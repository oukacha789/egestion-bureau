# Notifications macOS natives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Envoyer des notifications macOS natives quand un fichier est organisé ou qu'un doublon est détecté, avec throttle à 5 secondes pour éviter le spam.

**Architecture:** Nouveau module `notifications.rs` (ThrottleState + deux fonctions publiques). Wiring dans `lib.rs` : ajout du plugin Tauri, création du ThrottleState partagé, appels dans le pipeline existant. Aucun changement frontend.

**Tech Stack:** Rust, `tauri-plugin-notification = "2"`, `tokio::time::sleep`, `std::sync::{Arc, Mutex}`, `std::time::Instant`.

---

## Fichiers impactés

| Action | Fichier |
|--------|---------|
| Modifier | `src-tauri/Cargo.toml` |
| Modifier | `src-tauri/capabilities/default.json` |
| Créer   | `src-tauri/src/notifications.rs` |
| Modifier | `src-tauri/src/lib.rs` |

---

## Task 1 : Dépendance + permission

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1 : Ajouter `tauri-plugin-notification` à Cargo.toml**

Dans `src-tauri/Cargo.toml`, dans la section `[dependencies]`, ajouter après `tauri-plugin-dialog = "2"` :

```toml
tauri-plugin-notification = "2"
```

- [ ] **Step 2 : Ajouter la permission dans capabilities/default.json**

Remplacer le contenu de `src-tauri/capabilities/default.json` par :

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "notification:default"
  ]
}
```

- [ ] **Step 3 : Vérifier que cargo résout la dépendance**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo fetch
```

Attendu : pas d'erreur (téléchargement du crate).

- [ ] **Step 4 : Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities/default.json
git commit -m "feat(notifications): add tauri-plugin-notification dep + permission"
```

---

## Task 2 : Module `notifications.rs`

**Files:**
- Create: `src-tauri/src/notifications.rs`
- Test: dans le même fichier (`#[cfg(test)]`)

### Objectif

`ThrottleState` + deux fonctions publiques `notify_organized` et `notify_duplicate`. Le throttle évite d'envoyer plus d'une notification toutes les 5 secondes par type ; les fichiers intermédiaires sont accumulés et envoyés en batch à la fin de la fenêtre.

- [ ] **Step 1 : Écrire les tests unitaires de la logique throttle**

```rust
// src-tauri/src/notifications.rs
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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
```

- [ ] **Step 2 : Vérifier que les tests compilent (ils doivent passer, pas de logique à implémenter)**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo test notifications -- --nocapture 2>&1 | tail -15
```

Attendu : les tests passent (les fonctions helper sont déjà implémentées dans le même bloc).

- [ ] **Step 3 : Ajouter les fonctions `notify_organized` et `notify_duplicate`**

Ajouter après la définition de `batch_body_duplicate`, avant le bloc `#[cfg(test)]` :

```rust
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

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
```

- [ ] **Step 4 : Vérifier que tout compile**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo check 2>&1 | grep -E "error|warning: unused" | head -20
```

Note : `cargo check` va échouer tant que `mod notifications;` n'est pas déclaré dans `lib.rs`. C'est normal — continuer quand même, le wiring se fait en Task 3.

Alternative : ajouter temporairement `mod notifications;` dans `lib.rs` pour valider la compilation avant le wiring complet.

- [ ] **Step 5 : Relancer les tests pour confirmer**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo test notifications 2>&1 | tail -15
```

Attendu : 7 tests passent.

- [ ] **Step 6 : Commit**

```bash
git add src-tauri/src/notifications.rs
git commit -m "feat(notifications): ThrottleState + notify_organized + notify_duplicate"
```

---

## Task 3 : Wiring dans `lib.rs`

**Files:**
- Modify: `src-tauri/src/lib.rs`

### Objectif

Quatre changements dans `lib.rs` :
1. Déclarer `mod notifications;`
2. Enregistrer le plugin dans le builder
3. Créer `Arc<Mutex<ThrottleState>>` dans `setup()` et le passer à `start_pipeline`
4. Appeler `notify_organized` et `notify_duplicate` dans le pipeline

