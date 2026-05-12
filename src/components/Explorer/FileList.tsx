// src/components/Explorer/FileList.tsx
import { FileText, Image, Music, Video, Archive, Code, HelpCircle } from 'lucide-react';
import { FileRecord } from '../../store';

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

export function FileList({ files, sort, onSortChange, selectedFileId, onSelectFile }: Props) {
  const SortBtn = ({ col, label }: { col: string; label: string }) => (
    <button
      onClick={() => onSortChange(col)}
      className={`px-3 py-2 text-left text-xs transition-colors hover:text-zinc-200 ${
        sort === col ? 'text-zinc-100 font-medium' : 'text-zinc-500'
      }`}
    >
      {label} {sort === col && '↓'}
    </button>
  );

  return (
    <div className="flex flex-col h-full border-r border-zinc-800">
      {/* Sort header */}
      <div className="flex border-b border-zinc-800 shrink-0">
        <SortBtn col="name" label="Nom" />
        <div className="flex-1" />
        <SortBtn col="date" label="Date" />
        <SortBtn col="size" label="Taille" />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-600">Aucun fichier</div>
        ) : (
          files.map((f) => {
            const Icon = ICONS[f.category ?? 'other'] ?? FileText;
            return (
              <button
                key={f.id}
                onClick={() => onSelectFile(f.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-zinc-800/50 ${
                  selectedFileId === f.id ? 'bg-zinc-700' : 'hover:bg-zinc-800'
                }`}
              >
                <Icon size={14} className="text-zinc-500 shrink-0" />
                <span className="flex-1 text-sm text-zinc-200 truncate">{f.name}</span>
                <span className="text-xs text-zinc-600 shrink-0 w-24 text-right">{formatDate(f.modified_at)}</span>
                <span className="text-xs text-zinc-600 shrink-0 w-16 text-right">{formatBytes(f.size_bytes)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
