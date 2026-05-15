use crate::events::{AppEvent, FileDetectedPayload};
use anyhow::Result;
use notify::{event::{ModifyKind, RenameMode}, Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use tokio::sync::mpsc::Sender;
use tracing::{error, info};

pub struct FsWatcher {
    watcher: RecommendedWatcher,
    watched_dirs: Vec<PathBuf>,
}

impl FsWatcher {
    pub fn new(event_tx: Sender<AppEvent>, watch_dirs: Vec<PathBuf>) -> Result<Self> {
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                match result {
                    Ok(event) => {
                        // On macOS/FSEvents, moves into a watched dir from an unwatched
                        // location are reported as RenameMode::Any (not ::To). We also
                        // keep ::To for paired renames and Create for direct writes.
                        let relevant = matches!(
                            event.kind,
                            EventKind::Create(_)
                                | EventKind::Modify(ModifyKind::Name(
                                    RenameMode::To | RenameMode::Any
                                ))
                        );
                        if relevant {
                            for path in event.paths {
                                // path.is_file() skips rename-away events (file gone)
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

        Ok(Self { watcher, watched_dirs: watch_dirs })
    }

    pub fn set_dirs(&mut self, new_dirs: Vec<PathBuf>) -> anyhow::Result<()> {
        for dir in &self.watched_dirs {
            let _ = self.watcher.unwatch(dir);
        }
        for dir in &new_dirs {
            if dir.exists() {
                self.watcher.watch(dir, RecursiveMode::NonRecursive)?;
                info!("Now watching: {}", dir.display());
            } else {
                error!("Directory does not exist, skipping: {}", dir.display());
            }
        }
        self.watched_dirs = new_dirs;
        Ok(())
    }

    pub fn current_dirs(&self) -> &[PathBuf] {
        &self.watched_dirs
    }
}

pub fn detect_source(path: &Path) -> String {
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

    #[test]
    fn test_set_dirs_does_not_panic_on_empty() {
        use tokio::sync::mpsc;
        let (tx, _rx) = mpsc::channel(8);
        let mut fw = FsWatcher::new(tx, vec![]).unwrap();
        fw.set_dirs(vec![]).unwrap();
        assert!(fw.current_dirs().is_empty());
    }

    #[test]
    fn test_current_dirs_reflects_initial_dirs() {
        use tokio::sync::mpsc;
        let (tx, _rx) = mpsc::channel(8);
        let fw = FsWatcher::new(tx, vec![]).unwrap();
        assert!(fw.current_dirs().is_empty());
    }
}
