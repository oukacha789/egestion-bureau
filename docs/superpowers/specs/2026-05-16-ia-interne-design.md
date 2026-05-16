# Egestion — IA Interne : Design Spec

**Date :** 2026-05-16  
**Stack :** Tauri 2.x / Rust / React / TypeScript / SQLite / Claude API  
**Approche :** Incrémentale — patterns existants, helper `resolve_api_key` partagé

---

## Périmètre

5 sous-features :
1. Gestion de la clé API (Préférences + env var fallback)
2. "À valider" enrichi (suggestion IA mise en évidence)
3. Assistant enrichi (prompt système dynamique + questions générales)
4. FAQ / Aide (nouveau panneau sidebar)
5. Onboarding guidé par IA (analyse + suggestions de règles)

---

## 1. Gestion de la clé API

### Backend

**`engine/config.rs`** — ajout du champ dans `AppConfig` :
```rust
pub struct AppConfig {
    pub watch_dirs: Vec<String>,
    pub api_key: Option<String>,   // nouveau
}
```

**`AppState`** — expose la config chargée :
```rust
pub struct AppState {
    pub pool: SqlitePool,
    pub search_index: Arc<Mutex<SearchIndex>>,
    pub watcher: Arc<Mutex<FsWatcher>>,
    pub app_data_dir: PathBuf,
    pub config: Arc<Mutex<AppConfig>>,   // nouveau
}
```

**`commands/mod.rs`** — helper partagé :
```rust
pub fn resolve_api_key(state: &AppState) -> String {
    let config = state.config.lock().unwrap();
    config.api_key
        .as_deref()
        .filter(|k| !k.is_empty())
        .map(String::from)
        .unwrap_or_else(|| std::env::var("ANTHROPIC_API_KEY").unwrap_or_default())
}
```

**Nouvelles commandes dans `commands/prefs.rs`** :
- `get_api_key_masked() -> String` — retourne `sk-ant-...***` (20 premiers chars + `***`) ou `""` si non définie
- `set_api_key(key: String) -> ()` — écrit dans AppConfig + persiste `config.json`

**Impact sur commandes existantes :**
- `commands/assistant.rs::ask_assistant` : remplace `std::env::var("ANTHROPIC_API_KEY")` par `resolve_api_key(&state)`
- `lib.rs::start_pipeline` : charge `api_key` via `resolve_api_key` au lieu de l'env var directe

### Frontend — `PreferencesView.tsx`

Nouvelle section "Intelligence Artificielle" en bas du formulaire :

```
┌─ Intelligence Artificielle ─────────────────────────┐
│  Clé API Anthropic                                   │
│  [••••••••••••••••••••] [Modifier] [●] Connectée     │
│  Utilisée pour la classification IA et l'assistant.  │
│  Fallback : variable d'environnement ANTHROPIC_API_KEY│
└─────────────────────────────────────────────────────-┘
```

- Champ password (masqué par défaut), éditable en cliquant "Modifier"
- Bouton "Sauvegarder" appelle `set_api_key`
- Badge vert "Connectée" / rouge "Non configurée" selon `get_api_key_masked()`

---

## 2. "À valider" enrichi

### Backend — aucun changement

`get_unsorted_files` retourne déjà `category`, `subcategory`, `confidence` depuis la DB. Le classifieur Claude Haiku a déjà stocké sa suggestion.

### Frontend — `Unsorted/index.tsx`

**Modification de l'affichage par fichier :**

```
┌─ facture_edf.pdf ─────────────────────────────────┐
│  1.2 MB · pdf · confiance 32%                      │
│                                                     │
│  ✦ IA suggère :  [document / Factures]  ← amber    │
│                                                     │
│  Ou choisir : [photo] [video] [music] [archive] …  │
└─────────────────────────────────────────────────────┘
```

- Si `file.category` est définie (suggestion Claude), afficher un bouton amber mis en évidence avec label `"✦ {category}{subcategory ? ' / '+subcategory : ''}"`
- Cliquer ce bouton = `validate_unsorted_file(fileId, category, subcategory)` avec les valeurs existantes
- Les autres boutons catégorie restent présents mais visuellement secondaires
- Si `file.category` est null (aucune suggestion), afficher uniquement les boutons catégorie standards

---

## 3. Assistant enrichi — Prompt système dynamique

### Backend — `engine/assistant.rs`

**Nouvelle struct de contexte :**
```rust
pub struct AssistantContext {
    pub watch_dirs: Vec<String>,
    pub total_files: i64,
    pub organized_files: i64,
    pub unsorted_count: i64,
    pub rules_summary: String,   // ex: "3 règles : pdf→Documents, jpg→Photos, zip→Archives"
}
```

**`build_system_prompt(ctx: &AssistantContext) -> String`** — remplace la constante `SYSTEM_PROMPT` :

