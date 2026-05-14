# Règles personnalisées — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un système de règles personnalisées qui redirigent les fichiers vers des dossiers cibles et appliquent des tags automatiques, en remplaçant la logique d'organisation par défaut quand une règle matche.

**Architecture:** Nouveau module Rust `engine/rules_engine.rs` évalué dans le pipeline après `classify_file` et avant `organize_file`. `organize_file` reçoit un `override_target: Option<PathBuf>` qui bypasse le seuil de confiance et le `build_target_dir`. Côté frontend, une vue "Règles" dédiée dans la sidebar avec formulaire inline.

**Tech Stack:** Rust (sqlx, dirs, uuid, chrono), SQLite migration, React/TypeScript, Zustand, Lucide React, Tailwind CSS.

---

## File Map

**Rust — à créer :**
- `src-tauri/migrations/003_rules.sql` — nouvelle table `rules`
- `src-tauri/src/engine/rules_engine.rs` — `RuleRecord`, `RuleMatch`, `evaluate()`, `matches_rule()`
- `src-tauri/src/commands/rules.rs` — `get_rules`, `create_rule`, `delete_rule`, `toggle_rule`

**Rust — à modifier :**
- `src-tauri/src/engine/mod.rs` — déclarer `pub mod rules_engine`
- `src-tauri/src/engine/organizer.rs` — ajouter `override_target: Option<PathBuf>` à `organize_file`
- `src-tauri/src/commands/mod.rs` — ajouter `pub mod rules` + `pub use rules::*`
- `src-tauri/src/lib.rs` — pipeline : évaluation des règles + appel `organize_file` mis à jour + invoke_handler

**Frontend — à créer :**
- `src/components/Rules/index.tsx` — `RulesView` : liste + formulaire inline

**Frontend — à modifier :**
- `src/store/index.ts` — `RuleRecord` interface + slice rules
- `src/components/layout/Sidebar.tsx` — item "Règles" + badge amber
- `src/App.tsx` — route `rules`

---

## Task 1 — Migration SQL + RulesEngine (Rust)

**Files:**
- Create: `src-tauri/migrations/003_rules.sql`
- Create: `src-tauri/src/engine/rules_engine.rs`
- Modify: `src-tauri/src/engine/mod.rs`

- [ ] **Step 1: Créer la migration `003_rules.sql`**

```sql
CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    condition_type TEXT NOT NULL,
    condition_value TEXT NOT NULL,
    target_dir TEXT NOT NULL,
    auto_tag TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);
```

- [ ] **Step 2: Écrire les tests dans `engine/rules_engine.rs`** (fichier à créer — les tests vont compiler en échec)

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::PathBuf;

use crate::db::models::FileRecord;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RuleRecord {
    pub id: String,
    pub name: String,
    pub condition_type: String,
    pub condition_value: String,
    pub target_dir: String,
    pub auto_tag: Option<String>,
    pub priority: i64,
    pub enabled: bool,
    pub created_at: i64,
}

pub struct RuleMatch {
    pub rule_id: String,
    pub target_dir: PathBuf,
    pub auto_tag: Option<String>,
}

pub async fn evaluate(record: &FileRecord, pool: &SqlitePool) -> Result<Option<RuleMatch>> {
    let rules: Vec<RuleRecord> = sqlx::query_as(
        "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at
         FROM rules WHERE enabled = 1 ORDER BY priority DESC, created_at ASC"
    )
    .fetch_all(pool)
    .await?;

    for rule in rules {
        if matches_rule(record, &rule) {
            let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
            let target = resolve_target_dir(&rule.target_dir, &home);
            return Ok(Some(RuleMatch {
                rule_id: rule.id,
                target_dir: target,
                auto_tag: rule.auto_tag,
            }));
        }
    }
    Ok(None)
}

