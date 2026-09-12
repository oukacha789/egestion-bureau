import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Trash2, Pause, Play, SlidersHorizontal, Pencil } from 'lucide-react';
import { useAppStore, RuleRecord } from '../../store';

const CONDITION_TYPES = [
  { value: 'extension',    label: 'Extension =' },
  { value: 'name_contains', label: 'Nom contient' },
  { value: 'source',       label: 'Source =' },
];

const CONDITION_PLACEHOLDERS: Record<string, string> = {
  extension:    'fig',
  name_contains: 'facture',
  source:       'downloads',
};

export function RulesView() {
  const { rules, setRules, addRule, removeRule, updateRule } = useAppStore();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    condition_type: 'extension',
    condition_value: '',
    target_dir: '',
    auto_tag: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    condition_type: 'extension',
    condition_value: '',
    target_dir: '',
    auto_tag: '',
  });
  const [focusedRuleId, setFocusedRuleId] = useState<string | null>(null);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    invoke<RuleRecord[]>('get_rules')
      .then(setRules)
      .catch(console.error);
  }, []);

  async function handleCreate() {
    if (!form.name.trim() || !form.condition_value.trim() || !form.target_dir.trim()) return;
    try {
      const rule = await invoke<RuleRecord>('create_rule', {
        name: form.name.trim(),
        conditionType: form.condition_type,
        conditionValue: form.condition_value.trim(),
        targetDir: form.target_dir.trim(),
        autoTag: form.auto_tag.trim() || null,
      });
      addRule(rule);
      setForm({ name: '', condition_type: 'extension', condition_value: '', target_dir: '', auto_tag: '' });
      setCreating(false);
    } catch (err) {
      console.error('create_rule error:', err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke('delete_rule', { id });
      removeRule(id);
    } catch (err) {
      console.error('delete_rule error:', err);
    }
  }

  async function handleToggle(id: string) {
    try {
      const updated = await invoke<RuleRecord>('toggle_rule', { id });
      updateRule(updated);
    } catch (err) {
      console.error('toggle_rule error:', err);
    }
  }

  function handleEdit(rule: RuleRecord) {
    setEditingId(rule.id);
    setFocusedRuleId(null);
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
        conditionType: editForm.condition_type,
        conditionValue: editForm.condition_value.trim(),
        targetDir: editForm.target_dir.trim(),
        autoTag: editForm.auto_tag.trim() || null,
      });
      updateRule(updated);
      setEditingId(null);
      setEditForm({ name: '', condition_type: 'extension', condition_value: '', target_dir: '', auto_tag: '' });
    } catch (err) {
      console.error('update_rule error:', err);
    }
  }

  // Keyboard navigation: ↑↓ navigate, Enter edit, Space toggle, Del delete, Esc deselect
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (editingId !== null || creating) return;
      if (rules.length === 0) return;

      const idx = focusedRuleId ? rules.findIndex((r) => r.id === focusedRuleId) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = idx < rules.length - 1 ? idx + 1 : 0;
        setFocusedRuleId(rules[next].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = idx > 0 ? idx - 1 : rules.length - 1;
        setFocusedRuleId(rules[prev].id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const rule = rules[idx];
        if (rule) handleEdit(rule);
      } else if (e.key === ' ') {
        e.preventDefault();
        const rule = rules[idx];
        if (rule) handleToggle(rule.id);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const rule = rules[idx];
        if (rule) {
          handleDelete(rule.id);
          setFocusedRuleId(null);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setFocusedRuleId(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rules, focusedRuleId, editingId, creating]);

  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-amber-400" />
          <h1 className="text-sm font-semibold text-zinc-100">Règles d'organisation</h1>
          <span className="text-xs text-zinc-400">— appliquées avant l'organiseur</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          disabled={editingId !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bx-600 hover:bg-bx-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-100 text-xs rounded-lg transition-colors"
        >
          <Plus size={12} />
          Nouvelle règle
        </button>
      </div>

      {/* Empty state */}
      {rules.length === 0 && !creating && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <SlidersHorizontal size={28} className="text-zinc-500 mx-auto mb-3" />
            <p className="text-sm text-zinc-300">Aucune règle configurée.</p>
            <p className="text-xs text-zinc-400 mt-1">Crée une règle pour personnaliser l'organisation des fichiers.</p>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="flex flex-col gap-2 mb-4">
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
                  className="bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-amber-500"
                />
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] text-zinc-300 shrink-0 w-4">Si</span>
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
                    className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] text-zinc-300 shrink-0 w-4">→</span>
                  <input
                    placeholder="Dossier cible"
                    value={editForm.target_dir}
                    onChange={(e) => setEditForm({ ...editForm, target_dir: e.target.value })}
                    className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-400 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] text-zinc-300 shrink-0 w-4">#</span>
                  <input
                    placeholder="Tag automatique (optionnel)"
                    value={editForm.auto_tag}
                    onChange={(e) => setEditForm({ ...editForm, auto_tag: e.target.value })}
                    className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex gap-2 justify-end mt-1">
                  <button
                    onClick={() => { setEditingId(null); setEditForm({ name: '', condition_type: 'extension', condition_value: '', target_dir: '', auto_tag: '' }); }}
                    className="px-3 py-1.5 text-xs text-zinc-200 hover:text-zinc-200 transition-colors"
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
              onClick={() => setFocusedRuleId(rule.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors cursor-default ${
                rule.enabled
                  ? 'bg-bx-900 border-bx-800'
                  : 'bg-bx-950 border-bx-900 opacity-50'
              } ${focusedRuleId === rule.id ? 'ring-1 ring-amber-500/30' : ''}`}
            >
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  rule.enabled ? 'bg-emerald-400' : 'bg-zinc-600'
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate">{rule.name}</p>
                <p className="text-[10px] text-zinc-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="bg-bx-800 text-zinc-300 px-1.5 py-0.5 rounded">
                    {CONDITION_TYPES.find((c) => c.value === rule.condition_type)?.label}{' '}
                    "{rule.condition_value}"
                  </span>
                  <span>→</span>
                  <span className="text-zinc-200 font-mono truncate">{rule.target_dir}</span>
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
                  className="p-1.5 text-zinc-300 hover:text-amber-400 hover:bg-amber-900/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => handleToggle(rule.id)}
                  disabled={editingId !== null}
                  title={rule.enabled ? 'Désactiver' : 'Activer'}
                  className="p-1.5 text-zinc-300 hover:text-zinc-200 hover:bg-bx-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {rule.enabled ? <Pause size={11} /> : <Play size={11} />}
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={editingId !== null}
                  title="Supprimer"
                  className="p-1.5 text-zinc-300 hover:text-rose-400 hover:bg-rose-900/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {/* Inline creation form */}
      {creating && (
        <div className="border border-dashed border-amber-700/50 rounded-xl p-4 bg-bx-900/40">
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-3">
            Nouvelle règle
          </p>
          <div className="flex flex-col gap-2">
            <input
              placeholder="Nom de la règle (ex : Fichiers Figma)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-zinc-300 shrink-0 w-4">Si</span>
              <select
                value={form.condition_type}
                onChange={(e) => setForm({ ...form, condition_type: e.target.value })}
                className="bg-bx-800 border border-bx-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                {CONDITION_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
              <input
                placeholder={CONDITION_PLACEHOLDERS[form.condition_type]}
                value={form.condition_value}
                onChange={(e) => setForm({ ...form, condition_value: e.target.value })}
                className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-zinc-300 shrink-0 w-4">→</span>
              <input
                placeholder="Dossier cible (ex : ~/Documents/Finance)"
                value={form.target_dir}
                onChange={(e) => setForm({ ...form, target_dir: e.target.value })}
                className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-400 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-zinc-300 shrink-0 w-4">#</span>
              <input
                placeholder="Tag automatique (optionnel)"
                value={form.auto_tag}
                onChange={(e) => setForm({ ...form, auto_tag: e.target.value })}
                className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2 justify-end mt-1">
              <button
                onClick={() => {
                  setCreating(false);
                  setForm({ name: '', condition_type: 'extension', condition_value: '', target_dir: '', auto_tag: '' });
                }}
                className="px-3 py-1.5 text-xs text-zinc-200 hover:text-zinc-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.name.trim() || !form.condition_value.trim() || !form.target_dir.trim()}
                className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 font-medium rounded-lg transition-colors"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
