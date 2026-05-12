pub mod claude;
pub mod rules;

pub use rules::ClassificationResult;

use crate::db::models::FileRecord;
use crate::events::{AppEvent, FileClassifiedPayload};
use anyhow::Result;
use sqlx::SqlitePool;
use tokio::sync::mpsc::Sender;

const RULE_CONFIDENCE_THRESHOLD: f64 = 0.90;

pub async fn classify_file(
    record: &FileRecord,
    api_key: &str,
    pool: &SqlitePool,
    event_tx: &Sender<AppEvent>,
) -> Result<ClassificationResult> {
    // Level 1: rules
    if let Some(result) = rules::classify_by_rules(&record.path, &record.name) {
        if result.confidence >= RULE_CONFIDENCE_THRESHOLD {
            persist_classification(record, &result, "rule", pool).await?;
            emit_classified(record, &result, "rule", event_tx).await;
            return Ok(result);
        }
    }

    // Level 3: Claude API (Level 2 CLIP reserved for Phase 2)
    let claude_result = claude::classify_with_claude(
        &record.name,
        record.extension.as_deref(),
        record.size_bytes,
        &record.hash_sha256,
        api_key,
        pool,
    )
    .await
    .unwrap_or_else(|_| claude::ClaudeResult {
        category: "other".to_string(),
        subcategory: None,
        confidence: 0.0,
        tags: vec![],
    });

    let result = ClassificationResult {
        category: claude_result.category,
        subcategory: claude_result.subcategory,
        confidence: claude_result.confidence,
        tags: claude_result.tags,
    };

    persist_classification(record, &result, "claude", pool).await?;
    emit_classified(record, &result, "claude", event_tx).await;
    Ok(result)
}

async fn persist_classification(
    record: &FileRecord,
    result: &ClassificationResult,
    classifier: &str,
    pool: &SqlitePool,
) -> Result<()> {
    sqlx::query(
        "UPDATE files SET category = ?, subcategory = ?, confidence = ?, classifier = ? WHERE id = ?"
    )
    .bind(&result.category)
    .bind(&result.subcategory)
    .bind(result.confidence)
    .bind(classifier)
    .bind(&record.id)
    .execute(pool)
    .await?;

    for tag in &result.tags {
        let tag_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT OR IGNORE INTO tags (id, file_id, tag, source) VALUES (?, ?, ?, ?)"
        )
        .bind(&tag_id)
        .bind(&record.id)
        .bind(tag)
        .bind("ai")
        .execute(pool)
        .await?;
    }
    Ok(())
}

async fn emit_classified(
    record: &FileRecord,
    result: &ClassificationResult,
    classifier: &str,
    event_tx: &Sender<AppEvent>,
) {
    let payload = FileClassifiedPayload {
        file_id: record.id.clone(),
        category: result.category.clone(),
        subcategory: result.subcategory.clone(),
        confidence: result.confidence,
        classifier: classifier.to_string(),
        tags: result.tags.clone(),
    };
    let _ = event_tx.send(AppEvent::FileClassified(payload)).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::FileRecord;
    use chrono::Utc;
    use tokio::sync::mpsc;

    fn make_test_record(path: &str, name: &str, ext: Option<&str>) -> FileRecord {
        FileRecord {
            id: uuid::Uuid::new_v4().to_string(),
            path: path.to_string(),
            name: name.to_string(),
            extension: ext.map(|s| s.to_string()),
            size_bytes: 1024,
            hash_sha256: "testhash123".to_string(),
            created_at: Utc::now().timestamp(),
            modified_at: Utc::now().timestamp(),
            indexed_at: Utc::now().timestamp(),
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some("desktop".to_string()),
        }
    }

    #[tokio::test]
    async fn test_pdf_stops_at_rules_level() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let (tx, _rx) = mpsc::channel(10);

        let record = make_test_record("/path/file.pdf", "file.pdf", Some("pdf"));
        sqlx::query(
            "INSERT INTO files (id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, is_duplicate, is_organized) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)"
        )
        .bind(&record.id).bind(&record.path).bind(&record.name).bind(&record.extension)
        .bind(record.size_bytes).bind(&record.hash_sha256).bind(record.created_at)
        .bind(record.modified_at).bind(record.indexed_at)
        .execute(&pool).await.unwrap();

        // "no_key" won't work for API — but rules should kick in at 0.95 >= 0.90
        let result = classify_file(&record, "no_key", &pool, &tx).await.unwrap();
        assert_eq!(result.category, "document");
        assert_eq!(result.confidence, 0.95);
    }
}
