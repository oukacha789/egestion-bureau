import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface UpdateInfo {
  available: boolean;
  version: string | null;
  body: string | null;
}

export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;

    const timer = setTimeout(() => {
      invoke<UpdateInfo>('check_for_update')
        .then((info) => { if (info.available) setUpdate(info); })
        .catch((e) => { console.warn('[Updater] check_for_update failed:', e); });
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!update || dismissed) return null;

  async function handleInstall() {
    setInstalling(true);
    try {
      await invoke('install_update');
    } catch (err) {
      console.error('[Updater] install_update error:', err);
      setInstalling(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-72 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-zinc-100">
          Mise à jour disponible
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-400 hover:text-zinc-200 text-xs"
          aria-label="Ignorer"
        >
          ✕
        </button>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        Version {update.version ?? 'inconnue'}
        {update.body && (
          <span className="block mt-1 text-zinc-300">{update.body}</span>
        )}
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleInstall}
          disabled={installing}
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {installing ? 'Installation…' : 'Installer et relancer'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
