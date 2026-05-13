# Email Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter la catégorie `"email"` complète — dossier `~/Documents/Mail` surveillé, classification des extensions `.eml`/`.msg`/`.mbox`/`.emlx`, organisation vers `E-mails/{sous-catégorie}`, compteur `email_files` dans `get_stats`, badge cyan dans la sidebar, icône Mail dans le feed d'activité, et entrée dans l'Explorer.

**Architecture:** 3 couches — (1) Rust backend : classifier + organizer + watcher + get_stats ; (2) TypeScript store : `StatsData.email_files` ; (3) React UI : Sidebar, ActivityFeed, Explorer. Les couches sont indépendantes et peuvent être commitées séparément. Aucun nouveau composant, aucune nouvelle vue dédiée — l'Explorer existant gère l'affichage filtré par catégorie.

**Tech Stack:** Rust (Tauri v2), React 19, TypeScript, Tailwind v4 (`bx-*` custom theme), Lucide React, Zustand, SQLite via sqlx

---

## Fichiers touchés

| Fichier | Action |
|---------|--------|
| `src-tauri/src/engine/classifier/rules.rs` | Modifier — ajouter extensions + patterns email |
| `src-tauri/src/engine/organizer.rs` | Modifier — ajouter case `"email"` dans `build_target_dir` |
| `src-tauri/src/engine/watcher.rs` | Modifier — `default_watch_dirs` + `detect_source` |
| `src-tauri/src/commands/files.rs` | Modifier — ajouter `email_files` dans `get_stats` |
| `src/store/index.ts` | Modifier — ajouter `email_files: number` dans `StatsData` |
| `src/components/layout/Sidebar.tsx` | Modifier — nav item E-mails + badge + clic behavior |
| `src/components/Dashboard/ActivityFeed.tsx` | Modifier — ajouter `email` dans `CATEGORY_ICONS` |
| `src/components/Explorer/index.tsx` | Modifier — ajouter `email` dans `CATEGORIES` |

---

### Task 1 : Classifier — extensions et patterns email

**Files:**
- Modify: `src-tauri/src/engine/classifier/rules.rs`

**Contexte :** `rules.rs` contient deux tables constantes. `EXTENSION_MAP` mappe les extensions vers des catégories (confidence 0.95, pas de sous-catégorie). `FILENAME_PATTERNS` mappe les préfixes de nom de fichier vers catégorie + sous-catégorie (confidence 0.85, priorité sur EXTENSION_MAP). La fonction `classify_by_rules` vérifie les patterns d'abord, puis les extensions.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter dans le bloc `#[cfg(test)] mod tests` existant (à la fin du fichier, avant la `}` fermante du module tests) :

```rust
    #[test]
    fn test_classify_eml_by_extension() {
        let result = classify_by_rules("/path/file.eml", "file.eml").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.confidence, 0.95);
        assert_eq!(result.subcategory, None);
    }

    #[test]
    fn test_classify_msg_by_extension() {
        let result = classify_by_rules("/path/file.msg", "file.msg").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.confidence, 0.95);
    }

    #[test]
    fn test_classify_mbox_by_extension() {
        let result = classify_by_rules("/path/archive.mbox", "archive.mbox").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.confidence, 0.95);
    }

    #[test]
    fn test_classify_emlx_by_extension() {
        let result = classify_by_rules("/path/message.emlx", "message.emlx").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.confidence, 0.95);
    }

    #[test]
    fn test_classify_gmail_pattern_wins_over_extension() {
        // Pattern "gmail" checked before extension → subcategory Gmail, confidence 0.85
        let result = classify_by_rules("/path/gmail_export.mbox", "gmail_export.mbox").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.subcategory, Some("Gmail".to_string()));
        assert_eq!(result.confidence, 0.85);
    }

    #[test]
    fn test_classify_outlook_pattern() {
        let result = classify_by_rules("/path/outlook_backup.msg", "outlook_backup.msg").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.subcategory, Some("Outlook".to_string()));
        assert_eq!(result.confidence, 0.85);
    }

    #[test]
    fn test_classify_thunderbird_pattern() {
        let result = classify_by_rules("/path/thunderbird_export.mbox", "thunderbird_export.mbox").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.subcategory, Some("Thunderbird".to_string()));
        assert_eq!(result.confidence, 0.85);
    }
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_classify_eml 2>&1 | tail -15
```

Attendu : `FAILED` — `test_classify_eml_by_extension` panique avec `called \`Option::unwrap()\` on a \`None\` value`.

- [ ] **Step 3 : Ajouter les extensions email dans `EXTENSION_MAP`**

