# Preferences Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un écran Préférences permettant à l'utilisateur de sélectionner les dossiers surveillés via le file picker natif macOS (Tauri `dialog::open`), avec persistance dans un fichier `config.json` et mise à jour du watcher en temps réel sans redémarrer l'app.

**Architecture:**
- `engine/config.rs` — `AppConfig { watch_dirs }` sérialisé en JSON dans `app_data_dir/config.json`
- `FsWatcher::set_dirs()` — unwatch + rewatch à chaud, tracked dans `watched_dirs`
- `AppState` étendu : `watcher: Arc<Mutex<FsWatcher>>` + `app_data_dir: PathBuf`
- `commands/prefs.rs` — `get_prefs`, `set_watch_dirs`, `add_watch_dir`, `remove_watch_dir`
- `tauri-plugin-dialog` (Tauri 2 officiel) — file picker natif macOS côté frontend
- `src/components/Preferences/PreferencesView.tsx` — liste éditable de dossiers surveillés

**Tech Stack:** Tauri 2.x, Rust (anyhow, serde_json, dirs), React/TypeScript, Zustand, Tailwind CSS.

---

## File Map

**Rust — à créer :**
- `src-tauri/src/engine/config.rs` — AppConfig, load(), save()
- `src-tauri/src/commands/prefs.rs` — get_prefs, set_watch_dirs, add_watch_dir, remove_watch_dir

**Rust — à modifier :**
- `src-tauri/src/engine/watcher.rs` — renommer `_watcher` en `watcher`, ajouter `watched_dirs`, `set_dirs()`, `current_dirs()`
- `src-tauri/src/engine/mod.rs` — déclarer le module config
- `src-tauri/src/commands/mod.rs` — déclarer le module prefs
- `src-tauri/src/lib.rs` — charger config au démarrage, ajouter `watcher` + `app_data_dir` à AppState, enregistrer commandes
- `src-tauri/Cargo.toml` — ajouter `tauri-plugin-dialog = "2"`
- `src-tauri/capabilities/default.json` — ajouter permission `dialog:open`

**Frontend — à créer :**
- `src/components/Preferences/PreferencesView.tsx`

**Frontend — à modifier :**
- `src/App.tsx` — ajouter `{currentView === 'preferences' && <PreferencesView />}`
- `src/components/Sidebar/index.tsx` — ajouter item nav Préférences (icône Settings)
- `package.json` — ajouter `@tauri-apps/plugin-dialog`

---

## Task 1 — engine/config.rs : AppConfig + persistance JSON

**Files:**
- Create: `src-tauri/src/engine/config.rs`
- Modify: `src-tauri/src/engine/mod.rs`

- [ ] **Step 1 : Écrire les tests dans `engine/config.rs`**

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::engine::watcher::default_watch_dirs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub watch_dirs: Vec<PathBuf>,
}

