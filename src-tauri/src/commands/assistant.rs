use crate::engine::assistant::{ask, load_assistant_context, AssistantResponse, Message};
use crate::commands::resolve_api_key;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn ask_assistant(
    query: String,
    history: Vec<Message>,
    state: State<'_, AppState>,
) -> Result<AssistantResponse, String> {
    let api_key = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        resolve_api_key(config.api_key.as_deref())
    };

    let watch_dirs = state
        .watcher
        .lock()
        .map_err(|e| e.to_string())?
        .current_dirs()
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    let context = load_assistant_context(&state.pool, watch_dirs)
        .await
        .map_err(|e| e.to_string())?;

    ask(query, history, &api_key, &state.pool, context)
        .await
        .map_err(|e| e.to_string())
}
