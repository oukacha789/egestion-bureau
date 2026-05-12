use crate::db::models::{ActionRecord, FileRecord};
use crate::engine::organizer::undo_action;
use crate::engine::search::SearchResult;
use tauri::State;

use crate::AppState;

#[derive(Debug, serde::Serialize)]
pub struct FileMetadata {
    pub id: String,
    pub name: String,
    pub path: String,
    pub category: Option<String>,
    pub subcategory: Option<String>,
    pub tags: Vec<String>,
    pub size_bytes: i64,
    pub created_at: i64,
    pub modified_at: i64,
    pub confidence: Option<f64>,
    pub classifier: Option<String>,
}

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

#[tauri::command]
pub async fn search_files(
    query: String,
    limit: Option<u32>,
    category: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let limit = limit.unwrap_or(20) as usize;

    // Empty query → return recent organized files
    if query.trim().is_empty() {
        let files = sqlx::query_as::<_, FileRecord>(
            "SELECT id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, \
             category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir \
             FROM files WHERE is_organized = 1 ORDER BY indexed_at DESC LIMIT ?"
        )
        .bind(limit as i64)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

        return Ok(files
            .into_iter()
            .map(|f| SearchResult {
                id: f.id,
                name: f.name,
                path: f.path,
                category: f.category.unwrap_or_else(|| "other".to_string()),
                subcategory: f.subcategory.unwrap_or_default(),
                tags: vec![],
                year: 0,
                score: 0.0,
            })
            .collect());
    }

    let idx = state
        .search_index
        .lock()
        .map_err(|e| e.to_string())?;
    idx.search(&query, limit, category.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_files_by_category(
    category: String,
    sort_by: Option<String>,
    page: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    let offset = (page.unwrap_or(0) * 50) as i64;
    let cols = "id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, \
                category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir";

    // safe: sort_col built from match, never from user input
    let sort_col = match sort_by.as_deref().unwrap_or("date") {
        "name" => "name ASC",
        "size" => "size_bytes DESC",
        _      => "modified_at DESC",
    };

    let (sql, bind_cat) = if category == "_unsorted" {
        (
            format!("SELECT {} FROM files WHERE category = 'other' AND is_organized = 1 ORDER BY {} LIMIT 50 OFFSET ?", cols, sort_col),
            false,
        )
    } else {
        (
            format!("SELECT {} FROM files WHERE category = ? AND is_organized = 1 ORDER BY {} LIMIT 50 OFFSET ?", cols, sort_col),
            true,
        )
    };

    if bind_cat {
        sqlx::query_as::<_, FileRecord>(&sql)
            .bind(&category)
            .bind(offset)
            .fetch_all(&state.pool)
            .await
            .map_err(|e| e.to_string())
    } else {
        sqlx::query_as::<_, FileRecord>(&sql)
            .bind(offset)
            .fetch_all(&state.pool)
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn get_file_metadata(
    file_id: String,
    state: State<'_, AppState>,
) -> Result<FileMetadata, String> {
    let file = sqlx::query_as::<_, FileRecord>(
        "SELECT id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, \
         category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir \
         FROM files WHERE id = ?"
    )
    .bind(&file_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let tags: Vec<String> = sqlx::query_as::<_, (String,)>(
        "SELECT tag FROM tags WHERE file_id = ? ORDER BY weight DESC"
    )
    .bind(&file_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .map(|(t,)| t)
    .collect();

    Ok(FileMetadata {
        id: file.id,
        name: file.name,
        path: file.path,
        category: file.category,
        subcategory: file.subcategory,
        tags,
        size_bytes: file.size_bytes,
        created_at: file.created_at,
        modified_at: file.modified_at,
        confidence: file.confidence,
        classifier: file.classifier,
    })
}

#[tauri::command]
pub async fn open_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
