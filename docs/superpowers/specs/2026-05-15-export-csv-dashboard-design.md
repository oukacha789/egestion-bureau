# Export CSV Dashboard

**Date :** 2026-05-15
**Statut :** Approuvé

## Contexte

Le Dashboard affiche un bouton "CSV" désactivé ("À venir"). La commande `export_csv` existante interroge la table `files` et ne contient pas le chemin source (`path_before`), qui est stocké dans la table `actions`. Cette spec ajoute un export complet de l'historique d'organisation avec les 5 colonnes demandées.

## Comportement

### Déclencheur

Clic sur le bouton "CSV" dans la topbar du Dashboard. Le bouton est activé (suppression du `disabled`).

### Résultat

Téléchargement immédiat d'un fichier `egestion-historique-YYYY-MM-DD.csv` (date du jour) sans dialogue de confirmation.

### Contenu du CSV

En-tête fixe :
```
nom,chemin_source,destination,categorie,date
```

Une ligne par action d'organisation non annulée, triée par date décroissante, limitée à 10 000 lignes. Les valeurs contenant une virgule, un guillemet ou un saut de ligne sont encadrées de `"` (RFC 4180). La date est formatée ISO 8601 : `YYYY-MM-DD`.

Exemple :
```
nom,chemin_source,destination,categorie,date
rapport.pdf,/Downloads/rapport.pdf,/Documents/Finances/rapport.pdf,Finances,2026-05-14
notes.txt,/Desktop/notes.txt,/Documents/Perso/notes.txt,Perso,2026-05-13
```

### Cas particuliers

- **Aucune donnée** : le CSV contient uniquement l'en-tête. Pas de message d'erreur, le fichier vide est téléchargé normalement.
- **Erreur Tauri** : `console.error` silencieux, aucun feedback visible (comportement identique au bouton "Rapport" existant).

## Architecture

### Nouvelle fonction Rust : `build_history_csv`

**Fichier :** `src-tauri/src/engine/export.rs`

Requête SQL :
```sql
SELECT f.name, a.path_before, a.path_after, f.category, a.executed_at
FROM actions a
JOIN files f ON a.file_id = f.id
WHERE a.action_type = 'move' AND a.undone_at IS NULL
ORDER BY a.executed_at DESC
LIMIT 10000
```

Sérialisation : même fonction `csv_escape` existante. La date (`executed_at` en i64 Unix timestamp) est convertie en `YYYY-MM-DD` via `chrono::DateTime::from_timestamp`.

Signature :
```rust
pub async fn build_history_csv(pool: &SqlitePool) -> Result<String>
```

### Nouveau command Tauri : `export_history_csv`

**Fichier :** `src-tauri/src/commands/export.rs`

```rust
#[tauri::command]
pub async fn export_history_csv(state: State<'_, AppState>) -> Result<String, String> {
    build_history_csv(&state.pool).await.map_err(|e| e.to_string())
}
```

Aucun paramètre — export toujours complet.

### Enregistrement dans `lib.rs`

Ajouter `commands::export_history_csv` dans `tauri::generate_handler![]`.

### Modification Frontend : `Dashboard/index.tsx`

Ajouter la fonction `handleExportCsv` :
```tsx
const handleExportCsv = async () => {
  try {
    const csv = await invoke<string>('export_history_csv');
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `egestion-historique-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('CSV export failed:', e);
  }
};
```

Remplacer le bouton CSV disabled par :
```tsx
<button onClick={handleExportCsv} className="...">CSV</button>
```

## Dépendances

Aucune nouvelle dépendance. `chrono` est déjà utilisé dans `export.rs`.

## Hors scope

- Filtres (catégorie, date) sur l'export Dashboard — déjà couverts par l'export Explorer
- Feedback visuel de chargement sur le bouton CSV
- Export des fichiers annulés (`undone_at IS NOT NULL`)
- Export des doublons
