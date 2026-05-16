# IA Interne Egestion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intégrer 4 fonctionnalités IA dans Egestion : clé API dans les Préférences, suggestion visible dans "À valider", assistant avec prompt dynamique contextuel, panneau FAQ, et onboarding guidé par analyse de fichiers.

**Architecture:** Approche incrémentale sans refactoring. `AppConfig` reçoit `api_key`, `AppState` expose la config via `Arc<Mutex<AppConfig>>`. Un helper `resolve_api_key` est partagé dans `commands/mod.rs`. Les fonctions IA restent dans `engine/assistant.rs`.

**Tech Stack:** Rust/Tauri 2.x, React/TypeScript, SQLite (sqlx), Claude API (sonnet-4-6), reqwest

---

## Fichiers modifiés / créés

```
src-tauri/src/
  engine/
    config.rs              ← + api_key: Option<String> + serde(default)
    assistant.rs           ← + AssistantContext, build_system_prompt(), load_assistant_context()
                             + SuggestedRule, OnboardingAnalysis, analyze_for_onboarding()
  commands/
    mod.rs                 ← + pub fn resolve_api_key(config_key: Option<&str>) -> String
    prefs.rs               ← fix set/add/remove_watch_dir (use state.config mutex)
                             + fn mask_api_key(key: &str) -> String (testable helper)
                             + get_api_key_masked, set_api_key, analyze_for_onboarding (Tauri cmds)
    assistant.rs           ← use resolve_api_key + load AssistantContext before calling ask()
  lib.rs                   ← AppState += config: Arc<Mutex<AppConfig>>
                             setup() charge et partage la config

src/
  components/
    Unsorted/index.tsx     ← affiche suggestion IA (category/subcategory) en badge amber
    Preferences/PreferencesView.tsx  ← section "Intelligence Artificielle" + champ clé API
    Help/index.tsx         ← CRÉER — panneau FAQ avec questions prédéfinies + champ libre
    Onboarding/index.tsx   ← + phases 'analyzing' et 'suggestions' avec règles cliquables
    layout/Sidebar.tsx     ← + item 'Aide' avec icône HelpCircle
  App.tsx                  ← + {currentView === 'help' && <HelpView />}
```

---

## Task 1: AppConfig — champ api_key

**Files:**
- Modify: `src-tauri/src/engine/config.rs`

- [ ] **Step 1: Écrire le test**

Dans `engine/config.rs`, ajouter dans le bloc `#[cfg(test)] mod tests`:

```rust
#[test]
fn test_api_key_serde_default_none() {
    // config.json sans api_key doit charger sans paniquer
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
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
cd src-tauri && cargo test -p egestion-lib -- engine::config 2>&1 | tail -20
```

Attendu : erreur de compilation (champ `api_key` absent).

- [ ] **Step 3: Ajouter le champ `api_key` à `AppConfig`**

Dans `src-tauri/src/engine/config.rs`, modifier la struct et `default_config` :

```rust
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
    // save() et load() ne changent pas
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
cd src-tauri && cargo test -p egestion-lib -- engine::config 2>&1 | tail -20
```

Attendu : tous les tests `engine::config` passent (y compris les anciens).

- [ ] **Step 5: Corriger les erreurs de compilation dans `commands/prefs.rs`**

`set_watch_dirs`, `add_watch_dir`, `remove_watch_dir` construisent actuellement `AppConfig { watch_dirs: ... }` — ce qui compile plus car `api_key` est absent. On les corrigera en Task 3 quand `AppState.config` sera disponible. Pour l'instant, vérifier juste que `engine/config.rs` compile seul :

```bash
cd src-tauri && cargo check --lib 2>&1 | grep "error" | head -20
```

