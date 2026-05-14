# Règles — Édition inline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre l'édition inline d'une règle existante sans la supprimer/recréer.

**Architecture:** Nouvelle commande Tauri `update_rule` (Rust, même pattern que `toggle_rule`), enregistrée dans l'invoke_handler. Côté frontend, deux états locaux `editingId` / `editForm` dans `RulesView` — la carte bascule en formulaire quand `rule.id === editingId`.

**Tech Stack:** Rust (sqlx, Tauri), React/TypeScript, Zustand (updateRule déjà présent), Lucide React (Pencil).

---

## File Map

- **Modifier:** `src-tauri/src/commands/rules.rs` — ajouter `update_rule` + test
- **Modifier:** `src-tauri/src/lib.rs` — enregistrer `update_rule` dans invoke_handler
- **Modifier:** `src/components/Rules/index.tsx` — états edit + formulaire inline + bouton crayon

---

## Task 1 — Commande Rust `update_rule`

**Files:**
- Modify: `src-tauri/src/commands/rules.rs`

- [ ] **Étape 1 : Écrire le test qui échoue**

Ajouter à la fin du bloc `#[cfg(test)]` dans `src-tauri/src/commands/rules.rs` (avant la `}` fermante) :

```rust
    #[tokio::test]
    async fn test_update_rule() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES (?, 'Figma', 'extension', 'fig', '~/Design', NULL, 0, 1, ?)"
        )
        .bind(&id)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        // Simuler un update direct (la commande Tauri wrap ceci)
        sqlx::query(
            "UPDATE rules SET name=?, condition_type=?, condition_value=?, target_dir=?, auto_tag=? WHERE id=?"
        )
        .bind("Figma v2")
        .bind("name_contains")
        .bind("figma")
        .bind("~/Projets/Design")
        .bind(Some("design"))
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();

        let rule: RuleRecord = sqlx::query_as(
            "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at FROM rules WHERE id = ?"
        )
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(rule.name, "Figma v2");
        assert_eq!(rule.condition_type, "name_contains");
        assert_eq!(rule.condition_value, "figma");
        assert_eq!(rule.target_dir, "~/Projets/Design");
        assert_eq!(rule.auto_tag, Some("design".to_string()));
    }
```

- [ ] **Étape 2 : Lancer le test pour vérifier qu'il compile et passe (pas encore de commande Tauri, juste SQL)**

```bash
cd src-tauri && cargo test test_update_rule -- --nocapture
```

Attendu : `test test_update_rule ... ok`

- [ ] **Étape 3 : Ajouter la commande `update_rule`**

Ajouter avant le bloc `#[cfg(test)]` dans `src-tauri/src/commands/rules.rs` :

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

- [ ] **Étape 4 : Vérifier que tous les tests Rust passent**

```bash
cd src-tauri && cargo test
```

Attendu : tous les tests `ok`, aucune erreur de compilation.

- [ ] **Étape 5 : Commit**

```bash
git add src-tauri/src/commands/rules.rs
git commit -m "feat(rules): add update_rule command + test"
```

---

## Task 2 — Enregistrer `update_rule` dans l'invoke_handler

**Files:**
- Modify: `src-tauri/src/lib.rs` (ligne ~59)

- [ ] **Étape 1 : Ajouter `commands::update_rule` dans l'invoke_handler**

Dans `src-tauri/src/lib.rs`, localiser le bloc :

```rust
        .invoke_handler(tauri::generate_handler![
            ...
            commands::toggle_rule,
        ])
```

Remplacer par :

```rust
        .invoke_handler(tauri::generate_handler![
            ...
            commands::toggle_rule,
            commands::update_rule,
        ])
```

- [ ] **Étape 2 : Vérifier la compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Attendu : `Finished` sans erreur.

- [ ] **Étape 3 : Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(rules): register update_rule in invoke_handler"
```

---

## Task 3 — Frontend : édition inline dans `RulesView`

**Files:**
- Modify: `src/components/Rules/index.tsx`

- [ ] **Étape 1 : Ajouter l'import `Pencil` depuis lucide-react**

Remplacer la ligne d'import Lucide existante :

```tsx
import { Plus, Trash2, Pause, Play, SlidersHorizontal } from 'lucide-react';
```

par :

```tsx
import { Plus, Trash2, Pause, Play, SlidersHorizontal, Pencil } from 'lucide-react';
```

- [ ] **Étape 2 : Ajouter les états locaux d'édition**

Après les états `creating` et `form` existants, ajouter :

```tsx
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    condition_type: 'extension',
    condition_value: '',
    target_dir: '',
    auto_tag: '',
  });
