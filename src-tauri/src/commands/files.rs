use crate::db::models::{ActionRecord, FileRecord};
use crate::engine::organizer::undo_action;
use crate::engine::search::SearchResult;
use crate::engine::watcher::default_watch_dirs;
use std::sync::Arc;
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

    let emails: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files WHERE category = 'email'")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "total_files": total.0,
        "organized_files": organized.0,
        "duplicate_files": duplicates.0,
        "email_files": emails.0,
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

    let search_index = Arc::clone(&state.search_index);
    let query_clone = query.clone();
    let category_clone = category.clone();
    tokio::task::spawn_blocking(move || {
        let idx = search_index.lock().map_err(|e| e.to_string())?;
        idx.search(&query_clone, limit, category_clone.as_deref())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
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
    if !std::path::Path::new(&path).exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn read_text_preview(path: String) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 2000];
    let n = file.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

#[tauri::command]
pub fn get_watch_dirs() -> Vec<String> {
    default_watch_dirs()
        .iter()
        .filter_map(|p| p.file_name())
        .map(|n| n.to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
pub async fn trash_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    // Fetch file_id before deleting (needed for search index cleanup)
    let row: Option<(String,)> = sqlx::query_as("SELECT id FROM files WHERE path = ?")
        .bind(&path)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    trash::delete(&path).map_err(|e| e.to_string())?;

    if let Some((file_id,)) = row {
        sqlx::query("DELETE FROM files WHERE id = ?")
            .bind(&file_id)
            .execute(&state.pool)
            .await
            .map_err(|e| e.to_string())?;

        if let Ok(mut idx) = state.search_index.lock() {
            let _ = idx.delete_document(&file_id);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn move_file(path: String, dest_dir: String) -> Result<String, String> {
    let expanded = if dest_dir.starts_with("~/") {
        let home = dirs::home_dir().ok_or("Cannot resolve home directory")?;
        format!("{}/{}", home.display(), &dest_dir[2..])
    } else {
        dest_dir
    };
    let src = std::path::Path::new(&path);
    let filename = src.file_name().ok_or_else(|| "Invalid source path".to_string())?;
    let dest_dir_path = std::path::Path::new(&expanded);
    std::fs::create_dir_all(dest_dir_path).map_err(|e| e.to_string())?;
    let dest = dest_dir_path.join(filename);
    std::fs::rename(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_quick_look(path: String) -> Result<(), String> {
    use std::os::unix::process::CommandExt;

    // In debug builds: qlmanage -p for Quick Look (shows [DEBUG] in title — acceptable in dev).
    // In release builds: `open` hands off to the default macOS app (Preview, TextEdit…)
    // so the [DEBUG] label never appears to end users.
    #[cfg(debug_assertions)]
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    #[cfg(debug_assertions)]
    let (bin, args): (&str, Vec<&str>) = if ext == "eml" || ext == "emlx" {
        ("/usr/bin/open", vec![&path])
    } else {
        ("/usr/bin/qlmanage", vec!["-p", &path])
    };

    #[cfg(not(debug_assertions))]
    let (bin, args): (&str, Vec<&str>) = ("/usr/bin/open", vec![&path]);

    std::process::Command::new(bin)
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .process_group(0)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_read_text_preview_returns_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "hello world").unwrap();
        let result = read_text_preview(path.to_str().unwrap().to_string()).await;
        assert_eq!(result.unwrap(), "hello world");
    }

    #[tokio::test]
    async fn test_read_text_preview_truncates_at_2000() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.txt");
        let content = "x".repeat(5000);
        std::fs::write(&path, &content).unwrap();
        let result = read_text_preview(path.to_str().unwrap().to_string()).await;
        assert_eq!(result.unwrap().len(), 2000);
    }

    #[tokio::test]
    async fn test_read_text_preview_missing_file_returns_err() {
        let result = read_text_preview("/tmp/does_not_exist_xyz.txt".to_string()).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_open_quick_look_valid_path_returns_ok() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "hello").unwrap();
        let result = open_quick_look(path.to_str().unwrap().to_string());
        assert!(result.is_ok());
    }

    #[test]
    fn test_open_quick_look_nonexistent_path_returns_ok() {
        // qlmanage spawns even for missing files — spawn() itself succeeds
        let result = open_quick_look("/tmp/this_file_does_not_exist_xyz.txt".to_string());
        assert!(result.is_ok());
    }
}