Attendu : erreurs dans `commands/prefs.rs` uniquement (AppConfig missing field). C'est normal — Task 2 les corrige.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/engine/config.rs
git commit -m "feat(config): add api_key field to AppConfig with serde default"
```

---

## Task 2: AppState — exposer la config + resolve_api_key

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Écrire les tests pour `resolve_api_key`**

Ajouter à la fin de `src-tauri/src/commands/mod.rs` :

```rust
pub fn resolve_api_key(config_key: Option<&str>) -> String {
    config_key
        .filter(|k| !k.is_empty())
        .map(String::from)
        .unwrap_or_else(|| std::env::var("ANTHROPIC_API_KEY").unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_api_key_returns_config_key() {
        let key = resolve_api_key(Some("my-config-key"));
        assert_eq!(key, "my-config-key");
    }

    #[test]
    fn test_resolve_api_key_ignores_empty_string() {
        // Clé config vide → renvoie "" si env var absente
        let _key = resolve_api_key(Some(""));
        // Pas de panique — c'est l'invariant important
    }

    #[test]
    fn test_resolve_api_key_none_returns_env_or_empty() {
        // None → env var ou ""
        let _key = resolve_api_key(None);
    }
}
```

- [ ] **Step 2: Vérifier que les tests passent (la fonction est déjà écrite en step 1)**

```bash
cd src-tauri && cargo test -p egestion-lib -- commands::tests 2>&1 | tail -10
```

Attendu : 3 tests passent.

- [ ] **Step 3: Ajouter `config` à `AppState` dans `lib.rs`**

Remplacer la définition de `AppState` :

```rust
pub struct AppState {
    pub pool: SqlitePool,
    pub search_index: Arc<Mutex<SearchIndex>>,
    pub watcher: Arc<Mutex<crate::engine::watcher::FsWatcher>>,
    pub app_data_dir: std::path::PathBuf,
    pub config: Arc<Mutex<AppConfig>>,
}
```

Ajouter l'import manquant en tête de fichier si absent :
```rust
use crate::engine::config::AppConfig;
```

- [ ] **Step 4: Mettre à jour `setup()` pour partager la config**

Dans la fonction `run()`, dans le bloc `.setup(|app| {`, remplacer :

```rust
let config = AppConfig::load(&data_dir).unwrap_or_else(|_| AppConfig::default_config());
```

par :

```rust
let config = AppConfig::load(&data_dir).unwrap_or_else(|_| AppConfig::default_config());
let config = Arc::new(Mutex::new(config));
```

Puis remplacer la lecture de l'api_key :

```rust
let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
```

par :

```rust
let api_key = {
    let cfg = config.lock().expect("config lock");
    crate::commands::resolve_api_key(cfg.api_key.as_deref())
};
```

Puis dans `app.manage(AppState { ... })`, ajouter le champ :

```rust
app.manage(AppState {
    pool: pool.clone(),
    search_index: Arc::clone(&search_index),
    watcher: Arc::clone(&watcher),
    app_data_dir: data_dir.clone(),
    config: Arc::clone(&config),
});
```

Aussi dans la reconstruction de l'index depuis la config (scan initial), remplacer :
```rust
let config = AppConfig::load(&data_dir).unwrap_or_else(|_| AppConfig::default_config());
```
par (si présent dans le code de scan) :
```rust
let scan_dirs = config.lock().expect("config lock").watch_dirs.clone();
```

- [ ] **Step 5: Vérifier la compilation**

```bash
cd src-tauri && cargo check --lib 2>&1 | grep "error" | head -30
```

Attendu : erreurs restantes uniquement dans `commands/prefs.rs` (AppConfig struct init sans api_key). Task 3 les corrige.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/commands/mod.rs
git commit -m "feat(state): expose config in AppState + resolve_api_key helper"
```

---

## Task 3: Corriger prefs.rs + commandes API key

**Files:**
- Modify: `src-tauri/src/commands/prefs.rs`
- Modify: `src-tauri/src/lib.rs` (enregistrement des nouvelles commandes)

- [ ] **Step 1: Écrire les tests pour `mask_api_key`**

Ajouter à la fin de `commands/prefs.rs` :

```rust
pub fn mask_api_key(key: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    if key.len() <= 20 {
        return "***".to_string();
    }
    format!("{}***", &key[..20])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_key_shows_prefix() {
        let masked = mask_api_key("sk-ant-api03-VERY-LONG-KEY-HERE");
        assert!(masked.ends_with("***"));
        assert_eq!(&masked[..20], "sk-ant-api03-VERY-LO");
    }

    #[test]
    fn test_mask_key_empty_returns_empty() {
        assert_eq!(mask_api_key(""), "");
    }

    #[test]
    fn test_mask_key_short_returns_stars() {
        assert_eq!(mask_api_key("short"), "***");
    }

    #[test]
    fn test_mask_key_exactly_20_returns_stars() {
        assert_eq!(mask_api_key("12345678901234567890"), "***");
    }
}
```

- [ ] **Step 2: Vérifier les tests (mask_api_key est déjà écrit)**

```bash
cd src-tauri && cargo test -p egestion-lib -- commands::prefs 2>&1 | tail -15
```

Attendu : les 4 tests de mask_api_key passent.

- [ ] **Step 3: Corriger les constructeurs AppConfig dans prefs.rs**

Remplacer les 3 endroits dans `prefs.rs` qui font `AppConfig { watch_dirs: ... }`.

Dans `set_watch_dirs`, remplacer :
```rust
let config = AppConfig { watch_dirs: paths.clone() };
config.save(&state.app_data_dir).map_err(|e| e.to_string())?;
```
par :
```rust
{
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.watch_dirs = paths.clone();
    config.save(&state.app_data_dir).map_err(|e| e.to_string())?;
}
```

Dans `add_watch_dir`, remplacer :
```rust
let config = AppConfig { watch_dirs: current.clone() };
config.save(&state.app_data_dir).map_err(|e| e.to_string())?;
```
par :
```rust
{
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.watch_dirs = current.clone();
    config.save(&state.app_data_dir).map_err(|e| e.to_string())?;
}
```

Dans `remove_watch_dir`, remplacer :
```rust
let config = AppConfig { watch_dirs: current.clone() };
config.save(&state.app_data_dir).map_err(|e| e.to_string())?;
```
par :
```rust
{
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.watch_dirs = current.clone();
    config.save(&state.app_data_dir).map_err(|e| e.to_string())?;
}
```

Also remove unused `use crate::engine::config::AppConfig;` if no longer needed (or keep if still used elsewhere in the file — check).

- [ ] **Step 4: Ajouter les commandes `get_api_key_masked` et `set_api_key`**

Ajouter après `remove_watch_dir` dans `prefs.rs` :

```rust
#[tauri::command]
pub fn get_api_key_masked(state: State<'_, AppState>) -> String {
    let config = state.config.lock().unwrap();
    let key = crate::commands::resolve_api_key(config.api_key.as_deref());
    mask_api_key(&key)
}

#[tauri::command]
pub fn set_api_key(key: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.api_key = if key.is_empty() { None } else { Some(key) };
    config.save(&state.app_data_dir).map_err(|e| e.to_string())
}
```

- [ ] **Step 5: Enregistrer les nouvelles commandes dans `lib.rs`**

Dans le `tauri::generate_handler![...]`, ajouter après `commands::get_prefs` :

```rust
commands::get_api_key_masked,
commands::set_api_key,
```

- [ ] **Step 6: Vérifier la compilation complète**

```bash
cd src-tauri && cargo check --lib 2>&1 | grep "error"
```

Attendu : aucune erreur.

- [ ] **Step 7: Lancer tous les tests**

```bash
cd src-tauri && cargo test 2>&1 | tail -30
```

Attendu : tous les tests passent (aucun `FAILED`).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/prefs.rs src-tauri/src/lib.rs
git commit -m "feat(prefs): fix AppConfig construction + add get_api_key_masked, set_api_key"
```

---

## Task 4: AssistantContext + prompt système dynamique

**Files:**
- Modify: `src-tauri/src/engine/assistant.rs`

- [ ] **Step 1: Écrire les tests**

Ajouter dans le bloc `#[cfg(test)] mod tests` de `engine/assistant.rs` :

```rust
fn make_ctx() -> AssistantContext {
    AssistantContext {
        watch_dirs: vec!["~/Desktop".to_string(), "~/Downloads".to_string()],
        total_files: 127,
        organized_files: 95,
        unsorted_count: 8,
        rules_summary: "2 règles : pdf→Documents, jpg→Photos".to_string(),
    }
}

#[test]
fn test_build_system_prompt_contains_watch_dirs() {
    let prompt = build_system_prompt(&make_ctx());
    assert!(prompt.contains("~/Desktop"), "prompt must contain watch dir");
    assert!(prompt.contains("~/Downloads"), "prompt must contain second watch dir");
}

#[test]
fn test_build_system_prompt_contains_stats() {
    let prompt = build_system_prompt(&make_ctx());
    assert!(prompt.contains("127"), "total_files");
    assert!(prompt.contains("95"), "organized_files");
    assert!(prompt.contains("8"), "unsorted_count");
}

#[test]
fn test_build_system_prompt_contains_rules() {
    let prompt = build_system_prompt(&make_ctx());
    assert!(prompt.contains("2 règles"), "rules_summary");
}

#[test]
fn test_build_system_prompt_empty_dirs() {
    let ctx = AssistantContext {
        watch_dirs: vec![],
        total_files: 0,
        organized_files: 0,
        unsorted_count: 0,
        rules_summary: "Aucune règle".to_string(),
    };
    let prompt = build_system_prompt(&ctx);
    assert!(prompt.contains("Aucun dossier configuré"));
}
```

- [ ] **Step 2: Vérifier que les tests échouent (struct + fonction absentes)**

```bash
cd src-tauri && cargo test -p egestion-lib -- engine::assistant 2>&1 | tail -10
```

Attendu : erreur de compilation (`AssistantContext` et `build_system_prompt` non définis).

- [ ] **Step 3: Ajouter `AssistantContext` et `build_system_prompt` dans `engine/assistant.rs`**

Ajouter après les imports existants (avant `const SONNET_MODEL`):

```rust
#[derive(Debug, Clone)]
pub struct AssistantContext {
    pub watch_dirs: Vec<String>,
    pub total_files: i64,
    pub organized_files: i64,
    pub unsorted_count: i64,
    pub rules_summary: String,
}

pub fn build_system_prompt(ctx: &AssistantContext) -> String {
    let watch_dirs_str = if ctx.watch_dirs.is_empty() {
        "Aucun dossier configuré".to_string()
    } else {
        ctx.watch_dirs.join(", ")
    };

    format!(
        r#"Tu es un assistant intelligent intégré dans Egestion, une application macOS de gestion automatique de fichiers.

== COMMENT EGESTION FONCTIONNE ==
- Watcher : surveille les dossiers configurés en temps réel (FSEvents macOS). Chaque nouveau fichier déclenche le pipeline automatiquement.
- Pipeline : Fichier détecté → Indexation (hash SHA256, métadonnées) → Classification (règles d'abord ; si confiance < 90% → Claude Haiku) → Organisation (déplacement vers ~/Documents/Egestion/<Catégorie>).
- Règles : conditions (extension, nom contient, source) → dossier cible + tag automatique. Les règles ont priorité absolue sur l'IA si leur confiance ≥ 90%.
- Classification IA : Claude Haiku classe chaque fichier (photo/video/music/document/archive/code/installer/other) avec un score de confiance. Cache 30 jours par hash SHA256.
- À valider : fichiers dont la confiance IA est < 50% — attendent validation manuelle dans l'écran « À valider ».
- Dashboard : historique des déplacements, statistiques, export CSV. Chaque déplacement est annulable.

== CONTEXTE UTILISATEUR ==
Dossiers surveillés : {watch_dirs}
Fichiers indexés : {total} total, {organized} organisés
Fichiers en attente de validation : {unsorted}
Règles actives : {rules}

== SCHÉMA BASE DE DONNÉES ==
- files : id, path, name, extension, size_bytes, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, is_organized, source_dir
- tags : id, file_id, tag, source, weight
- actions : id, file_id, action_type, path_before, path_after, executed_at, undone_at, undoable

Catégories disponibles : photo, video, music, document, archive, code, installer, other

== RÈGLES DE RÉPONSE ==
1. Si la question demande de trouver/lister des fichiers → répondre UNIQUEMENT avec une requête SQL SQLite valide commençant par SELECT (sans markdown, sans ```sql).
   La requête sélectionne : id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, is_organized, source_dir depuis la table files.
2. Sinon → répondre en français en langage naturel, de façon concise et utile."#,
        watch_dirs = watch_dirs_str,
        total = ctx.total_files,
        organized = ctx.organized_files,
        unsorted = ctx.unsorted_count,
        rules = ctx.rules_summary,
    )
}
```

- [ ] **Step 4: Mettre à jour la fonction `ask()` pour utiliser `build_system_prompt`**

Remplacer la signature de `ask()` :

```rust
pub async fn ask(
    query: String,
    history: Vec<Message>,
    api_key: &str,
    pool: &SqlitePool,
) -> Result<AssistantResponse>
```

par :

```rust
pub async fn ask(
    query: String,
    history: Vec<Message>,
    context: AssistantContext,
    api_key: &str,
    pool: &SqlitePool,
) -> Result<AssistantResponse>
```

Dans le corps de `ask()`, remplacer `"system": SYSTEM_PROMPT` par :

```rust
"system": build_system_prompt(&context),
```

Supprimer la constante `SYSTEM_PROMPT` (elle n'est plus utilisée).

- [ ] **Step 5: Ajouter `load_assistant_context`**

Ajouter après `build_system_prompt` :

```rust
pub async fn load_assistant_context(
    pool: &SqlitePool,
    watch_dirs: Vec<String>,
) -> Result<AssistantContext> {
    let (total_files,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files")
        .fetch_one(pool)
        .await?;

    let (organized_files,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM files WHERE is_organized = 1")
            .fetch_one(pool)
            .await?;

    let (unsorted_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM files WHERE (confidence IS NULL OR confidence < 0.5) AND is_organized = 0",
    )
    .fetch_one(pool)
    .await?;

    let rules: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT name, condition_value, target_dir FROM rules WHERE enabled = 1 LIMIT 5",
    )
    .fetch_all(pool)
    .await?;

    let rules_summary = if rules.is_empty() {
        "Aucune règle configurée".to_string()
    } else {
        let parts: Vec<String> = rules
            .iter()
            .map(|(name, cond, target)| format!("{} ({} → {})", name, cond, target))
            .collect();
        format!("{} règle(s) : {}", rules.len(), parts.join(", "))
    };

    Ok(AssistantContext {
        watch_dirs,
        total_files,
        organized_files,
        unsorted_count,
        rules_summary,
    })
}
```

- [ ] **Step 6: Ajouter le test de `load_assistant_context`**

Dans le bloc `#[cfg(test)] mod tests` de `engine/assistant.rs` :

```rust
#[tokio::test]
async fn test_load_assistant_context_empty_db() {
    let pool = make_db().await;
    let ctx = load_assistant_context(&pool, vec!["~/Desktop".to_string()])
        .await
        .unwrap();
    assert_eq!(ctx.total_files, 0);
    assert_eq!(ctx.organized_files, 0);
    assert_eq!(ctx.unsorted_count, 0);
    assert_eq!(ctx.watch_dirs, vec!["~/Desktop"]);
    assert!(ctx.rules_summary.contains("Aucune règle"));
}
```

(La fonction `make_db()` existe déjà dans ce fichier test.)

- [ ] **Step 7: Lancer les tests engine::assistant**

```bash
cd src-tauri && cargo test -p egestion-lib -- engine::assistant 2>&1 | tail -20
```

Attendu : tous les tests passent (y compris les anciens sur cache et safe_query).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/engine/assistant.rs
git commit -m "feat(assistant): AssistantContext + dynamic system prompt + load_assistant_context"
```

---

## Task 5: Mettre à jour `commands/assistant.rs`

**Files:**
- Modify: `src-tauri/src/commands/assistant.rs`

- [ ] **Step 1: Remplacer le contenu de `commands/assistant.rs`**

```rust
use crate::engine::assistant::{ask, load_assistant_context, AssistantResponse, Message};
use crate::commands::resolve_api_key;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn ask_assistant(
    query: String,
    history: Vec<Message>,
    state: State<'_, AppState>,
) -> Result<AssistantResponse, String> {
    let api_key = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        resolve_api_key(config.api_key.as_deref())
    };

    let watch_dirs = state
        .watcher
        .lock()
        .map_err(|e| e.to_string())?
        .current_dirs()
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    let context = load_assistant_context(&state.pool, watch_dirs)
        .await
        .map_err(|e| e.to_string())?;

    ask(query, history, context, &api_key, &state.pool)
        .await
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd src-tauri && cargo check --lib 2>&1 | grep "error"
```

Attendu : aucune erreur.

- [ ] **Step 3: Lancer tous les tests**

```bash
cd src-tauri && cargo test 2>&1 | grep -E "FAILED|error\[" | head -20
```

Attendu : aucun `FAILED`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/assistant.rs
git commit -m "feat(assistant): inject dynamic context into ask_assistant command"
```

---

## Task 6: `analyze_for_onboarding` backend

**Files:**
- Modify: `src-tauri/src/engine/assistant.rs`
- Modify: `src-tauri/src/commands/prefs.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Écrire les tests de parsing JSON**

Ajouter dans `#[cfg(test)] mod tests` de `engine/assistant.rs` :

```rust
#[test]
fn test_parse_suggested_rules_valid() {
    let json = r#"[{"condition_type":"extension","condition_value":"pdf","target_dir":"Documents/Factures","label":"PDF → Documents/Factures"}]"#;
    let rules: Vec<SuggestedRule> = serde_json::from_str(json).unwrap();
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0].condition_type, "extension");
    assert_eq!(rules[0].condition_value, "pdf");
    assert_eq!(rules[0].target_dir, "Documents/Factures");
}

#[test]
fn test_parse_suggested_rules_invalid_returns_empty() {
    let rules: Vec<SuggestedRule> = serde_json::from_str("not json").unwrap_or_default();
    assert!(rules.is_empty());
}

#[tokio::test]
async fn test_analyze_for_onboarding_no_api_key_returns_summary() {
    // Sans API key, pas d'appel Claude, summary calculé depuis FS
    // On passe des répertoires vides → 0 fichiers
    let analysis = analyze_for_onboarding("", &[]).await.unwrap();
    assert_eq!(analysis.suggested_rules.len(), 0);
    // file_summary contient "0" ou "Aucun"
    assert!(
        analysis.file_summary.contains("0") || analysis.file_summary.contains("Aucun"),
        "got: {}",
        analysis.file_summary
    );
}
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
cd src-tauri && cargo test -p egestion-lib -- test_parse_suggested 2>&1 | tail -10
```

Attendu : erreur de compilation (`SuggestedRule` et `analyze_for_onboarding` absents).

- [ ] **Step 3: Ajouter les structs et la fonction dans `engine/assistant.rs`**

Ajouter les imports nécessaires au début du fichier (si absents) :
```rust
use std::collections::HashMap;
```

Ajouter après `load_assistant_context` :

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SuggestedRule {
    pub condition_type: String,
    pub condition_value: String,
    pub target_dir: String,
    pub label: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct OnboardingAnalysis {
    pub file_summary: String,
    pub suggested_rules: Vec<SuggestedRule>,
}

pub async fn analyze_for_onboarding(
    api_key: &str,
    watch_dirs: &[String],
) -> Result<OnboardingAnalysis> {
    // Compter les extensions depuis le FS (pas la DB — peut être vide juste après add_watch_dir)
    let mut ext_counts: HashMap<String, i64> = HashMap::new();
    for dir in watch_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if entry.path().is_file() {
                    let ext = entry
                        .path()
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("inconnu")
                        .to_lowercase();
                    *ext_counts.entry(ext).or_insert(0) += 1;
                }
            }
        }
    }

    let mut sorted: Vec<(String, i64)> = ext_counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    sorted.truncate(10);

    let total: i64 = sorted.iter().map(|(_, c)| c).sum();

    let file_summary = if total == 0 {
        "Aucun fichier détecté".to_string()
    } else {
        let parts: Vec<String> = sorted
            .iter()
            .take(5)
            .map(|(ext, cnt)| format!("{} .{}", cnt, ext))
            .collect();
        format!("{} fichiers : {}", total, parts.join(", "))
    };

    if api_key.is_empty() || total == 0 {
        return Ok(OnboardingAnalysis {
            file_summary,
            suggested_rules: vec![],
        });
    }

    let client = Client::new();
    let prompt = format!(
        "Analysez ces types de fichiers détectés et proposez 2-4 règles de classification simples. \
         Répondez UNIQUEMENT avec un tableau JSON valide, sans markdown ni explication.\n\n\
         Format exact : [{{\"condition_type\":\"extension\",\"condition_value\":\"pdf\",\
         \"target_dir\":\"Documents/Factures\",\"label\":\"PDF → Documents/Factures\"}}]\n\n\
         Fichiers détectés : {}",
        file_summary
    );

    let body = serde_json::json!({
        "model": SONNET_MODEL,
        "max_tokens": 512,
        "system": "Tu es un assistant de configuration pour l'app Egestion. Propose des règles de classification adaptées aux fichiers. Réponds UNIQUEMENT avec du JSON valide.",
        "messages": [{"role": "user", "content": prompt}]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await;

    let suggested_rules = match response {
        Ok(resp) if resp.status().is_success() => {
            let json: serde_json::Value = resp.json().await.unwrap_or_default();
            let raw = json["content"][0]["text"].as_str().unwrap_or("[]").trim();
            serde_json::from_str::<Vec<SuggestedRule>>(raw).unwrap_or_default()
        }
        _ => vec![],
    };

    Ok(OnboardingAnalysis { file_summary, suggested_rules })
}
```

- [ ] **Step 4: Lancer les tests**

```bash
cd src-tauri && cargo test -p egestion-lib -- engine::assistant 2>&1 | tail -20
```

Attendu : tous les tests passent.

- [ ] **Step 5: Ajouter le Tauri command dans `commands/prefs.rs`**

Ajouter en tête de `commands/prefs.rs` l'import du type de retour uniquement (pas la fonction — même nom que la commande Tauri) :
```rust
use crate::engine::assistant::OnboardingAnalysis;
```

Ajouter après `set_api_key` :

```rust
#[tauri::command]
pub async fn analyze_for_onboarding(state: State<'_, AppState>) -> Result<OnboardingAnalysis, String> {
    let api_key = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        crate::commands::resolve_api_key(config.api_key.as_deref())
    };
    let watch_dirs: Vec<String> = state
        .watcher
        .lock()
        .map_err(|e| e.to_string())?
        .current_dirs()
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    // Appel via chemin complet pour éviter conflit avec le nom de cette commande
    crate::engine::assistant::analyze_for_onboarding(&api_key, &watch_dirs)
        .await
        .map_err(|e| e.to_string())
}
```

⚠️ Ne pas faire `use crate::engine::assistant::analyze_for_onboarding` — ce serait un conflit de nom avec la fonction Tauri locale. Utiliser le chemin complet `crate::engine::assistant::analyze_for_onboarding(...)` dans le corps de la commande.

- [ ] **Step 6: Enregistrer la commande dans `lib.rs`**

Dans `tauri::generate_handler![...]`, ajouter après `commands::set_api_key` :

```rust
commands::analyze_for_onboarding,
```

- [ ] **Step 7: Vérifier la compilation et les tests**

```bash
cd src-tauri && cargo check --lib 2>&1 | grep "error"
cd src-tauri && cargo test 2>&1 | grep -E "FAILED|error\[" | head -20
```

Attendu : aucune erreur, aucun FAILED.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/engine/assistant.rs src-tauri/src/commands/prefs.rs src-tauri/src/lib.rs
git commit -m "feat(onboarding): SuggestedRule + OnboardingAnalysis + analyze_for_onboarding command"
```

