pub mod commands;
pub mod db;
pub mod engine;
pub mod events;

use crate::engine::{
    classifier::classify_file,
    indexer::index_file,
    organizer::organize_file,
    search::SearchIndex,
    watcher::{default_watch_dirs, FsWatcher},
};
use crate::events::AppEvent;
use sqlx::SqlitePool;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tracing::info;

pub struct AppState {
    pub pool: SqlitePool,
    pub search_index: Arc<Mutex<SearchIndex>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_recent_activity,
            commands::perform_undo,
            commands::get_unsorted_files,
            commands::validate_unsorted_file,
            commands::get_stats,
            commands::search_files,
            commands::get_files_by_category,
            commands::get_file_metadata,
            commands::open_in_finder,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("egestion.db");
            let pool = tauri::async_runtime::block_on(async {
                db::init_pool(db_path.to_str().unwrap())
                    .await
                    .expect("Failed to init database")
            });

            let index_path = data_dir.join("search_index");
            let mut search_index = SearchIndex::open_or_create(&index_path)
                .expect("Failed to init search index");

            tauri::async_runtime::block_on(async {
                search_index
                    .rebuild_from_db(&pool)
                    .await
                    .expect("Failed to rebuild search index");
            });

            let search_index = Arc::new(Mutex::new(search_index));

            app.manage(AppState {
                pool: pool.clone(),
                search_index: Arc::clone(&search_index),
            });

            let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
            tauri::async_runtime::spawn(start_pipeline(app_handle, pool, api_key, search_index));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn start_pipeline(
    app_handle: AppHandle,
    pool: SqlitePool,
    api_key: String,
    search_index: Arc<Mutex<SearchIndex>>,
) {
    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel::<AppEvent>(256);
    let pool = Arc::new(pool);
    let api_key = Arc::new(api_key);

    let watch_dirs = default_watch_dirs();
    let dir_count = watch_dirs.len();
    let watcher = FsWatcher::new(event_tx.clone(), watch_dirs).expect("Failed to start FSWatcher");

    info!("Pipeline started, watching {} directories", dir_count);

    let pool_clone = Arc::clone(&pool);
    let api_key_clone = Arc::clone(&api_key);
    let event_tx_clone = event_tx.clone();
    let app_handle_clone = app_handle.clone();

    tokio::spawn(async move {
        let _watcher = watcher;
        while let Some(event) = event_rx.recv().await {
            match event {
                AppEvent::FileDetected(payload) => {
                    info!("File detected: {}", payload.path);
                    match index_file(&payload.path, &payload.source_dir, &pool_clone, &event_tx_clone).await {
                        Ok(record) => {
                            if !record.is_duplicate {
                                match classify_file(&record, &api_key_clone, &pool_clone, &event_tx_clone).await {
                                    Ok(classification) => {
                                        match organize_file(&record, &classification, &pool_clone, &event_tx_clone).await {
                                            Ok(Some(action)) => {
                                                // Index organized file in Tantivy
                                                let tags: Vec<String> = sqlx::query_as::<_, (String,)>(
                                                    "SELECT tag FROM tags WHERE file_id = ?"
                                                )
                                                .bind(&record.id)
                                                .fetch_all(pool_clone.as_ref())
                                                .await
                                                .unwrap_or_default()
                                                .into_iter()
                                                .map(|(t,)| t)
                                                .collect();

                                                let mut indexed_record = record.clone();
                                                indexed_record.path = action.path_after.clone().unwrap_or(record.path.clone());
                                                indexed_record.is_organized = true;
                                                indexed_record.category = Some(classification.category.clone());
                                                indexed_record.subcategory = classification.subcategory.clone();

                                                match search_index.lock() {
                                                    Ok(mut idx) => {
                                                        if let Err(e) = idx.index_document(&indexed_record, &tags) {
                                                            tracing::error!("Search index error: {}", e);
                                                        }
                                                    }
                                                    Err(e) => tracing::error!("Search index mutex poisoned: {}", e),
                                                }
                                            }
                                            Ok(None) => {}
                                            Err(e) => tracing::error!("Organize error: {}", e),
                                        }
                                    }
                                    Err(e) => tracing::error!("Classify error: {}", e),
                                }
                            } else {
                                let _ = app_handle_clone.emit(
                                    "file-duplicate",
                                    serde_json::json!({
                                        "file_id": record.id,
                                        "path": record.path,
                                        "duplicate_of": record.duplicate_of,
                                    }),
                                );
                            }
                        }
                        Err(e) => tracing::error!("Index error: {}", e),
                    }
                }
                AppEvent::FileOrganized(payload) => {
                    let _ = app_handle_clone.emit("file-organized", &payload);
                }
                _ => {}
            }
        }
    });
}
