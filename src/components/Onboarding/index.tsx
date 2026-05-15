import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store';

type Phase = 'idle' | 'indexing';

export function OnboardingScreen() {
  const { setWatchedDirs } = useAppStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [addedDir, setAddedDir] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function handleAddFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Choisir un dossier à surveiller',
    });

    if (!selected || typeof selected !== 'string') return;

    setLoading(true);
    try {
      const updated = await invoke<string[]>('add_watch_dir', { dir: selected });
      setWatchedDirs(updated);
      setAddedDir(selected);
      setPhase('indexing');
    } catch (err) {
      console.error('add_watch_dir error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (phase === 'indexing') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <Loader2 size={28} className="text-amber-400 animate-spin" />
        <div>
          <p className="text-sm font-semibold text-zinc-100 mb-1">
            eGestion surveille votre dossier…
          </p>
          <p className="text-xs text-zinc-500">
            Les fichiers seront détectés et classés automatiquement.
          </p>
        </div>
        {addedDir && (
          <p className="text-[10px] text-zinc-600 font-mono truncate max-w-xs">
            {addedDir}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex gap-10 max-w-lg w-full">

        {/* Gauche — action principale */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-900/20 border border-amber-700/30 flex items-center justify-center">
            <FolderOpen size={24} className="text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100 mb-1">
              Aucun fichier indexé
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Ajoute un dossier à surveiller<br />pour commencer.
            </p>
          </div>
          <button
            onClick={handleAddFolder}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 text-xs font-semibold rounded-lg transition-colors"
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              '+'
            )}
            Ajouter un dossier
          </button>
        </div>

        {/* Séparateur */}
        <div className="w-px bg-bx-800 self-stretch" />

        {/* Droite — valeur produit */}
        <div className="flex-1 flex flex-col justify-center gap-3">
          <p className="text-[10px] font-medium tracking-widest uppercase text-zinc-600 mb-1">
            Ce que tu pourras faire
          </p>
          {[
            { icon: '🔍', label: 'Recherche instantanée' },
            { icon: '🏷', label: 'Tags automatiques' },
            { icon: '📊', label: 'Organisation intelligente' },
            { icon: '🗂', label: 'Détection de doublons' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-base">{icon}</span>
              <span className="text-xs text-zinc-400">{label}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
