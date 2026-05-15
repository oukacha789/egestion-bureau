# Undo Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher un toast en bas à droite après chaque organisation de fichier, permettant d'annuler l'action (ou le batch) en un clic.

**Architecture:** Nouveau composant `UndoToast` qui écoute l'event Tauri `file-organized`, accumule un batch d'`action_id`, démarre un timer de 8s au premier fichier, et appelle `perform_undo` pour chaque item au clic. Monté dans `App.tsx` au niveau root. Le store reçoit `removeActivities` pour retirer les items annulés du feed.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4, `@tauri-apps/api/event` (`listen`), `@tauri-apps/api/core` (`invoke`), Lucide React.

---

## Fichiers impactés

| Action  | Fichier |
|---------|---------|
| Modifier | `src/store/index.ts` |
| Créer   | `src/components/UndoToast/index.tsx` |
| Modifier | `src/index.css` |
| Modifier | `src/App.tsx` |

---

## Task 1 : Action `removeActivities` dans le store

**Files:**
- Modify: `src/store/index.ts`

### Objectif

Ajouter l'action `removeActivities(ids: string[])` qui filtre le tableau `activity` pour retirer les items annulés.

- [ ] **Step 1 : Ajouter `removeActivities` à l'interface `AppStore`**

Dans `src/store/index.ts`, dans l'interface `AppStore`, après la ligne `addActivity: (item: ActivityItem) => void;`, ajouter :

```ts
  removeActivities: (ids: string[]) => void;
```

- [ ] **Step 2 : Ajouter l'implémentation dans le store**

Dans `create<AppStore>((set) => ({ ... }))`, après `addActivity: (item) => ...`, ajouter :

```ts
  removeActivities: (ids) =>
    set((state) => ({
      activity: state.activity.filter((a) => !ids.includes(a.action_id)),
    })),
```

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): add removeActivities action"
```

---

## Task 2 : Composant `UndoToast`

**Files:**
- Create: `src/components/UndoToast/index.tsx`
- Modify: `src/index.css`

### Objectif

Composant monté globalement qui :
1. Écoute l'event Tauri `file-organized`
2. Accumule un batch (`actionId`, `name`, `category`)
3. Démarre un timer de 8s au premier item — ne se remet pas à zéro
4. Affiche le message (singulier ou "N fichiers organisés") avec un bouton Annuler
5. Au clic : appelle `perform_undo` pour chaque `actionId`, retire du store, ferme

- [ ] **Step 1 : Ajouter `@keyframes shrink` dans `src/index.css`**

Dans `src/index.css`, à la fin du fichier, ajouter :

```css
@keyframes shrink {
  from { width: 100%; }
  to   { width: 0%;   }
}
```

- [ ] **Step 2 : Créer `src/components/UndoToast/index.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Undo2, X } from 'lucide-react';
import { useAppStore } from '../../store';

interface BatchItem {
  actionId: string;
  name: string;
  category: string;
}

export function UndoToast() {
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const removeActivities = useAppStore((s) => s.removeActivities);

  const dismiss = () => {
    setVisible(false);
    setBatch([]);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleUndo = async () => {
    const ids = batch.map((b) => b.actionId);
    for (const actionId of ids) {
      try {
        await invoke('perform_undo', { actionId });
      } catch (e) {
        console.error('Undo failed:', e);
      }
    }
    removeActivities(ids);
    dismiss();
  };

  useEffect(() => {
    type Payload = { action_id: string; name: string; category: string };
    const unlistenPromise = listen<Payload>('file-organized', (event) => {
      const { action_id, name, category } = event.payload;
      const item: BatchItem = { actionId: action_id, name, category };

      setBatch((prev) => [...prev, item]);
      setVisible(true);

      if (timerRef.current === null) {
        timerRef.current = window.setTimeout(() => {
          setVisible(false);
          setBatch([]);
          timerRef.current = null;
        }, 8000);
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible || batch.length === 0) return null;

  const isBatch = batch.length > 1;
  const message = isBatch
    ? `${batch.length} fichiers organisés`
    : `${batch[0].name} → ${batch[0].category}`;
  const btnLabel = isBatch ? 'Annuler tout' : 'Annuler';

  return (
    <div className="fixed bottom-5 right-5 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden min-w-[260px] max-w-xs">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-zinc-500 mb-0.5 uppercase tracking-wider">
            {isBatch ? 'Fichiers organisés' : 'Fichier organisé'}
          </p>
          <p className="text-sm text-zinc-100 font-medium truncate">{message}</p>
        </div>
        <button
          onClick={handleUndo}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-600 text-amber-400 text-xs font-semibold rounded-lg hover:bg-zinc-700 transition-colors whitespace-nowrap flex-shrink-0"
        >
          <Undo2 size={11} />
          {btnLabel}
        </button>
        <button
          onClick={dismiss}
          className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      </div>
      <div className="h-0.5 bg-zinc-800">
        <div
          className="h-full bg-amber-500"
          style={{ animation: 'shrink 8s linear forwards' }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/components/UndoToast/index.tsx src/index.css
git commit -m "feat(undo-toast): composant toast — batch, timer 8s, annulation"
```

---

## Task 3 : Wiring dans `App.tsx`

**Files:**
- Modify: `src/App.tsx`

### Objectif

Monter `<UndoToast />` au niveau root de l'app, en dehors de tout routing conditionnel, pour qu'il soit actif quelle que soit la vue.

- [ ] **Step 1 : Ajouter l'import de `UndoToast` dans `App.tsx`**

Dans `src/App.tsx`, après `import { RulesView } from './components/Rules';`, ajouter :

```tsx
import { UndoToast } from './components/UndoToast';
```

- [ ] **Step 2 : Ajouter `<UndoToast />` dans le JSX**

Dans la fonction `App()`, après `<AssistantOverlay />` et avant `</div>`, ajouter :

```tsx
      <UndoToast />
```

Le JSX final ressemble à :

```tsx
  return (
    <div className="flex h-screen bg-bx-950 text-zinc-100 overflow-hidden">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />
      <main className="flex-1 overflow-hidden">
        {currentView === 'dashboard'    && <Dashboard />}
        {currentView === 'explorer'     && <Explorer />}
        {currentView === 'unsorted'     && <Unsorted />}
        {currentView === 'preferences'  && <PreferencesView />}
        {currentView === 'rules'        && <RulesView />}
      </main>
      <CommandPalette />
      <AssistantOverlay />
      <UndoToast />
    </div>
  );
```

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 4 : Test manuel**

Lance `npm run tauri dev`. Ajoute un dossier surveillé contenant des fichiers. Vérifie :
- Dès qu'un fichier est organisé → le toast apparaît en bas à droite avec "nom → catégorie"
- Si plusieurs fichiers arrivent dans les 8s → le message passe à "N fichiers organisés" et le bouton à "Annuler tout"
- La barre ambre en bas se réduit sur 8s puis le toast disparaît
- Clic "Annuler" → le fichier est remis à sa place, l'item disparaît du feed d'activité, le toast se ferme
- Clic ✕ → le toast se ferme sans annuler

- [ ] **Step 5 : Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): monter UndoToast au niveau root"
git push origin main
```
