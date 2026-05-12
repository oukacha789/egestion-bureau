pub mod commands;
pub mod db;
pub mod engine;
pub mod events;

use crate::engine::{
    classifier::classify_file,
    indexer::index_file,
    organizer::organize_file,
    watcher::{default_watch_dirs, FsWatcher},
};
use crate::events::AppEvent;
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tracing::info;

pub struct AppState {
    pub pool: SqlitePool,
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
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            let db_path = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir")
                .join("egestion.db");
            std::fs::create_dir_all(db_path.parent().unwrap())?;

            let pool = tauri::async_runtime::block_on(async {
                db::init_pool(db_path.to_str().unwrap())
                    .await
                    .expect("Failed to init database")
            });

            app.manage(AppState { pool: pool.clone() });

            let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
            tauri::async_runtime::spawn(start_pipeline(app_handle, pool, api_key));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn start_pipeline(app_handle: AppHandle, pool: SqlitePool, api_key: String) {
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
        let _watcher = watcher; // keep alive for task lifetime
        while let Some(event) = event_rx.recv().await {
            match event {
                AppEvent::FileDetected(payload) => {
                    info!("File detected: {}", payload.path);
                    match index_file(
                        &payload.path,
                        &payload.source_dir,
                        &pool_clone,
                        &event_tx_clone,
                    )
                    .await
                    {
                        Ok(record) => {
                            if !record.is_duplicate {
                                match classify_file(
                                    &record,
                                    &api_key_clone,
                                    &pool_clone,
                                    &event_tx_clone,
                                )
                                .await
                                {
                                    Ok(classification) => {
                                        if let Err(e) = organize_file(
                                            &record,
                                            &classification,
                                            &pool_clone,
                                            &event_tx_clone,
                                        )
                                        .await
                                        {
                                            tracing::error!("Organize error: {}", e);
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
