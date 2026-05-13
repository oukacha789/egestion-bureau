# Egestion Phase 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter 5 features à Egestion Bureau : tags manuels, Quick Look preview, assistant conversationnel ⌘J, embeddings sémantiques via Claude haiku → Tantivy, export CSV + rapport HTML.

**Architecture:** Modules Rust dédiés par feature (`engine/embeddings.rs`, `engine/assistant.rs`, `engine/export.rs`) + split de `commands.rs` en `commands/` submodule. AppState inchangé — tous les modules sont stateless et utilisent `pool` + `search_index` existants.

**Tech Stack:** Tauri 2.x, Rust (anyhow, sqlx, reqwest, tantivy 0.22), React/TypeScript, Zustand, Tailwind CSS.

---

## File Map

**Rust — à créer :**
- `src-tauri/src/commands/mod.rs` — re-exports (refactor de commands.rs)
- `src-tauri/src/commands/files.rs` — commandes existantes déplacées
- `src-tauri/src/commands/tags.rs` — get_tags, add_tag, remove_tag
- `src-tauri/src/commands/assistant.rs` — ask_assistant
- `src-tauri/src/commands/export.rs` — export_csv, export_report
- `src-tauri/src/engine/embeddings.rs` — generate_description via Claude haiku
- `src-tauri/src/engine/assistant.rs` — ask() via Claude sonnet-4-6
- `src-tauri/src/engine/export.rs` — build_csv(), build_report()

**Rust — à modifier :**
- `src-tauri/src/engine/search.rs` — ajout champ `description`, migration schema
- `src-tauri/src/engine/mod.rs` — déclarer nouveaux modules engine
- `src-tauri/src/lib.rs` — invoke_handler mis à jour, pipeline enrichi
- `src-tauri/tauri.conf.json` — activer assetProtocol

**Frontend — à créer :**
- `src/components/Explorer/TagEditor.tsx`
- `src/components/Preview/QuickLookPanel.tsx`
- `src/components/Assistant/AssistantOverlay.tsx`
- `src/components/Assistant/MessageList.tsx`
- `src/components/Assistant/InputBar.tsx`

**Frontend — à modifier :**
- `src/store/index.ts` — slice assistant
- `src/hooks/useKeyboard.ts` — ⌘J
- `src/components/Explorer/MetadataPanel.tsx` — TagEditor + QuickLookPanel
- `src/components/Explorer/FileList.tsx` — bouton Export CSV
- `src/components/Dashboard/index.tsx` — bouton Rapport HTML
- `src/App.tsx` — AssistantOverlay

---

## Task 1 — Split commands.rs → commands/ module

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/files.rs`
- Delete: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Créer `src-tauri/src/commands/files.rs`**

  Copier l'intégralité du contenu de `src-tauri/src/commands.rs` dans ce nouveau fichier (même code, même contenu exact).

- [ ] **Step 2: Créer `src-tauri/src/commands/mod.rs`**

```rust
pub mod files;
pub mod tags;
pub mod assistant;
pub mod export;

pub use files::*;
pub use tags::*;
pub use assistant::*;
pub use export::*;
```

  Note : les modules `tags`, `assistant`, `export` n'existent pas encore — ils seront créés dans les prochains tasks. Pour compiler maintenant, créer des fichiers vides temporaires :

```bash
touch src-tauri/src/commands/tags.rs
touch src-tauri/src/commands/assistant.rs
touch src-tauri/src/commands/export.rs
```

- [ ] **Step 3: Supprimer `src-tauri/src/commands.rs`**

```bash
rm src-tauri/src/commands.rs
```

- [ ] **Step 4: Mettre à jour `src-tauri/src/lib.rs`**

  Changer la première ligne de :
```rust
pub mod commands;
```
  à (aucun changement nécessaire — `pub mod commands;` fonctionne avec le dossier `commands/mod.rs`). Vérifier que le reste de `lib.rs` compile sans modification.

- [ ] **Step 5: Vérifier la compilation**

```bash
cd src-tauri && cargo check 2>&1
```

  Attendu : 0 erreurs. Les fichiers vides `tags.rs`, `assistant.rs`, `export.rs` compilent car ils sont vides.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/
git rm src-tauri/src/commands.rs
git commit -m "refactor: split commands.rs into commands/ submodule"
```

---

## Task 2 — Tags manuels — backend

**Files:**
- Modify: `src-tauri/src/commands/tags.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Écrire les tests dans `commands/tags.rs`**

```rust
use crate::AppState;
use std::sync::{Arc, Mutex};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_tags(
    file_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    sqlx::query_scalar::<_, String>(
        "SELECT tag FROM tags WHERE file_id = ? ORDER BY weight DESC, tag ASC"
    )
    .bind(&file_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_tag(
    file_id: String,
    tag: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, ?, ?, 'manual', 1.0)"
    )
    .bind(&id)
    .bind(&file_id)
    .bind(&tag)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_tag(
    file_id: String,
    tag: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM tags WHERE file_id = ? AND tag = ?")
        .bind(&file_id)
        .bind(&tag)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn make_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        // Insert a test file
        sqlx::query(
            "INSERT INTO files (id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, is_duplicate, is_organized) VALUES ('f1', '/test/file.pdf', 'file.pdf', 'pdf', 1024, 'abc', 0, 0, 0, 0, 0)"
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn test_add_and_get_tag() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, 'f1', 'facture', 'manual', 1.0)"
        )
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();

        let tags: Vec<String> = sqlx::query_scalar::<_, String>(
            "SELECT tag FROM tags WHERE file_id = 'f1'"
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(tags, vec!["facture"]);
    }

    #[tokio::test]
    async fn test_remove_tag() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, 'f1', 'important', 'manual', 1.0)"
        )
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("DELETE FROM tags WHERE file_id = 'f1' AND tag = 'important'")
            .execute(&pool)
            .await
            .unwrap();

        let tags: Vec<String> = sqlx::query_scalar::<_, String>(
            "SELECT tag FROM tags WHERE file_id = 'f1'"
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert!(tags.is_empty());
    }

    #[tokio::test]
    async fn test_duplicate_tag_ignored() {
        let pool = make_db().await;
        for _ in 0..2 {
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, 'f1', 'dup', 'manual', 1.0)"
            )
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();
        }
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags WHERE file_id = 'f1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }
}
```

- [ ] **Step 2: Lancer les tests**

```bash
cd src-tauri && cargo test commands::tags::tests 2>&1
```

  Attendu : 3 tests PASSED.

- [ ] **Step 3: Enregistrer les nouvelles commandes dans `lib.rs`**

  Dans `lib.rs`, modifier `invoke_handler` pour ajouter les 3 nouvelles commandes :

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_recent_activity,
    commands::perform_undo,
    commands::get_unsorted_files,
    commands::validate_unsorted_file,
    commands::get_stats,
    commands::search_files,
    commands::get_files_by_category,
    commands::get_file_metadata,
    commands::open_in_finder,
    commands::get_tags,
    commands::add_tag,
    commands::remove_tag,
])
```

