# Sidebar Redesign — Spec

**Date:** 2026-05-13  
**Status:** Approuvé

## Contexte

La sidebar actuelle est fonctionnelle mais sobre : texte "Egestion", 3 nav items, shortcut hint. L'objectif est de la rendre plus expressive et informative avec un logo iconique, une carte "Dossiers surveillés" dynamique, et un badge de count sur "À valider".

## Décisions validées

| Question | Choix |
|----------|-------|
| Direction | C — Enrichie avec carte statut |
| Contenu carte statut | B — Statut + chemins des dossiers surveillés |

## Nouveau layout

```
┌──────────────────────────┐
│  [E]  Egestion           │  ← Logo pill + texte + version
│       v0.1.0             │
├──────────────────────────┤
│  DOSSIERS SURVEILLÉS     │  ← Carte statut (bg #2a0f1a)
│  📁 Desktop              │
│  📁 Downloads            │
│  ● Surveillance active   │
├──────────────────────────┤
│  ▦ Dashboard             │  ← Nav items (inchangés logiquement)
│    Explorer              │
│    À valider    [3]      │  ← Badge rouge count non triés
├──────────────────────────┤
│  ⌘K chercher      [K]   │  ← Footer avec kbd badge
└──────────────────────────┘
```

## Composants à modifier / créer

### `src-tauri/src/commands/files.rs` — nouveau command

Ajouter à la fin du fichier :

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

Retourne uniquement les noms de dossiers (`["Desktop", "Downloads"]`), pas les chemins complets — plus lisible dans la UI.

### `src-tauri/src/lib.rs` — enregistrer le command

Ajouter `commands::get_watch_dirs` dans `generate_handler![]`.

### `src/store/index.ts` — nouveau champ

Ajouter dans `AppStore` et `create()` :

```ts
// dans AppStore interface
watchedDirs: string[];
setWatchedDirs: (dirs: string[]) => void;

// dans create()
watchedDirs: [],
setWatchedDirs: (dirs) => set({ watchedDirs: dirs }),
```

### `src/hooks/useFileEvents.ts` — fetch au mount

Ajouter un `invoke<string[]>('get_watch_dirs').then(setWatchedDirs)` dans le `useEffect`, à côté du `get_stats` initial.

### `src/components/layout/Sidebar.tsx` — refonte complète

Nouveau rendu :

```tsx
import { invoke } from '@tauri-apps/api/core';  // pas nécessaire si via hook
import { LayoutDashboard, FolderOpen, Folder, FolderClosed } from 'lucide-react';
import { useAppStore } from '../../store';

// ...

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const { isWatching, watchedDirs, activity } = useAppStore();
  const unsortedCount = 0; // géré via props ou store (voir ci-dessous)

  return (
    <div className="w-48 bg-bx-900 border-r border-bx-800 flex flex-col py-4">

      {/* Logo */}
      <div className="px-3.5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-bx-600 to-bx-800 rounded-lg flex items-center justify-center text-[13px] font-bold text-zinc-100 shrink-0">
            E
          </div>
          <div>
            <p className="text-[13px] font-bold text-zinc-100 leading-tight tracking-tight">Egestion</p>
            <p className="text-[9px] text-zinc-600">v0.1.0</p>
          </div>
        </div>
      </div>

      {/* Carte statut */}
      <div className="mx-2 mb-3 bg-[#2a0f1a] border border-bx-800 rounded-lg p-2.5">
        <p className="text-[8px] font-semibold uppercase tracking-[1.5px] text-zinc-600 mb-1.5">
          Dossiers surveillés
        </p>
        <div className="flex flex-col gap-1 mb-2">
          {watchedDirs.length > 0 ? watchedDirs.map((dir) => (
            <div key={dir} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <FolderClosed size={10} className="opacity-50 shrink-0" />
              {dir}
            </div>
          )) : (
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

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5">
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

      {/* Footer */}
      <div className="px-3.5 pt-2 border-t border-bx-800 flex items-center justify-between">
        <p className="text-[10px] text-zinc-700">⌘K chercher</p>
        <kbd className="text-[9px] text-zinc-700 bg-bx-800 border border-bx-700 rounded px-1.5 py-0.5">K</kbd>
      </div>

    </div>
  );
}
```

### Badge "À valider" — source du count

Le count des fichiers non triés vient du store `unsorted` (Unsorted view). Pour éviter d'ajouter un nouveau champ store, on passe par un `unsortedCount` calculé à partir de `stats` : `stats.total_files - stats.organized_files` (approximation). Si cette valeur est inexacte, une amélioration ultérieure pourra ajouter un champ dédié.

**Choix retenu :** `unsortedCount = Math.max(0, stats.total_files - stats.organized_files)` dans Sidebar, lu depuis `useAppStore`.

## Ce qui ne change pas

- Interface `SidebarProps` (`currentView`, `onNavigate`)
- Logique de navigation (App.tsx inchangé)
- Les 3 nav items et leurs IDs

## Contraintes

- `get_watch_dirs` retourne les noms de dossier seulement (pas chemins complets)
- `invoke` Tauri plantera en mode browser — géré dans `useFileEvents.ts` avec `.catch(console.error)`, `watchedDirs` reste `[]` en browser
- Pas de nouvelles dépendances npm
