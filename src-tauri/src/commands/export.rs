use crate::engine::export::{build_csv, build_history_csv, build_report, ExportFilters};
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

#[tauri::command]
pub async fn export_history_csv(state: State<'_, AppState>) -> Result<String, String> {
    build_history_csv(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_history_csv(state: State<'_, AppState>) -> Result<String, String> {
    let csv = build_history_csv(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let filename = format!("egestion-historique-{}.csv", date);
    let path = std::path::PathBuf::from(&home).join("Downloads").join(&filename);
    std::fs::write(&path, csv.as_bytes()).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("open")
        .arg("-R")
        .arg(path.to_str().unwrap_or(""))
        .spawn();
    Ok(filename)
}

#[tauri::command]
pub async fn save_report(state: State<'_, AppState>) -> Result<String, String> {
    let html = build_report(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let filename = format!("egestion-rapport-{}.html", chrono::Utc::now().timestamp());
    let path = std::path::PathBuf::from(&home).join("Downloads").join(&filename);
    std::fs::write(&path, html.as_bytes()).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("open")
        .arg("-R")
        .arg(path.to_str().unwrap_or(""))
        .spawn();
    Ok(filename)
}
