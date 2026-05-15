# Onboarding — État vide (0 fichiers indexés)

**Date :** 2026-05-15
**Statut :** Approuvé

## Contexte

Quand l'utilisateur lance eGestion pour la première fois (ou sans dossier configuré), le dashboard affiche des stats à 0 et une activité vide. Aucun guidage n'indique quoi faire. Cette spec décrit un écran d'onboarding conditionnel qui remplace le dashboard dans ce cas.

## Comportement

Le dashboard rend `<OnboardingScreen />` si `stats.total_files === 0`. Dès que `stats.total_files > 0` (mis à jour via le store Zustand), le dashboard bascule vers sa vue normale — sans action supplémentaire.

L'écran d'onboarding a deux états internes :

### État `idle` — aucun dossier configuré

Layout split horizontal :

**Moitié gauche — action principale :**
- Icône dossier (Lucide `FolderOpen`, couleur ambre)
- Titre : "Aucun fichier indexé"
- Sous-titre : "Ajoute un dossier à surveiller pour commencer."
- Bouton CTA : `+ Ajouter un dossier` (amber, pleine largeur relative)
  - Au clic : ouvre le sélecteur de dossier natif via `open({ directory: true })` de `@tauri-apps/plugin-dialog`
  - Si l'utilisateur sélectionne un dossier : appelle `invoke('add_watch_dir', { path })`, met à jour le store (`addWatchDir`), passe en état `indexing`
  - Si l'utilisateur annule : rien

**Moitié droite — valeur produit :**
- Label "Ce que tu pourras faire" (uppercase, zinc-600)
- 4 lignes : icône emoji + texte zinc-400
  - 🔍 Recherche instantanée
  - 🏷 Tags automatiques
  - 📊 Organisation intelligente
  - 🗂 Détection de doublons

### État `indexing` — dossier ajouté, 0 fichier encore indexé

Layout centré :
- Spinner animé (CSS pulse ou rotate, couleur ambre)
- Titre : "eGestion surveille votre dossier…"
- Sous-titre : "Les fichiers seront détectés et classés automatiquement."
- Texte secondaire : chemin du dossier ajouté (zinc-600, font-mono, tronqué)

La sortie de cet état est automatique : dès que `stats.total_files > 0`, le composant parent (Dashboard) bascule vers la vue normale.

## Architecture

### Nouveau composant

**`src/components/Onboarding/index.tsx`**
- Props : aucune (lit `watchedDirs` depuis le store pour afficher le chemin en état `indexing`)
- État local : `phase: 'idle' | 'indexing'`
- Dépendances :
  - `open` de `@tauri-apps/plugin-dialog`
  - `invoke('add_watch_dir', { path })` de `@tauri-apps/api/core`
  - `useAppStore` → `watchedDirs`, `addWatchDir`

### Modification Dashboard

**`src/components/Dashboard/index.tsx`**
- Condition : `if (stats.total_files === 0)` → `return <OnboardingScreen />`
- Sinon : vue normale inchangée

La condition est évaluée depuis `stats.total_files` déjà présent dans le store. Aucune prop à passer à `OnboardingScreen`.

## Données et store

Tous les éléments nécessaires sont déjà présents :
- `stats.total_files` — condition de bascule (store, mis à jour par les events Tauri)
- `watchedDirs` / `addWatchDir` — gestion des dossiers (store)
- `add_watch_dir` — commande Tauri existante
- `@tauri-apps/plugin-dialog` — déjà dans les dépendances (`tauri_plugin_dialog`)

## Hors scope

- Animation de transition entre onboarding et dashboard (fade-in) : non requis pour cette version
- Possibilité d'ajouter plusieurs dossiers depuis l'écran d'onboarding : l'utilisateur peut en ajouter d'autres depuis la sidebar après l'onboarding
- Onboarding multi-étapes numérotées : rejeté au profit du split layout
