use crate::AppState;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_tags(
    file_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    sqlx::query_scalar::<_, String>(
        "SELECT tag FROM tags WHERE file_id = ? ORDER BY weight DESC, tag ASC"
    )
    .bind(&file_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_tag(
    file_id: String,
    tag: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, ?, ?, 'manual', 1.0)"
    )
    .bind(&id)
    .bind(&file_id)
    .bind(&tag)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_tag(
    file_id: String,
    tag: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM tags WHERE file_id = ? AND tag = ?")
        .bind(&file_id)
        .bind(&tag)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn make_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO files (id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, is_duplicate, is_organized) VALUES ('f1', '/test/file.pdf', 'file.pdf', 'pdf', 1024, 'abc', 0, 0, 0, 0, 0)"
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn test_add_and_get_tag() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, 'f1', 'facture', 'manual', 1.0)"
        )
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();

        let tags: Vec<String> = sqlx::query_scalar::<_, String>(
            "SELECT tag FROM tags WHERE file_id = 'f1'"
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(tags, vec!["facture"]);
    }

    #[tokio::test]
    async fn test_remove_tag() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, 'f1', 'important', 'manual', 1.0)"
        )
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("DELETE FROM tags WHERE file_id = 'f1' AND tag = 'important'")
            .execute(&pool)
            .await
            .unwrap();

        let tags: Vec<String> = sqlx::query_scalar::<_, String>(
            "SELECT tag FROM tags WHERE file_id = 'f1'"
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert!(tags.is_empty());
    }

    #[tokio::test]
    async fn test_duplicate_tag_ignored() {
        let pool = make_db().await;
        for _ in 0..2 {
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, 'f1', 'dup', 'manual', 1.0)"
            )
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();
        }
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags WHERE file_id = 'f1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }
}
