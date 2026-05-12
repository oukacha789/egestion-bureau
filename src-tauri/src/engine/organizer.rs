use crate::db::models::{ActionRecord, FileRecord};
use crate::engine::classifier::ClassificationResult;
use crate::events::{AppEvent, FileOrganizedPayload};
use anyhow::Result;
use chrono::Utc;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

const EGESTION_BASE: &str = "Documents/Egestion";
const MIN_CONFIDENCE_FOR_AUTO_ORGANIZE: f64 = 0.50;

pub async fn organize_file(
    record: &FileRecord,
    classification: &ClassificationResult,
    pool: &SqlitePool,
    event_tx: &Sender<AppEvent>,
) -> Result<Option<ActionRecord>> {
    if classification.confidence < MIN_CONFIDENCE_FOR_AUTO_ORGANIZE {
        return Ok(None);
    }

    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot find home dir"))?;
    let target_dir = build_target_dir(&home, classification, record);
    std::fs::create_dir_all(&target_dir)?;

    let file_name = Path::new(&record.path)
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("Invalid path: no filename"))?;
    let target_path = resolve_conflict(&target_dir.join(file_name));

    std::fs::rename(&record.path, &target_path)?;

    let action = ActionRecord {
        id: Uuid::new_v4().to_string(),
        file_id: Some(record.id.clone()),
        action_type: "move".to_string(),
        path_before: Some(record.path.clone()),
        path_after: Some(target_path.to_string_lossy().to_string()),
        executed_at: Utc::now().timestamp(),
        undone_at: None,
        undoable: true,
    };

    sqlx::query(
        "INSERT INTO actions (id, file_id, action_type, path_before, path_after, executed_at, undoable) VALUES (?, ?, ?, ?, ?, ?, 1)"
    )
    .bind(&action.id)
    .bind(&action.file_id)
    .bind(&action.action_type)
    .bind(&action.path_before)
    .bind(&action.path_after)
    .bind(action.executed_at)
    .execute(pool)
    .await?;

    sqlx::query("UPDATE files SET path = ?, is_organized = 1 WHERE id = ?")
        .bind(&action.path_after)
        .bind(&record.id)
        .execute(pool)
        .await?;

    let payload = FileOrganizedPayload {
        action_id: action.id.clone(),
        file_id: record.id.clone(),
        name: record.name.clone(),
        path_before: action.path_before.clone().unwrap_or_default(),
        path_after: action.path_after.clone().unwrap_or_default(),
        category: classification.category.clone(),
    };
    let _ = event_tx.send(AppEvent::FileOrganized(payload)).await;

    Ok(Some(action))
}

pub async fn undo_action(action_id: &str, pool: &SqlitePool) -> Result<()> {
    let row = sqlx::query(
        "SELECT id, file_id, action_type, path_before, path_after, executed_at, undone_at, undoable FROM actions WHERE id = ? AND undone_at IS NULL AND undoable = 1"
    )
    .bind(action_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| anyhow::anyhow!("Action not found or already undone"))?;

    use sqlx::Row;
    let path_before: Option<String> = row.try_get("path_before")?;
    let path_after: Option<String> = row.try_get("path_after")?;
    let file_id: Option<String> = row.try_get("file_id")?;

    if let (Some(before), Some(after)) = (&path_before, &path_after) {
        if Path::new(after).exists() {
            if let Some(parent) = Path::new(before).parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::rename(after, before)?;
        }
    }

    let now = Utc::now().timestamp();
    sqlx::query("UPDATE actions SET undone_at = ? WHERE id = ?")
        .bind(now)
        .bind(action_id)
        .execute(pool)
        .await?;

    if let Some(fid) = &file_id {
        sqlx::query("UPDATE files SET path = ?, is_organized = 0 WHERE id = ?")
            .bind(&path_before)
            .bind(fid)
            .execute(pool)
            .await?;
    }

    Ok(())
}

fn build_target_dir(home: &Path, classification: &ClassificationResult, record: &FileRecord) -> PathBuf {
    let base = home.join(EGESTION_BASE);
    let category_dir = match classification.category.as_str() {
        "photo" => {
            let year = extract_year_from_timestamp(record.created_at);
            let subcat = classification.subcategory.clone().unwrap_or_else(|| "Divers".to_string());
            format!("Photos/{}/{}", year, subcat)
        }
        "video" => format!("Videos/{}", classification.subcategory.clone().unwrap_or_else(|| "Divers".to_string())),
        "music" => "Musiques".to_string(),
        "document" => format!("Documents/{}", classification.subcategory.clone().unwrap_or_else(|| "Divers".to_string())),
        "archive" => "Archives".to_string(),
        "installer" => "Installers".to_string(),
        "code" => "Code".to_string(),
        _ => "_Unsorted".to_string(),
    };
    base.join(category_dir)
}

fn extract_year_from_timestamp(ts: i64) -> i32 {
    use chrono::{DateTime, Utc};
    DateTime::<Utc>::from_timestamp(ts, 0)
        .map(|dt| dt.format("%Y").to_string().parse().unwrap_or(2026))
        .unwrap_or(2026)
}

fn resolve_conflict(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let parent = path.parent().unwrap_or(Path::new("."));
    let mut counter = 1;
    loop {
        let new_name = if ext.is_empty() {
            format!("{} ({})", stem, counter)
        } else {
            format!("{} ({}).{}", stem, counter, ext)
        };
        let candidate = parent.join(new_name);
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::classifier::ClassificationResult;

    fn make_record(created_at: i64) -> FileRecord {
        FileRecord {
            id: "test-id".to_string(),
            path: "/tmp/test.pdf".to_string(),
            name: "test.pdf".to_string(),
            extension: Some("pdf".to_string()),
            size_bytes: 100,
            hash_sha256: "hash".to_string(),
            created_at,
            modified_at: created_at,
            indexed_at: created_at,
            category: None, subcategory: None, confidence: None, classifier: None,
            is_duplicate: false, duplicate_of: None, is_organized: false,
            source_dir: Some("desktop".to_string()),
        }
    }

    #[test]
    fn test_build_target_dir_photo() {
        let home = Path::new("/Users/test");
        let classification = ClassificationResult {
            category: "photo".to_string(),
            subcategory: Some("Vacances".to_string()),
            confidence: 0.95,
            tags: vec![],
        };
        let dir = build_target_dir(home, &classification, &make_record(1704067200));
        assert!(dir.to_string_lossy().contains("Photos/2024/Vacances"));
    }

    #[test]
    fn test_build_target_dir_document_with_subcategory() {
        let home = Path::new("/Users/test");
        let classification = ClassificationResult {
            category: "document".to_string(),
            subcategory: Some("Factures".to_string()),
            confidence: 0.95,
            tags: vec![],
        };
        let dir = build_target_dir(home, &classification, &make_record(1704067200));
        assert!(dir.to_string_lossy().contains("Documents/Factures"));
    }

    #[test]
    fn test_build_target_dir_unknown_goes_to_unsorted() {
        let home = Path::new("/Users/test");
        let classification = ClassificationResult {
            category: "other".to_string(),
            subcategory: None,
            confidence: 0.30,
            tags: vec![],
        };
        let dir = build_target_dir(home, &classification, &make_record(1704067200));
        assert!(dir.to_string_lossy().contains("_Unsorted"));
    }

    #[test]
    fn test_resolve_conflict_no_existing() {
        let path = PathBuf::from("/nonexistent/definitely/not/here/file.pdf");
        assert_eq!(resolve_conflict(&path), path);
    }

    #[test]
    fn test_extract_year() {
        assert_eq!(extract_year_from_timestamp(1704067200), 2024);
    }
}
