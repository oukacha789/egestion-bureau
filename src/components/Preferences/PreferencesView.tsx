import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Plus, Trash2, Eye, Cpu, KeyRound } from 'lucide-react';

export function PreferencesView() {
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [maskedKey, setMaskedKey] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    invoke<string[]>('get_prefs').then(setDirs).catch(console.error);
    invoke<string>('get_api_key_masked').then(setMaskedKey).catch(console.error);
  }, []);

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  }

  async function handleAdd() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Choisir un dossier à surveiller',
    });

    if (!selected || typeof selected !== 'string') return;

    setLoading(true);
    try {
      const updated = await invoke<string[]>('add_watch_dir', { dir: selected });
      setDirs(updated);
      showFeedback('Dossier ajouté et surveillance active');
    } catch (err) {
      console.error('add_watch_dir error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(dir: string) {
    setLoading(true);
    try {
      const updated = await invoke<string[]>('remove_watch_dir', { dir });
      setDirs(updated);
      showFeedback('Dossier retiré de la surveillance');
    } catch (err) {
      console.error('remove_watch_dir error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveKey() {
    setSavingKey(true);
    try {
      await invoke('set_api_key', { key: newKey });
      const masked = await invoke<string>('get_api_key_masked');
      setMaskedKey(masked);
      setEditingKey(false);
      setNewKey('');
      showFeedback('Clé API sauvegardée');
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err as Error)?.message ?? String(err);
      console.error('set_api_key error:', err);
      showFeedback('Erreur : ' + (msg || 'impossible de sauvegarder la clé'));
    } finally {
      setSavingKey(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-100">Préférences</h1>
          <p className="text-sm text-zinc-300 mt-1">
            Configurez les dossiers surveillés automatiquement par Egestion.
          </p>
        </div>

        {/* Section dossiers surveillés */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Eye size={14} className="text-zinc-300" />
                Dossiers surveillés
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Les nouveaux fichiers déposés dans ces dossiers seront automatiquement classés.
              </p>
            </div>
            <button
              onClick={handleAdd}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-xs text-white transition-colors"
            >
              <Plus size={12} />
              Ajouter un dossier
            </button>
          </div>

          {/* Liste */}
          <div className="space-y-2">
            {dirs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 bg-zinc-900/40 border border-dashed border-zinc-700 rounded-xl text-zinc-400">
                <FolderOpen size={28} className="mb-2 opacity-40" />
                <p className="text-sm">Aucun dossier surveillé</p>
                <p className="text-xs mt-1">Cliquez sur « Ajouter un dossier » pour commencer.</p>
              </div>
            )}

            {dirs.map((dir) => {
              const parts = dir.replace(/\\/g, '/').split('/');
              const name = parts[parts.length - 1] || dir;
              const parent = parts.slice(0, -1).join('/') || '/';

              return (
                <div
                  key={dir}
                  className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl group"
                >
                  <FolderOpen size={16} className="text-indigo-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{name}</p>
                    <p className="text-xs text-zinc-400 truncate">{parent}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(dir)}
                    disabled={loading}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all disabled:opacity-0"
                    aria-label={`Retirer ${name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Intelligence Artificielle */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Cpu size={14} className="text-zinc-300" />
                Intelligence Artificielle
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Clé API Anthropic pour la classification IA et l'assistant.
                Fallback :{' '}
                <code className="text-zinc-300 bg-zinc-900 px-1 py-0.5 rounded text-[10px]">
                  ANTHROPIC_API_KEY
                </code>
              </p>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            {editingKey ? (
              <div className="flex items-center gap-2">
                <KeyRound size={13} className="text-zinc-300 shrink-0" />
                <input
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                  placeholder="sk-ant-api03-..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
                <button
                  onClick={handleSaveKey}
                  disabled={savingKey || !newKey.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-xs text-white transition-colors"
                >
                  {savingKey ? '…' : 'Sauvegarder'}
                </button>
                <button
                  onClick={() => { setEditingKey(false); setNewKey(''); }}
                  className="text-xs text-zinc-300 hover:text-zinc-300"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <KeyRound size={13} className="text-zinc-300 shrink-0" />
                <span className="flex-1 text-xs font-mono text-zinc-200">
                  {maskedKey || 'Non configurée'}
                </span>
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${maskedKey ? 'bg-emerald-400' : 'bg-zinc-600'}`}
                />
                <span className={`text-xs ${maskedKey ? 'text-emerald-400' : 'text-zinc-300'}`}>
                  {maskedKey ? 'Connectée' : 'Non configurée'}
                </span>
                <button
                  onClick={() => setEditingKey(true)}
                  className="text-xs text-zinc-300 hover:text-zinc-300 underline"
                >
                  {maskedKey ? 'Modifier' : 'Configurer'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Feedback toast */}
        {feedback && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-200 shadow-lg">
            {feedback}
          </div>
        )}
      </div>
    </div>
  );
}
