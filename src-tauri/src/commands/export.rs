use crate::engine::export::{build_csv, build_report, ExportFilters};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn export_csv(
    filters: ExportFilters,
    state: State<'_, AppState>,
) -> Result<String, String> {
    build_csv(&filters, &state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_report(state: State<'_, AppState>) -> Result<String, String> {
    build_report(&state.pool)
        .await
        .map_err(|e| e.to_string())
}
