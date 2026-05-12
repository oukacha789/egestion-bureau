use anyhow::{anyhow, Result};
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

const CLAUDE_MODEL: &str = "claude-haiku-4-5-20251001";
const CACHE_TTL_SECS: i64 = 30 * 24 * 3600;

#[derive(Debug, Serialize, Deserialize)]
struct ClaudeClassification {
    category: String,
    subcategory: Option<String>,
    tags: Vec<String>,
    suggested_path: String,
    confidence: f64,
    reason: String,
}

#[derive(Debug, Clone)]
pub struct ClaudeResult {
    pub category: String,
    pub subcategory: Option<String>,
    pub confidence: f64,
    pub tags: Vec<String>,
}

pub async fn classify_with_claude(
    name: &str,
    extension: Option<&str>,
    size_bytes: i64,
    hash_sha256: &str,
    api_key: &str,
    pool: &SqlitePool,
) -> Result<ClaudeResult> {
    if let Some(cached) = get_from_cache(hash_sha256, pool).await? {
        return Ok(cached);
    }

    let client = Client::new();
    let prompt = build_prompt(name, extension, size_bytes);

    let body = json!({
        "model": CLAUDE_MODEL,
        "max_tokens": 256,
        "messages": [{"role": "user", "content": prompt}],
        "system": "Tu es un classificateur de fichiers pour macOS. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication. Format exact:\n{\"category\":\"photo|video|music|document|archive|code|installer|other\",\"subcategory\":\"string ou null\",\"tags\":[\"tag1\",\"tag2\"],\"suggested_path\":\"Categorie/Sous-categorie\",\"confidence\":0.0,\"reason\":\"courte explication\"}"
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

    let resp_json: Value = response.json().await?;
    let content = resp_json["content"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow!("No text in Claude response"))?;

    let classification: ClaudeClassification = serde_json::from_str(content)
        .map_err(|e| anyhow!("Failed to parse Claude JSON: {} — raw: {}", e, content))?;

    store_in_cache(hash_sha256, content, pool).await?;

    Ok(ClaudeResult {
        category: classification.category,
        subcategory: classification.subcategory,
        confidence: classification.confidence.clamp(0.0, 1.0),
        tags: classification.tags,
    })
}

pub fn build_prompt(name: &str, extension: Option<&str>, size_bytes: i64) -> String {
    format!(
        "Classifie ce fichier :\n- Nom: {}\n- Extension: {}\n- Taille: {} octets",
        name,
        extension.unwrap_or("aucune"),
        size_bytes
    )
}

async fn get_from_cache(hash: &str, pool: &SqlitePool) -> Result<Option<ClaudeResult>> {
    let now = Utc::now().timestamp();
    let row = sqlx::query(
        "SELECT response FROM ai_cache WHERE hash_sha256 = ? AND expires_at > ?"
    )
    .bind(hash)
    .bind(now)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = row {
        use sqlx::Row;
        let response_str: String = row.try_get("response")?;
        let classification: ClaudeClassification = serde_json::from_str(&response_str)?;
        return Ok(Some(ClaudeResult {
            category: classification.category,
            subcategory: classification.subcategory,
            confidence: classification.confidence,
            tags: classification.tags,
        }));
    }
    Ok(None)
}

async fn store_in_cache(hash: &str, response: &str, pool: &SqlitePool) -> Result<()> {
    let now = Utc::now().timestamp();
    let expires_at = now + CACHE_TTL_SECS;
    sqlx::query(
        "INSERT OR REPLACE INTO ai_cache (hash_sha256, response, model, cached_at, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(hash)
    .bind(response)
    .bind(CLAUDE_MODEL)
    .bind(now)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_prompt_contains_name() {
        let prompt = build_prompt("facture_edf.pdf", Some("pdf"), 1024);
        assert!(prompt.contains("facture_edf.pdf"));
        assert!(prompt.contains("pdf"));
        assert!(prompt.contains("1024"));
    }

    #[tokio::test]
    async fn test_cache_miss_returns_none() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let result = get_from_cache("nonexistent_hash", &pool).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_cache_store_and_retrieve() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let hash = "abc123def456";
        let response = r#"{"category":"document","subcategory":"Factures","tags":["facture"],"suggested_path":"Documents/Factures","confidence":0.92,"reason":"test"}"#;

        store_in_cache(hash, response, &pool).await.unwrap();
        let result = get_from_cache(hash, &pool).await.unwrap();

        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.category, "document");
        assert!((r.confidence - 0.92).abs() < 0.001);
    }
}
