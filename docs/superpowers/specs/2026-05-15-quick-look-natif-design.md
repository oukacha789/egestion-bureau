# Quick Look macOS natif

**Date :** 2026-05-15
**Statut :** Approuvé

## Contexte

Le panneau d'aperçu dans l'Explorer (`QuickLookPanel`) supporte images, PDF et texte. Pour tous les autres types (vidéo, audio, Office, archives…), il affiche "Pas d'aperçu disponible". Cette spec délègue l'aperçu au système macOS natif via `qlmanage -p`, qui supporte la totalité des types de fichiers.

## Comportement

Deux déclencheurs ouvrent la fenêtre Quick Look macOS :

### Bouton "Quick Look"

Dans `QuickLookPanel`, la section fallback ("Pas d'aperçu disponible") est remplacée par un bouton "Quick Look". Pour les types déjà prévisualisés dans l'app (images, PDF, texte), un bouton identique est ajouté sous l'aperçu existant.

Le bouton :
- Label : `Aperçu rapide` avec icône `Eye` (Lucide)
- Appelle `invoke('open_quick_look', { path })` au clic
- Désactivé si le path est vide

### Raccourci clavier Espace

Dans l'Explorer (`src/components/Explorer/index.tsx`), un listener `keydown` sur `Space` :
- Déclenche Quick Look si `fileMetadata` est non-null (un fichier est sélectionné)
- Ignoré si le focus est dans un `<input>` ou `<textarea>` (`e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement`)
- Appelle `invoke('open_quick_look', { path: fileMetadata.path })`
- `e.preventDefault()` pour éviter le scroll de page

## Architecture

### Nouveau command Rust : `open_quick_look`

**Fichier :** `src-tauri/src/commands/files.rs`

```rust
#[tauri::command]
pub fn open_quick_look(path: String) -> Result<(), String> {
    std::process::Command::new("qlmanage")
        .arg("-p")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
```

**Enregistrement dans `src-tauri/src/lib.rs`** — ajouter `commands::open_quick_look` dans la liste `tauri::generate_handler!`.

### Modifications Frontend

**`src/components/Preview/QuickLookPanel.tsx`**

Remplacer le bloc fallback actuel (lignes 65-70) par :

```tsx
return (
  <div className="mt-3 flex flex-col items-center justify-center gap-2 bg-zinc-900/30 rounded-lg border border-zinc-800 py-5">
    <FileQuestion size={20} className="text-zinc-600" />
    <span className="text-xs text-zinc-600">Pas d'aperçu disponible</span>
    <QuickLookButton path={path} />
  </div>
);
```

Et ajouter `<QuickLookButton path={path} />` à la fin de chaque branche de rendu supportée (image, PDF, texte).

`QuickLookButton` est un sous-composant local dans le même fichier :

```tsx
function QuickLookButton({ path }: { path: string }) {
  const handleClick = () => invoke('open_quick_look', { path });
  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
    >
      <Eye size={11} />
      Aperçu rapide
    </button>
  );
}
```

**`src/components/Explorer/index.tsx`**

Ajouter un `useEffect` avec un listener `keydown` sur `Space` :

```tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== ' ') return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!fileMetadata) return;
    e.preventDefault();
    invoke('open_quick_look', { path: fileMetadata.path });
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [fileMetadata]);
```

## Dépendances

Aucune nouvelle dépendance npm ou crate. `std::process::Command` est dans la stdlib Rust. `qlmanage` est présent sur tous les Macs.

## Hors scope

- Aperçu in-app pour vidéo, audio, Office
- Syntax highlighting dans l'aperçu texte
- Raccourci Space dans d'autres vues (Dashboard, Unsorted)
- Support Windows/Linux (eGestion est macOS uniquement)
