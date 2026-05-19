# ⌘K Search — Refonte CommandPalette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refonte de la CommandPalette en layout deux colonnes (résultats + preview), avec chips de filtre catégorie, highlight de la query, et actions clavier étendues (⌘↵ Explorer, ⌥↵ copier chemin).

**Architecture:** Migration de `currentView` vers le store Zustand pour permettre la navigation depuis la palette. Trois nouveaux composants (`CategoryChips`, `SearchPreview`) et refonte de `CommandPalette`. `useSearch` accepte déjà un paramètre `category` — aucun changement backend.

**Tech Stack:** React 18, TypeScript, Zustand, Tauri invoke, lucide-react, Tailwind CSS.

---

## File Map

| Action | Fichier | Rôle |
|--------|---------|------|
| Modify | `src/store/index.ts` | Ajouter `currentView` + `setCurrentView` |
| Modify | `src/App.tsx` | Supprimer `useState` local, utiliser le store |
| Create | `src/components/Search/CategoryChips.tsx` | Chips de filtre par catégorie |
| Create | `src/components/Search/SearchPreview.tsx` | Panel preview du résultat sélectionné |
| Modify | `src/components/Search/SearchResult.tsx` | Highlight de la query dans le nom |
| Modify | `src/components/Search/CommandPalette.tsx` | Layout deux colonnes, actions clavier étendues |

---

### Task 1: Migrer `currentView` vers le store

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Ajouter `currentView` à l'interface `AppStore`**

Dans `src/store/index.ts`, ajouter dans `interface AppStore` après `// Rules` :

```ts
  // Navigation
  currentView: string;
  setCurrentView: (view: string) => void;
```

- [ ] **Step 2: Initialiser dans `create`**

Dans `src/store/index.ts`, dans `create<AppStore>((set) => ({`, ajouter après le bloc `rules` :

```ts
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),
```

- [ ] **Step 3: Mettre à jour `App.tsx`**

Remplacer le contenu de `src/App.tsx` :

```tsx
import { useAppStore } from './store';
import { Dashboard } from './components/Dashboard';
import { Unsorted } from './components/Unsorted';
import { Explorer } from './components/Explorer';
import { CommandPalette } from './components/Search/CommandPalette';
import { AssistantOverlay } from './components/Assistant/AssistantOverlay';
import { Sidebar } from './components/layout/Sidebar';
import { TitleBar } from './components/layout/TitleBar';
import { useFileEvents } from './hooks/useFileEvents';
import { useKeyboard } from './hooks/useKeyboard';
import { PreferencesView } from './components/Preferences/PreferencesView';
import { RulesView } from './components/Rules';
import { HelpView } from './components/Help';
import { UndoToast } from './components/UndoToast';

function App() {
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  useFileEvents();
  useKeyboard();

  return (
    <div className="flex flex-col h-screen bg-bx-950 text-zinc-100 overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={currentView} onNavigate={setCurrentView} />
        <main className="flex-1 overflow-hidden">
          {currentView === 'dashboard'    && <Dashboard />}
          {currentView === 'explorer'     && <Explorer />}
          {currentView === 'unsorted'     && <Unsorted />}
          {currentView === 'preferences'  && <PreferencesView />}
          {currentView === 'rules'        && <RulesView />}
          {currentView === 'help'         && <HelpView />}
        </main>
      </div>
      <CommandPalette />
      <AssistantOverlay />
      <UndoToast />
    </div>
  );
}

export default App;
```

- [ ] **Step 4: Vérifier que l'app compile**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -30
```

Attendu : aucune erreur TypeScript.

- [ ] **Step 5: Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && git add src/store/index.ts src/App.tsx && git commit -m "refactor: migrate currentView to Zustand store"
```

---

### Task 2: Créer `CategoryChips`

**Files:**
- Create: `src/components/Search/CategoryChips.tsx`

- [ ] **Step 1: Créer le composant**

Créer `src/components/Search/CategoryChips.tsx` :