---

## Task 7: Préférences UI — section clé API

**Files:**
- Modify: `src/components/Preferences/PreferencesView.tsx`

- [ ] **Step 1: Ajouter les imports et le state**

En tête du fichier, dans les imports lucide-react, ajouter `Cpu` et `KeyRound` :

```tsx
import { FolderOpen, Plus, Trash2, Eye, Cpu, KeyRound } from 'lucide-react';
```

Dans le composant `PreferencesView`, après les state existants, ajouter :

```tsx
const [maskedKey, setMaskedKey] = useState('');
const [editingKey, setEditingKey] = useState(false);
const [newKey, setNewKey] = useState('');
const [savingKey, setSavingKey] = useState(false);
```

Dans le `useEffect` existant, après `invoke<string[]>('get_prefs').then(...)`, ajouter :

```tsx
invoke<string>('get_api_key_masked').then(setMaskedKey).catch(console.error);
```

- [ ] **Step 2: Ajouter la fonction `handleSaveKey`**

Dans le composant, après `handleRemove` :

```tsx
async function handleSaveKey() {
  setSavingKey(true);
  try {
    await invoke('set_api_key', { key: newKey });
    const masked = await invoke<string>('get_api_key_masked');
    setMaskedKey(masked);
    setEditingKey(false);
    setNewKey('');
    showFeedback('Clé API sauvegardée');
  } catch (err) {
    console.error('set_api_key error:', err);
    showFeedback('Erreur lors de la sauvegarde');
  } finally {
    setSavingKey(false);
  }
}
```

