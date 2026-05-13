# Catégorie E-mails — Spec

**Date:** 2026-05-14
**Status:** Approuvé

## Contexte

Egestion surveille Desktop et Downloads pour organiser les fichiers. Cette spec ajoute la catégorie `"email"` : un dossier dédié `~/Documents/Mail` pour les exports de mails, la classification des extensions email (.eml, .msg, .mbox, .emlx), l'organisation vers `~/Documents/Egestion/E-mails/{sous-catégorie}`, un compteur dans `get_stats`, un badge dans la sidebar, une icône dans le feed d'activité, et une entrée dans l'Explorer.

## Périmètre

| Ce qui change | Ce qui ne change pas |
|---------------|----------------------|
| 8 fichiers modifiés | Pipeline complet (indexer, search, DB, events) |
| Nouveau dossier surveillé `~/Documents/Mail` | Interface `SidebarProps`, `AppStore` (sauf `StatsData`) |
| Nouvelle catégorie "email" dans rules + organizer | Logique undo, confidence thresholds |

## Décisions validées

| Question | Choix |
|----------|-------|
| Dossier à surveiller | `~/Documents/Mail` (dédié, créé automatiquement) |
| Stat card Dashboard | Garder "Doublons" — badge sidebar suffit pour le count email |
| Badge couleur | Cyan (`text-cyan-400` / `#22d3ee`) — distinct du rose "À valider" |

---

## Composants à modifier

### 1. `src-tauri/src/engine/watcher.rs`

**`default_watch_dirs()`** : ajouter `~/Documents/Mail` et le créer s'il n'existe pas :

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

**`detect_source()`** : ajouter la branche `mail` avant `"unknown"` :

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

### 2. `src-tauri/src/engine/classifier/rules.rs`

**`EXTENSION_MAP`** : ajouter après les entrées `"code"` :

```rust
("eml", "email"), ("msg", "email"), ("mbox", "email"), ("emlx", "email"),
```

**`FILENAME_PATTERNS`** : ajouter avant la fermeture du tableau :

```rust
("gmail",       "email", "Gmail"),
("outlook",     "email", "Outlook"),
("thunderbird", "email", "Thunderbird"),
```

Règle de priorité inchangée : les patterns sont vérifiés avant les extensions, donc `gmail_backup.mbox` sera classé `Gmail`, `report.eml` sera classé `Divers` (pas de pattern = pas de subcategory = organizer fallback vers "Divers").

### 3. `src-tauri/src/engine/organizer.rs`

Dans `build_target_dir()`, ajouter avant le `_` default :

```rust
"email" => format!(
    "E-mails/{}",
    classification.subcategory.clone().unwrap_or_else(|| "Divers".to_string())
),
```

Résultat : `~/Documents/Egestion/E-mails/Gmail`, `E-mails/Outlook`, `E-mails/Thunderbird`, `E-mails/Divers`.

### 4. `src-tauri/src/commands/files.rs`

Dans `get_stats()`, ajouter une query et l'inclure dans le JSON :

```rust
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

### 5. `src/store/index.ts`

Ajouter `email_files` à `StatsData` et à la valeur initiale :

```ts
// interface StatsData
export interface StatsData {
  total_files: number;
  organized_files: number;
  duplicate_files: number;
  email_files: number;
}

// dans create() — valeur initiale
stats: { total_files: 0, organized_files: 0, duplicate_files: 0, email_files: 0 },
```

### 6. `src/components/layout/Sidebar.tsx`

Ajouter `Mail` aux imports Lucide et un 4e item dans `NAV_ITEMS` :

```tsx
import { LayoutDashboard, FolderOpen, Folder, FolderClosed, Mail } from 'lucide-react';
```

```tsx
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'explorer',  label: 'Explorer',   icon: Folder },
  { id: 'unsorted',  label: 'À valider',  icon: FolderOpen },
  { id: 'emails',    label: 'E-mails',    icon: Mail },
];
```

**Comportement du clic "E-mails" :** cliquer sur E-mails navigue vers la vue `'explorer'` ET pré-sélectionne la catégorie email dans le store. Le composant Sidebar appelle `setSelectedCategory` depuis `useAppStore()` pour cet item uniquement :

```tsx
const { isWatching, watchedDirs, stats, setSelectedCategory } = useAppStore();

// Dans le bouton :
onClick={() => {
  if (id === 'emails') {
    setSelectedCategory('email');
    onNavigate('explorer');
  } else {
    onNavigate(id);
  }
}}
```

**Active state pour E-mails :** l'item est mis en surbrillance quand `currentView === 'explorer'` ET `selectedCategory === 'email'` :

```tsx
const isActive = id === 'emails'
  ? (currentView === 'explorer' && selectedCategory === 'email')
  : currentView === id;

className={`... ${isActive ? 'bg-bx-600 text-zinc-100' : 'text-zinc-500 ...'}`}
```

Le composant doit donc lire `selectedCategory` depuis `useAppStore()` en plus des champs existants. La destructure complète devient :

```tsx
const { isWatching, watchedDirs, stats, setSelectedCategory, selectedCategory } = useAppStore();
```

Badge cyan sur l'item `emails` (analogue au badge rose sur `unsorted`) :

```tsx
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
```

### 7. `src/components/Dashboard/ActivityFeed.tsx`

Ajouter `Mail` aux imports et une entrée dans `CATEGORY_ICONS` :

```tsx
import { FileText, Image, Music, Video, Archive, HelpCircle, Mail } from 'lucide-react';
```

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

### 8. `src/components/Explorer/index.tsx`

Ajouter `Mail` aux imports et un item dans `CATEGORIES` :

```tsx
import { Image, Video, Music, FileText, Archive, Code, HelpCircle, Mail } from 'lucide-react';
```

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

---

## Flux complet (exemple)

```
~/Documents/Mail/facture_mai.eml déposé
    ↓ watcher.rs (source: "mail")
    ↓ indexer → DB insert
    ↓ classifier/rules.rs → extension "eml" → category:"email", subcategory:None, confidence:0.95
    ↓ organizer.rs → ~/Documents/Egestion/E-mails/Divers/facture_mai.eml
    ↓ get_stats() → email_files += 1
    ↓ Tauri emit 'file-organized' { category: "email" }
    ↓ store: activity + stats (email_files: 1)
    ↓ Sidebar badge cyan: 1 · ActivityFeed icône Mail cyan · Explorer "E-mails" queryable
```

## Tests attendus (Rust)

Dans `rules.rs` :
- `.eml` → `category: "email"`, `confidence: 0.95`
- `.msg` → `category: "email"`, `confidence: 0.95`
- `gmail_export.mbox` → `category: "email"`, `subcategory: Some("Gmail")`, `confidence: 0.85`
- `outlook_backup.msg` (filename sans pattern) → `category: "email"`, `subcategory: None`

Dans `watcher.rs` :
- `detect_source("/Users/x/Documents/Mail/file.eml")` → `"mail"`

Dans `organizer.rs` :
- `category:"email"`, `subcategory: Some("Gmail")` → `E-mails/Gmail`
- `category:"email"`, `subcategory: None` → `E-mails/Divers`

## Ce qui ne change pas

- Pas de nouvelle vue "E-mails" dédiée — l'Explorer existant suffit (clic sur la catégorie)
- Pas de 5e stat card — le badge sidebar est le seul indicateur visuel email
- `useFileEvents.ts` inchangé — les événements `file-organized` portent déjà `category`
- DB schema inchangé — `category = 'email'` est une valeur textuelle comme les autres
