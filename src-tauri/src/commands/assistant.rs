use crate::engine::assistant::{ask, AssistantResponse, Message};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn ask_assistant(
    query: String,
    history: Vec<Message>,
    state: State<'_, AppState>,
) -> Result<AssistantResponse, String> {
    let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
    ask(query, history, &api_key, &state.pool)
        .await
        .map_err(|e| e.to_string())
}