- [ ] **Step 3: Ajouter la section UI dans le return**

Après la section `Dossiers surveillés` (avant le feedback toast), ajouter :

```tsx
{/* Section clé API */}
<section className="mt-8">
  <div className="flex items-center justify-between mb-3">
    <div>
      <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
        <Cpu size={14} className="text-zinc-500" />
        Intelligence Artificielle
      </h2>
      <p className="text-xs text-zinc-600 mt-0.5">
        Clé API Anthropic pour la classification IA et l'assistant.
        Fallback :{' '}
        <code className="text-zinc-500 bg-zinc-900 px-1 py-0.5 rounded text-[10px]">
          ANTHROPIC_API_KEY
        </code>
      </p>
    </div>
  </div>

  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
    {editingKey ? (
      <div className="flex items-center gap-2">
        <KeyRound size={13} className="text-zinc-500 shrink-0" />
        <input
          type="password"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
          placeholder="sk-ant-api03-..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
          autoFocus
        />
        <button
          onClick={handleSaveKey}
          disabled={savingKey || !newKey.trim()}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-xs text-white transition-colors"
        >
          {savingKey ? '…' : 'Sauvegarder'}
        </button>
        <button
          onClick={() => { setEditingKey(false); setNewKey(''); }}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Annuler
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-3">
        <KeyRound size={13} className="text-zinc-500 shrink-0" />
        <span className="flex-1 text-xs font-mono text-zinc-400">
          {maskedKey || 'Non configurée'}
        </span>
        <div
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${maskedKey ? 'bg-emerald-400' : 'bg-zinc-600'}`}
        />
        <span className={`text-xs ${maskedKey ? 'text-emerald-400' : 'text-zinc-500'}`}>
          {maskedKey ? 'Connectée' : 'Non configurée'}
        </span>
        <button
          onClick={() => setEditingKey(true)}
          className="text-xs text-zinc-500 hover:text-zinc-300 underline"
        >
          {maskedKey ? 'Modifier' : 'Configurer'}
        </button>
      </div>
    )}
  </div>
