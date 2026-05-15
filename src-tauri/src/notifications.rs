use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

const THROTTLE: Duration = Duration::from_secs(5);

pub struct ThrottleState {
    pub last_sent_organized: Option<Instant>,
    pub pending_organized: u32,
    pub organized_flush_scheduled: bool,

    pub last_sent_duplicate: Option<Instant>,
    pub pending_duplicate: u32,
    pub duplicate_flush_scheduled: bool,
}

impl ThrottleState {
    pub fn new() -> Self {
        Self {
            last_sent_organized: None,
            pending_organized: 0,
            organized_flush_scheduled: false,
            last_sent_duplicate: None,
            pending_duplicate: 0,
            duplicate_flush_scheduled: false,
        }
    }
}

pub fn can_send_immediate(last_sent: Option<Instant>) -> bool {
    last_sent
        .map(|t| t.elapsed() >= THROTTLE)
        .unwrap_or(true)
}

pub fn batch_body_organized(count: u32) -> String {
    if count == 1 {
        "1 fichier organisé".to_string()
    } else {
        format!("{} fichiers organisés", count)
    }
}

pub fn batch_body_duplicate(count: u32) -> String {
    if count == 1 {
        "1 doublon supplémentaire détecté".to_string()
    } else {
        format!("{} doublons supplémentaires détectés", count)
    }
}

fn send_notification(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        tracing::warn!("Notification error: {}", e);
    }
}

pub fn notify_organized(
    app: &AppHandle,
    name: &str,
    category: &str,
    state: Arc<Mutex<ThrottleState>>,
) {
    let mut guard = state.lock().unwrap();
    if can_send_immediate(guard.last_sent_organized) {
        let body = format!("{} → {}", name, category);
        guard.last_sent_organized = Some(Instant::now());
        guard.pending_organized = 0;
        guard.organized_flush_scheduled = false;
        drop(guard);
        send_notification(app, "eGestion", &body);
    } else {
        guard.pending_organized += 1;
        if !guard.organized_flush_scheduled {
            guard.organized_flush_scheduled = true;
            let last_sent = guard.last_sent_organized.unwrap();
            drop(guard);
            let app_clone = app.clone();
            let state_clone = Arc::clone(&state);
            tokio::spawn(async move {
                let elapsed = last_sent.elapsed();
                if elapsed < THROTTLE {
                    tokio::time::sleep(THROTTLE - elapsed).await;
                }
                let mut g = state_clone.lock().unwrap();
                let count = g.pending_organized;
                g.pending_organized = 0;
                g.last_sent_organized = Some(Instant::now());
                g.organized_flush_scheduled = false;
                drop(g);
                if count > 0 {
                    send_notification(&app_clone, "eGestion", &batch_body_organized(count));
                }
            });
        }
    }
}

pub fn notify_duplicate(
    app: &AppHandle,
    name: &str,
    state: Arc<Mutex<ThrottleState>>,
) {
    let mut guard = state.lock().unwrap();
    if can_send_immediate(guard.last_sent_duplicate) {
        let body = format!("{} est un doublon", name);
        guard.last_sent_duplicate = Some(Instant::now());
        guard.pending_duplicate = 0;
        guard.duplicate_flush_scheduled = false;
        drop(guard);
        send_notification(app, "Doublon détecté", &body);
    } else {
        guard.pending_duplicate += 1;
        if !guard.duplicate_flush_scheduled {
            guard.duplicate_flush_scheduled = true;
            let last_sent = guard.last_sent_duplicate.unwrap();
            drop(guard);
            let app_clone = app.clone();
            let state_clone = Arc::clone(&state);
            tokio::spawn(async move {
                let elapsed = last_sent.elapsed();
                if elapsed < THROTTLE {
                    tokio::time::sleep(THROTTLE - elapsed).await;
                }
                let mut g = state_clone.lock().unwrap();
                let count = g.pending_duplicate;
                g.pending_duplicate = 0;
                g.last_sent_duplicate = Some(Instant::now());
                g.duplicate_flush_scheduled = false;
                drop(g);
                if count > 0 {
                    send_notification(&app_clone, "Doublon détecté", &batch_body_duplicate(count));
                }
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_state_can_send_immediately() {
        let state = ThrottleState::new();
        assert!(can_send_immediate(state.last_sent_organized));
        assert!(can_send_immediate(state.last_sent_duplicate));
    }

    #[test]
    fn test_recent_send_cannot_send() {
        let recent = Some(Instant::now());
        assert!(!can_send_immediate(recent));
    }

    #[test]
    fn test_old_send_can_send() {
        let old = Some(Instant::now() - Duration::from_secs(6));
        assert!(can_send_immediate(old));
    }

    #[test]
    fn test_batch_body_organized_singular() {
        assert_eq!(batch_body_organized(1), "1 fichier organisé");
    }

    #[test]
    fn test_batch_body_organized_plural() {
        assert_eq!(batch_body_organized(5), "5 fichiers organisés");
    }

    #[test]
    fn test_batch_body_duplicate_singular() {
        assert_eq!(batch_body_duplicate(1), "1 doublon supplémentaire détecté");
    }

    #[test]
    fn test_batch_body_duplicate_plural() {
        assert_eq!(batch_body_duplicate(3), "3 doublons supplémentaires détectés");
    }
}