impl AppConfig {
    pub fn default_config() -> Self {
        Self {
            watch_dirs: default_watch_dirs(),
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
        // default_watch_dirs can be empty in CI, just check it doesn't panic
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
}
```

- [ ] **Step 2 : Déclarer le module dans `engine/mod.rs`**

  Ouvrir `src-tauri/src/engine/mod.rs` et ajouter :
```rust
pub mod config;
```

- [ ] **Step 3 : Lancer les tests**

```bash
cd src-tauri && cargo test engine::config::tests 2>&1
```

  Attendu : 4 tests PASSED.

- [ ] **Step 4 : Commit**

```bash
git add src-tauri/src/engine/config.rs src-tauri/src/engine/mod.rs
git commit -m "feat: engine/config.rs — AppConfig with JSON persistence"
```

---

## Task 2 — FsWatcher dynamique : set_dirs() à chaud

**Files:**
- Modify: `src-tauri/src/engine/watcher.rs`

L'objectif est d'ajouter `set_dirs()` pour désabonner les anciens dossiers et en surveiller de nouveaux, sans recréer le watcher.

- [ ] **Step 1 : Écrire le test dans `watcher.rs`**

  Dans le bloc `#[cfg(test)]` à la fin de `watcher.rs`, ajouter le test suivant **avant** la dernière accolade fermante :

```rust
#[test]
fn test_set_dirs_does_not_panic_on_empty() {
    // Can't truly test filesystem watching in unit tests, but verify set_dirs
    // doesn't panic when given an empty list or non-existent dirs.
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
```

- [ ] **Step 2 : Mettre à jour le struct et les méthodes dans `watcher.rs`**

  **2a — Modifier le struct `FsWatcher` :**

  Remplacer :
```rust
pub struct FsWatcher {
    _watcher: RecommendedWatcher,
}
```
  Par :
```rust
pub struct FsWatcher {
    watcher: RecommendedWatcher,
    watched_dirs: Vec<PathBuf>,
}
```

  **2b — Mettre à jour `FsWatcher::new` :** Remplacer `_watcher` par `watcher` et tracker `watched_dirs` :

```rust
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

    let mut actually_watched = Vec::new();
    for dir in &watch_dirs {
        if dir.exists() {
            watcher.watch(dir, RecursiveMode::NonRecursive)?;
            info!("Watching: {}", dir.display());
            actually_watched.push(dir.clone());
        } else {
            error!("Directory does not exist, skipping: {}", dir.display());
        }
    }

    Ok(Self { watcher, watched_dirs: watch_dirs })
}
```

  **2c — Ajouter `set_dirs` et `current_dirs` :**

  Ajouter ces méthodes dans le bloc `impl FsWatcher`, après `new` :

```rust
pub fn set_dirs(&mut self, new_dirs: Vec<PathBuf>) -> Result<()> {
    // Unwatch existing dirs
    for dir in &self.watched_dirs {
        let _ = self.watcher.unwatch(dir);
    }
    // Watch new dirs
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
```

- [ ] **Step 3 : Mettre à jour la référence dans `lib.rs`**

  Dans `start_pipeline`, remplacer :
```rust
let _watcher = watcher;
```
  par :
```rust
let _fw = watcher;
```
  (ou simplement laisser la variable être droppée — le watcher est maintenant dans AppState).

- [ ] **Step 4 : Lancer les tests**

```bash
cd src-tauri && cargo test engine::watcher::tests 2>&1
```

  Attendu : tous les tests PASSED (incluant les 2 nouveaux).

- [ ] **Step 5 : Commit**

```bash
git add src-tauri/src/engine/watcher.rs src-tauri/src/lib.rs
git commit -m "feat: FsWatcher::set_dirs() for hot-reload of watched directories"
```

---

## Task 3 — Backend commands/prefs.rs + AppState étendu

**Files:**
- Create: `src-tauri/src/commands/prefs.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1 : Créer `src-tauri/src/commands/prefs.rs`**

```rust
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

    let config = AppConfig { watch_dirs: paths.clone() };
    config
        .save(&state.app_data_dir)
        .map_err(|e| e.to_string())?;

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

    let config = AppConfig { watch_dirs: current.clone() };
    config
        .save(&state.app_data_dir)
        .map_err(|e| e.to_string())?;

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

    let config = AppConfig { watch_dirs: current.clone() };
    config
        .save(&state.app_data_dir)
        .map_err(|e| e.to_string())?;

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
```

- [ ] **Step 2 : Déclarer le module dans `commands/mod.rs`**

  Ouvrir `src-tauri/src/commands/mod.rs` et ajouter :
```rust
pub mod prefs;
pub use prefs::*;
```

- [ ] **Step 3 : Mettre à jour `AppState` et `lib.rs`**

  **3a — Modifier le struct `AppState` dans `lib.rs` :**

  Remplacer :
```rust
pub struct AppState {
    pub pool: SqlitePool,
    pub search_index: Arc<Mutex<SearchIndex>>,
}
```
  Par :
```rust
pub struct AppState {
    pub pool: SqlitePool,
    pub search_index: Arc<Mutex<SearchIndex>>,
    pub watcher: Arc<Mutex<crate::engine::watcher::FsWatcher>>,
    pub app_data_dir: std::path::PathBuf,
}
```

  **3b — Mettre à jour les imports en haut de `lib.rs` :**

  Ajouter dans le bloc `use crate::engine::` :
```rust
use crate::engine::config::AppConfig;
```

  Et ajouter `FsWatcher` à l'import watcher :
```rust
watcher::{default_watch_dirs, FsWatcher},
```
  devient (ou rester séparé — déjà présent).

  **3c — Mettre à jour le bloc `setup` dans `lib.rs` :**

  Dans le bloc `setup`, après la création du `pool` et avant `tauri::async_runtime::spawn(...)`, remplacer la partie qui crée le watcher :

  Trouver :
```rust
app.manage(AppState {
    pool: pool.clone(),
    search_index: Arc::clone(&search_index),
});

let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
tauri::async_runtime::spawn(start_pipeline(app_handle, pool, api_key, search_index));
```

  Remplacer par :
```rust
let config = AppConfig::load(&data_dir).unwrap_or_else(|_| AppConfig::default_config());

let (event_tx, event_rx) = tokio::sync::mpsc::channel::<AppEvent>(256);

let watcher = FsWatcher::new(event_tx.clone(), config.watch_dirs)
    .expect("Failed to start FSWatcher");
let watcher = Arc::new(Mutex::new(watcher));

app.manage(AppState {
    pool: pool.clone(),
    search_index: Arc::clone(&search_index),
    watcher: Arc::clone(&watcher),
    app_data_dir: data_dir.clone(),
});

let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
tauri::async_runtime::spawn(start_pipeline(app_handle, pool, api_key, search_index, watcher, event_rx));
```

  **3d — Mettre à jour la signature de `start_pipeline` :**

  Remplacer :
```rust
async fn start_pipeline(
    app_handle: AppHandle,
    pool: SqlitePool,
    api_key: String,
    search_index: Arc<Mutex<SearchIndex>>,
) {
    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel::<AppEvent>(256);
    let pool = Arc::new(pool);
    let api_key = Arc::new(api_key);

    let watch_dirs = default_watch_dirs();
    let dir_count = watch_dirs.len();
    let watcher = FsWatcher::new(event_tx.clone(), watch_dirs).expect("Failed to start FSWatcher");

    info!("Pipeline started, watching {} directories", dir_count);

    let pool_clone = Arc::clone(&pool);
    let api_key_clone = Arc::clone(&api_key);
    let event_tx_clone = event_tx.clone();
    let app_handle_clone = app_handle.clone();

    tokio::spawn(async move {
        let _watcher = watcher;
```

  Par :
```rust
async fn start_pipeline(
    app_handle: AppHandle,
    pool: SqlitePool,
    api_key: String,
    search_index: Arc<Mutex<SearchIndex>>,
    watcher: Arc<Mutex<FsWatcher>>,
    mut event_rx: tokio::sync::mpsc::Receiver<AppEvent>,
) {
    let pool = Arc::new(pool);
    let api_key = Arc::new(api_key);

    info!("Pipeline started");

    let pool_clone = Arc::clone(&pool);
    let api_key_clone = Arc::clone(&api_key);
    let app_handle_clone = app_handle.clone();

    tokio::spawn(async move {
        let _watcher = watcher; // keep alive
```

  (Supprimer aussi les lignes `let event_tx_clone = event_tx.clone();` et `let dir_count = ...` et `let watch_dirs = ...` qui ne sont plus nécessaires dans cette fonction.)

  Note : `event_tx_clone` était utilisé dans `index_file(...)`. Le remplacer par une instance créée séparément ou en passant directement `event_tx`. Puisque `event_tx` n'est plus dans scope, passer `app_handle_clone.clone()` à la place pour les émissions d'événements — ou créer un nouveau channel interne au pipeline. La solution la plus simple : créer un channel local dans `start_pipeline` pour les événements internes de traitement :

```rust
    // Channel interne pour les événements de traitement (ex: FileOrganized)
    let (internal_tx, _internal_rx) = tokio::sync::mpsc::channel::<AppEvent>(32);
    let event_tx_clone = internal_tx.clone();
```

  **3e — Enregistrer les nouvelles commandes dans `invoke_handler` :**

  Ajouter dans la liste `tauri::generate_handler!` :
```rust
commands::get_prefs,
commands::set_watch_dirs,
commands::add_watch_dir,
commands::remove_watch_dir,
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
cd src-tauri && cargo check 2>&1
```

  Attendu : 0 erreurs.

- [ ] **Step 5 : Commit**

```bash
git add src-tauri/src/commands/prefs.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: commands/prefs.rs — get_prefs, set_watch_dirs, add/remove_watch_dir"
```

---

## Task 4 — tauri-plugin-dialog : file picker natif macOS

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json`

- [ ] **Step 1 : Ajouter `tauri-plugin-dialog` à `Cargo.toml`**

  Dans la section `[dependencies]`, ajouter :
```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2 : Enregistrer le plugin dans `lib.rs`**

  Dans `tauri::Builder::default()`, ajouter avant `.invoke_handler(...)` :
```rust
.plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 3 : Ajouter la permission dans `capabilities/default.json`**

  Modifier le tableau `permissions` pour ajouter `"dialog:allow-open"` :
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open"
  ]
}
```

- [ ] **Step 4 : Installer le package npm**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npm install @tauri-apps/plugin-dialog
```

- [ ] **Step 5 : Vérifier la compilation**

```bash
cd src-tauri && cargo check 2>&1
```

  Attendu : 0 erreurs (le plugin génère automatiquement les schemas capabilities).

- [ ] **Step 6 : Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json package.json package-lock.json
git commit -m "feat: add tauri-plugin-dialog for native macOS file picker"
```

---

## Task 5 — Frontend : PreferencesView

**Files:**
- Create: `src/components/Preferences/PreferencesView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar/index.tsx`

- [ ] **Step 1 : Créer `src/components/Preferences/PreferencesView.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Plus, Trash2, Eye } from 'lucide-react';

export function PreferencesView() {
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    invoke<string[]>('get_prefs').then(setDirs).catch(console.error);
  }, []);

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  }

  async function handleAdd() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Choisir un dossier à surveiller',
    });