</section>
```

- [ ] **Step 4: Vérifier le TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npm run build 2>&1 | grep -E "error TS|Error" | head -20
```

Attendu : aucune erreur TypeScript.

- [ ] **Step 5: Commit**

```bash
git add src/components/Preferences/PreferencesView.tsx
git commit -m "feat(prefs-ui): add API key section with masked display and edit flow"
```

---

## Task 8: Unsorted UI — badge suggestion IA

**Files:**
- Modify: `src/components/Unsorted/index.tsx`

- [ ] **Step 1: Mettre à jour l'interface `FileRecord` locale**

Dans `Unsorted/index.tsx`, modifier l'interface :

```tsx
interface FileRecord {
  id: string;
  name: string;
  path: string;
  extension: string | null;
  size_bytes: number;
  category: string | null;
  subcategory: string | null;  // ← ajouter
  confidence: number | null;
}
```

- [ ] **Step 2: Mettre à jour la fonction `validate`**

Remplacer :

```tsx
const validate = async (fileId: string, category: string) => {
  try {
    await invoke('validate_unsorted_file', { fileId, category, subcategory: null });
```

par :

```tsx
const validate = async (fileId: string, category: string, subcategory: string | null = null) => {
  try {
    await invoke('validate_unsorted_file', { fileId, category, subcategory });
```

