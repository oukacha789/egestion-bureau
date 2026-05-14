import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Trash2, Pause, Play, SlidersHorizontal } from 'lucide-react';
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

  useEffect(() => {
    invoke<RuleRecord[]>('get_rules')
      .then(setRules)
      .catch(console.error);
  }, []);

  async function handleCreate() {
    if (!form.name.trim() || !form.condition_value.trim() || !form.target_dir.trim()) return;
    try {
      const rule = await invoke<RuleRecord>('create_rule', {
        name: form.name.trim(),
        condition_type: form.condition_type,
        condition_value: form.condition_value.trim(),
        target_dir: form.target_dir.trim(),
        auto_tag: form.auto_tag.trim() || null,
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

  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-amber-400" />
          <h1 className="text-sm font-semibold text-zinc-100">Règles d'organisation</h1>
          <span className="text-xs text-zinc-600">— appliquées avant l'organiseur</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bx-600 hover:bg-bx-700 text-zinc-100 text-xs rounded-lg transition-colors"
        >
          <Plus size={12} />
          Nouvelle règle
        </button>
      </div>

      {/* Empty state */}
      {rules.length === 0 && !creating && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <SlidersHorizontal size={28} className="text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">Aucune règle configurée.</p>
            <p className="text-xs text-zinc-600 mt-1">Crée une règle pour personnaliser l'organisation des fichiers.</p>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="flex flex-col gap-2 mb-4">
        {rules.map((rule) => (
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
                onClick={() => handleToggle(rule.id)}
                title={rule.enabled ? 'Désactiver' : 'Activer'}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-bx-800 rounded-lg transition-colors"
              >
                {rule.enabled ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <button
                onClick={() => handleDelete(rule.id)}
                title="Supprimer"
                className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-900/20 rounded-lg transition-colors"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
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
              className="bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-zinc-500 shrink-0 w-4">Si</span>
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
                className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-zinc-500 shrink-0 w-4">→</span>
              <input
                placeholder="Dossier cible (ex : ~/Documents/Finance)"
                value={form.target_dir}
                onChange={(e) => setForm({ ...form, target_dir: e.target.value })}
                className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-zinc-500 shrink-0 w-4">#</span>
              <input
                placeholder="Tag automatique (optionnel)"
                value={form.auto_tag}
                onChange={(e) => setForm({ ...form, auto_tag: e.target.value })}
                className="flex-1 bg-bx-800 border border-bx-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2 justify-end mt-1">
              <button
                onClick={() => {
                  setCreating(false);
                  setForm({ name: '', condition_type: 'extension', condition_value: '', target_dir: '', auto_tag: '' });
                }}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
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
