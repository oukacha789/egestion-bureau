use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::engine::watcher::default_watch_dirs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub watch_dirs: Vec<PathBuf>,
    #[serde(default)]
    pub api_key: Option<String>,
}

impl AppConfig {
    pub fn default_config() -> Self {
        Self {
            watch_dirs: default_watch_dirs(),
            api_key: None,
        }
    }

    pub fn load(app_data_dir: &Path) -> Result<Self> {
        let path = app_data_dir.join("config.json");
        if !path.exists() {
            return Ok(Self::default_config());
        }
        let content = std::fs::read_to_string(&path)?;
        let config: Self = serde_json::from_str(&content)?;
        Ok(config)
    }

    pub fn save(&self, app_data_dir: &Path) -> Result<()> {
        let path = app_data_dir.join("config.json");
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_load_returns_default_when_no_file() {
        let dir = tempdir().unwrap();
        let config = AppConfig::load(dir.path()).unwrap();
        let _ = config.watch_dirs;
    }

    #[test]
    fn test_save_and_reload_roundtrip() {
        let dir = tempdir().unwrap();
        let original = AppConfig {
            watch_dirs: vec![
                PathBuf::from("/tmp/a"),
                PathBuf::from("/tmp/b"),
            ],
            api_key: None,
        };
        original.save(dir.path()).unwrap();

        let loaded = AppConfig::load(dir.path()).unwrap();
        assert_eq!(loaded.watch_dirs, vec![
            PathBuf::from("/tmp/a"),
            PathBuf::from("/tmp/b"),
        ]);
    }

    #[test]
    fn test_save_creates_valid_json_file() {
        let dir = tempdir().unwrap();
        let config = AppConfig {
            watch_dirs: vec![PathBuf::from("/tmp/test")],
            api_key: None,
        };
        config.save(dir.path()).unwrap();

        let json_path = dir.path().join("config.json");
        assert!(json_path.exists());
        let content = std::fs::read_to_string(&json_path).unwrap();
        assert!(content.contains("watch_dirs"));
    }

    #[test]
    fn test_load_invalid_json_returns_err() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("config.json"), "not json").unwrap();
        let result = AppConfig::load(dir.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_api_key_serde_default_none() {
        let json = r#"{"watch_dirs":[]}"#;
        let config: AppConfig = serde_json::from_str(json).unwrap();
        assert!(config.api_key.is_none());
    }

    #[test]
    fn test_api_key_round_trip() {
        let dir = tempdir().unwrap();
        let config = AppConfig {
            watch_dirs: vec![],
            api_key: Some("sk-ant-test-key".to_string()),
        };
        config.save(dir.path()).unwrap();
        let loaded = AppConfig::load(dir.path()).unwrap();
        assert_eq!(loaded.api_key, Some("sk-ant-test-key".to_string()));
    }

    #[test]
    fn test_api_key_none_round_trip() {
        let dir = tempdir().unwrap();
        let config = AppConfig { watch_dirs: vec![], api_key: None };
        config.save(dir.path()).unwrap();
        let loaded = AppConfig::load(dir.path()).unwrap();
        assert!(loaded.api_key.is_none());
    }
}