- [ ] **Step 3: Ajouter le badge suggestion IA dans le JSX**

Dans le rendu de chaque fichier (dans le bloc `files.map`), après le `<div>` avec name/path/confidence, ajouter avant `<div className="flex flex-wrap gap-2">` :

```tsx
{file.category && (
  <div className="mb-2 flex items-center gap-2">
    <span className="text-[10px] text-zinc-500">✦ IA suggère :</span>
    <button
      onClick={() => validate(file.id, file.category!, file.subcategory)}
      className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors font-medium"
    >
      {file.category}
      {file.subcategory ? ` / ${file.subcategory}` : ''}
    </button>
  </div>
)}
```

Les boutons de catégorie existants restent affichés dessous avec un label "ou choisir manuellement :" :

```tsx
<div className="flex flex-wrap gap-2">
  {file.category && (
    <span className="text-[10px] text-zinc-600 mr-1 self-center">ou :</span>
  )}
  {CATEGORIES.map((cat) => (
    <button
      key={cat}
      onClick={() => validate(file.id, cat)}
      className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors capitalize"
    >
      {cat}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Vérifier le TypeScript**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

Attendu : aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/components/Unsorted/index.tsx
git commit -m "feat(unsorted): highlight AI-suggested category as amber badge"
```

---

## Task 9: Panneau Aide (FAQ)

**Files:**
- Create: `src/components/Help/index.tsx`

- [ ] **Step 1: Créer le composant**

Créer `src/components/Help/index.tsx` :

```tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2 } from 'lucide-react';

const FAQ_ITEMS = [
  'Comment créer une règle de classification ?',
  'Pourquoi un fichier reste-t-il dans "À valider" ?',
  'Comment fonctionne la surveillance automatique ?',
  'Comment exporter mes fichiers ou l\'historique ?',
  'Comment annuler une organisation automatique ?',
];

export function HelpView() {
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);

  async function askQuestion(question: string) {
    setActiveQuestion(question);
    setLoading(true);
    setAnswer('');
    try {
      const response = await invoke<{ files: unknown[]; text: string }>('ask_assistant', {
        query: question,
        history: [],
      });
      setAnswer(response.text || 'Désolé, je n\'ai pas pu répondre.');
    } catch (err) {
      setAnswer(`Erreur : ${err}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCustomSubmit() {
    const q = customQuestion.trim();
    if (!q) return;
    setCustomQuestion('');
    await askQuestion(q);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-zinc-800 shrink-0">
        <h1 className="text-lg font-semibold text-zinc-100">Aide</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Questions fréquentes et assistance</p>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6 max-w-2xl w-full">
        {/* FAQ buttons */}
        <section>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600 mb-3">
            Questions fréquentes
          </p>
          <div className="flex flex-col gap-2">
            {FAQ_ITEMS.map((q) => (
              <button
                key={q}
                onClick={() => askQuestion(q)}
                disabled={loading}
                className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                  activeQuestion === q
                    ? 'bg-indigo-900/30 border-indigo-600/50 text-indigo-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {q}
              </button>
            ))}
          </div>
        </section>

        {/* Réponse */}
        {(loading || answer) && (
          <section>
            <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600 mb-3">
              Réponse
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap min-h-[60px]">
              {loading ? (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">Génération en cours…</span>
                </div>
              ) : (
                answer
              )}
            </div>
          </section>
        )}

        {/* Champ libre */}
        <section>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600 mb-3">
            Poser une question
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
              placeholder="Posez votre question…"
              disabled={loading}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
            />
            <button
              onClick={handleCustomSubmit}
              disabled={loading || !customQuestion.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl text-sm text-white transition-colors"
            >
              Envoyer
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

Attendu : aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/Help/index.tsx
git commit -m "feat(help): add FAQ/Help view with predefined questions + free input"
```

---

## Task 10: Sidebar + App.tsx routing

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Ajouter HelpCircle dans Sidebar.tsx**

Dans les imports lucide-react en haut du fichier, ajouter `HelpCircle` :

```tsx
import { LayoutDashboard, FolderOpen, Folder, FolderClosed, Mail, Settings, SlidersHorizontal, HelpCircle } from 'lucide-react';
```

- [ ] **Step 2: Ajouter l'item Aide dans NAV_ITEMS**

Modifier `NAV_ITEMS` pour séparer les items principaux et l'aide. Remplacer le tableau :

```tsx
const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'explorer',    label: 'Explorer',    icon: Folder },
  { id: 'unsorted',    label: 'À valider',   icon: FolderOpen },
  { id: 'emails',      label: 'E-mails',     icon: Mail },
  { id: 'rules',       label: 'Règles',      icon: SlidersHorizontal },
  { id: 'preferences', label: 'Préférences', icon: Settings },
  { id: 'help',        label: 'Aide',        icon: HelpCircle },
];
```

- [ ] **Step 3: Ajouter une ligne de séparation avant "Aide" dans le rendu**

Dans le `nav`, après le `{NAV_ITEMS.map(...)}`, ou mieux : rendre les items avec un séparateur conditionnel. Remplacer la section `{/* ── Nav */}` entière par :

```tsx
{/* ── Nav ────────────────────────────────────────────────── */}
<nav className="flex-1 px-2 flex flex-col gap-0.5">
  {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
    if (id === 'help') {
      return (
        <div key={id}>
          <div className="my-1.5 border-t border-bx-800" />
          <button
            onClick={() => onNavigate(id)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
              currentView === id
                ? 'bg-bx-600 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-bx-800'
            }`}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        </div>
      );
    }

    const isActive = id === 'emails'
      ? (currentView === 'explorer' && selectedCategory === 'email')
      : currentView === id;

    return (
      <button
        key={id}
        onClick={() => {
          if (id === 'emails') {
            setSelectedCategory('email');
            onNavigate('explorer');
          } else {
            onNavigate(id);
          }
        }}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
          isActive
            ? 'bg-bx-600 text-zinc-100'
            : 'text-zinc-500 hover:text-zinc-200 hover:bg-bx-800'
        }`}
      >
        <Icon size={13} />
        <span>{label}</span>
        {id === 'unsorted' && unsortedCount > 0 && (
          <span className="ml-auto text-[9px] font-semibold bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full">
            {unsortedCount}
          </span>
        )}
        {id === 'emails' && stats.email_files > 0 && (
          <span className="ml-auto text-[9px] font-semibold bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full">
            {stats.email_files}
          </span>
        )}
        {id === 'rules' && enabledRulesCount > 0 && (
          <span className="ml-auto text-[9px] font-semibold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
            {enabledRulesCount}
          </span>
        )}
      </button>
    );
  })}
