import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { Check, X, Mail } from 'lucide-react';
import { FileContextMenu } from '../shared/FileContextMenu';

interface FileRecord {
  id: string;
  name: string;
  path: string;
  extension: string | null;
  size_bytes: number;
  category: string | null;
  subcategory: string | null;
  confidence: number | null;
}

const CATEGORIES = ['document', 'photo', 'video', 'music', 'archive', 'installer', 'code', 'email', 'other'];
const EMAIL_DEST = '~/Documents/Emails';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ContextState { x: number; y: number; path: string }

export function Unsorted() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<ContextState | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number>(0);
  const listRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await invoke<FileRecord[]>('get_unsorted_files');
      setFiles(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    load();
  }, []);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    const unlistenPromise = listen<{ file_id: string }>('file-organized', (event) => {
      setFiles((prev) => prev.filter((f) => f.id !== event.payload.file_id));
    });
    return () => { unlistenPromise.then((fn) => fn()); };
  }, []);

  // Clamp focusedIdx when list shrinks
  useEffect(() => {
    setFocusedIdx((i) => Math.min(i, Math.max(0, files.length - 1)));
  }, [files.length]);

  const validate = async (file: FileRecord, category: string, subcategory: string | null = null) => {
    try {
      await invoke('validate_unsorted_file', { fileId: file.id, category, subcategory });
      if (category === 'email') {
        await invoke('move_file', { path: file.path, destDir: EMAIL_DEST });
      }
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (e) {
      console.error('Validation failed:', e);
    }
  };

  const dismiss = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  function scrollToIdx(idx: number) {
    const el = listRef.current?.querySelector(`[data-unsorted-idx="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  // Keyboard navigation: ↑↓ navigate, Enter accept AI suggestion, Esc dismiss
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (files.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((i) => {
          const next = Math.min(i + 1, files.length - 1);
          scrollToIdx(next);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((i) => {
          const prev = Math.max(i - 1, 0);
          scrollToIdx(prev);
          return prev;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const file = files[focusedIdx];
        if (file) validate(file, file.category ?? 'other', file.subcategory ?? null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const file = files[focusedIdx];
        if (file) dismiss(file.id);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, focusedIdx]);

  async function openInFinder(path: string) {
    try { await invoke('open_in_finder', { path }); } catch (err) { console.error(err); }
  }

  async function copyPath(path: string) {
    try { await navigator.clipboard.writeText(path); } catch (err) { console.error(err); }
  }

  async function trashFile(path: string) {
    try {
      await invoke('trash_file', { path });
      setFiles((prev) => prev.filter((f) => f.path !== path));
    } catch (err) { console.error(err); }
  }

  async function moveFile(path: string) {
    try {
      const dir = await open({ directory: true, title: 'Choisir un dossier de destination' });
      if (dir) await invoke('move_file', { path, destDir: dir });
    } catch (err) { console.error(err); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-300 text-sm">Chargement...</p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400">
        <Check size={32} className="mb-3 text-green-500" />
        <p className="text-sm">Tout est classifié</p>
        <p className="text-xs mt-1">Aucun fichier en attente de validation</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-100">À valider</h1>
        <p className="text-xs text-zinc-300 mt-0.5">{files.length} fichier(s) en attente</p>
      </div>
      <div ref={listRef} className="flex-1 overflow-auto divide-y divide-zinc-800">
        {files.map((file, fileIdx) => (
          <div
            key={file.id}
            data-unsorted-idx={fileIdx}
            onClick={() => setFocusedIdx(fileIdx)}
            className={`px-6 py-4 transition-colors cursor-default ${
              fileIdx === focusedIdx ? 'bg-zinc-800/60 ring-1 ring-inset ring-blue-600/40' : ''
            }`}
            onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, path: file.path }); }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">{file.name}</p>
                <p className="text-xs text-zinc-300 mt-0.5">
                  {formatSize(file.size_bytes)} · {file.extension ?? 'inconnu'}
                  {file.confidence !== null && ` · confiance ${Math.round(file.confidence * 100)}%`}
                </p>
              </div>
              <button
                onClick={() => dismiss(file.id)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X size={14} />
              </button>
            </div>
            {file.category && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] text-zinc-300">✦ IA suggère :</span>
                <button
                  onClick={() => validate(file, file.category!, file.subcategory)}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors font-medium"
                >
                  {file.category === 'email' && <Mail size={11} />}
                  {file.category}
                  {file.subcategory ? ` / ${file.subcategory}` : ''}
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {file.category && (
                <span className="text-[10px] text-zinc-400 mr-1 self-center">ou :</span>
              )}
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => validate(file, cat)}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors capitalize"
                >
                  {cat === 'email' && <Mail size={11} />}
                  {cat}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {ctx && (
        <FileContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { label: 'Afficher dans le Finder', onClick: () => openInFinder(ctx.path) },
            { label: 'Copier le chemin',        onClick: () => copyPath(ctx.path), separator: true },
            { label: 'Déplacer…',              onClick: () => moveFile(ctx.path) },
            { label: 'Supprimer',              onClick: () => trashFile(ctx.path), danger: true, separator: true },
          ]}
        />
      )}
    </div>
  );
}
