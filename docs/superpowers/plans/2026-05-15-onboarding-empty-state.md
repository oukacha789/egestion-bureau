# Onboarding — État vide (0 fichiers indexés) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher un écran d'onboarding split (CTA + valeur produit) à la place du dashboard quand 0 fichiers sont indexés, avec transition vers un état "indexation en cours" après ajout du dossier.

**Architecture:** Nouveau composant `OnboardingScreen` avec deux états internes (`idle` / `indexing`). Le `Dashboard` rend conditionnellement ce composant si `stats.total_files === 0`. La sortie est automatique via le store Zustand dès que le premier fichier est indexé.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4, `@tauri-apps/api/core` (`invoke`), `@tauri-apps/plugin-dialog` (`open`), Lucide React.

---

## Fichiers impactés

| Action | Fichier |
|--------|---------|
| Créer  | `src/components/Onboarding/index.tsx` |
| Modifier | `src/components/Dashboard/index.tsx` |

---

## Task 1 : Composant `OnboardingScreen`

**Files:**
- Create: `src/components/Onboarding/index.tsx`

### Objectif

Deux états visuels :
- **`idle`** : layout split — gauche (icône + CTA "Ajouter un dossier") / droite (liste des 4 fonctionnalités)
- **`indexing`** : écran centré avec spinner + message + chemin du dossier ajouté

La transition `idle → indexing` se fait au clic du CTA après succès de `add_watch_dir`. La sortie de `indexing` est gérée par le parent (Dashboard) qui démontera ce composant dès que `stats.total_files > 0`.

- [ ] **Step 1 : Créer `src/components/Onboarding/index.tsx`**

```tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store';

type Phase = 'idle' | 'indexing';

export function OnboardingScreen() {
  const { setWatchedDirs } = useAppStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [addedDir, setAddedDir] = useState<string>('');
  const [loading, setLoading] = useState(false);

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
    } catch (err) {
      console.error('add_watch_dir error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (phase === 'indexing') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <Loader2 size={28} className="text-amber-400 animate-spin" />
        <div>
          <p className="text-sm font-semibold text-zinc-100 mb-1">
            eGestion surveille votre dossier…
          </p>
          <p className="text-xs text-zinc-500">
            Les fichiers seront détectés et classés automatiquement.
          </p>
        </div>
        {addedDir && (
          <p className="text-[10px] text-zinc-600 font-mono truncate max-w-xs">
            {addedDir}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex gap-10 max-w-lg w-full">

        {/* Gauche — action principale */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-900/20 border border-amber-700/30 flex items-center justify-center">
            <FolderOpen size={24} className="text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100 mb-1">
              Aucun fichier indexé
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Ajoute un dossier à surveiller<br />pour commencer.
            </p>
          </div>
          <button
            onClick={handleAddFolder}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 text-xs font-semibold rounded-lg transition-colors"
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              '+'
            )}
            Ajouter un dossier
          </button>
        </div>

        {/* Séparateur */}
        <div className="w-px bg-bx-800 self-stretch" />

        {/* Droite — valeur produit */}
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

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/components/Onboarding/index.tsx
git commit -m "feat(onboarding): OnboardingScreen — états idle + indexing"
```

---

## Task 2 : Intégration dans Dashboard

**Files:**
- Modify: `src/components/Dashboard/index.tsx`

### Objectif

Rendre `<OnboardingScreen />` à la place du dashboard complet quand `stats.total_files === 0`. La condition est évaluée directement depuis le store Zustand ; aucune prop à passer.

- [ ] **Step 1 : Ajouter l'import de `OnboardingScreen` dans Dashboard**

Dans `src/components/Dashboard/index.tsx`, ajouter l'import après les imports existants :

```tsx
import { OnboardingScreen } from '../Onboarding';
```

- [ ] **Step 2 : Ajouter le rendu conditionnel au début de la fonction `Dashboard`**

Dans la fonction `Dashboard()`, ajouter juste après la ligne `const { stats, isWatching } = useAppStore();` :

```tsx
  if (stats.total_files === 0) {
    return <OnboardingScreen />;
  }
```

Le reste de la fonction (`return (...)`) reste intact.

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 4 : Vérification visuelle dans l'app**

Lance `npm run tauri dev`. Ouvre l'app :
- Si aucun fichier n'est indexé → l'écran d'onboarding doit s'afficher (layout split)
- Clique "+ Ajouter un dossier" → sélecteur natif s'ouvre
- Sélectionne un dossier → l'écran passe en état "indexation en cours" (spinner + chemin)
- Dès qu'un fichier est détecté → le dashboard normal s'affiche automatiquement

Si des fichiers existent déjà en base → la vue dashboard normale s'affiche directement (pas de régression).

- [ ] **Step 5 : Commit**

```bash
git add src/components/Dashboard/index.tsx
git commit -m "feat(dashboard): afficher OnboardingScreen quand 0 fichiers indexés"
```
