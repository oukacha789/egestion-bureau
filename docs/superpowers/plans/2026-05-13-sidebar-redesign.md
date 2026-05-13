# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refaire la sidebar avec un logo pill "E", une carte "Dossiers surveillés" dynamique (Desktop/Downloads + statut actif), et un badge count sur "À valider".

**Architecture:** 3 couches — (1) nouvelle commande Tauri Rust qui expose les dossiers surveillés, (2) store + hook TS qui consomment la commande, (3) Sidebar React redesignée qui lit le store. Pas de nouveau composant — tout reste dans les fichiers existants.

**Tech Stack:** Rust (Tauri), React 19, TypeScript, Tailwind v4 (`bx-*` custom theme), Lucide React, Zustand

---

## Fichiers touchés

| Fichier | Action |
|---------|--------|
| `src-tauri/src/commands/files.rs` | Modifier — ajouter `get_watch_dirs` |
| `src-tauri/src/lib.rs` | Modifier — enregistrer `get_watch_dirs` dans `generate_handler![]` |
| `src/store/index.ts` | Modifier — ajouter `watchedDirs: string[]` + `setWatchedDirs` |
| `src/hooks/useFileEvents.ts` | Modifier — invoker `get_watch_dirs` au mount |
| `src/components/layout/Sidebar.tsx` | Modifier — refonte complète du rendu |

---

### Task 1 : Commande Tauri `get_watch_dirs`

**Files:**
- Modify: `src-tauri/src/commands/files.rs` (append après la ligne 289)
- Modify: `src-tauri/src/lib.rs:45` (ajouter dans `generate_handler![]`)

- [ ] **Step 1 : Ajouter `get_watch_dirs` à la fin de `files.rs`**

Ajouter ces lignes **avant** le bloc `#[cfg(test)]` (ligne 265 environ — chercher la dernière fonction `pub async fn` et insérer après sa `}` fermante, avant `#[cfg(test)]`).

La dernière fonction avant les tests est `read_text_preview`. Insérer après sa `}` :

```rust
#[tauri::command]
pub async fn get_watch_dirs() -> Vec<String> {
    use crate::engine::watcher::default_watch_dirs;
    default_watch_dirs()
        .iter()
        .filter_map(|p| p.file_name())
        .map(|n| n.to_string_lossy().into_owned())
        .collect()
}
```

- [ ] **Step 2 : Enregistrer dans `lib.rs`**

Dans `src-tauri/src/lib.rs`, trouver la ligne :
```rust
            commands::export_report,
```
et la remplacer par :
```rust
            commands::export_report,
            commands::get_watch_dirs,
```

- [ ] **Step 3 : Vérifier la compilation Rust**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri" && cargo check 2>&1 | tail -10
```

Attendu : `Finished` sans `error`. Des `warning` sont acceptables.

- [ ] **Step 4 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src-tauri/src/commands/files.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): add get_watch_dirs command — returns folder names"
```

---

### Task 2 : Store + hook — `watchedDirs`

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/hooks/useFileEvents.ts`

- [ ] **Step 1 : Ajouter `watchedDirs` dans l'interface `AppStore`**

Dans `src/store/index.ts`, trouver le bloc `interface AppStore` et y ajouter après `setIsWatching`:

```ts
  // Sidebar
  watchedDirs: string[];
  setWatchedDirs: (dirs: string[]) => void;
```

- [ ] **Step 2 : Initialiser dans `create()`**

Dans le même fichier, dans `create<AppStore>((set) => ({`, ajouter après `setIsWatching: (v) => set({ isWatching: v }),` :

```ts
  watchedDirs: [],
  setWatchedDirs: (dirs) => set({ watchedDirs: dirs }),
```

- [ ] **Step 3 : Invoquer `get_watch_dirs` dans `useFileEvents.ts`**

Dans `src/hooks/useFileEvents.ts`, modifier la ligne destructurée :
```ts
const { addActivity, setStats, setIsWatching } = useAppStore();
```
en :
```ts
const { addActivity, setStats, setIsWatching, setWatchedDirs } = useAppStore();
```

Puis, dans le `useEffect`, juste après le premier `invoke('get_stats')...`, ajouter :
```ts
    invoke<string[]>('get_watch_dirs')
      .then(setWatchedDirs)
      .catch(console.error);
```

Le bloc `useEffect` complet doit ressembler à ceci :
```ts
  useEffect(() => {
    setIsWatching(true);

    const unlistenPromise = listen<FileOrganizedPayload>('file-organized', (event) => {
      addActivity({
        action_id: event.payload.action_id,
        file_id: event.payload.file_id,
        name: event.payload.name,
        path_before: event.payload.path_before,
        path_after: event.payload.path_after,
        category: event.payload.category,
        timestamp: Date.now(),
      });

      invoke<{ total_files: number; organized_files: number; duplicate_files: number }>('get_stats')
        .then(setStats)
        .catch(console.error);
    });

    invoke<{ total_files: number; organized_files: number; duplicate_files: number }>('get_stats')
      .then(setStats)
      .catch(console.error);

    invoke<string[]>('get_watch_dirs')
      .then(setWatchedDirs)
      .catch(console.error);

    return () => {
      unlistenPromise.then((fn) => fn());
      setIsWatching(false);
    };
  }, []);
```

- [ ] **Step 4 : Vérifier TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -20
```

Attendu : aucune erreur.

- [ ] **Step 5 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src/store/index.ts src/hooks/useFileEvents.ts
git commit -m "feat: add watchedDirs to store, fetch get_watch_dirs on mount"
```

---

### Task 3 : Refonte `Sidebar.tsx`

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1 : Remplacer tout le contenu de `Sidebar.tsx`**

```tsx
import { LayoutDashboard, FolderOpen, Folder, FolderClosed } from 'lucide-react';
import { useAppStore } from '../../store';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'explorer',  label: 'Explorer',  icon: Folder },
  { id: 'unsorted',  label: 'À valider', icon: FolderOpen },
];

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const { isWatching, watchedDirs, stats } = useAppStore();
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
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
              currentView === id
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
          </button>
        ))}
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

- [ ] **Step 2 : Vérifier TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -20
```

Attendu : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src/components/layout/Sidebar.tsx
git commit -m "feat: sidebar redesign — logo pill, status card, unsorted badge, kbd footer"
```

---

### Task 4 : Vérification visuelle Playwright + push

**Files:** aucun fichier modifié — vérification uniquement.

- [ ] **Step 1 : Recharger et screenshot**

Naviguer vers http://localhost:1420, attendre 2s, screenshot pleine page.

- [ ] **Step 2 : Checklist visuelle**

- [ ] Logo pill "E" bordeaux visible en haut à gauche
- [ ] "Egestion" + "v0.1.0" à droite du pill
- [ ] Carte "Dossiers surveillés" avec "—" (watchedDirs vide en browser) OU Desktop/Downloads
- [ ] Statut ● Surveillance active / Inactive selon `isWatching`
- [ ] 3 nav items avec icônes, item actif en bordeaux
- [ ] Footer ⌘K chercher + badge K
- [ ] Badge rose sur "À valider" absent si `unsortedCount == 0`

- [ ] **Step 3 : Push**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git push
```