```
Tu es un assistant intelligent intégré dans Egestion, une application macOS 
de gestion automatique de fichiers.

== COMMENT EGESTION FONCTIONNE ==
- Watcher : surveille les dossiers configurés en temps réel (FSEvents macOS).
  Chaque nouveau fichier déclenche le pipeline automatiquement.
- Pipeline : Fichier détecté → Indexation (hash SHA256, métadonnées) → 
  Classification (règles d'abord ; si confiance < 90% → Claude Haiku) → 
  Organisation (déplacement vers ~/Documents/Egestion/<Catégorie>)
- Règles : conditions (extension, nom contient, source) → dossier cible + tag auto.
  Les règles ont priorité absolue sur l'IA si leur confiance ≥ 90%.
- Classification IA : Claude Haiku classe chaque fichier en catégorie 
  (photo/video/music/document/archive/code/installer/other) avec un score de confiance.
  Résultats mis en cache 30 jours par hash SHA256.
- À valider : fichiers dont la confiance IA est < 50% — restent non organisés 
  et attendent une validation manuelle dans l'écran "À valider".
- Dashboard : historique des actions (déplacements), statistiques, export CSV.
- Annulation : chaque déplacement est réversible via le bouton Annuler (toast).

== CONTEXTE UTILISATEUR ==
Dossiers surveillés : {watch_dirs}
Fichiers indexés : {total_files} total, {organized_files} organisés
Fichiers en attente de validation : {unsorted_count}
Règles actives : {rules_summary}

== SCHÉMA BASE DE DONNÉES ==
- files : id, path, name, extension, size_bytes, created_at, modified_at, 
          indexed_at, category, subcategory, confidence, classifier, 
          is_duplicate, is_organized, source_dir
- tags : id, file_id, tag, source, weight
- actions : id, file_id, action_type, path_before, path_after, executed_at, 
            undone_at, undoable

Catégories : photo, video, music, document, archive, code, installer, other

== RÈGLES DE RÉPONSE ==
1. Si la question demande de trouver/lister des fichiers → répondre UNIQUEMENT 
   avec une requête SQL SQLite valide commençant par SELECT (sans markdown).
2. Sinon → répondre en français en langage naturel, de façon concise et utile.
```

**Signature mise à jour :**
```rust
pub async fn ask(
    query: String,
    history: Vec<Message>,
    context: AssistantContext,
    api_key: &str,
    pool: &SqlitePool,
) -> Result<AssistantResponse>
```

**`commands/assistant.rs`** — charge le contexte avant d'appeler `ask()` :
```rust
pub async fn ask_assistant(query, history, state) {
    let api_key = resolve_api_key(&state);
    let context = load_assistant_context(&state.pool).await?;
    ask(query, history, context, &api_key, &state.pool).await
}
```

`load_assistant_context` exécute 3 requêtes SQL rapides (total, organized, unsorted) + charge les règles depuis DB.

---

## 4. FAQ / Aide — Nouveau panneau sidebar

### Backend

**Pas de nouvelle commande dédiée.** La FAQ réutilise `ask_assistant` avec les questions prédéfinies comme query.

### Frontend

**Nouvelle vue `src/components/Help/index.tsx`** :

```
┌─ Aide Egestion ─────────────────────────────────────┐
│  Comment puis-je vous aider ?                        │
│                                                      │
│  Questions fréquentes :                              │
│  ┌───────────────────────────────────────────────┐  │
│  │ Comment créer une règle de classification ?   │  │
│  │ Pourquoi ce fichier est dans "À valider" ?    │  │
│  │ Comment fonctionne la surveillance ?           │  │
│  │ Comment exporter mes données ?                │  │
│  │ Comment annuler une organisation ?            │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Réponse ───────────────────────────────────┐    │
│  │ [Réponse Claude affichée ici]               │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  [Poser une autre question ...]    [Envoyer]         │
└─────────────────────────────────────────────────────-┘
```

**FAQ_ITEMS** (constantes frontend) :
```typescript
const FAQ_ITEMS = [
  "Comment créer une règle de classification ?",
  "Pourquoi un fichier reste-t-il dans \"À valider\" ?",
  "Comment fonctionne la surveillance automatique ?",
  "Comment exporter mes fichiers ou l'historique ?",
  "Comment annuler une organisation automatique ?",
];
```

**Comportement :**
- Cliquer une question FAQ = envoyer comme query à `ask_assistant` (historique vide)
- Le champ libre en bas permet une question personnalisée
- Réponse affichée dans un bloc de texte scrollable
- Pas d'historique persisté entre sessions (éphémère, comme l'assistant ⌘J)

**Sidebar — `layout/Sidebar.tsx`** : ajout en bas (avec divider) :
```typescript
{ id: 'help', icon: HelpCircle, label: 'Aide', position: 'bottom' }
```

**App.tsx** : ajout `{currentView === 'help' && <HelpView />}`

---

## 5. Onboarding guidé par IA

### Backend

**Nouvelle commande `analyze_for_onboarding`** dans `commands/prefs.rs` :

