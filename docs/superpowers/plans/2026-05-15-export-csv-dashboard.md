# Export CSV Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activer le bouton "CSV" du Dashboard pour télécharger l'historique complet des fichiers organisés (nom, chemin source, destination, catégorie, date).

**Architecture:** Nouvelle fonction Rust `build_history_csv` dans `engine/export.rs` — requête `actions JOIN files` filtrée sur `action_type = 'move'` et `undone_at IS NULL`. Nouveau Tauri command `export_history_csv` (sans paramètres) enregistré dans `lib.rs`. Le bouton Dashboard appelle `invoke('export_history_csv')` et déclenche un téléchargement blob.

**Tech Stack:** Rust (`sqlx`, `chrono`, `anyhow`), React 19, TypeScript, `@tauri-apps/api/core` (`invoke`).

---

## Fichiers impactés

| Action   | Fichier |
|----------|---------|
| Modifier | `src-tauri/src/engine/export.rs` |
| Modifier | `src-tauri/src/commands/export.rs` |
| Modifier | `src-tauri/src/lib.rs` |
| Modifier | `src/components/Dashboard/index.tsx` |

---

## Task 1 : Fonction `build_history_csv` dans `engine/export.rs`

**Files:**
- Modify: `src-tauri/src/engine/export.rs`

### Objectif

Ajouter la fonction `build_history_csv(pool)` qui joint `actions` et `files`, filtre les actions de déplacement non annulées, et retourne un CSV avec l'en-tête `nom,chemin_source,destination,categorie,date`. La date est formatée `YYYY-MM-DD`.

---

- [ ] **Step 1 : Ajouter les tests unitaires dans `export.rs`**

À la fin du bloc `#[cfg(test)]` existant (avant le `}` fermant du module de test), ajouter :

```rust
    #[tokio::test]
    async fn test_build_history_csv_has_header() {
        let pool = make_db().await;
        let csv = build_history_csv(&pool).await.unwrap();
        assert!(csv.starts_with("nom,chemin_source,destination,categorie,date\n"));
    }

    #[tokio::test]
    async fn test_build_history_csv_empty_db_only_header() {
        let pool = make_db().await;
        let csv = build_history_csv(&pool).await.unwrap();
        assert_eq!(csv.lines().count(), 1);
    }

    #[tokio::test]
    async fn test_build_history_csv_with_data_returns_row() {
        let pool = make_db().await;
        sqlx::query(
            "INSERT INTO files (id, path, name, size_bytes, hash_sha256, created_at, modified_at, indexed_at, category)
             VALUES ('f1', '/dest/rapport.pdf', 'rapport.pdf', 100, 'hash1', 0, 0, 0, 'Finances')"
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO actions (id, file_id, action_type, path_before, path_after, executed_at)
             VALUES ('a1', 'f1', 'move', '/downloads/rapport.pdf', '/dest/rapport.pdf', 1715000000)"
        )
        .execute(&pool)
        .await
        .unwrap();

        let csv = build_history_csv(&pool).await.unwrap();
        assert_eq!(csv.lines().count(), 2);
        assert!(csv.contains("rapport.pdf"));
        assert!(csv.contains("/downloads/rapport.pdf"));
        assert!(csv.contains("/dest/rapport.pdf"));
        assert!(csv.contains("Finances"));
    }

    #[tokio::test]
    async fn test_build_history_csv_excludes_undone() {
        let pool = make_db().await;
        sqlx::query(
            "INSERT INTO files (id, path, name, size_bytes, hash_sha256, created_at, modified_at, indexed_at)
             VALUES ('f2', '/dest/note.txt', 'note.txt', 50, 'hash2', 0, 0, 0)"
        )
        .execute(&pool)
        .await
        .unwrap();
        // undone_at IS NOT NULL → doit être exclu
        sqlx::query(
            "INSERT INTO actions (id, file_id, action_type, path_before, path_after, executed_at, undone_at)
             VALUES ('a2', 'f2', 'move', '/src/note.txt', '/dest/note.txt', 1715000000, 1715001000)"
        )
        .execute(&pool)
        .await
        .unwrap();

        let csv = build_history_csv(&pool).await.unwrap();
        assert_eq!(csv.lines().count(), 1); // uniquement l'en-tête
    }
```

