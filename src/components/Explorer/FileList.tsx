// src/components/Explorer/FileList.tsx
import { useState } from 'react';
import { FileText, Image, Music, Video, Archive, Code, HelpCircle, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { FileRecord } from '../../store';
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
  onSelectFile: (id: string) => void;
}

interface ContextState { x: number; y: number; file: FileRecord }

export function FileList({ files, sort, onSortChange, selectedFileId, onSelectFile }: Props) {
  const [csvExporting, setCsvExporting] = useState(false);
  const [ctx, setCtx] = useState<ContextState | null>(null);

  function handleContextMenu(e: React.MouseEvent, file: FileRecord) {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, file });
  }

  async function openInFinder(path: string) {
    try { await invoke('open_in_finder', { path }); } catch (err) { console.error(err); }
  }

  async function quickLook(path: string) {
    try { await invoke('open_quick_look', { path }); } catch (err) { console.error(err); }
  }

  async function copyPath(path: string) {
    try { await navigator.clipboard.writeText(path); } catch (err) { console.error(err); }
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
    <div className="flex flex-col h-full border-r border-zinc-800">
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
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-400">Aucun fichier</div>
        ) : (
          files.map((f) => {
            const Icon = ICONS[f.category ?? 'other'] ?? FileText;
            return (
              <button
                key={f.id}
                onClick={() => onSelectFile(f.id)}
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
          { label: 'Afficher dans le Finder', onClick: () => openInFinder(ctx.file.path) },
          { label: 'Aperçu rapide',           onClick: () => quickLook(ctx.file.path) },
          { label: 'Copier le chemin',        onClick: () => copyPath(ctx.file.path), separator: true },
        ]}
      />
    )}
    </>
  );
}