- [ ] **Step 4: Vérifier compilation**

```bash
cd src-tauri && cargo check 2>&1
```

  Attendu : 0 erreurs.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/tags.rs src-tauri/src/lib.rs
git commit -m "feat: add get_tags, add_tag, remove_tag commands"
```

---

## Task 3 — Tags manuels — frontend

**Files:**
- Create: `src/components/Explorer/TagEditor.tsx`
- Modify: `src/components/Explorer/MetadataPanel.tsx`

- [ ] **Step 1: Créer `src/components/Explorer/TagEditor.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Plus } from 'lucide-react';

interface Props {
  fileId: string;
}

export function TagEditor({ fileId }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    loadTags();
  }, [fileId]);

  async function loadTags() {
    try {
      const result = await invoke<string[]>('get_tags', { fileId });
      setTags(result);
    } catch (err) {
      console.error('get_tags error:', err);
    }
  }

  async function handleAdd() {
    const tag = input.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    try {
      await invoke('add_tag', { fileId, tag });
      setTags((prev) => [...prev, tag]);
      setInput('');
    } catch (err) {
      console.error('add_tag error:', err);
    }
  }

  async function handleRemove(tag: string) {
    try {
      await invoke('remove_tag', { fileId, tag });
      setTags((prev) => prev.filter((t) => t !== tag));
    } catch (err) {
      console.error('remove_tag error:', err);
    }
  }

  return (
    <div>
      <div className="text-zinc-500 mb-1.5 text-xs">Tags manuels</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-900/60 border border-indigo-700/50 rounded text-indigo-200 text-xs"
          >
            {t}
            <button
              onClick={() => handleRemove(t)}
              className="text-indigo-400 hover:text-indigo-200 transition-colors"
              aria-label={`Supprimer tag ${t}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Ajouter un tag…"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleAdd}
          className="p-1 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors text-zinc-300"
          aria-label="Ajouter tag"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mettre à jour `MetadataPanel.tsx`**

  Ajouter l'import en haut du fichier :
```tsx
import { TagEditor } from './TagEditor';
```

  Dans le JSX, après le bloc des tags read-only existants (le bloc `{metadata.tags.length > 0 && ...}`), ajouter :

```tsx
<TagEditor fileId={metadata.id} />
```

- [ ] **Step 3: Vérifier dans le navigateur**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npm run dev
```

  Ouvrir l'app, aller dans Explorer, sélectionner un fichier, vérifier que `TagEditor` apparaît dans le MetadataPanel, ajouter/supprimer un tag.

- [ ] **Step 4: Commit**

```bash
git add src/components/Explorer/TagEditor.tsx src/components/Explorer/MetadataPanel.tsx
git commit -m "feat: TagEditor component for manual tags in MetadataPanel"
```

---

## Task 4 — Quick Look — backend + config

**Files:**
- Modify: `src-tauri/src/commands/files.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Ajouter `read_text_preview` dans `commands/files.rs`**

  Ajouter à la fin du fichier :

```rust
#[tauri::command]
pub async fn read_text_preview(path: String) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 2000];
    let n = file.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_read_text_preview_returns_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "hello world").unwrap();
        let result = read_text_preview(path.to_str().unwrap().to_string()).await;
        assert_eq!(result.unwrap(), "hello world");
    }

    #[tokio::test]
    async fn test_read_text_preview_truncates_at_2000() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.txt");
        let content = "x".repeat(5000);
        std::fs::write(&path, &content).unwrap();
        let result = read_text_preview(path.to_str().unwrap().to_string()).await;
        assert_eq!(result.unwrap().len(), 2000);
    }

    #[tokio::test]
    async fn test_read_text_preview_missing_file_returns_err() {
        let result = read_text_preview("/tmp/does_not_exist_xyz.txt".to_string()).await;
        assert!(result.is_err());
    }
}
```

- [ ] **Step 2: Lancer les tests**

```bash
cd src-tauri && cargo test commands::files::tests 2>&1
```

  Attendu : 3 tests PASSED.

- [ ] **Step 3: Ajouter `read_text_preview` dans `lib.rs` invoke_handler**

  Ajouter `commands::read_text_preview,` à la fin de la liste existante dans `generate_handler!` (la liste complète doit inclure toutes les commandes des tasks précédentes) :

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_recent_activity,
    commands::perform_undo,
    commands::get_unsorted_files,
    commands::validate_unsorted_file,
    commands::get_stats,
    commands::search_files,
    commands::get_files_by_category,
    commands::get_file_metadata,
    commands::open_in_finder,
    commands::get_tags,
    commands::add_tag,
    commands::remove_tag,
    commands::read_text_preview,
])
```

- [ ] **Step 4: Activer le protocol asset dans `tauri.conf.json`**

  Modifier la section `app.security` :

```json
"security": {
  "csp": null,
  "assetProtocol": {
    "enable": true,
    "scope": [
      "$DOCUMENT/**",
      "$DESKTOP/**",
      "$DOWNLOAD/**"
    ]
  }
}
```

- [ ] **Step 5: Vérifier compilation**

```bash
cd src-tauri && cargo check 2>&1
```

  Attendu : 0 erreurs.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/files.rs src-tauri/src/lib.rs src-tauri/tauri.conf.json
git commit -m "feat: read_text_preview command + enable asset protocol"
```

---

## Task 5 — Quick Look — frontend

**Files:**
- Create: `src/components/Preview/QuickLookPanel.tsx`
- Modify: `src/components/Explorer/MetadataPanel.tsx`

- [ ] **Step 1: Créer `src/components/Preview/QuickLookPanel.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileQuestion } from 'lucide-react';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
const TEXT_EXTS = new Set(['txt', 'md', 'json', 'ts', 'tsx', 'js', 'jsx', 'rs', 'toml', 'yaml', 'yml', 'sh', 'py', 'html', 'css']);