- [ ] **Step 2 : Vérifier que les tests échouent (fonction pas encore définie)**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo test build_history_csv 2>&1 | tail -10
```

Attendu : erreur de compilation `cannot find function build_history_csv`.

- [ ] **Step 3 : Implémenter `build_history_csv` dans `engine/export.rs`**

Après la fonction `build_csv` (avant la fonction `csv_escape`), ajouter :

```rust
pub async fn build_history_csv(pool: &SqlitePool) -> Result<String> {
    let rows: Vec<(String, Option<String>, Option<String>, Option<String>, i64)> =
        sqlx::query_as(
            "SELECT f.name, a.path_before, a.path_after, f.category, a.executed_at \
             FROM actions a \
             JOIN files f ON a.file_id = f.id \
             WHERE a.action_type = 'move' AND a.undone_at IS NULL \
             ORDER BY a.executed_at DESC \
             LIMIT 10000",
        )
        .fetch_all(pool)
        .await?;

    let mut csv = String::from("nom,chemin_source,destination,categorie,date\n");
    for (name, path_before, path_after, category, executed_at) in &rows {
        let date = DateTime::from_timestamp(*executed_at, 0)
            .unwrap_or(DateTime::UNIX_EPOCH)
            .format("%Y-%m-%d")
            .to_string();
        csv.push_str(&format!(
            "{},{},{},{},{}\n",
            csv_escape(name),
            csv_escape(path_before.as_deref().unwrap_or("")),
            csv_escape(path_after.as_deref().unwrap_or("")),
            csv_escape(category.as_deref().unwrap_or("")),
            date,
        ));
    }
    Ok(csv)
}
```

> Note : `DateTime`, `Utc`, et `csv_escape` sont déjà disponibles dans ce fichier — pas d'import supplémentaire.

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo test build_history_csv 2>&1 | tail -10
```

Attendu : `4 passed`.

- [ ] **Step 5 : Lancer tous les tests pour détecter les régressions**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo test 2>&1 | grep -E "test result|FAILED"
```

Attendu : tous les tests passent, aucun FAILED.

- [ ] **Step 6 : Commit**

```bash
git add src-tauri/src/engine/export.rs
git commit -m "feat(export): add build_history_csv — actions JOIN files, move + non-undone"
```

---

## Task 2 : Command Tauri `export_history_csv` + enregistrement

**Files:**
- Modify: `src-tauri/src/commands/export.rs`
- Modify: `src-tauri/src/lib.rs`

### Objectif

Exposer `build_history_csv` comme commande Tauri sans paramètres, puis l'enregistrer dans `lib.rs`.

---

- [ ] **Step 1 : Ajouter `export_history_csv` dans `commands/export.rs`**

Dans `src-tauri/src/commands/export.rs`, modifier la ligne d'import en tête pour inclure `build_history_csv` :

```rust
use crate::engine::export::{build_csv, build_history_csv, build_report, ExportFilters};
```

Puis ajouter la commande après `export_report` :

```rust
#[tauri::command]
pub async fn export_history_csv(state: State<'_, AppState>) -> Result<String, String> {
    build_history_csv(&state.pool)
        .await
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 2 : Enregistrer la commande dans `lib.rs`**

Dans `src-tauri/src/lib.rs`, ligne 54, après `commands::export_report,`, ajouter :

```rust
            commands::export_history_csv,
```

La section `generate_handler!` ressemble à :

```rust
        .invoke_handler(tauri::generate_handler![
            // ...
            commands::export_csv,
            commands::export_report,
            commands::export_history_csv,   // ← nouvelle ligne
            // ...
        ])
```

- [ ] **Step 3 : Vérifier que le projet compile sans erreurs**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri"
cargo build 2>&1 | grep "^error" | head -10
```

Attendu : aucune sortie (zéro erreurs).

- [ ] **Step 4 : Commit**

```bash
git add src-tauri/src/commands/export.rs src-tauri/src/lib.rs
git commit -m "feat(export): expose export_history_csv Tauri command"
```

---

## Task 3 : Activer le bouton CSV dans `Dashboard/index.tsx`

**Files:**
- Modify: `src/components/Dashboard/index.tsx`

### Objectif

Remplacer le bouton CSV `disabled` par un bouton actif qui appelle `invoke('export_history_csv')` et déclenche le téléchargement d'un fichier `egestion-historique-YYYY-MM-DD.csv`.

---

- [ ] **Step 1 : Ajouter `handleExportCsv` dans `Dashboard`**

Dans `src/components/Dashboard/index.tsx`, après la fonction `handleExportReport` (ligne ~79, avant le `return (`), ajouter :

```tsx
  async function handleExportCsv() {
    try {
      const csv = await invoke<string>('export_history_csv');
      const date = new Date().toISOString().slice(0, 10);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `egestion-historique-${date}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error('export_history_csv error:', err);
    }
  }
```

- [ ] **Step 2 : Activer le bouton CSV**

Remplacer le bouton CSV existant (lignes 96-103) :

```tsx
          <button
            disabled
            title="À venir"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-bx-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={11} />
            CSV
          </button>
```

Par :

```tsx
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-bx-800 transition-all"
          >
            <Download size={11} />
            CSV
          </button>
```

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 4 : Test manuel**

Lance `npm run tauri dev`. Dans le Dashboard :
- Clique sur "CSV" → le fichier `egestion-historique-YYYY-MM-DD.csv` se télécharge
- Ouvre le CSV dans un éditeur : la première ligne est `nom,chemin_source,destination,categorie,date`
- Si des fichiers ont été organisés, chaque ligne contient les 5 colonnes attendues
- Si la DB est vide, le CSV contient uniquement l'en-tête (pas d'erreur)

- [ ] **Step 5 : Commit et push**

```bash
git add src/components/Dashboard/index.tsx
git commit -m "feat(dashboard): activate CSV export button — calls export_history_csv"
git push origin main
```