```tsx
import { FileText, Image, Music, Video, Archive, Code, LayoutGrid } from 'lucide-react';

interface Category {
  key: string | null;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }> | null;
}

const CATEGORIES: Category[] = [
  { key: null,       label: 'Tout',     Icon: LayoutGrid },
  { key: 'document', label: 'Document', Icon: FileText },
  { key: 'photo',    label: 'Photo',    Icon: Image },
  { key: 'music',    label: 'Musique',  Icon: Music },
  { key: 'video',    label: 'Vidéo',    Icon: Video },
  { key: 'archive',  label: 'Archive',  Icon: Archive },
  { key: 'code',     label: 'Code',     Icon: Code },
];

interface Props {
  active: string | null;
  onChange: (category: string | null) => void;
}

export function CategoryChips({ active, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-zinc-800 overflow-x-auto scrollbar-none">
      {CATEGORIES.map(({ key, label, Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key ?? 'all'}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0 ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
            }`}
          >
            {Icon && <Icon size={11} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier compilation**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -20
```

Attendu : aucune erreur.

- [ ] **Step 3: Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && git add src/components/Search/CategoryChips.tsx && git commit -m "feat: add CategoryChips component for search filter"
```

---

### Task 3: Créer `SearchPreview`

**Files:**
- Create: `src/components/Search/SearchPreview.tsx`

- [ ] **Step 1: Créer le composant**

Créer `src/components/Search/SearchPreview.tsx` :

```tsx
import { FileText, Image, Music, Video, Archive, Code, FolderOpen } from 'lucide-react';
import { SearchResult } from '../../store';

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  document: FileText,
  photo:    Image,
  music:    Music,
  video:    Video,
  archive:  Archive,
  code:     Code,
};

const CATEGORY_COLORS: Record<string, string> = {
  document: 'text-blue-400 bg-blue-900/30',
  photo:    'text-emerald-400 bg-emerald-900/30',
  music:    'text-purple-400 bg-purple-900/30',
  video:    'text-rose-400 bg-rose-900/30',
  archive:  'text-amber-400 bg-amber-900/30',
  code:     'text-cyan-400 bg-cyan-900/30',
};

interface Props {
  result: SearchResult;
  onOpenFinder: (path: string) => void;
  onNavigateExplorer: (result: SearchResult) => void;
  onCopyPath: (path: string) => void;
}

export function SearchPreview({ result, onOpenFinder, onNavigateExplorer, onCopyPath }: Props) {
  const Icon = ICONS[result.category] ?? FileText;
  const colorClass = CATEGORY_COLORS[result.category] ?? 'text-zinc-400 bg-zinc-800';

  return (
    <div className="flex flex-col h-full px-5 py-4 gap-4">
      {/* Icône + nom */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-zinc-800 rounded-lg shrink-0">
          <Icon size={20} className="text-zinc-300" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100 break-all leading-snug">{result.name}</p>
          {result.subcategory && (
            <p className="text-xs text-zinc-500 mt-0.5">{result.subcategory}</p>
          )}
        </div>
      </div>

      {/* Chemin */}
      <div className="flex items-start gap-2">
        <FolderOpen size={13} className="text-zinc-600 shrink-0 mt-0.5" />
        <p className="text-xs text-zinc-500 break-all leading-relaxed">{result.path}</p>
      </div>

      {/* Catégorie + année */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${colorClass}`}>
          {result.category}
        </span>
        {result.year > 0 && (
          <span className="text-[10px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
            {result.year}
          </span>
        )}
      </div>

      {/* Tags */}
      {result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.tags.map((tag) => (
            <span key={tag} className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => onOpenFinder(result.path)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          <span>Ouvrir dans Finder</span>
          <kbd className="text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded text-[10px]">↵</kbd>
        </button>
        <button
          onClick={() => onNavigateExplorer(result)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          <span>Voir dans Explorer</span>
          <kbd className="text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded text-[10px]">⌘↵</kbd>
        </button>
        <button
          onClick={() => onCopyPath(result.path)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          <span>Copier le chemin</span>
          <kbd className="text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded text-[10px]">⌥↵</kbd>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier compilation**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && git add src/components/Search/SearchPreview.tsx && git commit -m "feat: add SearchPreview panel component"
```

---

### Task 4: Ajouter le highlight dans `SearchResult.tsx`

**Files:**
- Modify: `src/components/Search/SearchResult.tsx`

- [ ] **Step 1: Réécrire `SearchResult.tsx` avec highlight**

```tsx
import { FileText, Image, Music, Video, Archive, Code } from 'lucide-react';
import { SearchResult as SR } from '../../store';

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  document: FileText,
  photo:    Image,
  music:    Music,
  video:    Video,
  archive:  Archive,
  code:     Code,
};

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="text-white font-semibold">
            {part}
          </strong>
        ) : (
          part
        )
      )}
    </>
  );
}

interface Props {
  result: SR;
  isSelected: boolean;
  query: string;
  onClick: () => void;
}