</nav>
```

- [ ] **Step 4: Mettre à jour `App.tsx`**

Ajouter l'import :
```tsx
import { HelpView } from './components/Help';
```

Dans la section `<main>`, après `{currentView === 'rules' && <RulesView />}`, ajouter :
```tsx
{currentView === 'help' && <HelpView />}
```

- [ ] **Step 5: Vérifier TypeScript**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

Attendu : aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/App.tsx
git commit -m "feat(nav): add Aide sidebar item with separator + route Help view in App"
```

---

## Task 11: Onboarding guidé par IA

**Files:**
- Modify: `src/components/Onboarding/index.tsx`

- [ ] **Step 1: Mettre à jour les imports et les types**

Remplacer le contenu de `Onboarding/index.tsx` par :

```tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Loader2, Check, X, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';

type Phase = 'idle' | 'indexing' | 'analyzing' | 'suggestions' | 'done';

interface SuggestedRule {
  condition_type: string;
  condition_value: string;
  target_dir: string;
  label: string;
}

interface OnboardingAnalysis {
  file_summary: string;
  suggested_rules: SuggestedRule[];
}
```

- [ ] **Step 2: Écrire le composant complet**

Continuer le fichier :

```tsx
export function OnboardingScreen() {
  const { setWatchedDirs } = useAppStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [addedDir, setAddedDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<OnboardingAnalysis | null>(null);
  const [dismissedIndices, setDismissedIndices] = useState<Set<number>>(new Set());
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set());
  const [completing, setCompleting] = useState(false);

  async function startAnalysis() {
    setPhase('analyzing');
    try {
      const result = await invoke<OnboardingAnalysis>('analyze_for_onboarding');
      setAnalysis(result);
    } catch {
      setAnalysis({ file_summary: '', suggested_rules: [] });
    }
    setPhase('suggestions');
  }

  async function handleAddFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Choisir un dossier à surveiller',
    });
    if (!selected || typeof selected !== 'string') return;

    setLoading(true);
    try {
      const updated = await invoke<string[]>('add_watch_dir', { dir: selected });
      setWatchedDirs(updated);
      setAddedDir(selected);
      setPhase('indexing');
      setTimeout(startAnalysis, 2000);
    } catch (err) {
      console.error('add_watch_dir error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptRule(rule: SuggestedRule, index: number) {
    try {
      await invoke('create_rule', {
        name: rule.label,
        conditionType: rule.condition_type,
        conditionValue: rule.condition_value,
        targetDir: rule.target_dir,
        autoTag: null as null,
      });
      setAcceptedIndices((prev) => new Set([...prev, index]));
    } catch (err) {
      console.error('create_rule error:', err);
    }
  }

  async function handleAcceptAll() {
    if (!analysis) return;
    setCompleting(true);
    for (const [i, rule] of analysis.suggested_rules.entries()) {
      if (!dismissedIndices.has(i) && !acceptedIndices.has(i)) {
        await handleAcceptRule(rule, i);
      }
    }
    setCompleting(false);
    setPhase('done');
  }

  // ─── Phase: done ──────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <Check size={28} className="text-emerald-400" />
        <div>
          <p className="text-sm font-semibold text-zinc-100 mb-1">Egestion est configuré !</p>
          <p className="text-xs text-zinc-500">
            Utilisez la barre latérale pour explorer vos fichiers.
          </p>
        </div>
      </div>
    );
  }

  // ─── Phase: suggestions ───────────────────────────────────────────────────
  if (phase === 'suggestions') {
    const rules = analysis?.suggested_rules ?? [];
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-amber-400" />
            <h1 className="text-sm font-semibold text-zinc-100">Analyse terminée</h1>
          </div>
          {analysis?.file_summary && (
            <p className="text-xs text-zinc-500">{analysis.file_summary}</p>
          )}
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5">
          {rules.length > 0 ? (
            <>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600 mb-3">
                  Règles suggérées pour votre profil
                </p>
                <div className="flex flex-col gap-2">
                  {rules.map((rule, i) => {
                    if (dismissedIndices.has(i)) return null;
                    const accepted = acceptedIndices.has(i);
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                          accepted
                            ? 'bg-emerald-900/20 border-emerald-700/40'
                            : 'bg-zinc-900 border-zinc-800'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 truncate">{rule.label}</p>
                          <p className="text-xs text-zinc-600">
                            .{rule.condition_value} → {rule.target_dir}
                          </p>
                        </div>
                        {accepted ? (
                          <Check size={14} className="text-emerald-400 shrink-0" />
                        ) : (
                          <>
                            <button
                              onClick={() => handleAcceptRule(rule, i)}
                              className="px-3 py-1 text-xs bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 rounded-lg transition-colors"
                            >
                              Accepter
                            </button>
                            <button
                              onClick={() =>
                                setDismissedIndices((prev) => new Set([...prev, i]))
                              }
                              className="p-1 text-zinc-600 hover:text-zinc-400"
                            >
                              <X size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAcceptAll}
                  disabled={completing}
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-900 text-xs font-semibold rounded-lg transition-colors"
                >
                  {completing ? 'Application…' : 'Accepter toutes les règles'}
                </button>
                <button
                  onClick={() => setPhase('done')}
                  className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Commencer sans règles
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
              <p className="text-sm text-zinc-400">
                {analysis?.file_summary
                  ? 'Aucune règle suggérée pour ces fichiers.'
                  : 'Analyse indisponible — configurez une clé API Anthropic dans les Préférences.'}
              </p>
              <p className="text-xs text-zinc-600">
                Vous pouvez créer des règles manuellement dans l'onglet Règles.
              </p>
              <button
                onClick={() => setPhase('done')}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 rounded-lg transition-colors"
              >
                Commencer
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Phase: analyzing ─────────────────────────────────────────────────────
  if (phase === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <Sparkles size={28} className="text-amber-400 animate-pulse" />
        <div>
          <p className="text-sm font-semibold text-zinc-100 mb-1">
            Analyse de vos fichiers en cours…
          </p>
          <p className="text-xs text-zinc-500">
            Claude examine vos types de fichiers pour personnaliser Egestion.
          </p>
        </div>
      </div>
    );
  }

  // ─── Phase: indexing ──────────────────────────────────────────────────────
  if (phase === 'indexing') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <Loader2 size={28} className="text-amber-400 animate-spin" />
        <div>
          <p className="text-sm font-semibold text-zinc-100 mb-1">
            Egestion surveille votre dossier…
          </p>
          <p className="text-xs text-zinc-500">
            Les fichiers seront détectés et classés automatiquement.
          </p>
        </div>
        {addedDir && (
          <p className="text-[10px] text-zinc-600 font-mono truncate max-w-xs">{addedDir}</p>
        )}
      </div>
    );
  }

  // ─── Phase: idle ──────────────────────────────────────────────────────────
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex gap-10 max-w-lg w-full">
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-900/20 border border-amber-700/30 flex items-center justify-center">
            <FolderOpen size={24} className="text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100 mb-1">Aucun fichier indexé</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Ajoute un dossier à surveiller
              <br />
              pour commencer.
            </p>
          </div>
          <button
            onClick={handleAddFolder}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 text-xs font-semibold rounded-lg transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : '+'}
            Ajouter un dossier
          </button>
        </div>

        <div className="w-px bg-zinc-800 self-stretch" />

        <div className="flex-1 flex flex-col justify-center gap-3">
          <p className="text-[10px] font-medium tracking-widest uppercase text-zinc-600 mb-1">
            Ce que tu pourras faire
          </p>
          {[
            { icon: '🔍', label: 'Recherche instantanée' },
            { icon: '🏷', label: 'Tags automatiques' },
            { icon: '📊', label: 'Organisation intelligente' },
            { icon: '🗂', label: 'Détection de doublons' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-base">{icon}</span>
              <span className="text-xs text-zinc-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Vérifier TypeScript**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

Attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/components/Onboarding/index.tsx
git commit -m "feat(onboarding): add AI-guided phases — analyzing + rule suggestions"
```

