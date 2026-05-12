use crate::db::models::{ActionRecord, FileRecord};
use crate::engine::organizer::undo_action;
use tauri::State;

use crate::AppState;

#[tauri::command]
pub async fn get_recent_activity(
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<ActionRecord>, String> {
    let limit = limit.unwrap_or(20);
    sqlx::query_as::<_, ActionRecord>(
        "SELECT id, file_id, action_type, path_before, path_after, executed_at, undone_at, undoable FROM actions WHERE undone_at IS NULL ORDER BY executed_at DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn perform_undo(
    action_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    undo_action(&action_id, &state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_unsorted_files(
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    sqlx::query_as::<_, FileRecord>(
        "SELECT id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir FROM files WHERE (confidence IS NULL OR confidence < 0.5) AND is_organized = 0 ORDER BY indexed_at DESC LIMIT 50"
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_unsorted_file(
    file_id: String,
    category: String,
    subcategory: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE files SET category = ?, subcategory = ?, confidence = 1.0, classifier = 'user' WHERE id = ?"
    )
    .bind(&category)
    .bind(&subcategory)
    .bind(&file_id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_stats(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let organized: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files WHERE is_organized = 1")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let duplicates: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files WHERE is_duplicate = 1")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "total_files": total.0,
        "organized_files": organized.0,
        "duplicate_files": duplicates.0,
    }))
}
