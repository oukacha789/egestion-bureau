# ⌘K Search — Refonte CommandPalette (deux colonnes)

## Contexte
L'infrastructure existe : `useKeyboard` → `CommandPalette` → `useSearch` → Tauri `search_files` → Tantivy. Le raccourci fonctionne. Ce spec couvre la refonte UX de la palette.

## Layout

Palette modale 760px, deux colonnes :
- **Gauche (420px)** : input de recherche + chips catégorie + liste de résultats scrollable
- **Droite (340px)** : panel de preview du résultat sélectionné (nom, chemin, tags, année, taille + actions)

Overlay identique à l'actuel (backdrop blur, fermeture au clic extérieur).

## Composants

### `CommandPalette.tsx` (refonte)
- State local : `query`, `selectedIdx`, `activeCategory` (null = tout)
- Passe `activeCategory` à `useSearch`
- Keyboard : ↑↓ naviguer, ↵ ouvrir Finder, ⌘↵ naviguer Explorer, ⌥↵ copier chemin, Esc fermer

### `CategoryChips.tsx` (nouveau)
- Chips horizontaux : Tout + une chip par catégorie (document, photo, music, video, archive, code)
- Icônes lucide-react, highlight chip active

### `SearchResultItem.tsx` (amélioration)
- Highlight des tokens de la query dans le nom du fichier (split + bold)
- Affiche nom + chemin relatif (identique à l'actuel)

### `SearchPreview.tsx` (nouveau)
- Reçoit le `SearchResult` sélectionné
- Affiche : nom, chemin complet, badge catégorie, subcategory, tags (pills), année, taille N/A (non dans SearchResult)
- Actions : boutons ↵ Finder / ⌘↵ Explorer / ⌥↵ Copier

## Data flow

```
useKeyboard ─⌘K─► setSearchOpen(true)
CommandPalette
  └─ useSearch(query, activeCategory) ──► invoke('search_files')
                                               └─► Tantivy / DB
  └─ searchResults (store)
```

Pour "naviguer dans Explorer" : appelle `setCurrentView('explorer')` + `setSelectedCategory(result.category)` + `setSelectedFile(result.id)`. Nécessite d'exposer `setCurrentView` — passé en prop depuis `App.tsx` ou via store (ajouter `setCurrentView` au store).

## Highlight

```ts
function highlight(text: string, query: string): ReactNode {
  // split text on query tokens, wrap matches in <strong>
}
```

## Keyboard shortcuts (résumé)

| Touche | Action |
|--------|--------|
| ↑ / ↓ | Naviguer |
| ↵ | Ouvrir dans Finder |
| ⌘↵ | Naviguer vers le fichier dans Explorer |
| ⌥↵ | Copier le chemin |
| Esc | Fermer |

## Changements store

Ajouter à `AppStore` :
- `currentView: string` + `setCurrentView: (v: string) => void`
(actuellement géré en state local dans App.tsx — le migrer vers le store)
