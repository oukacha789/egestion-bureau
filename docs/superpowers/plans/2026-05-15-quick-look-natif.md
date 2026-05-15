# Quick Look macOS natif Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ouvrir la fenêtre Quick Look macOS native pour n'importe quel fichier, via un bouton dans le panneau de prévisualisation et le raccourci clavier Espace.

**Architecture:** Commande Rust `open_quick_look` qui appelle `qlmanage -p <path>`. Côté frontend : `QuickLookButton` ajouté dans toutes les branches de `QuickLookPanel`, et listener `keydown` sur `Space` dans `Explorer`.

**Tech Stack:** Rust (`std::process::Command`), React 19, TypeScript, `@tauri-apps/api/core` (`invoke`), Lucide React (`Eye`).

---

## Fichiers impactés

| Action   | Fichier |
|----------|---------|
| Modifier | `src-tauri/src/commands/files.rs` |
| Modifier | `src-tauri/src/lib.rs` |
| Modifier | `src/components/Preview/QuickLookPanel.tsx` |
| Modifier | `src/components/Explorer/index.tsx` |

---

## Task 1 : Commande Rust `open_quick_look`

**Files:**
- Modify: `src-tauri/src/commands/files.rs`
- Modify: `src-tauri/src/lib.rs`

### Objectif

Ajouter une commande Tauri synchrone `open_quick_look(path: String)` qui lance `qlmanage -p <path>` via `std::process::Command::spawn()`. La commande retourne `Ok(())` dès que le processus est lancé (non-bloquant).

- [ ] **Step 1 : Écrire le test unitaire dans `files.rs`**

À la fin du bloc `#[cfg(test)]` existant dans `src-tauri/src/commands/files.rs` (avant le `}` fermant du module de test), ajouter :

```rust
    #[test]
    fn test_open_quick_look_valid_path_returns_ok() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "hello").unwrap();
        let result = open_quick_look(path.to_str().unwrap().to_string());
        assert!(result.is_ok());
    }

    #[test]
    fn test_open_quick_look_nonexistent_path_returns_ok() {
        // qlmanage spawns even for missing files — spawn() itself succeeds
        let result = open_quick_look("/tmp/this_file_does_not_exist_xyz.txt".to_string());
        assert!(result.is_ok());
    }
```

- [ ] **Step 2 : Vérifier que les tests échouent (fonction pas encore définie)**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo test open_quick_look 2>&1 | tail -10
```

Attendu : erreur de compilation `cannot find function open_quick_look`.

- [ ] **Step 3 : Implémenter `open_quick_look` dans `files.rs`**

Dans `src-tauri/src/commands/files.rs`, après la fonction `read_text_preview` (avant le bloc `#[cfg(test)]`), ajouter :

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

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo test open_quick_look 2>&1 | tail -10
```

Attendu : `2 passed`.

- [ ] **Step 5 : Enregistrer la commande dans `lib.rs`**

Dans `src-tauri/src/lib.rs`, dans la liste `tauri::generate_handler![...]`, ajouter `commands::open_quick_look,` après `commands::read_text_preview,` :

```rust
        .invoke_handler(tauri::generate_handler![
            // ... commandes existantes ...
            commands::read_text_preview,
            commands::open_quick_look,   // ← ajouter cette ligne
            commands::ask_assistant,
            // ...
        ])
```

- [ ] **Step 6 : Vérifier que le projet compile**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo build 2>&1 | grep "^error" | head -10
```

Attendu : aucune erreur.

- [ ] **Step 7 : Lancer tous les tests**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo test 2>&1 | grep -E "test result|FAILED"
```

Attendu : tous les tests passent.

- [ ] **Step 8 : Commit**

```bash
git add src-tauri/src/commands/files.rs src-tauri/src/lib.rs
git commit -m "feat(quick-look): add open_quick_look Rust command + tests"
```

---

## Task 2 : Bouton Quick Look dans `QuickLookPanel`

**Files:**
- Modify: `src/components/Preview/QuickLookPanel.tsx`

### Objectif

Ajouter un sous-composant `QuickLookButton` qui appelle `invoke('open_quick_look', { path })`. Modifier les 4 branches de rendu pour inclure ce bouton : image, PDF, texte, et fallback.

- [ ] **Step 1 : Ajouter `Eye` aux imports Lucide et `invoke` est déjà importé**

Dans `src/components/Preview/QuickLookPanel.tsx`, ligne 4, remplacer :

```tsx
import { FileQuestion } from 'lucide-react';
```

Par :

```tsx
import { FileQuestion, Eye } from 'lucide-react';
```

- [ ] **Step 2 : Ajouter le sous-composant `QuickLookButton` avant `QuickLookPanel`**

Après les constantes `IMAGE_EXTS`, `TEXT_EXTS` et la fonction `getExt` (avant la ligne `interface Props`), insérer :

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

- [ ] **Step 3 : Modifier la branche image pour inclure le bouton**

Remplacer le bloc `if (IMAGE_EXTS.has(ext))` (lignes 31-41) par :

```tsx
  if (IMAGE_EXTS.has(ext)) {
    return (
      <>
        <div className="h-48 flex items-center justify-center bg-zinc-900/50 rounded-lg overflow-hidden mt-3">
          <img
            src={convertFileSrc(path)}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <div className="mt-2 flex justify-center">
          <QuickLookButton path={path} />
        </div>
      </>
    );
  }