Dans `src-tauri/src/engine/classifier/rules.rs`, trouver la ligne :
```rust
    ("rs", "code"), ("py", "code"), ("js", "code"), ("ts", "code"),
    ("go", "code"), ("java", "code"), ("cpp", "code"), ("c", "code"),
    ("sh", "code"), ("rb", "code"), ("swift", "code"),
```
et ajouter après la ligne `("sh", "code"), ("rb", "code"), ("swift", "code"),` :
```rust
    ("eml", "email"), ("msg", "email"), ("mbox", "email"), ("emlx", "email"),
```

- [ ] **Step 4 : Ajouter les patterns de sous-catégorie dans `FILENAME_PATTERNS`**

Dans le même fichier, trouver :
```rust
    ("setup", "installer", ""),
    ("install", "installer", ""),
];
```
et remplacer par :
```rust
    ("setup", "installer", ""),
    ("install", "installer", ""),
    ("gmail",       "email", "Gmail"),
    ("outlook",     "email", "Outlook"),
    ("thunderbird", "email", "Thunderbird"),
];
```

- [ ] **Step 5 : Vérifier que les tests passent**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_classify_eml 2>&1 | tail -15
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_classify_gmail 2>&1 | tail -10
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_classify_outlook 2>&1 | tail -10
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_classify_thunderbird 2>&1 | tail -10
```

Attendu : `test result: ok. N passed; 0 failed` pour chaque commande.

- [ ] **Step 6 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src-tauri/src/engine/classifier/rules.rs
git commit -m "feat(classifier): add email extensions (.eml .msg .mbox .emlx) and subcategory patterns"
```

---

### Task 2 : Organizer — case "email" dans `build_target_dir`

**Files:**
- Modify: `src-tauri/src/engine/organizer.rs`

**Contexte :** `build_target_dir` est une fonction privée dans `organizer.rs`. Elle prend `home: &Path`, `classification: &ClassificationResult`, `record: &FileRecord` et retourne un `PathBuf`. Le chemin de base est `~/Documents/Egestion/`. La fonction utilise un `match` sur `classification.category.as_str()`. Les autres catégories (`"photo"`, `"document"`, etc.) sont des bras du match ; le `_` catch-all retourne `"_Unsorted"`. Il n'existe pas encore de bloc `#[cfg(test)]` dans ce fichier — il faut le créer.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `src-tauri/src/engine/organizer.rs` (avant la dernière `}` du fichier, ou en fin de fichier si pas encore de bloc test) :

```rust
#[cfg(test)]
mod tests {
    use super::build_target_dir;
    use crate::engine::classifier::ClassificationResult;
    use crate::db::models::FileRecord;
    use std::path::PathBuf;

    fn dummy_record() -> FileRecord {
        FileRecord {
            id: "test".to_string(),
            path: "/tmp/test.eml".to_string(),
            name: "test.eml".to_string(),
            extension: Some("eml".to_string()),
            size_bytes: 0,
            hash_sha256: "".to_string(),
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
            source_dir: None,
        }
    }

    #[test]
    fn test_build_target_dir_email_gmail() {
        let home = PathBuf::from("/Users/test");
        let cls = ClassificationResult {
            category: "email".to_string(),
            subcategory: Some("Gmail".to_string()),
            confidence: 0.85,
            tags: vec![],
        };
        let result = build_target_dir(&home, &cls, &dummy_record());
        assert!(
            result.to_string_lossy().ends_with("E-mails/Gmail"),
            "Expected path to end with E-mails/Gmail, got: {}",
            result.display()
        );
    }

    #[test]
    fn test_build_target_dir_email_divers() {
        let home = PathBuf::from("/Users/test");
        let cls = ClassificationResult {
            category: "email".to_string(),
            subcategory: None,
            confidence: 0.95,
            tags: vec![],
        };
        let result = build_target_dir(&home, &cls, &dummy_record());
        assert!(
            result.to_string_lossy().ends_with("E-mails/Divers"),
            "Expected path to end with E-mails/Divers, got: {}",
            result.display()
        );
    }
}
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_build_target_dir_email 2>&1 | tail -15
```

Attendu : les deux tests échouent — le match catch-all `_` retourne `"_Unsorted"` au lieu de `"E-mails/..."`.

- [ ] **Step 3 : Ajouter le case `"email"` dans `build_target_dir`**

