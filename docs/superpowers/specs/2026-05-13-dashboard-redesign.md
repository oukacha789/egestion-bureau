# Dashboard Redesign — Spec

**Date:** 2026-05-13  
**Status:** Approuvé

## Contexte

Le Dashboard actuel utilise un système de 2 onglets (Aperçu / Activité) et une grille 2×2 de stat-cards. L'objectif est de passer à un layout plus lisible : hero section en haut, stats condensées en ligne, feed d'activité unique sans onglets.

## Décisions validées

| Question | Choix |
|----------|-------|
| Direction globale | B — Header hero + stats condensées |
| Style du hero | B — Bonjour + date + actions rapides |
| Tab system | Supprimé — page unique scrollable |

## Nouveau layout

```
┌─────────────────────────────────────────────┐
│ Topbar : "Dashboard"          [Rapport][CSV] │
├─────────────────────────────────────────────┤
│  Hero : Bonjour 👋                          │
│  ● Surveillance active · Mercredi 13 mai    │
│  [████████████░░░░] 75% organisés · obj 90% │
├─────────────────────────────────────────────┤
│  [Indexés][Organisés][Doublons][Taux d'org] │
│   4 cartes en ligne, fond bx-900            │
├─────────────────────────────────────────────┤
│  ACTIVITÉ RÉCENTE                           │
│  ┌────────────────────────────────────────┐ │
│  │ 📄 rapport.pdf   → Documents/  2 min  │ │
│  │ 🖼 vacances.jpg  → Photos/2024  8 min  │ │
│  │ ...                                    │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Composants à modifier

### `Dashboard/index.tsx`

- **Supprimer** l'état `tab` et le composant `TabPill`
- **Topbar** : garder le statut dot + label à gauche ; déplacer Rapport/CSV à droite sous forme de `btn btn-ghost`
- **Hero** (nouveau bloc) :
  - Titre "Bonjour 👋" + méta (statut actif + date du jour)
  - Barre de progression : `orgRate` sur fond `bx-950`, gradient amber
  - Label "X% organisés · objectif 90%"
  - Background `gradient(135deg, bx-800 → bx-900 → bx-950)`, border `bx-700`, `rounded-xl`
- **Stats row** : passer de `grid-cols-2` à `grid-cols-4`, réduire padding et taille de valeur (`text-2xl` → `text-xl` ou `text-2xl`)
  - Ajouter une ligne `sub` sur chaque carte (ex: "↑ +12 aujourd'hui", "à traiter", "objectif : 90%")
- **Feed** : retirer le bloc conditionnel `tab === 'activite'` ; garder `ActivityFeed` sans `limit`, directement sous les stats

### `Dashboard/ActivityFeed.tsx`

- Retirer la prop `limit` ou la garder optionnelle (pas de changement fonctionnel)
- Ajouter un champ timestamp/relatif dans `ActivityRow` si `item.timestamp` est disponible dans le store

### `layout/Sidebar.tsx`

- Aucun changement

### `index.css`

- Aucun changement (les couleurs bx-* sont déjà définies)

## Ce qui ne change pas

- Le thème bordeaux (`bx-*` + zinc)
- La logique Tauri (`invoke`, `useFileEvents`, `useAppStore`)
- L'Explorer et Unsorted
- La CommandPalette

## Contraintes

- Les appels Tauri (`invoke`, `listen`) crashent en mode browser ordinaire — c'est normal, tester dans l'app Tauri (`npm run tauri dev`) ou ignorer les erreurs console en dev Vite.
- Ne pas introduire de dépendances npm supplémentaires.
