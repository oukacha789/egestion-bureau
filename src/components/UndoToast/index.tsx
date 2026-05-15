import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Undo2, X } from 'lucide-react';
import { useAppStore } from '../../store';

interface BatchItem {
  actionId: string;
  name: string;
  category: string;
}

export function UndoToast() {
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const removeActivities = useAppStore((s) => s.removeActivities);

  const dismiss = () => {
    setVisible(false);
    setBatch([]);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleUndo = async () => {
    const ids = batch.map((b) => b.actionId);
    for (const actionId of ids) {
      try {
        await invoke('perform_undo', { actionId });
      } catch (e) {
        console.error('Undo failed:', e);
      }
    }
    removeActivities(ids);
    dismiss();
  };

  useEffect(() => {
    type Payload = { action_id: string; name: string; category: string };
    const unlistenPromise = listen<Payload>('file-organized', (event) => {
      const { action_id, name, category } = event.payload;
      const item: BatchItem = { actionId: action_id, name, category };

      setBatch((prev) => [...prev, item]);
      setVisible(true);

      if (timerRef.current === null) {
        timerRef.current = window.setTimeout(() => {
          setVisible(false);
          setBatch([]);
          timerRef.current = null;
        }, 8000);
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible || batch.length === 0) return null;

  const isBatch = batch.length > 1;
  const message = isBatch
    ? `${batch.length} fichiers organisés`
    : `${batch[0].name} → ${batch[0].category}`;
  const btnLabel = isBatch ? 'Annuler tout' : 'Annuler';

  return (
    <div className="fixed bottom-5 right-5 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden min-w-[260px] max-w-xs">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-zinc-500 mb-0.5 uppercase tracking-wider">
            {isBatch ? 'Fichiers organisés' : 'Fichier organisé'}
          </p>
          <p className="text-sm text-zinc-100 font-medium truncate">{message}</p>
        </div>
        <button
          onClick={handleUndo}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-600 text-amber-400 text-xs font-semibold rounded-lg hover:bg-zinc-700 transition-colors whitespace-nowrap flex-shrink-0"
        >
          <Undo2 size={11} />
          {btnLabel}
        </button>
        <button
          onClick={dismiss}
          className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      </div>
      <div className="h-0.5 bg-zinc-800">
        <div
          className="h-full bg-amber-500"
          style={{ animation: 'shrink 8s linear forwards' }}
        />
      </div>
    </div>
  );
}
