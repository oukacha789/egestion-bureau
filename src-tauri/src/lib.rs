pub mod commands;
pub mod db;
pub mod engine;
pub mod events;
pub mod notifications;

use crate::engine::{
    classifier::classify_file,
    config::AppConfig,
    indexer::index_file,
    organizer::organize_file,
    rules_engine,
    search::SearchIndex,
    watcher::FsWatcher,
};
use crate::events::AppEvent;
use crate::notifications::{notify_duplicate, notify_organized, ThrottleState};
use sqlx::SqlitePool;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tracing::info;

pub struct AppState {
    pub pool: SqlitePool,
    pub search_index: Arc<Mutex<SearchIndex>>,
    pub watcher: Arc<Mutex<crate::engine::watcher::FsWatcher>>,
    pub app_data_dir: std::path::PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
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
            commands::get_tags,
            commands::add_tag,
            commands::remove_tag,
            commands::read_text_preview,
            commands::ask_assistant,
            commands::export_csv,
            commands::export_report,
            commands::get_watch_dirs,
            commands::get_prefs,
            commands::set_watch_dirs,
            commands::add_watch_dir,
            commands::remove_watch_dir,
            commands::get_rules,
            commands::create_rule,
            commands::delete_rule,
            commands::toggle_rule,
            commands::update_rule,
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

            let config = AppConfig::load(&data_dir).unwrap_or_else(|_| AppConfig::default_config());

            let (event_tx, event_rx) = tokio::sync::mpsc::channel::<AppEvent>(256);

            let watcher = FsWatcher::new(event_tx.clone(), config.watch_dirs)
                .expect("Failed to start FSWatcher");
            let watcher = Arc::new(Mutex::new(watcher));

            app.manage(AppState {
                pool: pool.clone(),
                search_index: Arc::clone(&search_index),
                watcher: Arc::clone(&watcher),
                app_data_dir: data_dir.clone(),
            });

            let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
            let throttle = Arc::new(Mutex::new(ThrottleState::new()));
            tauri::async_runtime::spawn(start_pipeline(app_handle, pool, api_key, search_index, watcher, event_rx, throttle));

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
    watcher: Arc<Mutex<FsWatcher>>,
    mut event_rx: tokio::sync::mpsc::Receiver<AppEvent>,
    throttle: Arc<Mutex<ThrottleState>>,
) {
    let pool = Arc::new(pool);
    let api_key = Arc::new(api_key);

    info!("Pipeline started");

    let pool_clone = Arc::clone(&pool);
    let api_key_clone = Arc::clone(&api_key);
    let (internal_tx, _) = tokio::sync::mpsc::channel::<AppEvent>(32);
    let event_tx_clone = internal_tx.clone();
    let app_handle_clone = app_handle.clone();
    let throttle_clone = Arc::clone(&throttle);

    tokio::spawn(async move {
        let _fw = watcher;
        while let Some(event) = event_rx.recv().await {
            match event {
                AppEvent::FileDetected(payload) => {
                    info!("File detected: {}", payload.path);
                    match index_file(&payload.path, &payload.source_dir, &pool_clone, &event_tx_clone).await {
                        Ok(record) => {
                            if !record.is_duplicate {
                                match classify_file(&record, &api_key_clone, &pool_clone, &event_tx_clone).await {
                                    Ok(classification) => {
                                        let rule_match = rules_engine::evaluate(&record, pool_clone.as_ref())
                                            .await
                                            .unwrap_or(None);
                                        let override_target = rule_match.as_ref().map(|m| m.target_dir.clone());
                                        match organize_file(&record, &classification, &pool_clone, &event_tx_clone, override_target).await {
                                            Ok(Some(action)) => {
                                                if let Some(ref rm) = rule_match {
                                                    if let Some(ref tag) = rm.auto_tag {
                                                        let tag_id = uuid::Uuid::new_v4().to_string();
                                                        if let Err(e) = sqlx::query(
                                                            "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, ?, ?, 'rule', 1.0)"
                                                        )
                                                        .bind(&tag_id)
                                                        .bind(&record.id)
                                                        .bind(tag)
                                                        .execute(pool_clone.as_ref())
                                                        .await {
                                                            tracing::warn!("Failed to insert auto-tag '{}' for file {}: {}", tag, record.id, e);
                                                        }
                                                    }
                                                }
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
                                                        if let Err(e) = idx.index_document(&indexed_record, &tags, None) {
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
                                notify_duplicate(
                                    &app_handle_clone,
                                    &record.name,
                                    Arc::clone(&throttle_clone),
                                );
                            }
                        }
                        Err(e) => tracing::error!("Index error: {}", e),
                    }
                }
                AppEvent::FileOrganized(payload) => {
                    let _ = app_handle_clone.emit("file-organized", &payload);
                    notify_organized(
                        &app_handle_clone,
                        &payload.name,
                        &payload.category,
                        Arc::clone(&throttle_clone),
                    );
                }
                _ => {}
            }
        }
    });
}
