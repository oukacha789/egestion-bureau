# Egestion Bureau — Phase 3 Design Spec

**Date :** 2026-05-13  
**Stack :** Tauri 2.x / Rust / React / TypeScript / SQLite (sqlx) / Tantivy 0.22  
**Contexte :** Phase 1 (MVP pipeline) et Phase 2 (Search + Explorer) terminées.

---

## Périmètre Phase 3

5 features :
1. Tags manuels
2. Quick Look preview in-app
3. Assistant conversationnel Claude (sonnet-4-6) — overlay ⌘J
4. Embeddings sémantiques via Claude haiku (descriptions textuelles → Tantivy)
5. Export CSV + Rapport HTML

---

## Architecture générale

**Approche :** modules Rust dédiés par feature, continuité du pattern `engine/search.rs`.

### Nouveaux modules Rust

```
src-tauri/src/
  engine/
    embeddings.rs   ← descriptions sémantiques via Claude haiku
    assistant.rs    ← requêtes NL → SQL via Claude sonnet-4-6
    export.rs       ← génération CSV + HTML
  commands/
    mod.rs          ← re-exports
    files.rs        ← commandes existantes (déplacées)
    tags.rs         ← add_tag, remove_tag, get_tags
    assistant.rs    ← ask_assistant
    export.rs       ← export_csv, export_report
```

**AppState :** aucun nouveau champ — tous les modules sont stateless et utilisent `db` + `search_index` existants.

### Nouveaux composants Frontend

```
src/components/
  Assistant/
    AssistantOverlay.tsx   ← overlay ⌘J
    MessageList.tsx        ← historique session (éphémère)
    InputBar.tsx           ← champ saisie + submit
  Preview/
    QuickLookPanel.tsx     ← image / PDF / texte
  Explorer/
    TagEditor.tsx          ← inline dans MetadataPanel
```

---

## Feature 1 — Tags manuels

La table `tags` est déjà présente dans le schéma Phase 1 (`file_id`, `tag`, `source`, `weight`, contrainte UNIQUE sur `(file_id, tag)`). Aucune migration SQL nécessaire.

### Backend — `commands/tags.rs`

| Commande | SQL |
|---|---|
| `get_tags(file_id)` | `SELECT tag, source, weight FROM tags WHERE file_id = ?` |
| `add_tag(file_id, tag)` | `INSERT OR IGNORE INTO tags (id, file_id, tag, source, weight) VALUES (...)` avec `source='manual'`, `weight=1.0` |
| `remove_tag(file_id, tag)` | `DELETE FROM tags WHERE file_id = ? AND tag = ?` |

### Frontend — `TagEditor.tsx`

- Intégré dans `MetadataPanel.tsx` sous les métadonnées existantes
- Affiche les tags comme badges avec bouton `×` pour supprimer
- Input inline + `Enter` pour ajouter un nouveau tag
- Re-fetch `get_tags` après chaque opération add/remove

---

## Feature 2 — Quick Look preview

### Backend — ajout dans `commands/files.rs`

- `read_text_preview(path: String) -> Result<String>` : lit les 2000 premiers octets, retourne UTF-8 best-effort (lossy)

Pour images et PDF, le protocol `asset://` Tauri sert les fichiers locaux directement — aucune commande Rust supplémentaire.

### Tauri config — `tauri.conf.json`

Activer le protocol `asset` avec scope restreint :
- `~/Documents/Egestion/`
- `~/Desktop/` (Bureau)
- `~/Downloads/` (Téléchargements)

### Frontend — `QuickLookPanel.tsx`

Intégré en bas du `MetadataPanel`, hauteur fixe `200px`, scrollable.

| Type | Extensions | Rendu |
|---|---|---|
| Image | jpg, jpeg, png, gif, webp, svg | `<img src="asset://...">` |
| PDF | pdf | `<iframe src="asset://...">` |
| Texte | txt, md, json, ts, rs, toml, yaml, … | `<pre>` via `read_text_preview` |
| Autre | * | Icône générique + taille fichier |

---

## Feature 3 — Assistant conversationnel

### Backend — `engine/assistant.rs`

```rust
pub struct Message { pub role: String, pub content: String }
pub struct AssistantResponse { pub files: Vec<FileRecord>, pub text: String }

pub async fn ask(
    query: String,
    history: Vec<Message>,
    db: &SqlitePool,
) -> Result<AssistantResponse>
```

**System prompt** fourni à Claude sonnet-4-6 :
- Schéma DB complet (tables `files`, `tags`, `actions`, `corrections`)
- Liste des catégories et sous-catégories disponibles
- Liste des top 20 tags existants (requête dynamique)
- Instruction : générer du SQL valide SQLite ou une réponse texte si la requête n'est pas une recherche

