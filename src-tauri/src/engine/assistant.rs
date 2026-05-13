use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::models::FileRecord;

const SONNET_MODEL: &str = "claude-sonnet-4-6";

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

const SYSTEM_PROMPT: &str = r#"Tu es un assistant de recherche de fichiers pour l'application Egestion.

Schéma de la base de données :
- files : id, path, name, extension, size_bytes, created_at (timestamp unix), modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, is_organized, source_dir
- tags : id, file_id, tag, source, weight
- actions : id, file_id, action_type, path_before, path_after, executed_at, undone_at, undoable

Catégories disponibles : photo, video, music, document, archive, code, installer, other

Règles :
1. Si la question demande de trouver des fichiers, réponds UNIQUEMENT avec une requête SQL SQLite valide commençant par SELECT. Pas de markdown, pas de ```sql.
2. Sinon, réponds en français en langage naturel.

La requête SQL doit sélectionner les colonnes : id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir
depuis la table files (avec éventuels JOINs sur tags)."#;

pub async fn ask(
    query: String,
    history: Vec<Message>,
    api_key: &str,
    pool: &SqlitePool,
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
        "system": SYSTEM_PROMPT,
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
}