Dans `src-tauri/src/engine/organizer.rs`, trouver :
```rust
        "code" => "Code".to_string(),
        _ => "_Unsorted".to_string(),
```
et remplacer par :
```rust
        "code" => "Code".to_string(),
        "email" => format!(
            "E-mails/{}",
            classification.subcategory.clone().unwrap_or_else(|| "Divers".to_string())
        ),
        _ => "_Unsorted".to_string(),
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_build_target_dir_email 2>&1 | tail -10
```

Attendu : `test result: ok. 2 passed; 0 failed`.

- [ ] **Step 5 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src-tauri/src/engine/organizer.rs
git commit -m "feat(organizer): add email category — organizes to E-mails/{subcategory}"
```

---

### Task 3 : Watcher + `get_stats` — dossier Mail + detect_source + email_files

**Files:**
- Modify: `src-tauri/src/engine/watcher.rs`
- Modify: `src-tauri/src/commands/files.rs`

**Contexte :** `default_watch_dirs()` retourne `Vec<PathBuf>` avec Desktop et Downloads. Le `FsWatcher::new()` skip les dossiers qui n'existent pas (`if dir.exists()`), donc `~/Documents/Mail` doit être créé dans `default_watch_dirs()` avant d'être pushé. `detect_source` fait une correspondance sur le path en minuscules. La commande `get_stats` dans `files.rs` exécute 3 requêtes SQL et retourne un `serde_json::Value`.

- [ ] **Step 1 : Écrire les tests qui échouent pour `watcher.rs`**

Dans `src-tauri/src/engine/watcher.rs`, ajouter dans le bloc `#[cfg(test)] mod tests` existant (avant la `}` fermante du module) :

```rust
    #[test]
    fn test_detect_source_mail() {
        let path = PathBuf::from("/Users/test/Documents/Mail/export.eml");
        assert_eq!(detect_source(&path), "mail");
    }

    #[test]
    fn test_detect_source_documents_mailbox_is_not_mail() {
        // "/documents/mailbox/" ne contient pas "/documents/mail/" → "unknown"
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
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_detect_source_mail 2>&1 | tail -15
```

Attendu : `test_detect_source_mail` FAILED (retourne `"unknown"`), `test_default_watch_dirs_includes_mail` FAILED.

- [ ] **Step 3 : Mettre à jour `detect_source` dans `watcher.rs`**

Trouver dans `src-tauri/src/engine/watcher.rs` :
```rust
fn detect_source(path: &Path) -> String {
    let path_str = path.to_string_lossy().to_lowercase();
    if path_str.contains("/downloads") {
        "downloads".to_string()
    } else if path_str.contains("/desktop") {
        "desktop".to_string()
    } else {
        "unknown".to_string()
    }
}
```
et remplacer par :
```rust
fn detect_source(path: &Path) -> String {
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
```

- [ ] **Step 4 : Mettre à jour `default_watch_dirs` dans `watcher.rs`**

Trouver :
```rust
pub fn default_watch_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(desktop) = dirs::desktop_dir() {
        dirs.push(desktop);
    }
    if let Some(downloads) = dirs::download_dir() {
        dirs.push(downloads);
    }
    dirs
}
```
et remplacer par :
```rust
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
```

- [ ] **Step 5 : Vérifier que les tests watcher passent**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_detect_source_mail 2>&1 | tail -10
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test test_default_watch_dirs_includes_mail 2>&1 | tail -10
```

Attendu : `test result: ok. 1 passed; 0 failed` pour chaque commande.

- [ ] **Step 6 : Ajouter `email_files` dans `get_stats` (`files.rs`)**

Dans `src-tauri/src/commands/files.rs`, trouver :
```rust
    let duplicates: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files WHERE is_duplicate = 1")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "total_files": total.0,
        "organized_files": organized.0,
        "duplicate_files": duplicates.0,
    }))
```
et remplacer par :
```rust
    let duplicates: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files WHERE is_duplicate = 1")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let emails: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files WHERE category = 'email'")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "total_files": total.0,
        "organized_files": organized.0,
        "duplicate_files": duplicates.0,
        "email_files": emails.0,
    }))
```

- [ ] **Step 7 : Vérifier la compilation Rust**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo check 2>&1 | tail -10
```

Attendu : `Finished` sans `error`.

