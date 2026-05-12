use crate::events::{AppEvent, FileDetectedPayload};
use anyhow::Result;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use tokio::sync::mpsc::Sender;
use tracing::{error, info};

pub struct FsWatcher {
    _watcher: RecommendedWatcher,
}

impl FsWatcher {
    pub fn new(event_tx: Sender<AppEvent>, watch_dirs: Vec<PathBuf>) -> Result<Self> {
        let tx = event_tx.clone();

        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                match result {
                    Ok(event) => {
                        if matches!(event.kind, EventKind::Create(_)) {
                            for path in event.paths {
                                if path.is_file() {
                                    let source = detect_source(&path);
                                    let payload = FileDetectedPayload {
                                        path: path.to_string_lossy().to_string(),
                                        source_dir: source,
                                    };
                                    if let Err(e) = tx.blocking_send(AppEvent::FileDetected(payload)) {
                                        error!("Failed to send FileDetected event: {}", e);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => error!("Watch error: {}", e),
                }
            },
            Config::default(),
        )?;

        for dir in &watch_dirs {
            if dir.exists() {
                watcher.watch(dir, RecursiveMode::NonRecursive)?;
                info!("Watching: {}", dir.display());
            } else {
                error!("Directory does not exist, skipping: {}", dir.display());
            }
        }

        Ok(Self { _watcher: watcher })
    }
}

fn detect_source(path: &Path) -> String {
    let path_str = path.to_string_lossy().to_lowercase();
    if path_str.contains("/downloads") {
        "downloads".to_string()
    } else if path_str.contains("/desktop") {
        "desktop".to_string()
    } else {
        "unknown".to_string()
    }
}

pub fn default_watch_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(desktop) = dirs::desktop_dir() {
        dirs.push(desktop);
    }
    if let Some(downloads) = dirs::download_dir() {
        dirs.push(downloads);
    }
    dirs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_source_desktop() {
        let path = PathBuf::from("/Users/test/Desktop/file.pdf");
        assert_eq!(detect_source(&path), "desktop");
    }

    #[test]
    fn test_detect_source_downloads() {
        let path = PathBuf::from("/Users/test/Downloads/file.zip");
        assert_eq!(detect_source(&path), "downloads");
    }

    #[test]
    fn test_detect_source_unknown() {
        let path = PathBuf::from("/Users/test/Documents/file.pdf");
        assert_eq!(detect_source(&path), "unknown");
    }

    #[test]
    fn test_default_watch_dirs_not_empty() {
        let dirs = default_watch_dirs();
        assert!(!dirs.is_empty());
    }
}
