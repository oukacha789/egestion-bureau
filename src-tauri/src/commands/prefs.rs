use crate::engine::assistant::OnboardingAnalysis;
use crate::engine::config::AppConfig;
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn get_data_dir(state: State<'_, AppState>) -> String {
    state.app_data_dir.to_string_lossy().into_owned()
}

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
    let prefix: String = key.chars().take(20).collect();
    format!("{prefix}***")
}

#[tauri::command]
pub fn get_api_key_masked(state: State<'_, AppState>) -> Result<String, String> {
    let stored = state.config.lock().map_err(|e| e.to_string())?.api_key.clone();
    let key = crate::commands::resolve_api_key(stored.as_deref());
    Ok(mask_api_key(&key))
}

#[tauri::command]
pub fn set_api_key(key: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    // Strip any leading garbage before the real key (e.g. "• \t" from copy-paste)
    let raw = key.trim().to_string();
    let key = if let Some(idx) = raw.find("sk-") {
        raw[idx..].to_string()
    } else {
        raw
    };
    config.api_key = if key.is_empty() { None } else { Some(key) };
    config.save(&state.app_data_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn analyze_for_onboarding(state: State<'_, AppState>) -> Result<OnboardingAnalysis, String> {
    let api_key = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        crate::commands::resolve_api_key(config.api_key.as_deref())
    };
    let watch_dirs: Vec<String> = state
        .watcher
        .lock()
        .map_err(|e| e.to_string())?
        .current_dirs()
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    // Use full path to avoid name conflict with this command
    crate::engine::assistant::analyze_for_onboarding(&api_key, &watch_dirs)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_key_shows_prefix() {
        let masked = mask_api_key("sk-ant-api03-VERY-LONG-KEY-HERE");
        assert!(masked.ends_with("***"));
        assert!(masked.starts_with("sk-ant-api03-VERY-LO"));
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

    #[test]
    fn test_mask_key_21_chars_shows_prefix() {
        let key = "a".repeat(21);
        assert_eq!(mask_api_key(&key), format!("{}***", "a".repeat(20)));
    }

    #[test]
    fn test_mask_key_multibyte_does_not_panic() {
        // 15 chars = 30 bytes — must not panic
        let _ = mask_api_key(&"é".repeat(15));
    }
}
