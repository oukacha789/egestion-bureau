use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::models::FileRecord;

const SONNET_MODEL: &str = "claude-sonnet-4-6";

#[derive(Debug, Clone)]
pub struct AssistantContext {
    pub watch_dirs: Vec<String>,
    pub total_files: i64,
    pub organized_files: i64,
    pub unsorted_count: i64,
    pub rules_summary: String,
}

pub fn build_system_prompt(ctx: &AssistantContext) -> String {
    let watch_dirs_str = if ctx.watch_dirs.is_empty() {
        "Aucun dossier configuré".to_string()
    } else {
        ctx.watch_dirs.join(", ")
    };

    format!(
        r#"Tu es un assistant intelligent intégré dans Egestion, une application macOS de gestion automatique de fichiers.

== COMMENT EGESTION FONCTIONNE ==
- Watcher : surveille les dossiers configurés en temps réel (FSEvents macOS). Chaque nouveau fichier déclenche le pipeline automatiquement.
- Pipeline : Fichier détecté → Indexation (hash SHA256, métadonnées) → Classification (règles d'abord ; si confiance < 90% → Claude Haiku) → Organisation (déplacement vers ~/Documents/Egestion/<Catégorie>).
- Règles : conditions (extension, nom contient, source) → dossier cible + tag automatique. Les règles ont priorité absolue sur l'IA si leur confiance ≥ 90%.
- Classification IA : Claude Haiku classe chaque fichier (photo/video/music/document/archive/code/installer/other) avec un score de confiance. Cache 30 jours par hash SHA256.
- À valider : fichiers dont la confiance IA est < 50% — attendent validation manuelle dans l'écran « À valider ».
- Dashboard : historique des déplacements, statistiques, export CSV. Chaque déplacement est annulable.

== CONTEXTE UTILISATEUR ==
Dossiers surveillés : {watch_dirs}
Fichiers indexés : {total} total, {organized} organisés
Fichiers en attente de validation : {unsorted}
Règles actives : {rules}

== SCHÉMA BASE DE DONNÉES ==
- files : id, path, name, extension, size_bytes, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, is_organized, source_dir
- tags : id, file_id, tag, source, weight
- actions : id, file_id, action_type, path_before, path_after, executed_at, undone_at, undoable

Catégories disponibles : photo, video, music, document, archive, code, installer, other

== RÈGLES DE RÉPONSE ==
1. Si la question demande de trouver/lister des fichiers → répondre UNIQUEMENT avec une requête SQL SQLite valide commençant par SELECT (sans markdown, sans ```sql).
   La requête sélectionne : id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir depuis la table files.
2. Sinon → répondre en français en langage naturel, de façon concise et utile."#,
        watch_dirs = watch_dirs_str,
        total = ctx.total_files,
        organized = ctx.organized_files,
        unsorted = ctx.unsorted_count,
        rules = ctx.rules_summary,
    )
}

pub async fn load_assistant_context(
    pool: &SqlitePool,
    watch_dirs: Vec<String>,
) -> Result<AssistantContext> {
    let (total_files,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files")
        .fetch_one(pool)
        .await?;

    let (organized_files,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM files WHERE is_organized = 1")
            .fetch_one(pool)
            .await?;

    let (unsorted_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM files WHERE (confidence IS NULL OR confidence < 0.5) AND is_organized = 0",
    )
    .fetch_one(pool)
    .await?;

    let rules: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT name, condition_value, target_dir FROM rules WHERE enabled = 1 LIMIT 5",
    )
    .fetch_all(pool)
    .await?;

    let rules_summary = if rules.is_empty() {
        "Aucune règle configurée".to_string()
    } else {
        let parts: Vec<String> = rules
            .iter()
            .map(|(name, cond, target)| format!("{} ({} → {})", name, cond, target))
            .collect();
        format!("{} règle(s) : {}", rules.len(), parts.join(", "))
    };

    Ok(AssistantContext {
        watch_dirs,
        total_files,
        organized_files,
        unsorted_count,
        rules_summary,
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct AssistantResponse {
    pub files: Vec<FileRecord>,
    pub text: String,
}

pub async fn ask(
    query: String,
    history: Vec<Message>,
    api_key: &str,
    pool: &SqlitePool,
    context: AssistantContext,
) -> Result<AssistantResponse> {
    if api_key.is_empty() {
        return Err(anyhow!("ANTHROPIC_API_KEY not set"));
    }

    let mut messages: Vec<serde_json::Value> = history
        .iter()
        .map(|m| serde_json::json!({"role": m.role, "content": m.content}))
        .collect();
    messages.push(serde_json::json!({"role": "user", "content": query}));

    let client = Client::new();
    let body = serde_json::json!({
        "model": SONNET_MODEL,
        "max_tokens": 1024,
        "system": build_system_prompt(&context),
        "messages": messages,
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Claude API error {}: {}", status, text));
    }

    let json: serde_json::Value = response.json().await?;
    let raw = json["content"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow!("Unexpected API response format"))?
        .trim()
        .to_string();

    if raw.to_uppercase().starts_with("SELECT") {
        let files = execute_safe_query(&raw, pool).await?;
        Ok(AssistantResponse { files, text: String::new() })
    } else {
        Ok(AssistantResponse { files: vec![], text: raw })
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SuggestedRule {
    pub condition_type: String,
    pub condition_value: String,
    pub target_dir: String,
    pub label: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct OnboardingAnalysis {
    pub file_summary: String,
    pub suggested_rules: Vec<SuggestedRule>,
}

pub async fn analyze_for_onboarding(
    api_key: &str,
    watch_dirs: &[String],
) -> Result<OnboardingAnalysis> {
    use std::collections::HashMap;

    let mut ext_counts: HashMap<String, i64> = HashMap::new();
    for dir in watch_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if entry.path().is_file() {
                    let ext = entry
                        .path()
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("inconnu")
                        .to_lowercase();
                    *ext_counts.entry(ext).or_insert(0) += 1;
                }
            }
        }
    }

    let mut sorted: Vec<(String, i64)> = ext_counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    sorted.truncate(10);

    let total: i64 = sorted.iter().map(|(_, c)| c).sum();

    let file_summary = if total == 0 {
        "Aucun fichier détecté".to_string()
    } else {
        let parts: Vec<String> = sorted
            .iter()
            .take(5)
            .map(|(ext, cnt)| format!("{} .{}", cnt, ext))
            .collect();
        format!("{} fichiers : {}", total, parts.join(", "))
    };

    if api_key.is_empty() || total == 0 {
        return Ok(OnboardingAnalysis {
            file_summary,
            suggested_rules: vec![],
        });
    }

    let client = Client::new();
    let prompt = format!(
        "Analysez ces types de fichiers détectés et proposez 2-4 règles de classification simples. \
         Répondez UNIQUEMENT avec un tableau JSON valide, sans markdown ni explication.\n\n\
         Format exact : [{{\"condition_type\":\"extension\",\"condition_value\":\"pdf\",\
         \"target_dir\":\"Documents/Factures\",\"label\":\"PDF → Documents/Factures\"}}]\n\n\
         Fichiers détectés : {}",
        file_summary
    );

    let body = serde_json::json!({
        "model": SONNET_MODEL,
        "max_tokens": 512,
        "system": "Tu es un assistant de configuration pour l'app Egestion. Propose des règles de classification adaptées aux fichiers. Réponds UNIQUEMENT avec du JSON valide.",
        "messages": [{"role": "user", "content": prompt}]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await;

    let suggested_rules = match response {
        Ok(resp) if resp.status().is_success() => {
            let json: serde_json::Value = resp.json().await.unwrap_or_default();
            let raw = json["content"][0]["text"].as_str().unwrap_or("[]").trim();
            serde_json::from_str::<Vec<SuggestedRule>>(raw).unwrap_or_default()
        }
        _ => vec![],
    };

    Ok(OnboardingAnalysis { file_summary, suggested_rules })
}

async fn execute_safe_query(sql: &str, pool: &SqlitePool) -> Result<Vec<FileRecord>> {
    let trimmed = sql.trim();
    if !trimmed.to_uppercase().starts_with("SELECT") {
        return Err(anyhow!("Only SELECT queries are allowed"));
    }
    let files = sqlx::query_as::<_, FileRecord>(trimmed)
        .fetch_all(pool)
        .await?;
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn make_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    fn make_ctx() -> AssistantContext {
        AssistantContext {
            watch_dirs: vec!["~/Desktop".to_string(), "~/Downloads".to_string()],
            total_files: 127,
            organized_files: 95,
            unsorted_count: 8,
            rules_summary: "2 règles : pdf→Documents, jpg→Photos".to_string(),
        }
    }

    #[test]
    fn test_build_system_prompt_contains_watch_dirs() {
        let prompt = build_system_prompt(&make_ctx());
        assert!(prompt.contains("~/Desktop"), "prompt must contain watch dir");
        assert!(prompt.contains("~/Downloads"), "prompt must contain second watch dir");
    }

    #[test]
    fn test_build_system_prompt_contains_stats() {
        let prompt = build_system_prompt(&make_ctx());
        assert!(prompt.contains("127"), "total_files");
        assert!(prompt.contains("95"), "organized_files");
        assert!(prompt.contains("8"), "unsorted_count");
    }

    #[test]
    fn test_build_system_prompt_contains_rules() {
        let prompt = build_system_prompt(&make_ctx());
        assert!(prompt.contains("2 règles"), "rules_summary");
    }

    #[test]
    fn test_build_system_prompt_empty_dirs() {
        let ctx = AssistantContext {
            watch_dirs: vec![],
            total_files: 0,
            organized_files: 0,
            unsorted_count: 0,
            rules_summary: "Aucune règle".to_string(),
        };
        let prompt = build_system_prompt(&ctx);
        assert!(prompt.contains("Aucun dossier configuré"));
    }

    #[tokio::test]
    async fn test_load_assistant_context_empty_db() {
        let pool = make_db().await;
        let ctx = load_assistant_context(&pool, vec!["~/Desktop".to_string()])
            .await
            .unwrap();
        assert_eq!(ctx.total_files, 0);
        assert_eq!(ctx.organized_files, 0);
        assert_eq!(ctx.unsorted_count, 0);
        assert_eq!(ctx.watch_dirs, vec!["~/Desktop"]);
        assert!(ctx.rules_summary.contains("Aucune règle"));
    }

    #[tokio::test]
    async fn test_execute_safe_query_rejects_non_select() {
        let pool = make_db().await;
        let result = execute_safe_query("DROP TABLE files", &pool).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Only SELECT queries are allowed"));
    }

    #[tokio::test]
    async fn test_execute_safe_query_accepts_select() {
        let pool = make_db().await;
        let result = execute_safe_query(
            "SELECT id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir FROM files LIMIT 1",
            &pool,
        ).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_execute_safe_query_case_insensitive() {
        let pool = make_db().await;
        let result = execute_safe_query(
            "select id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir from files",
            &pool,
        ).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_suggested_rules_valid() {
        let json = r#"[{"condition_type":"extension","condition_value":"pdf","target_dir":"Documents/Factures","label":"PDF → Documents/Factures"}]"#;
        let rules: Vec<SuggestedRule> = serde_json::from_str(json).unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].condition_type, "extension");
        assert_eq!(rules[0].condition_value, "pdf");
        assert_eq!(rules[0].target_dir, "Documents/Factures");
    }

    #[test]
    fn test_parse_suggested_rules_invalid_returns_empty() {
        let rules: Vec<SuggestedRule> = serde_json::from_str("not json").unwrap_or_default();
        assert!(rules.is_empty());
    }

    #[tokio::test]
    async fn test_analyze_for_onboarding_no_api_key_returns_summary() {
        let analysis = analyze_for_onboarding("", &[]).await.unwrap();
        assert_eq!(analysis.suggested_rules.len(), 0);
        assert!(
            analysis.file_summary.contains("0") || analysis.file_summary.contains("Aucun"),
            "got: {}",
            analysis.file_summary
        );
    }
}