```

- [ ] **Step 4 : Modifier la branche PDF pour inclure le bouton**

Remplacer le bloc `if (ext === 'pdf')` (lignes 43-53) par :

```tsx
  if (ext === 'pdf') {
    return (
      <>
        <div className="h-48 mt-3 rounded-lg overflow-hidden border border-zinc-700">
          <iframe
            src={convertFileSrc(path)}
            className="w-full h-full"
            title="PDF preview"
          />
        </div>
        <div className="mt-2 flex justify-center">
          <QuickLookButton path={path} />
        </div>
      </>
    );
  }
```

- [ ] **Step 5 : Modifier la branche texte pour inclure le bouton**

Remplacer le bloc `if (TEXT_EXTS.has(ext) && textContent !== null)` (lignes 55-63) par :

```tsx
  if (TEXT_EXTS.has(ext) && textContent !== null) {
    return (
      <>
        <div className="mt-3 h-48 overflow-auto bg-zinc-900/50 rounded-lg border border-zinc-800 p-2">
          <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
            {textContent}
          </pre>
        </div>
        <div className="mt-2 flex justify-center">
          <QuickLookButton path={path} />
        </div>
      </>
    );
  }
```

- [ ] **Step 6 : Modifier la branche fallback pour remplacer par le bouton**

Remplacer le bloc `return` final (lignes 65-70) par :

```tsx
  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-3 bg-zinc-900/30 rounded-lg border border-zinc-800 py-6">
      <FileQuestion size={20} className="text-zinc-600" />
      <span className="text-xs text-zinc-600">Pas d'aperçu disponible</span>
      <QuickLookButton path={path} />
    </div>
  );
```

- [ ] **Step 7 : Vérifier la compilation TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 8 : Commit**

```bash
git add src/components/Preview/QuickLookPanel.tsx
git commit -m "feat(quick-look): add QuickLookButton in all preview branches"
```

---

## Task 3 : Raccourci clavier Espace dans l'Explorer

**Files:**
- Modify: `src/components/Explorer/index.tsx`

### Objectif

Ajouter un `useEffect` dans le composant `Explorer` qui écoute `keydown` sur `Space`. Quand un fichier est sélectionné (`fileMetadata` non-null) et que le focus n'est pas dans un input, appelle `invoke('open_quick_look', { path: fileMetadata.path })`.

- [ ] **Step 1 : Vérifier que `invoke` est importé dans `Explorer/index.tsx`**

`invoke` est déjà importé à la ligne 3 :
```tsx
import { invoke } from '@tauri-apps/api/core';
```
Rien à ajouter.

- [ ] **Step 2 : Ajouter le `useEffect` de raccourci Space dans `Explorer`**

Dans `src/components/Explorer/index.tsx`, après le `useEffect` de chargement des métadonnées (qui se termine à la ligne ~64, avant le `return (`), ajouter :

```tsx
  // Raccourci Space → Quick Look
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

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 4 : Test manuel**

Lance `npm run tauri dev`. Dans l'Explorer :
- Sélectionne un fichier image → le bouton "Aperçu rapide" apparaît sous l'image → clic → fenêtre Quick Look macOS s'ouvre
- Sélectionne un fichier `.docx` → la section fallback affiche le bouton "Aperçu rapide" → clic → Quick Look s'ouvre avec aperçu Word
- Sélectionne n'importe quel fichier, appuie sur `Space` → Quick Look s'ouvre
- Clique dans la recherche (input), appuie sur `Space` → rien ne se passe (pas de Quick Look)

- [ ] **Step 5 : Commit**

```bash
git add src/components/Explorer/index.tsx
git commit -m "feat(quick-look): Space shortcut opens native Quick Look in Explorer"
git push origin main
```