fn matches_rule(record: &FileRecord, rule: &RuleRecord) -> bool {
    match rule.condition_type.as_str() {
        "extension" => record
            .extension
            .as_deref()
            .map(|e| e.to_lowercase() == rule.condition_value.to_lowercase().trim_start_matches('.'))
            .unwrap_or(false),
        "name_contains" => record
            .name
            .to_lowercase()
            .contains(&rule.condition_value.to_lowercase()),
        "source" => record
            .source_dir
            .as_deref()
            .map(|s| s.to_lowercase().contains(&rule.condition_value.to_lowercase()))
            .unwrap_or(false),
        _ => false,
    }
}

fn resolve_target_dir(target_dir: &str, home: &PathBuf) -> PathBuf {
    if target_dir.starts_with("~/") {
        home.join(&target_dir[2..])
    } else {
        PathBuf::from(target_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_record(name: &str, ext: &str, source: &str) -> FileRecord {
        FileRecord {
            id: "test".to_string(),
            path: format!("/tmp/{}", name),
            name: name.to_string(),
            extension: Some(ext.to_string()),
            size_bytes: 100,
            hash_sha256: "abc".to_string(),
            created_at: 0,
            modified_at: 0,
            indexed_at: 0,
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some(source.to_string()),
        }
    }

    fn make_rule(ctype: &str, cval: &str) -> RuleRecord {
        RuleRecord {
            id: "r1".to_string(),
            name: "test".to_string(),
            condition_type: ctype.to_string(),
            condition_value: cval.to_string(),
            target_dir: "~/Test".to_string(),
            auto_tag: None,
            priority: 0,
            enabled: true,
            created_at: 0,
        }
    }

    #[test]
    fn test_matches_extension() {
        let record = make_record("design.fig", "fig", "desktop");
        let rule = make_rule("extension", "fig");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_matches_extension_case_insensitive() {
        let record = make_record("design.FIG", "FIG", "desktop");
        let rule = make_rule("extension", "fig");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_extension_strips_leading_dot() {
        let record = make_record("file.pdf", "pdf", "desktop");
        let rule = make_rule("extension", ".pdf");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_matches_name_contains() {
        let record = make_record("facture_mai.pdf", "pdf", "downloads");
        let rule = make_rule("name_contains", "facture");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_no_match_name_contains() {
        let record = make_record("rapport.pdf", "pdf", "downloads");
        let rule = make_rule("name_contains", "facture");
        assert!(!matches_rule(&record, &rule));
    }

    #[test]
    fn test_matches_source() {
        let record = make_record("archive.zip", "zip", "downloads");
        let rule = make_rule("source", "downloads");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_resolve_tilde_path() {
        let home = PathBuf::from("/Users/test");
        let result = resolve_target_dir("~/Documents/Finance", &home);
        assert_eq!(result, PathBuf::from("/Users/test/Documents/Finance"));
    }

    #[test]
    fn test_no_match_wrong_extension() {
        let record = make_record("file.png", "png", "desktop");
        let rule = make_rule("extension", "pdf");
        assert!(!matches_rule(&record, &rule));
    }

    #[tokio::test]
    async fn test_evaluate_returns_match_from_db() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES ('r1', 'Figma', 'extension', 'fig', '~/Design', 'design', 0, 1, 0)"
        )
        .execute(&pool)
        .await
        .unwrap();

        let record = FileRecord {
            id: "f1".to_string(),
            path: "/tmp/logo.fig".to_string(),
            name: "logo.fig".to_string(),
            extension: Some("fig".to_string()),
            size_bytes: 100,
            hash_sha256: "abc".to_string(),
            created_at: 0,
            modified_at: 0,
            indexed_at: 0,
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some("desktop".to_string()),
        };

        let result = evaluate(&record, &pool).await.unwrap();
        assert!(result.is_some());
        let m = result.unwrap();
        assert_eq!(m.rule_id, "r1");
        assert_eq!(m.auto_tag, Some("design".to_string()));
    }

    #[tokio::test]
    async fn test_evaluate_no_match_returns_none() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let record = FileRecord {
            id: "f1".to_string(),
            path: "/tmp/photo.jpg".to_string(),
            name: "photo.jpg".to_string(),
            extension: Some("jpg".to_string()),
            size_bytes: 100,
            hash_sha256: "abc".to_string(),
            created_at: 0,
            modified_at: 0,
            indexed_at: 0,
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some("desktop".to_string()),
        };

        let result = evaluate(&record, &pool).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_evaluate_disabled_rule_not_matched() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES ('r1', 'Disabled', 'extension', 'fig', '~/Design', NULL, 0, 0, 0)"
        )
        .execute(&pool)
        .await
        .unwrap();

        let record = FileRecord {
            id: "f1".to_string(),
            path: "/tmp/logo.fig".to_string(),
            name: "logo.fig".to_string(),
            extension: Some("fig".to_string()),
            size_bytes: 100,
            hash_sha256: "abc".to_string(),
            created_at: 0,
            modified_at: 0,
            indexed_at: 0,
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some("desktop".to_string()),
        };

        let result = evaluate(&record, &pool).await.unwrap();
        assert!(result.is_none(), "Disabled rule must not match");
    }
}
```

- [ ] **Step 3: Lancer les tests pour vérifier l'échec de compilation**

```bash
cd src-tauri && cargo test engine::rules_engine::tests 2>&1 | head -20
```

Attendu : erreur de compilation `file not found for module rules_engine` ou `cannot find module`.

- [ ] **Step 4: Déclarer le module dans `engine/mod.rs`**

Ouvrir `src-tauri/src/engine/mod.rs` et ajouter la ligne suivante (les autres lignes restent inchangées) :

```rust
pub mod assistant;
pub mod classifier;
pub mod config;
pub mod embeddings;
pub mod export;
pub mod indexer;
pub mod organizer;
pub mod rules_engine;
pub mod search;
pub mod watcher;
```

- [ ] **Step 5: Relancer les tests — vérifier qu'ils passent**

```bash
cd src-tauri && cargo test engine::rules_engine::tests 2>&1
```

Attendu : `11 passed; 0 failed`.

- [ ] **Step 6: Vérifier la compilation globale**

```bash
cd src-tauri && cargo check 2>&1
```

Attendu : 0 erreurs.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/migrations/003_rules.sql src-tauri/src/engine/rules_engine.rs src-tauri/src/engine/mod.rs
git commit -m "feat: rules_engine — RuleRecord, evaluate(), matches_rule() with TDD"
```

---

## Task 2 — Commandes Tauri pour les règles

**Files:**
- Create: `src-tauri/src/commands/rules.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Écrire les tests + implémentation dans `commands/rules.rs`**

```rust
use crate::engine::rules_engine::RuleRecord;
use crate::AppState;
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_rules(state: State<'_, AppState>) -> Result<Vec<RuleRecord>, String> {
    sqlx::query_as::<_, RuleRecord>(
        "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at
         FROM rules ORDER BY priority DESC, created_at ASC"
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_rule(
    name: String,
    condition_type: String,
    condition_value: String,
    target_dir: String,
    auto_tag: Option<String>,
    state: State<'_, AppState>,
) -> Result<RuleRecord, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)"
    )
    .bind(&id)
    .bind(&name)
    .bind(&condition_type)
    .bind(&condition_value)
    .bind(&target_dir)
    .bind(&auto_tag)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, RuleRecord>(
        "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at
         FROM rules WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_rule(id: String, state: State<'_, AppState>) -> Result<(), String> {
    sqlx::query("DELETE FROM rules WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_rule(id: String, state: State<'_, AppState>) -> Result<RuleRecord, String> {
    sqlx::query(
        "UPDATE rules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?"
    )
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, RuleRecord>(
        "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at
         FROM rules WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())
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
    async fn test_create_and_get_rule() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES (?, 'Figma', 'extension', 'fig', '~/Design', 'design', 0, 1, ?)"
        )
        .bind(&id)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        let rules: Vec<RuleRecord> = sqlx::query_as(
            "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at FROM rules"
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].name, "Figma");
        assert_eq!(rules[0].condition_type, "extension");
        assert_eq!(rules[0].auto_tag, Some("design".to_string()));
        assert!(rules[0].enabled);
    }

    #[tokio::test]
    async fn test_delete_rule() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES (?, 'Test', 'extension', 'pdf', '~/Docs', NULL, 0, 1, ?)"
        )
        .bind(&id)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("DELETE FROM rules WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rules")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn test_toggle_rule_disables() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES (?, 'Test', 'extension', 'pdf', '~/Docs', NULL, 0, 1, ?)"
        )
        .bind(&id)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("UPDATE rules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();

        let enabled: bool = sqlx::query_scalar("SELECT enabled FROM rules WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert!(!enabled);
    }
}
```

- [ ] **Step 2: Lancer les tests**

```bash
cd src-tauri && cargo test commands::rules::tests 2>&1
```

Attendu : `3 passed; 0 failed`.

- [ ] **Step 3: Mettre à jour `commands/mod.rs`**

Remplacer le contenu de `src-tauri/src/commands/mod.rs` par :

```rust
pub mod files;
pub mod tags;
pub mod assistant;
pub mod export;
pub mod prefs;
pub mod rules;

pub use files::*;
pub use tags::*;
pub use assistant::*;
pub use export::*;
pub use prefs::*;
pub use rules::*;
```

- [ ] **Step 4: Vérifier la compilation**

```bash
cd src-tauri && cargo check 2>&1
```

Attendu : 0 erreurs.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/rules.rs src-tauri/src/commands/mod.rs
git commit -m "feat: commands/rules — get_rules, create_rule, delete_rule, toggle_rule"
```

---

## Task 3 — Organizer override_target + Pipeline lib.rs

**Files:**
- Modify: `src-tauri/src/engine/organizer.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Écrire le test d'organizer dans `organizer.rs`**

Ajouter à la fin de `src-tauri/src/engine/organizer.rs` :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::FileRecord;
    use crate::engine::classifier::ClassificationResult;
    use sqlx::SqlitePool;

    async fn make_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    fn make_record(path: &str) -> FileRecord {
        FileRecord {
            id: uuid::Uuid::new_v4().to_string(),
            path: path.to_string(),
            name: std::path::Path::new(path)
                .file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .to_string(),
            extension: Some("pdf".to_string()),
            size_bytes: 5,
            hash_sha256: "abc".to_string(),
            created_at: 0,
            modified_at: 0,
            indexed_at: 0,
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some("desktop".to_string()),
        }
    }

    #[tokio::test]
    async fn test_organize_low_confidence_no_override_returns_none() {
        let pool = make_db().await;
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("test.pdf");
        std::fs::write(&src, b"data").unwrap();

        let record = make_record(src.to_str().unwrap());
        let classification = ClassificationResult {
            category: "document".to_string(),
            subcategory: None,
            confidence: 0.10,
            tags: vec![],
        };
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let result = organize_file(&record, &classification, &pool, &tx, None)
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_organize_low_confidence_with_override_moves_file() {
        let pool = make_db().await;
        let src_dir = tempfile::tempdir().unwrap();
        let tgt_dir = tempfile::tempdir().unwrap();
        let src = src_dir.path().join("report.pdf");
        std::fs::write(&src, b"data").unwrap();

        // Insert file record so the DB UPDATE in organize_file doesn't fail
        sqlx::query(
            "INSERT INTO files (id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, is_duplicate, is_organized)
             VALUES (?, ?, 'report.pdf', 'pdf', 4, 'abc', 0, 0, 0, 0, 0)"
        )
        .bind(&"fid")
        .bind(src.to_str().unwrap())
        .execute(&pool)
        .await
        .unwrap();

        let mut record = make_record(src.to_str().unwrap());
        record.id = "fid".to_string();

        let classification = ClassificationResult {
            category: "document".to_string(),
            subcategory: None,
            confidence: 0.10,  // Below MIN_CONFIDENCE_FOR_AUTO_ORGANIZE
            tags: vec![],
        };
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let override_target = Some(tgt_dir.path().to_path_buf());
        let result = organize_file(&record, &classification, &pool, &tx, override_target)
            .await
            .unwrap();
        assert!(result.is_some(), "override_target must bypass confidence check");
        let tgt_file = tgt_dir.path().join("report.pdf");
        assert!(tgt_file.exists(), "File must be moved to override target");
    }
}
```

- [ ] **Step 2: Lancer le test — vérifier l'échec de compilation**

```bash
cd src-tauri && cargo test engine::organizer::tests 2>&1 | head -15
```

Attendu : erreur de compilation car `organize_file` n'a pas encore de 5e paramètre.

- [ ] **Step 3: Modifier `organize_file` dans `organizer.rs`**

Remplacer la signature et le début du corps (lignes 14–26) :

**Ancien code :**
```rust
pub async fn organize_file(
    record: &FileRecord,
    classification: &ClassificationResult,
    pool: &SqlitePool,
    event_tx: &Sender<AppEvent>,
) -> Result<Option<ActionRecord>> {
    if classification.confidence < MIN_CONFIDENCE_FOR_AUTO_ORGANIZE {
        return Ok(None);
    }

    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot find home dir"))?;
    let target_dir = build_target_dir(&home, classification, record);
```

**Nouveau code :**
```rust
pub async fn organize_file(
    record: &FileRecord,
    classification: &ClassificationResult,
    pool: &SqlitePool,
    event_tx: &Sender<AppEvent>,
    override_target: Option<PathBuf>,
) -> Result<Option<ActionRecord>> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot find home dir"))?;
    let target_dir = match override_target {
        Some(dir) => dir,
        None => {
            if classification.confidence < MIN_CONFIDENCE_FOR_AUTO_ORGANIZE {
                return Ok(None);
            }
            build_target_dir(&home, classification, record)
        }
    };
```

- [ ] **Step 4: Lancer les tests de l'organizer — vérifier qu'ils passent**

```bash
cd src-tauri && cargo test engine::organizer::tests 2>&1
```

Attendu : `2 passed; 0 failed`.

- [ ] **Step 5: Mettre à jour `lib.rs` — import + pipeline + invoke_handler**

**5a — Ajouter l'import** en haut de `src-tauri/src/lib.rs`, dans le bloc `use crate::engine::` existant :

Remplacer :
```rust
use crate::engine::{
    classifier::classify_file,
    config::AppConfig,
    indexer::index_file,
    organizer::organize_file,
    search::SearchIndex,
    watcher::FsWatcher,
};
```

Par :
```rust
use crate::engine::{
    classifier::classify_file,
    config::AppConfig,
    indexer::index_file,
    organizer::organize_file,
    rules_engine,
    search::SearchIndex,
    watcher::FsWatcher,
};
```

**5b — Mettre à jour l'invoke_handler** (après `commands::remove_watch_dir,`, avant le `]`) :

```rust
commands::get_rules,
commands::create_rule,
commands::delete_rule,
commands::toggle_rule,
```

La liste complète doit ressembler à :
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
    commands::ask_assistant,
    commands::export_csv,
    commands::export_report,
    commands::get_watch_dirs,
    commands::get_prefs,
    commands::set_watch_dirs,
    commands::add_watch_dir,
    commands::remove_watch_dir,
    commands::get_rules,
    commands::create_rule,
    commands::delete_rule,
    commands::toggle_rule,
])
```

**5c — Mettre à jour le pipeline** dans `start_pipeline`. Remplacer :

```rust
                                Ok(classification) => {
                                    match organize_file(&record, &classification, &pool_clone, &event_tx_clone).await {
                                        Ok(Some(action)) => {
                                            // Index organized file in Tantivy
                                            let tags: Vec<String> = sqlx::query_as::<_, (String,)>(
```

Par :

```rust
                                Ok(classification) => {
                                    let rule_match = rules_engine::evaluate(&record, pool_clone.as_ref())
                                        .await
                                        .unwrap_or(None);
                                    let override_target = rule_match.as_ref().map(|m| m.target_dir.clone());
                                    match organize_file(&record, &classification, &pool_clone, &event_tx_clone, override_target).await {
                                        Ok(Some(action)) => {
                                            if let Some(ref rm) = rule_match {
                                                if let Some(ref tag) = rm.auto_tag {
                                                    let tag_id = uuid::Uuid::new_v4().to_string();
                                                    let _ = sqlx::query(
                                                        "INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (?, ?, ?, 'rule', 1.0)"
                                                    )
                                                    .bind(&tag_id)
                                                    .bind(&record.id)
                                                    .bind(tag)
                                                    .execute(pool_clone.as_ref())
                                                    .await;
                                                }
                                            }
                                            // Index organized file in Tantivy
                                            let tags: Vec<String> = sqlx::query_as::<_, (String,)>(
```

- [ ] **Step 6: Vérifier la compilation**

```bash
cd src-tauri && cargo check 2>&1
```

Attendu : 0 erreurs.

- [ ] **Step 7: Lancer tous les tests Rust**

```bash
cd src-tauri && cargo test 2>&1 | grep -E "^test result|FAILED"
```

Attendu : tous les suites `ok`, 0 `FAILED`.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/engine/organizer.rs src-tauri/src/lib.rs
git commit -m "feat: organizer override_target + pipeline rules evaluation + auto-tag"
```

---

## Task 4 — Store TypeScript — RuleRecord + slice rules

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Ajouter `RuleRecord` et le slice rules dans `src/store/index.ts`**

Ajouter après l'interface `AssistantMessage` (ligne 65) :

```ts
export interface RuleRecord {
  id: string;
  name: string;
  condition_type: 'extension' | 'name_contains' | 'source';
  condition_value: string;
  target_dir: string;
  auto_tag: string | null;
  priority: number;
  enabled: boolean;
  created_at: number;
}
```

Dans l'interface `AppStore` (après le bloc `// Explorer`), ajouter :

```ts
  // Rules
  rules: RuleRecord[];
  setRules: (rules: RuleRecord[]) => void;
  addRule: (rule: RuleRecord) => void;
  removeRule: (id: string) => void;
  updateRule: (rule: RuleRecord) => void;
```

Dans `create<AppStore>((set) => ({`, ajouter après `setExplorerSort`:

```ts
  rules: [],
  setRules: (rules) => set({ rules }),
  addRule: (rule) => set((s) => ({ rules: [...s.rules, rule] })),
  removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
  updateRule: (rule) =>
    set((s) => ({ rules: s.rules.map((r) => (r.id === rule.id ? rule : r)) })),
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npm run build 2>&1 | tail -10
```

Attendu : build réussi, 0 erreurs TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): RuleRecord interface + rules slice"
```

---

## Task 5 — RulesView — composant frontend

**Files:**
- Create: `src/components/Rules/index.tsx`

- [ ] **Step 1: Créer `src/components/Rules/index.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Trash2, Pause, Play, SlidersHorizontal } from 'lucide-react';
import { useAppStore, RuleRecord } from '../../store';

const CONDITION_TYPES = [
  { value: 'extension',    label: 'Extension =' },
  { value: 'name_contains', label: 'Nom contient' },
  { value: 'source',       label: 'Source =' },
];

const CONDITION_PLACEHOLDERS: Record<string, string> = {
  extension:    'fig',
  name_contains: 'facture',
  source:       'downloads',
};

export function RulesView() {
  const { rules, setRules, addRule, removeRule, updateRule } = useAppStore();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    condition_type: 'extension',
    condition_value: '',
    target_dir: '',
    auto_tag: '',
  });

  useEffect(() => {
    invoke<RuleRecord[]>('get_rules')
      .then(setRules)
      .catch(console.error);
  }, []);

  async function handleCreate() {
    if (!form.name.trim() || !form.condition_value.trim() || !form.target_dir.trim()) return;
    try {
      const rule = await invoke<RuleRecord>('create_rule', {
        name: form.name.trim(),
        condition_type: form.condition_type,
        condition_value: form.condition_value.trim(),
        target_dir: form.target_dir.trim(),
        auto_tag: form.auto_tag.trim() || null,
      });
      addRule(rule);
      setForm({ name: '', condition_type: 'extension', condition_value: '', target_dir: '', auto_tag: '' });
      setCreating(false);
    } catch (err) {
      console.error('create_rule error:', err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke('delete_rule', { id });
      removeRule(id);
    } catch (err) {
      console.error('delete_rule error:', err);
    }
  }

  async function handleToggle(id: string) {
    try {
      const updated = await invoke<RuleRecord>('toggle_rule', { id });
      updateRule(updated);
    } catch (err) {
      console.error('toggle_rule error:', err);
    }
  }

  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-amber-400" />
          <h1 className="text-sm font-semibold text-zinc-100">Règles d'organisation</h1>
          <span className="text-xs text-zinc-600">— appliquées avant l'organiseur</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bx-600 hover:bg-bx-700 text-zinc-100 text-xs rounded-lg transition-colors"
        >
          <Plus size={12} />
          Nouvelle règle
        </button>
      </div>

      {/* Empty state */}
      {rules.length === 0 && !creating && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <SlidersHorizontal size={28} className="text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">Aucune règle configurée.</p>
            <p className="text-xs text-zinc-600 mt-1">Crée une règle pour personnaliser l'organisation des fichiers.</p>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="flex flex-col gap-2 mb-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              rule.enabled
                ? 'bg-bx-900 border-bx-800'
                : 'bg-bx-950 border-bx-900 opacity-50'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                rule.enabled ? 'bg-emerald-400' : 'bg-zinc-600'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">{rule.name}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded">
                  {CONDITION_TYPES.find((c) => c.value === rule.condition_type)?.label}{' '}
                  "{rule.condition_value}"
                </span>
                <span>→</span>
                <span className="text-zinc-400 font-mono truncate">{rule.target_dir}</span>
                {rule.auto_tag && (
                  <span className="bg-emerald-900/30 text-emerald-400 px-1.5 py-0.5 rounded">
                    #{rule.auto_tag}
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => handleToggle(rule.id)}
                title={rule.enabled ? 'Désactiver' : 'Activer'}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-bx-800 rounded-lg transition-colors"
              >
                {rule.enabled ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <button
                onClick={() => handleDelete(rule.id)}
                title="Supprimer"
                className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-900/20 rounded-lg transition-colors"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Inline creation form */}
      {creating && (
        <div className="border border-dashed border-amber-700/50 rounded-xl p-4 bg-bx-900/40">
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-3">
            Nouvelle règle
          </p>
          <div className="flex flex-col gap-2">
            <input
              placeholder="Nom de la règle (ex : Fichiers Figma)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-zinc-500 shrink-0 w-4">Si</span>
              <select
                value={form.condition_type}
                onChange={(e) => setForm({ ...form, condition_type: e.target.value })}
                className="bg-bx-800 border border-bx-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                {CONDITION_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
              <input
                placeholder={CONDITION_PLACEHOLDERS[form.condition_type]}
                value={form.condition_value}
                onChange={(e) => setForm({ ...form, condition_value: e.target.value })}
                className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-zinc-500 shrink-0 w-4">→</span>
              <input
                placeholder="Dossier cible (ex : ~/Documents/Finance)"
                value={form.target_dir}
                onChange={(e) => setForm({ ...form, target_dir: e.target.value })}
                className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-zinc-500 shrink-0 w-4">#</span>
              <input
                placeholder="Tag automatique (optionnel)"
                value={form.auto_tag}
                onChange={(e) => setForm({ ...form, auto_tag: e.target.value })}
                className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2 justify-end mt-1">
              <button
                onClick={() => {
                  setCreating(false);
                  setForm({ name: '', condition_type: 'extension', condition_value: '', target_dir: '', auto_tag: '' });
                }}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.name.trim() || !form.condition_value.trim() || !form.target_dir.trim()}
                className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 font-medium rounded-lg transition-colors"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Rules/index.tsx
git commit -m "feat: RulesView — liste, formulaire inline, toggle, delete"
```

---

## Task 6 — Sidebar + App.tsx — câblage de la vue

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Mettre à jour `Sidebar.tsx`**

Remplacer la ligne d'import Lucide par :
```tsx
import { LayoutDashboard, FolderOpen, Folder, FolderClosed, Mail, Settings, SlidersHorizontal } from 'lucide-react';
```

Remplacer le tableau `NAV_ITEMS` par :
```tsx
const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'explorer',    label: 'Explorer',    icon: Folder },
  { id: 'unsorted',    label: 'À valider',   icon: FolderOpen },
  { id: 'emails',      label: 'E-mails',     icon: Mail },
  { id: 'rules',       label: 'Règles',      icon: SlidersHorizontal },
  { id: 'preferences', label: 'Préférences', icon: Settings },
];
```

Modifier la destructure du store pour ajouter `rules` :
```tsx
const { isWatching, watchedDirs, stats, setSelectedCategory, selectedCategory, rules } = useAppStore();
```

Ajouter `enabledRulesCount` juste après la ligne `unsortedCount` :
```tsx
const enabledRulesCount = rules.filter((r) => r.enabled).length;
```

Dans le JSX du bouton, après le badge `emails`, ajouter le badge `rules` :
```tsx
{id === 'rules' && enabledRulesCount > 0 && (
  <span className="ml-auto text-[9px] font-semibold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
    {enabledRulesCount}
  </span>
)}
```

- [ ] **Step 2: Mettre à jour `App.tsx`**

Ajouter l'import :
```tsx
import { RulesView } from './components/Rules';
```

Ajouter la route après `{currentView === 'preferences' && <PreferencesView />}` :
```tsx
{currentView === 'rules' && <RulesView />}
```

- [ ] **Step 3: Vérifier dans le navigateur**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npm run dev
```

Ouvrir l'app. Vérifier :
- La sidebar affiche 6 items, dont "Règles" avec l'icône ⟨ SlidersHorizontal ⟩
- Cliquer sur "Règles" ouvre la vue RulesView avec l'état vide
- Cliquer "Nouvelle règle" affiche le formulaire inline
- Remplir et valider crée une entrée dans la liste (note : en mode navigateur sans Tauri, `invoke` échoue silencieusement — le test complet nécessite `npm run tauri dev`)

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/App.tsx
git commit -m "feat: Sidebar item Règles + badge amber + App route rules"
```

---

## Récapitulatif des commits attendus

1. `feat: rules_engine — RuleRecord, evaluate(), matches_rule() with TDD`
2. `feat: commands/rules — get_rules, create_rule, delete_rule, toggle_rule`
3. `feat: organizer override_target + pipeline rules evaluation + auto-tag`
4. `feat(store): RuleRecord interface + rules slice`
5. `feat: RulesView — liste, formulaire inline, toggle, delete`
6. `feat: Sidebar item Règles + badge amber + App route rules`
