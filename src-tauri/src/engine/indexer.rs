use crate::db::models::FileRecord;
use crate::events::{AppEvent, FileIndexedPayload};
use anyhow::Result;
use chrono::Utc;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use std::fs;
use std::io::Read;
use std::path::Path;
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

pub async fn index_file(
    path: &str,
    source_dir: &str,
    pool: &SqlitePool,
    event_tx: &Sender<AppEvent>,
) -> Result<FileRecord> {
    let path_obj = Path::new(path);
    let metadata = fs::metadata(path)?;

    let name = path_obj
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let extension = path_obj
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    let hash = compute_sha256(path)?;
    let now = Utc::now().timestamp();

    let created_at = metadata
        .created()
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or(now);
    let modified_at = metadata
        .modified()
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or(now);

    let duplicate_of = find_duplicate_by_hash(&hash, path, pool).await?;
    let is_duplicate = duplicate_of.is_some();

    let record = FileRecord {
        id: Uuid::new_v4().to_string(),
        path: path.to_string(),
        name,
        extension,
        size_bytes: metadata.len() as i64,
        hash_sha256: hash.clone(),
        created_at,
        modified_at,
        indexed_at: now,
        category: None,
        subcategory: None,
        confidence: None,
        classifier: None,
        is_duplicate,
        duplicate_of: duplicate_of.clone(),
        is_organized: false,
        source_dir: Some(source_dir.to_string()),
    };

    sqlx::query(
        r#"INSERT INTO files (id, path, name, extension, size_bytes, hash_sha256,
           created_at, modified_at, indexed_at, is_duplicate, duplicate_of, is_organized, source_dir)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12)
           ON CONFLICT(path) DO UPDATE SET
               modified_at = excluded.modified_at,
               indexed_at = excluded.indexed_at,
               hash_sha256 = excluded.hash_sha256"#,
    )
    .bind(&record.id)
    .bind(&record.path)
    .bind(&record.name)
    .bind(&record.extension)
    .bind(record.size_bytes)
    .bind(&record.hash_sha256)
    .bind(record.created_at)
    .bind(record.modified_at)
    .bind(record.indexed_at)
    .bind(record.is_duplicate)
    .bind(&record.duplicate_of)
    .bind(&record.source_dir)
    .execute(pool)
    .await?;

    // ON CONFLICT keeps the original row's id — fetch the real id so downstream
    // operations (tag inserts, classify updates) reference a valid foreign key.
    let actual_id: String =
        sqlx::query_scalar("SELECT id FROM files WHERE path = ?")
            .bind(path)
            .fetch_one(pool)
            .await?;
    let record = FileRecord { id: actual_id, ..record };

    let payload = FileIndexedPayload {
        file_id: record.id.clone(),
        path: record.path.clone(),
        hash_sha256: hash,
    };
    let _ = event_tx.send(AppEvent::FileIndexed(payload)).await;

    Ok(record)
}

fn compute_sha256(path: &str) -> Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

async fn find_duplicate_by_hash(hash: &str, current_path: &str, pool: &SqlitePool) -> Result<Option<String>> {
    let result = sqlx::query_scalar(
        "SELECT id FROM files WHERE hash_sha256 = ? AND is_duplicate = 0 AND path != ? LIMIT 1",
    )
    .bind(hash)
    .bind(current_path)
    .fetch_optional(pool)
    .await?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn test_index_file_creates_record() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let (tx, _rx) = mpsc::channel(10);

        let mut tmp = NamedTempFile::new().unwrap();
        tmp.write_all(b"hello world").unwrap();
        let path = tmp.path().to_str().unwrap().to_string();

        let record = index_file(&path, "desktop", &pool, &tx).await.unwrap();

        assert!(!record.id.is_empty());
        assert_eq!(record.size_bytes, 11);
        assert!(!record.hash_sha256.is_empty());
        assert!(!record.is_duplicate);
        assert_eq!(record.source_dir, Some("desktop".to_string()));
    }

    #[tokio::test]
    async fn test_index_detects_duplicate() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let (tx, _rx) = mpsc::channel(10);

        let mut tmp1 = NamedTempFile::new().unwrap();
        tmp1.write_all(b"same content").unwrap();
        let mut tmp2 = NamedTempFile::new().unwrap();
        tmp2.write_all(b"same content").unwrap();

        index_file(tmp1.path().to_str().unwrap(), "desktop", &pool, &tx).await.unwrap();
        let record2 = index_file(tmp2.path().to_str().unwrap(), "desktop", &pool, &tx).await.unwrap();

        assert!(record2.is_duplicate);
        assert!(record2.duplicate_of.is_some());
    }

    #[tokio::test]
    async fn test_reindex_same_file_not_marked_duplicate() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let (tx, _rx) = mpsc::channel(10);

        let mut tmp = NamedTempFile::new().unwrap();
        tmp.write_all(b"same content").unwrap();
        let path = tmp.path().to_str().unwrap().to_string();

        index_file(&path, "desktop", &pool, &tx).await.unwrap();
        let record2 = index_file(&path, "desktop", &pool, &tx).await.unwrap();

        assert!(!record2.is_duplicate, "Re-indexing the same file must not mark it as a self-duplicate");
        assert!(record2.duplicate_of.is_none());
    }

    #[test]
    fn test_compute_sha256_deterministic() {
        let mut tmp = NamedTempFile::new().unwrap();
        tmp.write_all(b"test content").unwrap();
        let path = tmp.path().to_str().unwrap().to_string();

        let h1 = compute_sha256(&path).unwrap();
        let h2 = compute_sha256(&path).unwrap();
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
    }
}
