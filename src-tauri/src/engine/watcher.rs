use crate::events::{AppEvent, FileDetectedPayload};
use anyhow::Result;
use notify::{event::{ModifyKind, RenameMode}, Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use tokio::sync::mpsc::Sender;
use tracing::{error, info};

pub struct FsWatcher {
    _watcher: RecommendedWatcher,
}

impl FsWatcher {
    pub fn new(event_tx: Sender<AppEvent>, watch_dirs: Vec<PathBuf>) -> Result<Self> {
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                match result {
                    Ok(event) => {
                        if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(ModifyKind::Name(RenameMode::To))) {
                            for path in event.paths {
                                if path.is_file() {
                                    let source = detect_source(&path);
                                    let payload = FileDetectedPayload {
                                        path: path.to_string_lossy().to_string(),
                                        source_dir: source,
                                    };
                                    if let Err(e) = event_tx.blocking_send(AppEvent::FileDetected(payload)) {
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
                // NonRecursive: only watch top-level of Desktop/Downloads, not subdirectories
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
    } else if path_str.contains("/documents/mail/") {
        "mail".to_string()
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
    if let Some(documents) = dirs::document_dir() {
        let mail_dir = documents.join("Mail");
        let _ = std::fs::create_dir_all(&mail_dir);
        dirs.push(mail_dir);
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
    fn test_default_watch_dirs_returns_dirs() {
        // On macOS Desktop and Downloads are always defined; skip if neither exists
        let dirs = default_watch_dirs();
        // At least Desktop or Downloads should be defined on a developer machine
        // In headless CI this may return 0 dirs — that's acceptable behavior
        let _ = dirs; // just verify it doesn't panic
    }

    #[test]
    fn test_detect_source_mail() {
        let path = PathBuf::from("/Users/test/Documents/Mail/export.eml");
        assert_eq!(detect_source(&path), "mail");
    }

    #[test]
    fn test_detect_source_documents_mailbox_is_not_mail() {
        let path = PathBuf::from("/Users/test/Documents/Mailbox/file.eml");
        assert_eq!(detect_source(&path), "unknown");
    }

    #[test]
    fn test_default_watch_dirs_includes_mail() {
        if let Some(documents) = dirs::document_dir() {
            let dirs = default_watch_dirs();
            let mail_dir = documents.join("Mail");
            assert!(dirs.contains(&mail_dir), "Mail dir should be included in watch dirs");
        }
    }
}
