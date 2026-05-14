# Règles personnalisées — Spec

**Date:** 2026-05-14
**Status:** Approuvé

## Contexte

Egestion organise les fichiers via un pipeline classifier → organizer. Cette spec ajoute un système de règles personnalisées : l'utilisateur définit des règles conditionnelles (`extension = .fig`, `nom contient "facture"`, `source = Downloads`) qui redirigent un fichier vers un dossier cible et ajoutent un tag automatique, en court-circuitant le seuil de confiance minimum du classifier.

---

## Périmètre

| Ce qui change | Ce qui ne change pas |
|---|---|
| 8 fichiers modifiés/créés | Pipeline classifier, undo journal, SearchIndex |
| Nouvelle table `rules` + migration `003_rules.sql` | DB schema des tables existantes |
| Nouveau module `engine/rules_engine.rs` | Tantivy, embeddings, assistant |
| Nouvelle commande `commands/rules.rs` | Interface `SidebarProps` |
| Modification `organizer.rs` (paramètre `override_target`) | Format des événements Tauri |
| Nouvelle vue `Rules/` + store slice | `useFileEvents.ts`, `useKeyboard.ts` |

---

## Décisions validées

| Question | Choix |
|---|---|
| Conditions par règle | Une seule condition (simple) |
| Types de conditions | `extension`, `name_contains`, `source` |
| Actions | Dossier cible + tag optionnel |
| Seuil de confiance | Bypassé si une règle matche |
| Position dans le pipeline | Après classifier, avant organizer |
| UI | Vue dédiée "Règles" dans la sidebar |

---

## Composants à modifier/créer

### 1. `src-tauri/migrations/003_rules.sql` (nouveau)

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

### 2. `src-tauri/src/engine/rules_engine.rs` (nouveau)

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
    let expanded = target_dir.replacen("~/", "", 1);
    if target_dir.starts_with("~/") {
        home.join(expanded)
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
    fn test_extension_strips_leading_dot() {
        let record = make_record("file.pdf", "pdf", "desktop");
        let rule = make_rule("extension", ".pdf");
        assert!(matches_rule(&record, &rule));
    }
}
```

### 3. `src-tauri/src/engine/mod.rs`

Ajouter la ligne :
```rust
pub mod rules_engine;
```

### 4. `src-tauri/src/engine/organizer.rs`

Modifier la signature de `organize_file` pour accepter un `override_target` :

```rust
pub async fn organize_file(
    record: &FileRecord,
    classification: &ClassificationResult,
    pool: &SqlitePool,
    event_tx: &Sender<AppEvent>,
    override_target: Option<PathBuf>,
) -> Result<Option<ActionRecord>>
```

Dans le corps, remplacer :
```rust
if classification.confidence < MIN_CONFIDENCE_FOR_AUTO_ORGANIZE {
    return Ok(None);
}
let target_dir = build_target_dir(&home, classification, record);
```
par :
```rust
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

Mettre à jour tous les appels existants à `organize_file` dans `lib.rs` pour passer `None` en 5e argument.