- [ ] **Step 1 : Ajouter `mod notifications;` et l'import `use crate::notifications`**

En haut de `src-tauri/src/lib.rs`, après `pub mod events;`, ajouter :

```rust
pub mod notifications;
```

Et ajouter dans les `use` existants :

```rust
use crate::notifications::{notify_duplicate, notify_organized, ThrottleState};
```

- [ ] **Step 2 : Enregistrer le plugin notification dans le builder**

Dans la fonction `run()`, après `.plugin(tauri_plugin_dialog::init())`, ajouter :

```rust
        .plugin(tauri_plugin_notification::init())
```

- [ ] **Step 3 : Créer le ThrottleState et le passer à `start_pipeline`**

Dans le bloc `.setup(|app| { ... })`, juste avant `Ok(())`, ajouter :

```rust
            let throttle = Arc::new(Mutex::new(ThrottleState::new()));
```

Et modifier l'appel à `start_pipeline` (ligne `tauri::async_runtime::spawn(start_pipeline(...))`) pour y ajouter `throttle` :

```rust
            tauri::async_runtime::spawn(start_pipeline(app_handle, pool, api_key, search_index, watcher, event_rx, throttle));
```

- [ ] **Step 4 : Mettre à jour la signature de `start_pipeline`**

Modifier la signature de la fonction `start_pipeline` :

```rust
async fn start_pipeline(
    app_handle: AppHandle,
    pool: SqlitePool,
    api_key: String,
    search_index: Arc<Mutex<SearchIndex>>,
    watcher: Arc<Mutex<FsWatcher>>,
    mut event_rx: tokio::sync::mpsc::Receiver<AppEvent>,
    throttle: Arc<Mutex<ThrottleState>>,
) {
```

- [ ] **Step 5 : Passer `throttle` dans le tokio::spawn interne**

Dans `start_pipeline`, le `tokio::spawn(async move { ... })` interne a besoin d'accéder au throttle. Ajouter avant le spawn :

```rust
    let throttle_clone = Arc::clone(&throttle);
```

Et ajouter `throttle_clone` dans le `move` du spawn en le clonant à chaque usage :

```rust
    tokio::spawn(async move {
        let _fw = watcher;
        while let Some(event) = event_rx.recv().await {
            match event {
                AppEvent::FileDetected(payload) => {
                    // ... code existant inchangé jusqu'à ...
                    } else {
                        let _ = app_handle_clone.emit(
                            "file-duplicate",
                            serde_json::json!({
                                "file_id": record.id,
                                "path": record.path,
                                "duplicate_of": record.duplicate_of,
                            }),
                        );
                        // AJOUTER ICI :
                        notify_duplicate(
                            &app_handle_clone,
                            &record.name,
                            Arc::clone(&throttle_clone),
                        );
                    }
                }
                AppEvent::FileOrganized(payload) => {
                    let _ = app_handle_clone.emit("file-organized", &payload);
                    // AJOUTER ICI :
                    notify_organized(
                        &app_handle_clone,
                        &payload.name,
                        &payload.category,
                        Arc::clone(&throttle_clone),
                    );
                }
                _ => {}
            }
        }
    });
```

- [ ] **Step 6 : Compiler et vérifier**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo build 2>&1 | grep -E "^error" | head -20
```

Attendu : aucune erreur. Des warnings sont acceptables.

- [ ] **Step 7 : Lancer tous les tests**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo test 2>&1 | tail -10
```

Attendu : 82+ tests passent, 0 failed.

- [ ] **Step 8 : Test manuel**

Lance `npm run tauri dev` depuis le répertoire du projet. Ajoute un dossier contenant quelques fichiers. Vérifie :
- Une notification macOS apparaît pour le premier fichier organisé (titre "eGestion", corps "nom_fichier → catégorie")
- Si plusieurs fichiers arrivent rapidement, une seule notification groupée ("N fichiers organisés") apparaît 5 secondes après la première
- Si un doublon est détecté, une notification "Doublon détecté" apparaît

- [ ] **Step 9 : Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(notifications): wiring pipeline — notify_organized + notify_duplicate"
git push origin main
```