**Input :** aucun (utilise les watch_dirs de l'AppState)

**Algorithme :**
1. Parcourir les fichiers de la DB (`SELECT extension, COUNT(*) ... GROUP BY extension ORDER BY COUNT(*) DESC LIMIT 20`)
2. Construire un résumé textuel des types de fichiers
3. Appeler Claude sonnet-4-6 avec le prompt :
   ```
   Analysez ces types de fichiers détectés dans le dossier de l'utilisateur 
   et proposez 2-4 règles de classification simples. Répondez UNIQUEMENT 
   avec un JSON valide, sans markdown.
   
   Format : [{"condition_type":"extension","condition_value":"pdf",
   "target_dir":"Documents/Factures","label":"PDF → Documents/Factures"}]
   
   Fichiers détectés : {summary}
   ```
4. Parser la réponse JSON

**Struct de retour :**
```rust
#[derive(Serialize)]
pub struct OnboardingAnalysis {
    pub file_summary: String,          // "127 fichiers : 43 PDFs, 38 images, ..."
    pub suggested_rules: Vec<SuggestedRule>,
}

#[derive(Serialize, Deserialize)]
pub struct SuggestedRule {
    pub condition_type: String,    // "extension"
    pub condition_value: String,   // "pdf"
    pub target_dir: String,        // "Documents/Factures"
    pub label: String,             // "PDF → Documents/Factures"
}
```

### Frontend — `Onboarding/index.tsx`

**Nouvelles phases :**

```typescript
type Phase = 'idle' | 'indexing' | 'analyzing' | 'suggestions';
```

**Phase `analyzing`** (après 2s de délai post-indexation) :
```
🔍 Analyse de vos fichiers en cours…
   Claude examine vos types de fichiers pour personnaliser Egestion.
```

**Phase `suggestions`** :
```
📊 Analyse terminée
   127 fichiers détectés : 43 PDFs, 38 images, 22 archives

✦ Règles suggérées pour votre profil :
┌──────────────────────────────────────────────────────┐
│ ✓ PDF → Documents/Factures          [Accepter] [✕]  │
│ ✓ JPG/PNG → Photos/Bureau           [Accepter] [✕]  │
│ ✓ ZIP → Archives                    [Accepter] [✕]  │
└──────────────────────────────────────────────────────┘

[Accepter toutes les règles]    [Commencer sans règles]
```

**Logique :**
- "Accepter" une règle = `invoke('create_rule', { rule: suggestedRule })`
- "Accepter toutes" = boucle séquentielle sur toutes les règles non rejetées
- "Commencer sans règles" + "Accepter toutes" → naviguer vers le Dashboard
- Règles rejetées (✕) = masquées de la liste, non créées

---

## Architecture — Fichiers modifiés / créés

```
src-tauri/src/
  engine/
    config.rs              ← + champ api_key: Option<String> (#[serde(default)])
    assistant.rs           ← AssistantContext + build_system_prompt() dynamique
                             + async fn analyze_for_onboarding() (logique IA)
  commands/
    mod.rs                 ← + pub fn resolve_api_key(state: &AppState) -> String
    prefs.rs               ← + get_api_key_masked, set_api_key (Tauri commands)
                             + analyze_for_onboarding (Tauri command wrapper)
    assistant.rs           ← + async fn load_assistant_context() (requêtes DB)
                               appel ask() enrichi avec contexte
  lib.rs                   ← AppState expose config: Arc<Mutex<AppConfig>>;
                             pipeline lit clé via resolve_api_key

src/
  components/
    Unsorted/index.tsx     ← affiche suggestion IA en évidence
    Preferences/PreferencesView.tsx  ← section clé API
    Help/index.tsx         ← nouveau panneau FAQ (CRÉER)
    Onboarding/index.tsx   ← phases analyzing + suggestions
    layout/Sidebar.tsx     ← ajout item "Aide"
  App.tsx                  ← ajout vue 'help'
```

---

## Migrations SQL

Aucune — les données nécessaires sont déjà présentes (`category`, `subcategory`, `confidence` dans `files`). La clé API est stockée dans `config.json` (fichier de config, pas DB).

---

## Tests

- `engine/assistant.rs` : `test_build_system_prompt_contains_context()` — vérifier injection des valeurs
- `engine/assistant.rs` : `test_analyze_for_onboarding_parses_json()` — mock Claude, vérifier parsing
- `commands/prefs.rs` : `test_set_and_get_api_key()` — vérifier round-trip
- `commands/mod.rs` : `test_resolve_api_key_prefers_config()` — config > env var
- Frontend : TypeScript types pour `OnboardingAnalysis`, `SuggestedRule`

---

## Considérations

- **Coût API :** `analyze_for_onboarding` est appelé une seule fois au premier lancement. FAQ et assistant partagent le même pipeline sonnet-4-6 (pas de coût supplémentaire d'infrastructure).
- **Gestion d'erreur IA :** si Claude ne répond pas lors de l'onboarding, afficher la phase suggestions avec liste vide et message "Analyse indisponible — vous pouvez créer des règles manuellement dans Règles".
- **Modèle utilisé :** classification → Claude Haiku (coût minimal) ; assistant/FAQ/onboarding → claude-sonnet-4-6 (qualité).
- **Sécurité clé API :** stockée en clair dans `config.json` dans l'app data dir macOS (`~/Library/Application Support/egestion/`). Pas de keychain pour l'instant — acceptable pour MVP desktop.