```

- [ ] **Étape 3 : Ajouter les fonctions `handleEdit` et `handleUpdate`**

Après la fonction `handleToggle` existante, ajouter :

```tsx
  function handleEdit(rule: RuleRecord) {
    setEditingId(rule.id);
    setCreating(false);
    setEditForm({
      name: rule.name,
      condition_type: rule.condition_type,
      condition_value: rule.condition_value,
      target_dir: rule.target_dir,
      auto_tag: rule.auto_tag ?? '',
    });
  }

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

- [ ] **Étape 4 : Modifier le rendu de chaque carte dans `rules.map()`**

Remplacer le contenu de `rules.map((rule) => (` par le rendu conditionnel suivant (mode édition si `rule.id === editingId`, sinon affichage normal) :

```tsx
      {rules.map((rule) =>
        rule.id === editingId ? (
          /* ── Mode édition inline ── */
          <div
            key={rule.id}
            className="border border-dashed border-amber-700/50 rounded-xl p-4 bg-bx-900/40"
          >
            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-3">
              Modifier la règle
            </p>
            <div className="flex flex-col gap-2">
              <input
                placeholder="Nom de la règle"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-zinc-500 shrink-0 w-4">Si</span>
                <select
                  value={editForm.condition_type}
                  onChange={(e) => setEditForm({ ...editForm, condition_type: e.target.value })}
                  className="bg-bx-800 border border-bx-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  {CONDITION_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
                <input
                  placeholder={CONDITION_PLACEHOLDERS[editForm.condition_type]}
                  value={editForm.condition_value}
                  onChange={(e) => setEditForm({ ...editForm, condition_value: e.target.value })}
                  className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-zinc-500 shrink-0 w-4">→</span>
                <input
                  placeholder="Dossier cible"
                  value={editForm.target_dir}
                  onChange={(e) => setEditForm({ ...editForm, target_dir: e.target.value })}
                  className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-zinc-500 shrink-0 w-4">#</span>
                <input
                  placeholder="Tag automatique (optionnel)"
                  value={editForm.auto_tag}
                  onChange={(e) => setEditForm({ ...editForm, auto_tag: e.target.value })}
                  className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex gap-2 justify-end mt-1">
                <button
                  onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={!editForm.name.trim() || !editForm.condition_value.trim() || !editForm.target_dir.trim()}
                  className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 font-medium rounded-lg transition-colors"
                >
                  Sauvegarder
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── Mode affichage normal ── */
          <div
            key={rule.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              rule.enabled
                ? 'bg-bx-900 border-bx-800'
                : 'bg-bx-950 border-bx-900 opacity-50'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                rule.enabled ? 'bg-emerald-400' : 'bg-zinc-600'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">{rule.name}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded">
                  {CONDITION_TYPES.find((c) => c.value === rule.condition_type)?.label}{' '}
                  "{rule.condition_value}"
                </span>
                <span>→</span>
                <span className="text-zinc-400 font-mono truncate">{rule.target_dir}</span>
                {rule.auto_tag && (
                  <span className="bg-emerald-900/30 text-emerald-400 px-1.5 py-0.5 rounded">
                    #{rule.auto_tag}
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => handleEdit(rule)}
                disabled={editingId !== null || creating}
                title="Modifier"
                className="p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-amber-900/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={() => handleToggle(rule.id)}
                disabled={editingId !== null}
                title={rule.enabled ? 'Désactiver' : 'Activer'}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-bx-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {rule.enabled ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <button
                onClick={() => handleDelete(rule.id)}
                disabled={editingId !== null}
                title="Supprimer"
                className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-900/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        )
      )}
```

- [ ] **Étape 5 : Vérifier le type TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i error || echo "No TS errors"
```

Attendu : `No TS errors`

- [ ] **Étape 6 : Commit**

```bash
git add src/components/Rules/index.tsx
git commit -m "feat(rules): édition inline — pencil button + editForm + update_rule invoke"
```
