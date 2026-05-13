use anyhow::{anyhow, Result};
use chrono::Utc;
use reqwest::Client;
use sqlx::SqlitePool;

const HAIKU_MODEL: &str = "claude-haiku-4-5-20251001";
const DESC_CACHE_TTL_SECS: i64 = 30 * 24 * 3600;

pub async fn generate_description(
    hash_sha256: &str,
    name: &str,
    category: &str,
    subcategory: Option<&str>,
    tags: &[String],
    api_key: &str,
    pool: &SqlitePool,
) -> Result<String> {
    let cache_key = format!("desc:{}", hash_sha256);

    if let Some(cached) = get_from_cache(&cache_key, pool).await? {
        return Ok(cached);
    }

    if api_key.is_empty() {
        return Err(anyhow!("ANTHROPIC_API_KEY not set"));
    }

    let tag_str = if tags.is_empty() {
        "aucun tag".to_string()
    } else {
        tags.join(", ")
    };

    let sub = subcategory.unwrap_or("—");
    let prompt = format!(
        "Fichier : {name}\nCatégorie : {category} / {sub}\nTags : {tag_str}\n\nDécris ce fichier en 1-2 phrases concises pour faciliter sa recherche ultérieure."
    );

    let client = Client::new();
    let body = serde_json::json!({
        "model": HAIKU_MODEL,
        "max_tokens": 150,
        "messages": [{"role": "user", "content": prompt}]
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
    let description = json["content"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow!("Unexpected API response format"))?
        .trim()
        .to_string();

    save_to_cache(&cache_key, &description, pool).await?;

    Ok(description)
}

async fn get_from_cache(key: &str, pool: &SqlitePool) -> Result<Option<String>> {
    let now = Utc::now().timestamp();
    let cached = sqlx::query_scalar::<_, String>(
        "SELECT response FROM ai_cache WHERE hash_sha256 = ? AND expires_at > ?"
    )
    .bind(key)
    .bind(now)
    .fetch_optional(pool)
    .await?;
    Ok(cached)
}

async fn save_to_cache(key: &str, description: &str, pool: &SqlitePool) -> Result<()> {
    let now = Utc::now().timestamp();
    sqlx::query(
        "INSERT OR REPLACE INTO ai_cache (hash_sha256, response, model, cached_at, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(key)
    .bind(description)
    .bind(HAIKU_MODEL)
    .bind(now)
    .bind(now + DESC_CACHE_TTL_SECS)
    .execute(pool)
    .await?;
    Ok(())
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
    async fn test_cache_miss_returns_none() {
        let pool = make_db().await;
        let result = get_from_cache("desc:nonexistent", &pool).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_save_and_retrieve_cache() {
        let pool = make_db().await;
        save_to_cache("desc:abc123", "Un document fiscal de 2023.", &pool)
            .await
            .unwrap();
        let result = get_from_cache("desc:abc123", &pool).await.unwrap();
        assert_eq!(result, Some("Un document fiscal de 2023.".to_string()));
    }

    #[tokio::test]
    async fn test_expired_cache_returns_none() {
        let pool = make_db().await;
        sqlx::query(
            "INSERT INTO ai_cache (hash_sha256, response, model, cached_at, expires_at) VALUES ('desc:old', 'old desc', 'haiku', 0, 1)"
        )
        .execute(&pool)
        .await
        .unwrap();
        let result = get_from_cache("desc:old", &pool).await.unwrap();
        assert!(result.is_none());
    }
}