- [ ] **Step 8 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src-tauri/src/engine/watcher.rs src-tauri/src/commands/files.rs
git commit -m "feat(watcher): add ~/Documents/Mail to watch dirs; feat(stats): add email_files count"
```

---

### Task 4 : TypeScript store — `email_files` dans `StatsData`

**Files:**
- Modify: `src/store/index.ts`

**Contexte :** `StatsData` est une interface TypeScript exportée qui reflète le JSON retourné par `get_stats()`. La valeur initiale du store (`stats: { total_files: 0, organized_files: 0, duplicate_files: 0 }`) doit aussi être mise à jour. `StatsData` est utilisée dans `useFileEvents.ts` (type du retour d'`invoke<StatsData>('get_stats')`) — aucun changement nécessaire là-bas car TypeScript ne valide pas les propriétés supplémentaires sur le JSON reçu à l'exécution.

- [ ] **Step 1 : Mettre à jour `StatsData` dans `src/store/index.ts`**

Trouver :
```ts
export interface StatsData {
  total_files: number;
  organized_files: number;
  duplicate_files: number;
}
```
et remplacer par :
```ts
export interface StatsData {
  total_files: number;
  organized_files: number;
  duplicate_files: number;
  email_files: number;
}
```

- [ ] **Step 2 : Mettre à jour la valeur initiale dans `create()`**

Trouver :
```ts
  stats: { total_files: 0, organized_files: 0, duplicate_files: 0 },
```
et remplacer par :
```ts
  stats: { total_files: 0, organized_files: 0, duplicate_files: 0, email_files: 0 },
```

- [ ] **Step 3 : Vérifier TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -20
```

Attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src/store/index.ts
git commit -m "feat(store): add email_files to StatsData"
```

---

### Task 5 : Frontend UI — Sidebar, ActivityFeed, Explorer

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/Dashboard/ActivityFeed.tsx`
- Modify: `src/components/Explorer/index.tsx`

**Contexte :**

**Sidebar.tsx** — la nav utilise `NAV_ITEMS.map(...)` avec un seul `onClick={() => onNavigate(id)}`. Le click sur "E-mails" doit appeler `setSelectedCategory('email')` ET `onNavigate('explorer')` (pas un nouveau routeur). L'item est actif si `currentView === 'explorer' && selectedCategory === 'email'`. Le badge cyan utilise `stats.email_files` depuis le store (déjà destructuré).

**ActivityFeed.tsx** — `CATEGORY_ICONS` est un `Record<string, React.ReactNode>`. L'import de Lucide est en ligne 2.

**Explorer/index.tsx** — `CATEGORIES` est une constante déclarée avant la fonction `Explorer()`. L'import Lucide est en lignes 4-6.

- [ ] **Step 1 : Mettre à jour `Sidebar.tsx`**

Remplacer le contenu complet de `src/components/layout/Sidebar.tsx` par :

```tsx
import { LayoutDashboard, FolderOpen, Folder, FolderClosed, Mail } from 'lucide-react';
import { useAppStore } from '../../store';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'explorer',  label: 'Explorer',  icon: Folder },
  { id: 'unsorted',  label: 'À valider', icon: FolderOpen },
  { id: 'emails',    label: 'E-mails',   icon: Mail },
];

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const { isWatching, watchedDirs, stats, setSelectedCategory, selectedCategory } = useAppStore();
  const unsortedCount = Math.max(0, stats.total_files - stats.organized_files);

  return (
    <div className="w-48 bg-bx-900 border-r border-bx-800 flex flex-col py-4">

      {/* ── Logo ───────────────────────────────────────────────── */}
      <div className="px-3.5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-bx-600 to-bx-800 rounded-lg flex items-center justify-center text-[13px] font-bold text-zinc-100 shrink-0 select-none">
            E
          </div>
          <div>
            <p className="text-[13px] font-bold text-zinc-100 leading-tight tracking-tight">Egestion</p>
            <p className="text-[9px] text-zinc-600">v0.1.0</p>
          </div>
        </div>
      </div>

      {/* ── Carte statut ───────────────────────────────────────── */}
      <div className="mx-2 mb-3 bg-[#2a0f1a] border border-bx-800 rounded-lg p-2.5">
        <p className="text-[8px] font-semibold uppercase tracking-[1.5px] text-zinc-600 mb-1.5">
          Dossiers surveillés
        </p>
        <div className="flex flex-col gap-1 mb-2">
          {watchedDirs.length > 0 ? (
            watchedDirs.map((dir) => (
              <div key={dir} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <FolderClosed size={10} className="opacity-50 shrink-0" />
                {dir}
              </div>
            ))
          ) : (
            <div className="text-[10px] text-zinc-600">—</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isWatching ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          <span className={`text-[9px] font-medium ${isWatching ? 'text-emerald-400' : 'text-zinc-600'}`}>
            {isWatching ? 'Surveillance active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* ── Nav ────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
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
            </button>
          );
        })}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="px-3.5 pt-2 border-t border-bx-800 flex items-center justify-between">
        <p className="text-[10px] text-zinc-700">⌘K chercher</p>
        <kbd className="text-[9px] text-zinc-700 bg-bx-800 border border-bx-700 rounded px-1.5 py-0.5">K</kbd>
      </div>

    </div>
  );
}
```

