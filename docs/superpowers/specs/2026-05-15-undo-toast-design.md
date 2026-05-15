# Undo Toast — Visible dans le Dashboard

**Date :** 2026-05-15
**Statut :** Approuvé

## Contexte

Le feed d'activité affiche déjà un bouton "annuler" par item au hover. Ce comportement est invisible pour l'utilisateur qui ne consulte pas l'onglet Dashboard au moment où un fichier est organisé. Cette spec ajoute un toast visible en bas à droite qui apparaît automatiquement après chaque organisation de fichier, permettant une annulation immédiate sans naviguer vers le feed.

## Comportement

### Déclenchement

Le toast apparaît dès que l'event Tauri `file-organized` est reçu (un fichier vient d'être déplacé par le pipeline). Il n'apparaît pas pour les doublons (`file-duplicate`).

### Batch

Si plusieurs events `file-organized` arrivent pendant que le toast est visible, le message se met à jour :

- 1 fichier : `"rapport.pdf → Documents"`
- 2+ fichiers : `"4 fichiers organisés"`

Le bouton passe de "↩ Annuler" à "↩ Annuler tout".

Le timer de 8 secondes démarre au premier fichier du batch et **ne se remet pas à zéro** quand des fichiers supplémentaires arrivent.

### Timer

Barre de progression animée CSS en bas du toast (ambre, 100% → 0% en 8s). À l'expiration, le toast disparaît sans effet.

### Annulation

Au clic sur "Annuler" / "Annuler tout" :
1. Appel séquentiel de `invoke('perform_undo', { actionId })` pour chaque `action_id` du batch
2. Retrait des items annulés du feed d'activité via `removeActivities(ids)` dans le store
3. Fermeture du toast

Si `perform_undo` échoue pour un item, les autres sont quand même tentés (best-effort). Pas de message d'erreur visible.

## Architecture

### Nouveau composant : `src/components/UndoToast/index.tsx`

**Props :** aucune

**État local :**
```ts
interface BatchItem {
  actionId: string;
  name: string;
  category: string;
}
type ToastState = 'hidden' | 'visible';
```

**Logique :**
- `useEffect` → `listen('file-organized', handler)` au montage, `unlisten` au démontage
- Handler : si toast caché → nouveau batch, démarrer timer. Si toast visible → ajouter au batch, laisser le timer en cours.
- Timer : `setTimeout(8000)` stocké dans un ref, nettoyé à chaque fermeture ou clic
- Animation CSS : `@keyframes` sur `width` de 100% à 0% en 8s linéaire

**Rendu :**
```tsx
// Position fixe : bottom-5 right-5, z-50
// Fond : bg-zinc-900, border border-zinc-700, rounded-xl, shadow-xl
// Corps : label "Fichier(s) organisé(s)" + message principal + bouton ambre
// Barre : div absolue en bas, bg-amber-500, animation CSS
```

### Modification `src/App.tsx`

Ajouter `<UndoToast />` dans le JSX root, en dehors de tout layout conditionnel, pour qu'il soit rendu quelle que soit la vue active.

### Modification `src/store/index.ts`

Ajouter l'action `removeActivities` :

```ts
removeActivities: (ids: string[]) =>
  set((state) => ({
    activity: state.activity.filter((a) => !ids.includes(a.action_id)),
  })),
```

Exposer aussi dans l'interface `AppStore`.

## Payload de l'event `file-organized`

Le `FileOrganizedPayload` Rust (déjà sérialisé) contient :
```ts
{
  action_id: string;
  file_id: string;
  name: string;
  path_before: string;
  path_after: string;
  category: string;
}
```

Le composant utilise uniquement `action_id`, `name`, et `category`.

## Hors scope

- Undo pour les doublons (`file-duplicate`)
- Redo (réappliquer après annulation)
- Toast depuis des vues autres que le Dashboard
- Persistance du batch si l'app est rechargée pendant les 8s
- Message d'erreur si `perform_undo` échoue