export function SearchResultItem({ result, isSelected, query, onClick }: Props) {
  const Icon = ICONS[result.category] ?? FileText;
  const relativePath = result.path.replace(/^.*\/Egestion\//, '');

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
      }`}
    >
      <Icon size={15} className={isSelected ? 'text-indigo-400' : 'text-zinc-500'} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-300 truncate">
          {highlightText(result.name, query)}
        </div>
        <div className="text-[10px] text-zinc-600 truncate mt-0.5">{relativePath}</div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Vérifier compilation**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && git add src/components/Search/SearchResult.tsx && git commit -m "feat: add query highlight in SearchResultItem"
```

---

### Task 5: Refondre `CommandPalette.tsx` — layout deux colonnes

**Files:**
- Modify: `src/components/Search/CommandPalette.tsx`

- [ ] **Step 1: Réécrire `CommandPalette.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search } from 'lucide-react';
import { useAppStore } from '../../store';
import { useSearch } from '../../hooks/useSearch';
import { SearchResultItem } from './SearchResult';
import { CategoryChips } from './CategoryChips';
import { SearchPreview } from './SearchPreview';
import type { SearchResult } from '../../store';

export function CommandPalette() {
  const {
    isSearchOpen, setSearchOpen,
    searchResults, setSearchResults,
    setCurrentView, setSelectedCategory, setSelectedFile,
  } = useAppStore();
  const { search } = useSearch();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      setQuery('');
      setSelectedIdx(0);
      setActiveCategory(null);
      search('', undefined);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchResults([]);
    }
  }, [isSearchOpen]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [searchResults.length]);

  useEffect(() => {
    search(query, activeCategory ?? undefined);
  }, [activeCategory]);

  const selectedResult: SearchResult | null = searchResults[selectedIdx] ?? null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setSearchOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedResult) {
      if (e.metaKey) {
        navigateToExplorer(selectedResult);
      } else if (e.altKey) {
        copyPath(selectedResult.path);
      } else {
        openFile(selectedResult.path);
      }
    }
  }

  async function openFile(path: string) {
    setSearchOpen(false);
    try {
      await invoke('open_in_finder', { path });
    } catch (err) {
      console.error('open_in_finder error:', err);
    }
  }

  function navigateToExplorer(result: SearchResult) {
    setSearchOpen(false);
    setCurrentView('explorer');
    setSelectedCategory(result.category);
    setSelectedFile(result.id);
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      // clipboard API may fail silently in Tauri webview
    }
    setSearchOpen(false);
  }

  if (!isSearchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm"
      onClick={() => setSearchOpen(false)}
    >
      <div
        className="w-[760px] bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col max-h-[560px]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <Search size={15} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              search(e.target.value, activeCategory ?? undefined);
            }}
            placeholder="Rechercher un fichier…"
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 text-sm outline-none"
          />
          <kbd className="text-xs text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">esc</kbd>
        </div>

        {/* Category chips */}
        <CategoryChips active={activeCategory} onChange={setActiveCategory} />

        {/* Body: two columns */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Results list */}
          <div className="w-[420px] overflow-y-auto border-r border-zinc-800 shrink-0">
            {searchResults.length === 0 && query.trim() !== '' ? (
              <div className="px-4 py-10 text-center text-sm text-zinc-600">Aucun résultat</div>
            ) : (
              searchResults.map((r, i) => (
                <SearchResultItem
                  key={r.id}
                  result={r}
                  isSelected={i === selectedIdx}
                  query={query}
                  onClick={() => setSelectedIdx(i)}
                />
              ))
            )}
          </div>

          {/* Preview panel */}
          <div className="flex-1 overflow-y-auto bg-zinc-900/50">
            {selectedResult ? (
              <SearchPreview
                result={selectedResult}
                onOpenFinder={openFile}
                onNavigateExplorer={navigateToExplorer}
                onCopyPath={copyPath}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-zinc-700">
                Sélectionner un résultat
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-800 flex gap-4 text-[10px] text-zinc-600 shrink-0">
          <span>↑↓ naviguer</span>
          <span>↵ Finder</span>
          <span>⌘↵ Explorer</span>
          <span>⌥↵ copier chemin</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier compilation TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1
```

Attendu : aucune erreur.

- [ ] **Step 3: Vérifier dans le navigateur**

Ouvrir http://localhost:1420 (ou relancer `npm run tauri dev`), appuyer sur ⌘K, vérifier :
- La palette s'ouvre en deux colonnes
- Les chips de catégorie filtrent les résultats
- La saisie filtre les résultats avec highlight
- ↑↓ navigue et met à jour le panel droit
- ⌘↵ ferme la palette et navigue vers l'Explorer
- ⌥↵ copie le chemin
- Esc ferme

- [ ] **Step 4: Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && git add src/components/Search/CommandPalette.tsx && git commit -m "feat: refonte CommandPalette deux colonnes avec preview et actions clavier"
```