function getExt(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

interface Props {
  path: string;
}

export function QuickLookPanel({ path }: Props) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const ext = getExt(path);

  useEffect(() => {
    if (TEXT_EXTS.has(ext)) {
      invoke<string>('read_text_preview', { path })
        .then(setTextContent)
        .catch(() => setTextContent(null));
    } else {
      setTextContent(null);
    }
  }, [path, ext]);

  if (IMAGE_EXTS.has(ext)) {
    return (
      <div className="h-48 flex items-center justify-center bg-zinc-900/50 rounded-lg overflow-hidden mt-3">
        <img
          src={convertFileSrc(path)}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  if (ext === 'pdf') {
    return (
      <div className="h-48 mt-3 rounded-lg overflow-hidden border border-zinc-700">
        <iframe
          src={convertFileSrc(path)}
          className="w-full h-full"
          title="PDF preview"
        />
      </div>
    );
  }

  if (TEXT_EXTS.has(ext) && textContent !== null) {
    return (
      <div className="mt-3 h-48 overflow-auto bg-zinc-900/50 rounded-lg border border-zinc-800 p-2">
        <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
          {textContent}
        </pre>
      </div>
    );
  }

  return (
    <div className="mt-3 h-20 flex flex-col items-center justify-center bg-zinc-900/30 rounded-lg border border-zinc-800 text-zinc-600">
      <FileQuestion size={20} />
      <span className="text-xs mt-1">Pas d'aperçu disponible</span>
    </div>
  );
}
```

- [ ] **Step 2: Mettre à jour `MetadataPanel.tsx`**

  Ajouter l'import :
```tsx
import { QuickLookPanel } from '../Preview/QuickLookPanel';
```

  Dans le JSX, avant la section `TagEditor`, ajouter :
```tsx
<QuickLookPanel path={metadata.path} />
```

- [ ] **Step 3: Vérifier dans le navigateur**

  Lancer `npm run dev`, sélectionner un fichier image/texte dans Explorer, vérifier que le preview s'affiche dans le MetadataPanel.

- [ ] **Step 4: Commit**

```bash
git add src/components/Preview/ src/components/Explorer/MetadataPanel.tsx
git commit -m "feat: QuickLookPanel for image/PDF/text preview in MetadataPanel"
```

---

## Task 6 — Embeddings sémantiques — engine/embeddings.rs

**Files:**
- Create: `src-tauri/src/engine/embeddings.rs`
- Modify: `src-tauri/src/engine/mod.rs`

- [ ] **Step 1: Déclarer le module dans `engine/mod.rs`**

  Ouvrir `src-tauri/src/engine/mod.rs` et ajouter :
```rust
pub mod embeddings;
```

- [ ] **Step 2: Créer `src-tauri/src/engine/embeddings.rs`**

```rust
use anyhow::{anyhow, Result};
use chrono::Utc;
use reqwest::Client;
use sqlx::SqlitePool;

const HAIKU_MODEL: &str = "claude-haiku-4-5-20251001";
const DESC_CACHE_TTL_SECS: i64 = 30 * 24 * 3600;

pub async fn generate_description(
    hash_sha256: &str,
    name: &str,
    category: &str,
    subcategory: Option<&str>,
    tags: &[String],
    api_key: &str,
    pool: &SqlitePool,
) -> Result<String> {
    let cache_key = format!("desc:{}", hash_sha256);

    // Cache hit
    if let Some(cached) = get_from_cache(&cache_key, pool).await? {
        return Ok(cached);
    }

    if api_key.is_empty() {
        return Err(anyhow!("ANTHROPIC_API_KEY not set"));
    }

    let tag_str = if tags.is_empty() {
        "aucun tag".to_string()
    } else {
        tags.join(", ")
    };

    let sub = subcategory.unwrap_or("—");
    let prompt = format!(
        "Fichier : {name}\nCatégorie : {category} / {sub}\nTags : {tag_str}\n\nDécris ce fichier en 1-2 phrases concises pour faciliter sa recherche ultérieure."
    );

    let client = Client::new();
    let body = serde_json::json!({
        "model": HAIKU_MODEL,
        "max_tokens": 150,
        "messages": [{"role": "user", "content": prompt}]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Claude API error {}: {}", status, text));
    }

    let json: serde_json::Value = response.json().await?;
    let description = json["content"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow!("Unexpected API response format"))?
        .trim()
        .to_string();

    save_to_cache(&cache_key, &description, pool).await?;

    Ok(description)
}

async fn get_from_cache(key: &str, pool: &SqlitePool) -> Result<Option<String>> {
    let now = Utc::now().timestamp();
    let cached = sqlx::query_scalar::<_, String>(
        "SELECT response FROM ai_cache WHERE hash_sha256 = ? AND expires_at > ?"
    )
    .bind(key)
    .bind(now)
    .fetch_optional(pool)
    .await?;
    Ok(cached)
}

async fn save_to_cache(key: &str, description: &str, pool: &SqlitePool) -> Result<()> {
    let now = Utc::now().timestamp();
    sqlx::query(
        "INSERT OR REPLACE INTO ai_cache (hash_sha256, response, model, cached_at, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(key)
    .bind(description)
    .bind(HAIKU_MODEL)
    .bind(now)
    .bind(now + DESC_CACHE_TTL_SECS)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn make_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn test_cache_miss_returns_none() {
        let pool = make_db().await;
        let result = get_from_cache("desc:nonexistent", &pool).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_save_and_retrieve_cache() {
        let pool = make_db().await;
        save_to_cache("desc:abc123", "Un document fiscal de 2023.", &pool)
            .await
            .unwrap();
        let result = get_from_cache("desc:abc123", &pool).await.unwrap();
        assert_eq!(result, Some("Un document fiscal de 2023.".to_string()));
    }

    #[tokio::test]
    async fn test_expired_cache_returns_none() {
        let pool = make_db().await;
        // Insert expired entry
        sqlx::query(
            "INSERT INTO ai_cache (hash_sha256, response, model, cached_at, expires_at) VALUES ('desc:old', 'old desc', 'haiku', 0, 1)"
        )
        .execute(&pool)
        .await
        .unwrap();
        let result = get_from_cache("desc:old", &pool).await.unwrap();
        assert!(result.is_none());
    }
}
```

- [ ] **Step 3: Lancer les tests**

```bash
cd src-tauri && cargo test engine::embeddings::tests 2>&1
```

  Attendu : 3 tests PASSED (pas d'appel réseau réel).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/engine/embeddings.rs src-tauri/src/engine/mod.rs
git commit -m "feat: engine/embeddings.rs — semantic description via Claude haiku with ai_cache"
```

---

## Task 7 — Search schema — ajout champ description + migration

**Files:**
- Modify: `src-tauri/src/engine/search.rs`

- [ ] **Step 1: Écrire le test d'intégration description dans search.rs**

  Ajouter dans le bloc `#[cfg(test)]` à la fin de `search.rs`, avant la dernière `}` :

```rust
#[test]
fn test_description_field_indexed_and_searchable() {
    let mut idx = SearchIndex::in_memory().unwrap();
    let record = make_test_record("file-desc", "contrat_2023.pdf", "document", "Contrats", 1704067200);
    idx.index_document(&record, &[], Some("Contrat de prestation de service signé en 2023.")).unwrap();
    let results = idx.search("prestation", 10, None).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "file-desc");
}
```

- [ ] **Step 2: Lancer le test — vérifier qu'il échoue**

```bash
cd src-tauri && cargo test test_description_field_indexed_and_searchable 2>&1
```

  Attendu : erreur de compilation (paramètre `description` inexistant).

- [ ] **Step 3: Mettre à jour `SearchIndex` dans `search.rs`**

  **3a — Ajouter `description_field` au struct :**
```rust
pub struct SearchIndex {
    index: Index,
    writer: IndexWriter,
    reader: IndexReader,
    pub id_field: Field,
    pub name_field: Field,
    pub path_field: Field,
    pub category_field: Field,
    pub subcategory_field: Field,
    pub tags_field: Field,
    pub year_field: Field,
    pub description_field: Field,
}
```

  **3b — Mettre à jour `build_schema()` :** Changer la signature de retour et ajouter le champ :
```rust
fn build_schema() -> (Schema, Field, Field, Field, Field, Field, Field, Field, Field) {
    let mut b = Schema::builder();
    let id_field          = b.add_text_field("id",          STRING | STORED);
    let name_field        = b.add_text_field("name",        TEXT | STORED);
    let path_field        = b.add_text_field("path",        STORED);
    let category_field    = b.add_text_field("category",    STRING | STORED);
    let sub_field         = b.add_text_field("subcategory", TEXT | STORED);
    let tags_field        = b.add_text_field("tags",        TEXT | STORED);
    let year_field        = b.add_u64_field("year",         STORED | INDEXED | FAST);
    let description_field = b.add_text_field("description", TEXT | STORED);
    (b.build(), id_field, name_field, path_field, category_field, sub_field, tags_field, year_field, description_field)
}
```

  **3c — Mettre à jour `open_or_create` :** Gérer le schema mismatch (wipe + recreate) et déstructurer le 9-tuple :
```rust
pub fn open_or_create(index_path: &std::path::Path) -> Result<Self> {
    let (schema, id_field, name_field, path_field, category_field, subcategory_field, tags_field, year_field, description_field) =
        Self::build_schema();
    std::fs::create_dir_all(index_path)?;

    let index = {
        let dir = tantivy::directory::MmapDirectory::open(index_path)?;
        match Index::open_or_create(dir, schema.clone()) {
            Ok(idx) => idx,
            Err(_) => {
                // Schema changed — wipe and recreate
                std::fs::remove_dir_all(index_path)?;
                std::fs::create_dir_all(index_path)?;
                let dir = tantivy::directory::MmapDirectory::open(index_path)?;
                Index::open_or_create(dir, schema)?
            }
        }
    };

    let writer = index.writer(50_000_000)?;
    let reader = index.reader()?;
    Ok(Self { index, writer, reader, id_field, name_field, path_field, category_field, subcategory_field, tags_field, year_field, description_field })
}
```

  **3d — Mettre à jour `in_memory` (tests) :**
```rust
#[cfg(test)]
pub fn in_memory() -> Result<Self> {
    let (schema, id_field, name_field, path_field, category_field, subcategory_field, tags_field, year_field, description_field) =
        Self::build_schema();
    let dir = RamDirectory::create();
    let index = Index::open_or_create(dir, schema)?;
    let writer = index.writer(50_000_000)?;
    let reader = index.reader()?;
    Ok(Self { index, writer, reader, id_field, name_field, path_field, category_field, subcategory_field, tags_field, year_field, description_field })
}
```

  **3e — Mettre à jour `index_document` signature :**
```rust
pub fn index_document(&mut self, record: &FileRecord, tags: &[String], description: Option<&str>) -> Result<()> {
    let mut doc = TantivyDocument::default();
    doc.add_text(self.id_field, &record.id);
    doc.add_text(self.name_field, &record.name);
    doc.add_text(self.path_field, &record.path);
    doc.add_text(self.category_field, record.category.as_deref().unwrap_or("other"));
    doc.add_text(self.subcategory_field, record.subcategory.as_deref().unwrap_or(""));
    for tag in tags {
        doc.add_text(self.tags_field, tag);
    }
    doc.add_u64(self.year_field, Self::timestamp_to_year(record.created_at));
    if let Some(desc) = description {
        doc.add_text(self.description_field, desc);
    }

    self.writer.add_document(doc)?;
    self.writer.commit()?;
    self.reader.reload()?;
    Ok(())
}
```

  **3f — Mettre à jour `rebuild_from_db` :** Ajouter la récupération des descriptions depuis `ai_cache` et mettre à jour le `QueryParser` :
```rust
pub async fn rebuild_from_db(&mut self, pool: &sqlx::SqlitePool) -> Result<()> {
    let searcher = self.reader.searcher();
    if searcher.num_docs() > 0 {
        return Ok(());
    }

    let files = sqlx::query_as::<_, FileRecord>(
        "SELECT id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, \
         category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir \
         FROM files WHERE is_organized = 1"
    )
    .fetch_all(pool)
    .await?;

    for file in &files {
        let tags: Vec<String> = sqlx::query_as::<_, (String,)>(
            "SELECT tag FROM tags WHERE file_id = ?"
        )
        .bind(&file.id)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(t,)| t)
        .collect();

        let desc_key = format!("desc:{}", file.hash_sha256);
        let description: Option<String> = sqlx::query_scalar(
            "SELECT response FROM ai_cache WHERE hash_sha256 = ? AND expires_at > ?"
        )
        .bind(&desc_key)
        .bind(chrono::Utc::now().timestamp())
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

        let mut doc = TantivyDocument::default();
        doc.add_text(self.id_field, &file.id);
        doc.add_text(self.name_field, &file.name);
        doc.add_text(self.path_field, &file.path);
        doc.add_text(self.category_field, file.category.as_deref().unwrap_or("other"));
        doc.add_text(self.subcategory_field, file.subcategory.as_deref().unwrap_or(""));
        for tag in &tags {
            doc.add_text(self.tags_field, tag);
        }
        doc.add_u64(self.year_field, Self::timestamp_to_year(file.created_at));
        if let Some(ref desc) = description {
            doc.add_text(self.description_field, desc.as_str());
        }
        self.writer.add_document(doc)?;
    }

    if !files.is_empty() {
        self.writer.commit()?;
        self.reader.reload()?;
    }
    tracing::info!("Search index rebuilt: {} documents", files.len());
    Ok(())
}
```

  **3g — Mettre à jour `search` pour inclure `description_field` dans le QueryParser :**
```rust
let query_parser = QueryParser::for_index(
    &self.index,
    vec![self.name_field, self.subcategory_field, self.tags_field, self.description_field],
);
```

  **3h — Corriger les appels existants à `index_document` dans les tests :**

  Mettre à jour les 4 tests existants qui appellent `idx.index_document(...)` pour passer `None` en 3e argument :
```rust
idx.index_document(&record, &["facture".to_string()], None).unwrap();
// etc. pour chaque appel
```

- [ ] **Step 4: Lancer tous les tests search**

```bash
cd src-tauri && cargo test engine::search::tests 2>&1
```

  Attendu : tous les tests PASSED (incluant le nouveau `test_description_field_indexed_and_searchable`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/engine/search.rs
git commit -m "feat: add description field to Tantivy schema, auto schema migration"
```

---

## Task 8 — Pipeline integration — embeddings

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Mettre à jour le pipeline dans `lib.rs`**

  Ajouter l'import en haut du fichier (dans le bloc `use crate::engine::`) :
```rust
use crate::engine::embeddings::generate_description;
```

  Dans `start_pipeline`, après `organize_file` réussit (dans le bloc `Ok(Some(action)) =>`), juste avant `search_index.lock()`, ajouter la génération de description :

```rust
Ok(Some(action)) => {
    let tags: Vec<String> = sqlx::query_as::<_, (String,)>(
        "SELECT tag FROM tags WHERE file_id = ?"
    )
    .bind(&record.id)
    .fetch_all(pool_clone.as_ref())
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(t,)| t)
    .collect();

    let mut indexed_record = record.clone();
    indexed_record.path = action.path_after.clone().unwrap_or(record.path.clone());
    indexed_record.is_organized = true;
    indexed_record.category = Some(classification.category.clone());
    indexed_record.subcategory = classification.subcategory.clone();

    // Generate semantic description if confidence >= 0.5
    let description = if classification.confidence >= 0.5 {
        generate_description(
            &record.hash_sha256,
            &record.name,
            &classification.category,
            classification.subcategory.as_deref(),
            &tags,
            api_key_clone.as_ref(),
            pool_clone.as_ref(),
        )
        .await
        .ok()
    } else {
        None
    };

    match search_index.lock() {
        Ok(mut idx) => {
            if let Err(e) = idx.index_document(&indexed_record, &tags, description.as_deref()) {
                tracing::error!("Search index error: {}", e);
            }
        }
        Err(e) => tracing::error!("Search index mutex poisoned: {}", e),
    }
}
```

- [ ] **Step 2: Vérifier compilation**

```bash
cd src-tauri && cargo check 2>&1
```

  Attendu : 0 erreurs.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: integrate embeddings generation into file pipeline"
```

---

## Task 9 — Assistant conversationnel — backend

**Files:**
- Create: `src-tauri/src/engine/assistant.rs`
- Modify: `src-tauri/src/engine/mod.rs`
- Modify: `src-tauri/src/commands/assistant.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Déclarer le module dans `engine/mod.rs`**

  Ajouter :
```rust
pub mod assistant;
```

- [ ] **Step 2: Créer `src-tauri/src/engine/assistant.rs`**

```rust
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::models::FileRecord;

const SONNET_MODEL: &str = "claude-sonnet-4-6";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct AssistantResponse {
    pub files: Vec<FileRecord>,
    pub text: String,
}

const SYSTEM_PROMPT: &str = r#"Tu es un assistant de recherche de fichiers pour l'application Egestion.

Schéma de la base de données :
- files : id, path, name, extension, size_bytes, created_at (timestamp unix), modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, is_organized, source_dir
- tags : id, file_id, tag, source, weight
- actions : id, file_id, action_type, path_before, path_after, executed_at, undone_at, undoable

Catégories disponibles : photo, video, music, document, archive, code, installer, other

Règles :
1. Si la question demande de trouver des fichiers, réponds UNIQUEMENT avec une requête SQL SQLite valide commençant par SELECT. Pas de markdown, pas de ```sql.
2. Sinon, réponds en français en langage naturel.

La requête SQL doit sélectionner les colonnes : id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir
depuis la table files (avec éventuels JOINs sur tags)."#;

pub async fn ask(
    query: String,
    history: Vec<Message>,
    api_key: &str,
    pool: &SqlitePool,
) -> Result<AssistantResponse> {
    if api_key.is_empty() {
        return Err(anyhow!("ANTHROPIC_API_KEY not set"));
    }

    let mut messages: Vec<serde_json::Value> = history
        .iter()
        .map(|m| serde_json::json!({"role": m.role, "content": m.content}))
        .collect();
    messages.push(serde_json::json!({"role": "user", "content": query}));

    let client = Client::new();
    let body = serde_json::json!({
        "model": SONNET_MODEL,
        "max_tokens": 1024,
        "system": SYSTEM_PROMPT,
        "messages": messages,
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Claude API error {}: {}", status, text));
    }

    let json: serde_json::Value = response.json().await?;
    let raw = json["content"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow!("Unexpected API response format"))?
        .trim()
        .to_string();

    if raw.to_uppercase().starts_with("SELECT") {
        let files = execute_safe_query(&raw, pool).await?;
        Ok(AssistantResponse { files, text: String::new() })
    } else {
        Ok(AssistantResponse { files: vec![], text: raw })
    }
}

async fn execute_safe_query(sql: &str, pool: &SqlitePool) -> Result<Vec<FileRecord>> {
    let trimmed = sql.trim();
    if !trimmed.to_uppercase().starts_with("SELECT") {
        return Err(anyhow!("Only SELECT queries are allowed"));
    }
    let files = sqlx::query_as::<_, FileRecord>(trimmed)
        .fetch_all(pool)
        .await?;
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn make_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn test_execute_safe_query_rejects_non_select() {
        let pool = make_db().await;
        let result = execute_safe_query("DROP TABLE files", &pool).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Only SELECT queries are allowed"));
    }

    #[tokio::test]
    async fn test_execute_safe_query_accepts_select() {
        let pool = make_db().await;
        let result = execute_safe_query(
            "SELECT id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir FROM files LIMIT 1",
            &pool,
        ).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_execute_safe_query_case_insensitive() {
        let pool = make_db().await;
        let result = execute_safe_query(
            "select id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir from files",
            &pool,
        ).await;
        assert!(result.is_ok());
    }
}
```

- [ ] **Step 3: Lancer les tests**

```bash
cd src-tauri && cargo test engine::assistant::tests 2>&1
```

  Attendu : 3 tests PASSED.

- [ ] **Step 4: Remplir `commands/assistant.rs`**

```rust
use crate::engine::assistant::{ask, AssistantResponse, Message};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn ask_assistant(
    query: String,
    history: Vec<Message>,
    state: State<'_, AppState>,
) -> Result<AssistantResponse, String> {
    let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
    ask(query, history, &api_key, &state.pool)
        .await
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 5: Ajouter `ask_assistant` dans `lib.rs` invoke_handler**

```rust
commands::ask_assistant,
```

- [ ] **Step 6: Vérifier compilation**

```bash
cd src-tauri && cargo check 2>&1
```

  Attendu : 0 erreurs.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/engine/assistant.rs src-tauri/src/engine/mod.rs src-tauri/src/commands/assistant.rs src-tauri/src/lib.rs
git commit -m "feat: engine/assistant.rs + ask_assistant command (NL → SQL via Claude sonnet)"
```

---

## Task 10 — Assistant conversationnel — frontend

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/hooks/useKeyboard.ts`
- Create: `src/components/Assistant/MessageList.tsx`
- Create: `src/components/Assistant/InputBar.tsx`
- Create: `src/components/Assistant/AssistantOverlay.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Ajouter le slice assistant dans `store/index.ts`**

  Ajouter les types après `FileMetadata` :
```ts
export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  files: FileRecord[];
}
```

  Ajouter dans `AppStore` :
```ts
// Assistant
isAssistantOpen: boolean;
assistantMessages: AssistantMessage[];
setAssistantOpen: (open: boolean) => void;
addAssistantMessage: (msg: AssistantMessage) => void;
clearAssistantMessages: () => void;
```

  Ajouter dans `create<AppStore>((set) => ({` :
```ts
isAssistantOpen: false,
assistantMessages: [],
setAssistantOpen: (open) => set({ isAssistantOpen: open }),
addAssistantMessage: (msg) =>
  set((state) => ({ assistantMessages: [...state.assistantMessages, msg] })),
clearAssistantMessages: () => set({ assistantMessages: [] }),
```

- [ ] **Step 2: Mettre à jour `useKeyboard.ts`**

```ts
import { useEffect } from 'react';
import { useAppStore } from '../store';

export function useKeyboard() {
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAssistantOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSearchOpen, setAssistantOpen]);
}
```

- [ ] **Step 3: Créer `src/components/Assistant/MessageList.tsx`**

```tsx
import { SearchResultItem } from '../Search/SearchResultItem';
import { AssistantMessage } from '../../store';

interface Props {
  messages: AssistantMessage[];
}

export function MessageList({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Posez une question sur vos fichiers…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4 p-4">
      {messages.map((msg, i) => (
        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {msg.role === 'user' ? (
            <div className="max-w-xs px-3 py-2 bg-indigo-600 rounded-2xl rounded-tr-sm text-sm text-white">
              {msg.content}
            </div>
          ) : (
            <div className="flex-1 space-y-2">
              {msg.content && (
                <div className="px-3 py-2 bg-zinc-800 rounded-2xl rounded-tl-sm text-sm text-zinc-200">
                  {msg.content}
                </div>
              )}
              {msg.files.length > 0 && (
                <div className="space-y-1">
                  {msg.files.map((f) => (
                    <SearchResultItem
                      key={f.id}
                      result={{
                        id: f.id,
                        name: f.name,
                        path: f.path,
                        category: f.category ?? 'other',
                        subcategory: f.subcategory ?? '',
                        tags: [],
                        year: 0,
                        score: 0,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Créer `src/components/Assistant/InputBar.tsx`**

```tsx
import { useState } from 'react';
import { Send } from 'lucide-react';

interface Props {
  onSubmit: (query: string) => void;
  loading: boolean;
}

export function InputBar({ onSubmit, loading }: Props) {
  const [value, setValue] = useState('');

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !loading) {
        onSubmit(value.trim());
        setValue('');
      }
    }
  }

  function handleSubmit() {
    if (value.trim() && !loading) {
      onSubmit(value.trim());
      setValue('');
    }
  }

  return (
    <div className="border-t border-zinc-700 p-3 flex gap-2 items-end">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Trouvez des fichiers… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"
        rows={2}
        disabled={loading}
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || loading}
        className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Créer `src/components/Assistant/AssistantOverlay.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useAppStore, AssistantMessage } from '../../store';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';

export function AssistantOverlay() {
  const isOpen = useAppStore((s) => s.isAssistantOpen);
  const setOpen = useAppStore((s) => s.setAssistantOpen);
  const messages = useAppStore((s) => s.assistantMessages);
  const addMessage = useAppStore((s) => s.addAssistantMessage);
  const clearMessages = useAppStore((s) => s.clearAssistantMessages);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function close() {
    setOpen(false);
    clearMessages();
  }

  async function handleSubmit(query: string) {
    addMessage({ role: 'user', content: query, files: [] });
    setLoading(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await invoke<{ files: any[]; text: string }>('ask_assistant', {
        query,
        history,
      });
      addMessage({
        role: 'assistant',
        content: response.text,
        files: response.files,
      });
    } catch (err) {
      addMessage({
        role: 'assistant',
        content: `Erreur : ${err}`,
        files: [],
      });
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="w-full max-w-xl h-[600px] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 shrink-0">
          <span className="text-sm font-medium text-zinc-200">Assistant Egestion</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">⌘J</span>
            <button
              onClick={close}
              className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <MessageList messages={messages} />
        {loading && (
          <div className="px-4 pb-2 text-xs text-zinc-500 animate-pulse">Recherche en cours…</div>
        )}
        <div ref={bottomRef} />

        <InputBar onSubmit={handleSubmit} loading={loading} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Mettre à jour `App.tsx`**

  Ajouter l'import :
```tsx
import { AssistantOverlay } from './components/Assistant/AssistantOverlay';
```

  Dans le JSX, après `<CommandPalette />` :
```tsx
<AssistantOverlay />
```

- [ ] **Step 7: Vérifier dans le navigateur**

  Lancer `npm run dev`, appuyer sur ⌘J, vérifier que l'overlay s'ouvre. Taper une question, vérifier que la réponse (texte ou fichiers) s'affiche. Appuyer sur Échap, vérifier que l'overlay se ferme et que l'historique est effacé.

- [ ] **Step 8: Commit**

```bash
git add src/store/index.ts src/hooks/useKeyboard.ts src/components/Assistant/ src/App.tsx
git commit -m "feat: AssistantOverlay ⌘J with MessageList and InputBar"
```

---

## Task 11 — Export — backend

**Files:**
- Create: `src-tauri/src/engine/export.rs`
- Modify: `src-tauri/src/engine/mod.rs`
- Modify: `src-tauri/src/commands/export.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Déclarer le module dans `engine/mod.rs`**

  Ajouter :
```rust
pub mod export;
```

- [ ] **Step 2: Créer `src-tauri/src/engine/export.rs`**

```rust
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportFilters {
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
}

pub async fn build_csv(filters: &ExportFilters, pool: &SqlitePool) -> Result<String> {
    let mut conditions = vec!["is_organized = 1".to_string()];
    if let Some(ref cat) = filters.category {
        conditions.push(format!("category = '{}'", cat.replace('\'', "''")));
    }
    if let Some(from) = filters.date_from {
        conditions.push(format!("modified_at >= {}", from));
    }
    if let Some(to) = filters.date_to {
        conditions.push(format!("modified_at <= {}", to));
    }

    let where_clause = conditions.join(" AND ");
    let sql = format!(
        "SELECT id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, \
         indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, \
         is_organized, source_dir FROM files WHERE {} ORDER BY modified_at DESC LIMIT 10000",
        where_clause
    );

    let rows = sqlx::query(&sql).fetch_all(pool).await?;

    let mut csv = String::from("name,path,category,subcategory,tags,size_bytes,modified_at,confidence\n");

    for row in &rows {
        use sqlx::Row;
        let file_id: String = row.try_get("id").unwrap_or_default();
        let name: String = row.try_get("name").unwrap_or_default();
        let path: String = row.try_get("path").unwrap_or_default();
        let category: String = row.try_get::<Option<String>, _>("category").unwrap_or(None).unwrap_or_default();
        let subcategory: String = row.try_get::<Option<String>, _>("subcategory").unwrap_or(None).unwrap_or_default();
        let size_bytes: i64 = row.try_get("size_bytes").unwrap_or(0);
        let modified_at: i64 = row.try_get("modified_at").unwrap_or(0);
        let confidence: Option<f64> = row.try_get("confidence").unwrap_or(None);

        let tags: Vec<String> = sqlx::query_scalar::<_, String>(
            "SELECT tag FROM tags WHERE file_id = ? ORDER BY weight DESC"
        )
        .bind(&file_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let tags_str = tags.join("|");
        let conf_str = confidence.map(|c| format!("{:.2}", c)).unwrap_or_default();

        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            csv_escape(&name),
            csv_escape(&path),
            csv_escape(&category),
            csv_escape(&subcategory),
            csv_escape(&tags_str),
            size_bytes,
            modified_at,
            conf_str,
        ));
    }

    Ok(csv)
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

pub async fn build_report(pool: &SqlitePool) -> Result<String> {
    // Stats par catégorie
    let cats: Vec<(String, i64)> = sqlx::query_as::<_, (String, i64)>(
        "SELECT category, COUNT(*) as cnt FROM files WHERE is_organized = 1 AND category IS NOT NULL GROUP BY category ORDER BY cnt DESC"
    )
    .fetch_all(pool)
    .await?;

    // Top 10 tags
    let top_tags: Vec<(String, i64)> = sqlx::query_as::<_, (String, i64)>(
        "SELECT tag, COUNT(*) as cnt FROM tags GROUP BY tag ORDER BY cnt DESC LIMIT 10"
    )
    .fetch_all(pool)
    .await?;

    // 30 dernières actions
    let actions: Vec<(String, Option<String>, i64)> = sqlx::query_as::<_, (String, Option<String>, i64)>(
        "SELECT action_type, path_after, executed_at FROM actions WHERE undone_at IS NULL ORDER BY executed_at DESC LIMIT 30"
    )
    .fetch_all(pool)
    .await?;

    // Doublons
    let (dup_count, dup_size): (i64, i64) = sqlx::query_as::<_, (i64, i64)>(
        "SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM files WHERE is_duplicate = 1"
    )
    .fetch_one(pool)
    .await
    .unwrap_or((0, 0));

    let now: DateTime<Utc> = Utc::now();
    let max_count = cats.iter().map(|(_, c)| *c).max().unwrap_or(1).max(1);

    // SVG bar chart
    let bar_width = 300i64;
    let bar_height = 20i64;
    let gap = 6i64;
    let svg_height = (bar_height + gap) * cats.len() as i64;

    let mut bars = String::new();
    for (i, (cat, count)) in cats.iter().enumerate() {
        let y = i as i64 * (bar_height + gap);
        let w = (count * bar_width) / max_count;
        bars.push_str(&format!(
            r#"<rect x="100" y="{y}" width="{w}" height="{bar_height}" fill="#6366f1" rx="3"/>
<text x="95" y="{}" font-size="11" fill="#a1a1aa" text-anchor="end" dominant-baseline="middle">{cat}</text>
<text x="{}" y="{}" font-size="10" fill="#6366f1" dominant-baseline="middle">{count}</text>
"#,
            y + bar_height / 2,
            100 + w + 6,
            y + bar_height / 2,
        ));
    }

    let actions_rows: String = actions
        .iter()
        .map(|(atype, path, ts)| {
            let dt = DateTime::from_timestamp(*ts, 0)
                .unwrap_or(DateTime::UNIX_EPOCH)
                .format("%d/%m/%Y %H:%M")
                .to_string();
            let path_str = path.as_deref().unwrap_or("—");
            format!("<tr><td>{dt}</td><td>{atype}</td><td title=\"{path_str}\">{}</td></tr>",
                path_str.rsplit('/').next().unwrap_or(path_str))
        })
        .collect();

    let tag_rows: String = top_tags
        .iter()
        .map(|(tag, cnt)| format!("<tr><td>{tag}</td><td>{cnt}</td></tr>"))
        .collect();

    let html = format!(r#"<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport Egestion — {now_fmt}</title>
<style>
  body {{ font-family: -apple-system, sans-serif; background: #18181b; color: #e4e4e7; margin: 0; padding: 2rem; }}
  h1 {{ color: #f4f4f5; font-size: 1.5rem; margin-bottom: 0.25rem; }}
  .subtitle {{ color: #71717a; font-size: 0.875rem; margin-bottom: 2rem; }}
  h2 {{ color: #a1a1aa; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2rem; margin-bottom: 1rem; }}
  .card {{ background: #27272a; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 0.8125rem; }}
  td, th {{ padding: 0.5rem 0.75rem; border-bottom: 1px solid #3f3f46; text-align: left; }}
  th {{ color: #71717a; font-weight: 500; }}
  .dup-box {{ display: flex; gap: 2rem; }}
  .dup-stat {{ text-align: center; }}
  .dup-stat .num {{ font-size: 2rem; font-weight: 700; color: #f87171; }}
  .dup-stat .lbl {{ font-size: 0.75rem; color: #71717a; }}
</style>
</head>
<body>
<h1>Rapport Egestion</h1>
<p class="subtitle">Généré le {now_fmt}</p>

<h2>Fichiers par catégorie</h2>
<div class="card">
<svg width="500" height="{svg_height}" xmlns="http://www.w3.org/2000/svg">{bars}</svg>
</div>

<h2>Top 10 tags</h2>
<div class="card">
<table>
<thead><tr><th>Tag</th><th>Occurrences</th></tr></thead>
<tbody>{tag_rows}</tbody>
</table>
</div>

<h2>Doublons détectés</h2>
<div class="card">
<div class="dup-box">
  <div class="dup-stat"><div class="num">{dup_count}</div><div class="lbl">fichiers en doublon</div></div>
  <div class="dup-stat"><div class="num">{dup_size_fmt}</div><div class="lbl">espace potentiellement libérable</div></div>
</div>
</div>

<h2>30 dernières actions</h2>
<div class="card">
<table>
<thead><tr><th>Date</th><th>Action</th><th>Fichier</th></tr></thead>
<tbody>{actions_rows}</tbody>
</table>
</div>
</body>
</html>"#,
        now_fmt = now.format("%d/%m/%Y à %H:%M").to_string(),
        svg_height = svg_height.max(20),
        bars = bars,
        tag_rows = tag_rows,
        dup_count = dup_count,
        dup_size_fmt = format_bytes(dup_size),
        actions_rows = actions_rows,
    );

    Ok(html)
}

fn format_bytes(b: i64) -> String {
    if b < 1024 { format!("{} o", b) }
    else if b < 1024 * 1024 { format!("{} Ko", b / 1024) }
    else { format!("{:.1} Mo", b as f64 / 1_048_576.0) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn make_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn test_build_csv_has_header() {
        let pool = make_db().await;
        let filters = ExportFilters { category: None, tags: vec![], date_from: None, date_to: None };
        let csv = build_csv(&filters, &pool).await.unwrap();
        assert!(csv.starts_with("name,path,category,subcategory,tags,size_bytes,modified_at,confidence\n"));
    }

    #[tokio::test]
    async fn test_build_csv_empty_db_only_header() {
        let pool = make_db().await;
        let filters = ExportFilters { category: None, tags: vec![], date_from: None, date_to: None };
        let csv = build_csv(&filters, &pool).await.unwrap();
        assert_eq!(csv.lines().count(), 1); // only header
    }

    #[tokio::test]
    async fn test_build_report_is_valid_html() {
        let pool = make_db().await;
        let html = build_report(&pool).await.unwrap();
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("Rapport Egestion"));
        assert!(html.contains("</html>"));
    }

    #[test]
    fn test_csv_escape_wraps_comma() {
        assert_eq!(csv_escape("a,b"), "\"a,b\"");
    }

    #[test]
    fn test_csv_escape_plain_unchanged() {
        assert_eq!(csv_escape("hello"), "hello");
    }
}
```

- [ ] **Step 3: Lancer les tests**

```bash
cd src-tauri && cargo test engine::export::tests 2>&1
```

  Attendu : 5 tests PASSED.

- [ ] **Step 4: Remplir `commands/export.rs`**

```rust
use crate::engine::export::{build_csv, build_report, ExportFilters};
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
```

- [ ] **Step 5: Ajouter les commandes dans `lib.rs` invoke_handler**

```rust
commands::export_csv,
commands::export_report,
```

- [ ] **Step 6: Vérifier compilation**

```bash
cd src-tauri && cargo check 2>&1
```

  Attendu : 0 erreurs.

- [ ] **Step 7: Lancer tous les tests Rust**

```bash
cd src-tauri && cargo test 2>&1
```

  Attendu : tous les tests PASSED.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/engine/export.rs src-tauri/src/engine/mod.rs src-tauri/src/commands/export.rs src-tauri/src/lib.rs
git commit -m "feat: engine/export.rs — CSV export + HTML report with SVG charts"
```

---

## Task 12 — Export — frontend

**Files:**
- Modify: `src/components/Explorer/FileList.tsx`
- Modify: `src/components/Dashboard/index.tsx`

- [ ] **Step 1: Ajouter le bouton Export CSV dans `FileList.tsx`**

  Ajouter les imports en haut :
```tsx
import { invoke } from '@tauri-apps/api/core';
import { Download } from 'lucide-react';
```

  Ajouter une fonction `handleExportCsv` dans le composant `FileList` (après la définition de `SortBtn`) :
```tsx
async function handleExportCsv() {
  try {
    const csv = await invoke<string>('export_csv', {
      filters: { category: null, tags: [], date_from: null, date_to: null },
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `egestion-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('export_csv error:', err);
  }
}
```

  Dans le header de tri (div avec `border-b border-zinc-800`), ajouter le bouton après les SortBtn :
```tsx
<button
  onClick={handleExportCsv}
  className="px-3 py-2 text-xs text-zinc-500 hover:text-zinc-200 flex items-center gap-1 transition-colors"
  title="Exporter en CSV"
>
  <Download size={12} />
  CSV
</button>
```

- [ ] **Step 2: Ajouter le bouton Rapport HTML dans `Dashboard/index.tsx`**

  Ajouter les imports :
```tsx
import { invoke } from '@tauri-apps/api/core';
import { BarChart2 } from 'lucide-react';
```

  Ajouter la fonction dans `Dashboard` :
```tsx
async function handleExportReport() {
  try {
    const html = await invoke<string>('export_report');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `egestion-rapport-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('export_report error:', err);
  }
}
```

  Dans le header du Dashboard (div avec `flex items-center justify-between`), ajouter le bouton à côté de l'indicateur de statut :
```tsx
<button
  onClick={handleExportReport}
  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
>
  <BarChart2 size={12} />
  Rapport
</button>
```

- [ ] **Step 3: Vérifier dans le navigateur**

  Lancer `npm run dev`. Dans Explorer, cliquer "CSV" → vérifier que le fichier se télécharge avec les bons headers. Dans Dashboard, cliquer "Rapport" → vérifier que le fichier HTML s'ouvre correctement dans un navigateur.

- [ ] **Step 4: Commit final**

```bash
git add src/components/Explorer/FileList.tsx src/components/Dashboard/index.tsx
git commit -m "feat: export CSV button in Explorer, HTML report button in Dashboard"
```

---

## Récapitulatif des commits attendus

1. `refactor: split commands.rs into commands/ submodule`
2. `feat: add get_tags, add_tag, remove_tag commands`
3. `feat: TagEditor component for manual tags in MetadataPanel`
4. `feat: read_text_preview command + enable asset protocol`
5. `feat: QuickLookPanel for image/PDF/text preview in MetadataPanel`
6. `feat: engine/embeddings.rs — semantic description via Claude haiku with ai_cache`
7. `feat: add description field to Tantivy schema, auto schema migration`
8. `feat: integrate embeddings generation into file pipeline`
9. `feat: engine/assistant.rs + ask_assistant command (NL → SQL via Claude sonnet)`
10. `feat: AssistantOverlay ⌘J with MessageList and InputBar`
11. `feat: engine/export.rs — CSV export + HTML report with SVG charts`
12. `feat: export CSV button in Explorer, HTML report button in Dashboard`