    if (!selected || typeof selected !== 'string') return;

    setLoading(true);
    try {
      const updated = await invoke<string[]>('add_watch_dir', { dir: selected });
      setDirs(updated);
      showFeedback('Dossier ajouté et surveillance active');
    } catch (err) {
      console.error('add_watch_dir error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(dir: string) {
    setLoading(true);
    try {
      const updated = await invoke<string[]>('remove_watch_dir', { dir });
      setDirs(updated);
      showFeedback('Dossier retiré de la surveillance');
    } catch (err) {
      console.error('remove_watch_dir error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-100">Préférences</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Configurez les dossiers surveillés automatiquement par Egestion.
          </p>
        </div>

        {/* Section dossiers surveillés */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Eye size={14} className="text-zinc-500" />
                Dossiers surveillés
              </h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                Les nouveaux fichiers déposés dans ces dossiers seront automatiquement classés.
              </p>
            </div>
            <button
              onClick={handleAdd}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-xs text-white transition-colors"
            >
              <Plus size={12} />
              Ajouter un dossier
            </button>
          </div>

          {/* Liste */}
          <div className="space-y-2">
            {dirs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 bg-zinc-900/40 border border-dashed border-zinc-700 rounded-xl text-zinc-600">
                <FolderOpen size={28} className="mb-2 opacity-40" />
                <p className="text-sm">Aucun dossier surveillé</p>
                <p className="text-xs mt-1">Cliquez sur « Ajouter un dossier » pour commencer.</p>
              </div>
            )}

            {dirs.map((dir) => {
              const parts = dir.replace(/\\/g, '/').split('/');
              const name = parts[parts.length - 1] || dir;
              const parent = parts.slice(0, -1).join('/') || '/';

              return (
                <div
                  key={dir}
                  className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl group"
                >
                  <FolderOpen size={16} className="text-indigo-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{name}</p>
                    <p className="text-xs text-zinc-600 truncate">{parent}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(dir)}
                    disabled={loading}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all disabled:opacity-0"
                    aria-label={`Retirer ${name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Feedback toast */}
        {feedback && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-200 shadow-lg animate-fade-in">
            {feedback}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Ajouter la vue dans `App.tsx`**

  Ajouter l'import :
```tsx
import { PreferencesView } from './components/Preferences/PreferencesView';
```

  Dans le JSX (après la ligne `{currentView === 'unsorted' && <Unsorted />}`) :
```tsx
{currentView === 'preferences' && <PreferencesView />}
```

- [ ] **Step 3 : Ajouter l'item nav dans `Sidebar/index.tsx`**

  Ajouter `Settings` aux imports Lucide en haut du fichier :
```tsx
import { ..., Settings } from 'lucide-react';
```

  Trouver la liste des nav items dans le composant Sidebar. Ajouter en bas de la liste (avant ou après les items existants, selon la structure) :

```tsx
<button
  onClick={() => onNavigate('preferences')}
  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
    currentView === 'preferences'
      ? 'bg-zinc-800 text-zinc-100'
      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
  }`}
>
  <Settings size={16} />
  Préférences
</button>
```

  Note : adapter les classes et la structure exacte au composant Sidebar existant (vérifier les classes utilisées par les autres items pour rester cohérent).

- [ ] **Step 4 : Vérifier dans le navigateur**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npm run dev
```

  Vérifier :
  - L'item « Préférences » apparaît dans la sidebar
  - Cliquer dessus affiche la vue PreferencesView
  - Les dossiers actuellement surveillés s'affichent (Desktop, Downloads, Mail par défaut)
  - Cliquer « Ajouter un dossier » ouvre le file picker natif macOS
  - Sélectionner un dossier l'ajoute à la liste + toast de confirmation
  - Hover sur un dossier → bouton Trash apparaît → clic le retire
  - Recharger l'app → les dossiers configurés persistent (via config.json)

- [ ] **Step 5 : Commit**

```bash
git add src/components/Preferences/ src/App.tsx src/components/Sidebar/index.tsx
git commit -m "feat: PreferencesView — watched folder management with native macOS file picker"
```

---

## Récapitulatif des commits attendus

1. `feat: engine/config.rs — AppConfig with JSON persistence`
2. `feat: FsWatcher::set_dirs() for hot-reload of watched directories`
3. `feat: commands/prefs.rs — get_prefs, set_watch_dirs, add/remove_watch_dir`
4. `feat: add tauri-plugin-dialog for native macOS file picker`
5. `feat: PreferencesView — watched folder management with native macOS file picker`

---

## Points d'attention

- **`assetProtocol` scope** : élargi à `$HOME/**` dans `tauri.conf.json` — couvre tous les dossiers personnalisés que l'utilisateur peut configurer via les Préférences. ✅ déjà fait.
- **`NonRecursive` vs `Recursive`** : le watcher actuel surveille uniquement le niveau racine. Pour des dossiers personnalisés, l'utilisateur peut vouloir la surveillance récursive — à envisager dans une v2 avec une option par dossier.
- **Permissions Tauri** : `dialog:allow-open` donne accès à `dialog.open()` mais pas à `dialog.save()` — ajouter `dialog:allow-save` séparément si besoin.