---

## Task 12: Build final + vérification

- [ ] **Step 1: Build Rust complet**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error" | head -20
```

Attendu : `Finished` sans erreur.

- [ ] **Step 2: Tests Rust complets**

```bash
cd src-tauri && cargo test 2>&1 | tail -30
```

Attendu : tous les tests passent. Vérifier en particulier :
- `engine::config::test_api_key_round_trip` ✓
- `commands::tests::test_resolve_api_key_returns_config_key` ✓
- `commands::prefs::tests::test_mask_key_shows_prefix` ✓
- `engine::assistant::test_build_system_prompt_contains_watch_dirs` ✓
- `engine::assistant::test_load_assistant_context_empty_db` ✓
- `engine::assistant::test_parse_suggested_rules_valid` ✓

- [ ] **Step 3: Build frontend**

```bash
npm run build 2>&1 | tail -10
```

Attendu : aucune erreur TypeScript.

- [ ] **Step 4: Build Tauri complet**

```bash
npm run tauri build 2>&1 | tail -20
```

Attendu : app buildée sans erreur.

- [ ] **Step 5: Commit final**

```bash
git add -A
git status  # vérifier qu'il ne reste rien de non stagé
git commit -m "chore: final build verification — AI integration complete"
```

---

## Résumé des commandes Tauri ajoutées

| Commande | Fichier | Description |
|---|---|---|
| `get_api_key_masked` | `commands/prefs.rs` | Retourne clé masquée (sk-ant-...***) |
| `set_api_key` | `commands/prefs.rs` | Sauvegarde clé dans config.json |
| `analyze_for_onboarding` | `commands/prefs.rs` | Scan FS + suggestions Claude |
| `ask_assistant` (modifié) | `commands/assistant.rs` | Utilise prompt dynamique + contexte |