- [ ] **Step 2 : Mettre à jour `ActivityFeed.tsx`**

Dans `src/components/Dashboard/ActivityFeed.tsx`, trouver :
```tsx
import { Undo2, FileText, Image, Music, Video, Archive, HelpCircle } from 'lucide-react';
```
et remplacer par :
```tsx
import { Undo2, FileText, Image, Music, Video, Archive, HelpCircle, Mail } from 'lucide-react';
```

Trouver :
```tsx
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  document: <FileText size={14} className="text-blue-400" />,
  photo:    <Image   size={14} className="text-green-400" />,
  music:    <Music   size={14} className="text-purple-400" />,
  video:    <Video   size={14} className="text-orange-400" />,
  archive:  <Archive size={14} className="text-yellow-400" />,
};
```
et remplacer par :
```tsx
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  document: <FileText size={14} className="text-blue-400" />,
  photo:    <Image   size={14} className="text-green-400" />,
  music:    <Music   size={14} className="text-purple-400" />,
  video:    <Video   size={14} className="text-orange-400" />,
  archive:  <Archive size={14} className="text-yellow-400" />,
  email:    <Mail    size={14} className="text-cyan-400" />,
};
```

- [ ] **Step 3 : Mettre à jour `Explorer/index.tsx`**

Dans `src/components/Explorer/index.tsx`, trouver :
```tsx
import {
  FileText, Image, Music, Video, Archive, Code, HelpCircle,
} from 'lucide-react';
```
et remplacer par :
```tsx
import {
  FileText, Image, Music, Video, Archive, Code, HelpCircle, Mail,
} from 'lucide-react';
```

Trouver :
```tsx
const CATEGORIES = [
  { id: 'photo',     label: 'Photos',    Icon: Image },
  { id: 'video',     label: 'Vidéos',    Icon: Video },
  { id: 'music',     label: 'Musiques',  Icon: Music },
  { id: 'document',  label: 'Documents', Icon: FileText },
  { id: 'archive',   label: 'Archives',  Icon: Archive },
  { id: 'code',      label: 'Code',      Icon: Code },
  { id: '_unsorted', label: '_Unsorted', Icon: HelpCircle },
];
```
et remplacer par :
```tsx
const CATEGORIES = [
  { id: 'photo',     label: 'Photos',    Icon: Image },
  { id: 'video',     label: 'Vidéos',    Icon: Video },
  { id: 'music',     label: 'Musiques',  Icon: Music },
  { id: 'document',  label: 'Documents', Icon: FileText },
  { id: 'archive',   label: 'Archives',  Icon: Archive },
  { id: 'code',      label: 'Code',      Icon: Code },
  { id: 'email',     label: 'E-mails',   Icon: Mail },
  { id: '_unsorted', label: '_Unsorted', Icon: HelpCircle },
];
```

- [ ] **Step 4 : Vérifier TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -20
```

Attendu : aucune erreur.

- [ ] **Step 5 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src/components/layout/Sidebar.tsx src/components/Dashboard/ActivityFeed.tsx src/components/Explorer/index.tsx
git commit -m "feat(ui): add E-mails nav item (sidebar badge + ActivityFeed icon + Explorer category)"
```

---

### Task 6 : Vérification finale + push

**Files:** aucun fichier modifié — vérification uniquement.

- [ ] **Step 1 : Lancer la suite de tests Rust complète**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo test 2>&1 | tail -20
```

Attendu : `test result: ok. N passed; 0 failed` (toutes les suites).

- [ ] **Step 2 : Screenshot Playwright**

Naviguer vers `http://localhost:1420`, attendre 2s, prendre un screenshot.

- [ ] **Step 3 : Checklist visuelle**

- [ ] Sidebar : 4 items nav (Dashboard · Explorer · À valider · E-mails)
- [ ] E-mails a une icône enveloppe (Mail icon de Lucide)
- [ ] Status card "Dossiers surveillés" : Desktop · Downloads · Mail (après redémarrage de l'app native)
- [ ] Badge cyan absent si `stats.email_files === 0` (normal en mode browser)
- [ ] ActivityFeed : aucune régression sur les icônes existantes (document/photo/music/video/archive)
- [ ] Explorer : catégorie "E-mails" visible dans la liste de gauche

- [ ] **Step 4 : Push**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git push
```
