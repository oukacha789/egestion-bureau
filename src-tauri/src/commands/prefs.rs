use crate::engine::config::AppConfig;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn get_prefs(state: State<'_, AppState>) -> Vec<String> {
    state
        .watcher
        .lock()
        .map(|fw| {
            fw.current_dirs()
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_watch_dirs(
    dirs: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let paths: Vec<PathBuf> = dirs.iter().map(PathBuf::from).collect();

    {
        let mut config = AppConfig::load(&state.app_data_dir)
            .unwrap_or_else(|_| AppConfig::default_config());
        config.watch_dirs = paths.clone();
        config.save(&state.app_data_dir).map_err(|e| e.to_string())?;
    }

    state
        .watcher
        .lock()
        .map_err(|e| e.to_string())?
        .set_dirs(paths)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn add_watch_dir(
    dir: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let new_path = PathBuf::from(&dir);

    let mut current: Vec<PathBuf> = state
        .watcher
        .lock()
        .map_err(|e| e.to_string())?
        .current_dirs()
        .to_vec();

    if current.contains(&new_path) {
        return Ok(current
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect());
    }

    current.push(new_path);

    {
        let mut config = AppConfig::load(&state.app_data_dir)
            .unwrap_or_else(|_| AppConfig::default_config());
        config.watch_dirs = current.clone();
        config.save(&state.app_data_dir).map_err(|e| e.to_string())?;
    }

    state
        .watcher
        .lock()
        .map_err(|e| e.to_string())?
        .set_dirs(current.clone())
        .map_err(|e| e.to_string())?;

    Ok(current
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

#[tauri::command]
pub fn remove_watch_dir(
    dir: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let to_remove = PathBuf::from(&dir);

    let current: Vec<PathBuf> = state
        .watcher
        .lock()
        .map_err(|e| e.to_string())?
        .current_dirs()
        .iter()
        .filter(|p| **p != to_remove)
        .cloned()
        .collect();

    {
        let mut config = AppConfig::load(&state.app_data_dir)
            .unwrap_or_else(|_| AppConfig::default_config());
        config.watch_dirs = current.clone();
        config.save(&state.app_data_dir).map_err(|e| e.to_string())?;
    }

    state
        .watcher
        .lock()
        .map_err(|e| e.to_string())?
        .set_dirs(current.clone())
        .map_err(|e| e.to_string())?;

    Ok(current
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

pub fn mask_api_key(key: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    if key.len() <= 20 {
        return "***".to_string();
    }
    format!("{}***", &key[..20])
}

#[tauri::command]
pub fn get_api_key_masked(state: State<'_, AppState>) -> String {
    let config = state.config.lock().unwrap();
    let key = crate::commands::resolve_api_key(config.api_key.as_deref());
    mask_api_key(&key)
}

#[tauri::command]
pub fn set_api_key(key: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.api_key = if key.is_empty() { None } else { Some(key) };
    config.save(&state.app_data_dir).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_key_shows_prefix() {
        let masked = mask_api_key("sk-ant-api03-VERY-LONG-KEY-HERE");
        assert!(masked.ends_with("***"));
        assert_eq!(&masked[..20], "sk-ant-api03-VERY-LO");
    }

    #[test]
    fn test_mask_key_empty_returns_empty() {
        assert_eq!(mask_api_key(""), "");
    }

    #[test]
    fn test_mask_key_short_returns_stars() {
        assert_eq!(mask_api_key("short"), "***");
    }

    #[test]
    fn test_mask_key_exactly_20_returns_stars() {
        assert_eq!(mask_api_key("12345678901234567890"), "***");
    }
}
