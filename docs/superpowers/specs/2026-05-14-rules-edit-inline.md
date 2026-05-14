# Règles — Édition inline — Spec

**Date:** 2026-05-14
**Status:** Approuvé

## Contexte

La `RulesView` permet déjà de créer, supprimer et activer/désactiver des règles. Cette spec ajoute l'édition inline : l'utilisateur peut modifier les champs d'une règle existante sans avoir à la supprimer et la recréer.

---

## Périmètre

| Ce qui change | Ce qui ne change pas |
|---|---|
| `commands/rules.rs` — nouvelle commande `update_rule` | Toutes les autres commandes (get, create, delete, toggle) |
| `lib.rs` — enregistrement `update_rule` dans invoke_handler | Pipeline organizer, rules_engine |
| `Rules/index.tsx` — états edit + formulaire inline | Store `updateRule()` déjà présent |

---

## Décisions validées

| Question | Choix |
|---|---|
| Approche UI | Édition inline dans la carte (Option A) |
| Style du formulaire d'édition | Même que le formulaire de création (bordure dashed amber) |
| Retour commande | `RuleRecord` complet (même pattern que `toggle_rule`) |
| Concurrence | Un seul éditeur actif à la fois (editingId) |

---

## Backend — `update_rule`

### `src-tauri/src/commands/rules.rs`

Nouvelle commande Tauri :

```rust
#[tauri::command]
pub async fn update_rule(
    id: String,
    name: String,
    condition_type: String,
    condition_value: String,
    target_dir: String,
    auto_tag: Option<String>,
    state: State<'_, AppState>,
) -> Result<RuleRecord, String> {
    sqlx::query(
        "UPDATE rules SET name=?, condition_type=?, condition_value=?, target_dir=?, auto_tag=? WHERE id=?"
    )
    .bind(&name)
    .bind(&condition_type)
    .bind(&condition_value)
    .bind(&target_dir)
    .bind(&auto_tag)
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, RuleRecord>(
        "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at
         FROM rules WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())
}
```

### `src-tauri/src/lib.rs`

Ajouter `commands::update_rule` dans l'`invoke_handler`.

---

## Frontend — `Rules/index.tsx`

### Nouveaux états locaux

```ts
const [editingId, setEditingId] = useState<string | null>(null);
const [editForm, setEditForm] = useState({
  name: '',
  condition_type: 'extension',
  condition_value: '',
  target_dir: '',
  auto_tag: '',
});
```

### Fonction `handleEdit` (ouvre l'édition)

```ts
function handleEdit(rule: RuleRecord) {
  setEditingId(rule.id);
  setEditForm({
    name: rule.name,
    condition_type: rule.condition_type,
    condition_value: rule.condition_value,
    target_dir: rule.target_dir,
    auto_tag: rule.auto_tag ?? '',
  });
}
```

### Fonction `handleUpdate`

```ts
async function handleUpdate() {
  if (!editingId) return;
  try {
    const updated = await invoke<RuleRecord>('update_rule', {
      id: editingId,
      name: editForm.name.trim(),
      condition_type: editForm.condition_type,
      condition_value: editForm.condition_value.trim(),
      target_dir: editForm.target_dir.trim(),
      auto_tag: editForm.auto_tag.trim() || null,
    });
    updateRule(updated);
    setEditingId(null);
  } catch (err) {
    console.error('update_rule error:', err);
  }
}
```

### Rendu conditionnel dans la liste

Pour chaque règle dans `rules.map()` :
- Si `rule.id === editingId` → rendre le formulaire d'édition inline (même structure que le formulaire de création, bordure dashed amber, libellé "MODIFIER LA RÈGLE")
- Sinon → rendre la carte normale

### Bouton crayon dans la carte

Icône `Pencil` (size 11), inséré avant `Pause`/`Play` dans les actions.
Désactivé (`opacity-40 cursor-not-allowed`) si `editingId !== null || creating`.

---

## Flux utilisateur

```
Utilisateur clique sur ✏ (Pencil)
    → editingId = rule.id
    → editForm pré-rempli avec les valeurs actuelles
    → carte bascule en formulaire éditable

Utilisateur modifie les champs
    → clique "Sauvegarder"
    → invoke('update_rule', {...})
    → updateRule(result) dans le store
    → editingId = null → carte revient en mode affichage

Utilisateur clique "Annuler"
    → editingId = null → aucun changement
```

---

## Ce qui ne change pas

- Pas de migration SQL (aucun nouveau champ)
- `priority` et `enabled` non modifiables via ce formulaire (toggle existe déjà)
- `created_at` non modifiable
- `rules_engine.rs`, `organizer.rs`, store inchangés