### 5. `src-tauri/src/commands/rules.rs` (nouveau)

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
    sqlx::query("UPDATE rules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?")
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
```

### 6. `src-tauri/src/commands/mod.rs`

Ajouter `pub mod rules;` et `pub use rules::*;`.

### 7. `src-tauri/src/lib.rs`

**Imports :** ajouter `use crate::engine::rules_engine;`

**Pipeline :** entre `classify_file` et `organize_file`, insérer :

```rust
Ok(classification) => {
    // Évaluer les règles personnalisées
    let rule_match = rules_engine::evaluate(&record, pool_clone.as_ref())
        .await
        .unwrap_or(None);

    let override_target = rule_match.as_ref().map(|m| m.target_dir.clone());

    match organize_file(&record, &classification, &pool_clone, &event_tx_clone, override_target).await {
        Ok(Some(action)) => {
            // Ajouter le tag automatique de la règle si présent
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
            // ... reste du pipeline (Tantivy index) inchangé
        }
        // ...
    }
}
```

**invoke_handler :** ajouter :
```rust
commands::get_rules,
commands::create_rule,
commands::delete_rule,
commands::toggle_rule,
```

### 8. `src/store/index.ts`

Ajouter le type `RuleRecord` et le slice rules :

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

Dans `AppStore` :
```ts
rules: RuleRecord[];
setRules: (rules: RuleRecord[]) => void;
addRule: (rule: RuleRecord) => void;
removeRule: (id: string) => void;
updateRule: (rule: RuleRecord) => void;
```

Valeurs initiales :
```ts
rules: [],
setRules: (rules) => set({ rules }),
addRule: (rule) => set((s) => ({ rules: [...s.rules, rule] })),
removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
updateRule: (rule) => set((s) => ({ rules: s.rules.map((r) => (r.id === rule.id ? rule : r)) })),
```

### 9. `src/components/Rules/index.tsx` (nouveau)

Vue principale avec liste de règles + formulaire inline de création :

- `useEffect` au montage : `invoke<RuleRecord[]>('get_rules')` → `setRules`
- Liste des règles : chaque règle affiche `name`, condition, dossier cible, tag (s'il existe), boutons Éditer/Supprimer/Toggle
- Formulaire inline "Nouvelle règle" : champs `name`, `condition_type` (select), `condition_value` (input), `target_dir` (input), `auto_tag` (input optionnel) + bouton Créer
- Bouton Créer appelle `invoke('create_rule', {...})` → `addRule(result)` dans le store
- Bouton Supprimer appelle `invoke('delete_rule', {id})` → `removeRule(id)`
- Toggle (⏸/▶) appelle `invoke('toggle_rule', {id})` → `updateRule(result)`
- Badge compteur sidebar = `rules.filter(r => r.enabled).length`

### 10. `src/components/layout/Sidebar.tsx`

Ajouter `SlidersHorizontal` aux imports Lucide et insérer l'item avant `preferences` :

```tsx
import { LayoutDashboard, FolderOpen, Folder, FolderClosed, Mail, Settings, SlidersHorizontal } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'explorer',    label: 'Explorer',    icon: Folder },
  { id: 'unsorted',    label: 'À valider',   icon: FolderOpen },
  { id: 'emails',      label: 'E-mails',     icon: Mail },
  { id: 'rules',       label: 'Règles',      icon: SlidersHorizontal },
  { id: 'preferences', label: 'Préférences', icon: Settings },
];
```

Badge sur `rules` (amber) :

```tsx
{id === 'rules' && enabledRulesCount > 0 && (
  <span className="ml-auto text-[9px] font-semibold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
    {enabledRulesCount}
  </span>
)}
```

Où `enabledRulesCount` = `useAppStore((s) => s.rules.filter(r => r.enabled).length)`.

### 11. `src/App.tsx`

Ajouter l'import et la route :

```tsx
import { RulesView } from './components/Rules';
// ...
{currentView === 'rules' && <RulesView />}
```

---

## Flux complet (exemple)

```
~/Desktop/design_v3.fig déposé
    ↓ watcher.rs (source: "desktop")
    ↓ indexer → DB insert
    ↓ classifier → category:"code", confidence:0.75
    ↓ rules_engine::evaluate() → match: règle "Fichiers Figma" (extension = fig)
    ↓ organize_file(override_target = ~/Projets/Design/Figma)
    ↓ INSERT INTO tags (source='rule', tag='design')
    ↓ Tantivy index
    ↓ UI: Explorer "design_v3.fig" tagué #design dans ~/Projets/Design/Figma
```

---

## Tests attendus (Rust)

Dans `engine/rules_engine.rs` (8 tests) :
- `test_matches_extension` — `.fig` matche extension = `fig`
- `test_matches_extension_case_insensitive` — `.FIG` matche `fig`
- `test_extension_strips_leading_dot` — valeur `.pdf` matche extension `pdf`
- `test_matches_name_contains` — `facture_mai.pdf` matche `facture`
- `test_no_match_name_contains` — `rapport.pdf` ne matche pas `facture`
- `test_matches_source` — source `downloads` matche `downloads`
- `test_resolve_tilde_path` — `~/Documents/Finance` → `/Users/x/Documents/Finance`
- Test DB : `evaluate()` avec pool in-memory + règle insérée → `Some(RuleMatch)`

Dans `commands/rules.rs` :
- `create_rule` → row in DB
- `delete_rule` → row supprimée
- `toggle_rule` → enabled flipped

---

## Ce qui ne change pas

- Aucune migration des tables existantes
- Le classifier continue de tourner pour toutes les règles (métadonnées category/subcategory conservées)
- L'undo journal fonctionne identiquement (la règle ne modifie que le target_dir)
- `useFileEvents.ts` inchangé — les événements `file-organized` portent déjà le chemin final