**Flow :**
1. Claude reçoit `history` + nouvelle `query`
2. Claude retourne soit du SQL (`SELECT ... FROM files ...`), soit du texte libre
3. Si SQL : validé (doit commencer par `SELECT`, sinon erreur) → exécuté contre SQLite → résultats mappés en `Vec<FileRecord>`
4. Si texte : retourné directement dans `AssistantResponse.text`

### Commande — `commands/assistant.rs`

- `ask_assistant(query: String, history: Vec<Message>) -> Result<AssistantResponse>`

### Frontend — `AssistantOverlay.tsx`

- Raccourci `⌘J` toggle open/close (via `useKeyboard.ts` existant)
- `Escape` ferme l'overlay
- Overlay plein-écran semi-transparent, centré, largeur max `640px`
- `MessageList` : bulles user/assistant, résultats fichiers affichés via `SearchResultItem` existant
- `InputBar` : textarea + bouton Submit, `Enter` envoie, `Shift+Enter` saut de ligne
- Historique effacé à la fermeture (éphémère, pas persisté en DB)

---

## Feature 4 — Embeddings sémantiques

### Backend — `engine/embeddings.rs`

```rust
pub async fn generate_description(file: &FileRecord, tags: &[String]) -> Result<String>
```

- Appelle Claude haiku-4-5 avec : `nom`, `catégorie`, `sous-catégorie`, `tags` du fichier
- Prompt : « Décris ce fichier en 1-2 phrases pour faciliter sa recherche »
- Résultat mis en cache dans `ai_cache` (clé = `hash_sha256`, TTL 30 jours, model = `haiku-4-5`)
- Appelé dans le pipeline Organizer, après classification, uniquement si `confidence >= 0.5`

### Intégration Tantivy — `engine/search.rs`

- Ajout du champ `description` (TEXT, `TEXT_STORED`) dans le schéma Tantivy existant
- `index_document` enrichi avec la description récupérée depuis `ai_cache`
- La recherche existante couvre automatiquement ce champ — aucun changement dans `search_files`
- `rebuild_from_db` récupère les descriptions depuis `ai_cache` lors de la reconstruction de l'index

**Migration SQL :** aucune — la description vit dans `ai_cache` et Tantivy, pas dans `files`.

**Coût API :** haiku-4-5, ~50 tokens/fichier, uniquement au premier indexage (cache ensuite).

---

## Feature 5 — Export CSV + Rapport HTML

### Backend — `engine/export.rs`

**CSV :**
```rust
pub async fn export_csv(filters: ExportFilters, db: &SqlitePool) -> Result<String>
```
- `ExportFilters` : `{ category: Option<String>, tags: Vec<String>, date_from: Option<i64>, date_to: Option<i64> }`
- Colonnes : `name, path, category, subcategory, tags (pipe-separated), size_bytes, modified_at, confidence`
- Retourne le contenu CSV complet comme `String`

**Rapport HTML :**
```rust
pub async fn export_report(db: &SqlitePool) -> Result<String>
```
- Génère un fichier HTML autonome (CSS inline, pas de dépendances externes) contenant :
  - Nb fichiers par catégorie → bar chart SVG inline
  - Top 10 tags (avec compte)
  - 30 dernières actions de l'historique undo
  - Duplicats détectés + espace total potentiellement libéré
  - Date de génération du rapport

### Commandes — `commands/export.rs`

- `export_csv(filters: ExportFilters) -> Result<String>`
- `export_report() -> Result<String>`

Le frontend reçoit la `String` et déclenche `dialog::save` Tauri pour choisir l'emplacement de sauvegarde.

### Frontend

- Bouton **"Export CSV"** dans la toolbar de `FileList.tsx` (filtres actifs de l'Explorer appliqués)
- Bouton **"Rapport HTML"** dans `Dashboard` (section existante)
- Pas de nouvelle vue dédiée

---

## Migrations SQL

Aucune migration nécessaire en Phase 3 :
- Table `tags` : déjà présente (Phase 1)
- Table `ai_cache` : déjà présente (Phase 1)
- Tantivy : schéma étendu en mémoire, `rebuild_from_db` gère la migration de l'index

---

## Tests

- `engine/embeddings.rs` : mock Claude API, vérifier cache hit/miss
- `engine/assistant.rs` : mock Claude API, vérifier parsing SQL + fallback texte
- `engine/export.rs` : vérifier structure CSV (headers, séparateurs), vérifier HTML valide
- `commands/tags.rs` : test add/remove/get avec DB in-memory (pattern existant)
- Frontend : types TypeScript pour toutes les nouvelles commandes Tauri
