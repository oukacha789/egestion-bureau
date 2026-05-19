// src/components/Explorer/FileList.tsx
import { useEffect, useRef, useState } from 'react';
import { FileText, Image, Music, Video, Archive, Code, HelpCircle, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileRecord, useAppStore } from '../../store';
import { FileContextMenu } from '../shared/FileContextMenu';

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  document: FileText,
  photo: Image,
  music: Music,
  video: Video,
  archive: Archive,
  code: Code,
  other: HelpCircle,
};

function formatBytes(b: number): string {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

interface Props {
  files: FileRecord[];
  sort: string;
  onSortChange: (sort: string) => void;
  selectedFileId: string | null;
  onSelectFile: (id: string | null) => void;
  focusZone: 'sidebar' | 'filelist';
  onFocusZoneChange: (zone: 'sidebar' | 'filelist') => void;
}

interface ContextState { x: number; y: number; file: FileRecord }

export function FileList({ files, sort, onSortChange, selectedFileId, onSelectFile, focusZone, onFocusZoneChange }: Props) {
  const removeExplorerFile = useAppStore((s) => s.removeExplorerFile);
  const [csvExporting, setCsvExporting] = useState(false);
  const [ctx, setCtx] = useState<ContextState | null>(null);
  const contextFileRef = useRef<FileRecord | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  function scrollToFile(id: string) {
    const el = listRef.current?.querySelector(`[data-file-id="${id}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  // Filelist keyboard: ↑↓ navigate, ← back to sidebar, Enter → Finder, Space → QuickLook, Esc → deselect+sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (focusZone !== 'filelist') return;

      const idx = files.findIndex((f) => f.id === selectedFileId);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(idx + 1, files.length - 1);
        if (next >= 0) {
          onSelectFile(files[next].id);
          scrollToFile(files[next].id);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = idx <= 0 ? 0 : idx - 1;
        onSelectFile(files[prev].id);
        scrollToFile(files[prev].id);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onFocusZoneChange('sidebar');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const file = files[idx];
        if (file) invoke('open_in_finder', { path: file.path }).catch(console.error);
      } else if (e.key === ' ') {
        e.preventDefault();
        const file = files[idx];
        if (file) invoke('open_quick_look', { path: file.path }).catch(console.error);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onSelectFile(null);
        onFocusZoneChange('sidebar');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusZone, files, selectedFileId, onSelectFile, onFocusZoneChange]);

  function handleContextMenu(e: React.MouseEvent, file: FileRecord) {
    e.preventDefault();
    contextFileRef.current = file;
    setCtx({ x: e.clientX, y: e.clientY, file });
  }

  async function openInFinder(path: string) {
    console.log('[ContextMenu] openInFinder:', path);
    try { await invoke('open_in_finder', { path }); } catch (err) { console.error(err); }
  }

  async function quickLook(path: string) {
    console.log('[ContextMenu] quickLook:', path);
    try { await invoke('open_quick_look', { path }); } catch (err) { console.error(err); }
  }

  async function copyPath(path: string) {
    console.log('[ContextMenu] copyPath:', path);
    try { await navigator.clipboard.writeText(path); } catch (err) { console.error(err); }
  }

  async function trashFile(file: FileRecord) {
    console.log('[ContextMenu] trashFile:', file.path);
    try {
      await invoke('trash_file', { path: file.path });
      removeExplorerFile(file.id);
    } catch (err) {
      console.error('trash_file error:', err);
    }
  }

  async function moveFile(path: string) {
    console.log('[ContextMenu] moveFile:', path);
    try {
      const dir = await open({ directory: true, title: 'Choisir un dossier de destination' });
      if (dir) await invoke('move_file', { path, destDir: dir });
    } catch (err) { console.error(err); }
  }

  async function handleExportCsv() {
    setCsvExporting(true);
    try {
      const csv = await invoke<string>('export_csv', {
        filters: { category: null, tags: [], date_from: null, date_to: null },
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `egestion-export-${Date.now()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error('export_csv error:', err);
    } finally {
      setCsvExporting(false);
    }
  }

  const SortBtn = ({ col, label }: { col: string; label: string }) => (
    <button
      onClick={() => onSortChange(col)}
      className={`px-3 py-2 text-left text-xs transition-colors hover:text-zinc-200 ${
        sort === col ? 'text-zinc-100 font-medium' : 'text-zinc-300'
      }`}
    >
      {label} {sort === col && '↓'}
    </button>
  );

  return (
    <>
    <div className={`flex flex-col h-full border-r border-zinc-800 transition-colors ${
      focusZone === 'filelist' ? 'border-l-2 border-l-blue-600' : ''
    }`}>
      {/* Sort header */}
      <div className="flex border-b border-zinc-800 shrink-0">
        <SortBtn col="name" label="Nom" />
        <div className="flex-1" />
        <SortBtn col="date" label="Date" />
        <SortBtn col="size" label="Taille" />
        <button
          onClick={handleExportCsv}
          disabled={csvExporting}
          className="px-3 py-2 text-xs text-zinc-300 hover:text-zinc-200 flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Exporter en CSV"
        >
          <Download size={12} />
          CSV
        </button>
      </div>

      {/* File list */}
      <div
        ref={listRef}
        onClick={() => onFocusZoneChange('filelist')}
        className="flex-1 overflow-y-auto"
      >
        {files.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-400">Aucun fichier</div>
        ) : (
          files.map((f) => {
            const Icon = ICONS[f.category ?? 'other'] ?? FileText;
            return (
              <button
                key={f.id}
                data-file-id={f.id}
                onClick={() => { onSelectFile(f.id); onFocusZoneChange('filelist'); }}
                onContextMenu={(e) => handleContextMenu(e, f)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-zinc-800/50 ${
                  selectedFileId === f.id ? 'bg-zinc-700' : 'hover:bg-zinc-800'
                }`}
              >
                <Icon size={14} className="text-zinc-300 shrink-0" />
                <span className="flex-1 text-sm text-zinc-200 truncate">{f.name}</span>
                <span className="text-xs text-zinc-400 shrink-0 w-24 text-right">{formatDate(f.modified_at)}</span>
                <span className="text-xs text-zinc-400 shrink-0 w-16 text-right">{formatBytes(f.size_bytes)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>

    {ctx && (
      <FileContextMenu
        x={ctx.x}
        y={ctx.y}
        onClose={() => setCtx(null)}
        items={[
          { label: 'Afficher dans le Finder', onClick: () => openInFinder(contextFileRef.current!.path) },
          { label: 'Aperçu rapide',           onClick: () => quickLook(contextFileRef.current!.path) },
          { label: 'Copier le chemin',        onClick: () => copyPath(contextFileRef.current!.path), separator: true },
          { label: 'Déplacer…',              onClick: () => moveFile(contextFileRef.current!.path) },
          { label: 'Supprimer',              onClick: () => trashFile(contextFileRef.current!), danger: true, separator: true },
        ]}
      />
    )}
    </>
  );
}
