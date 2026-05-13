// src/components/Explorer/MetadataPanel.tsx
import { invoke } from '@tauri-apps/api/core';
import { ExternalLink } from 'lucide-react';
import { FileMetadata } from '../../store';
import { TagEditor } from './TagEditor';

function formatBytes(b: number): string {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

interface Props {
  metadata: FileMetadata | null;
}

export function MetadataPanel({ metadata }: Props) {
  if (!metadata) {
    return (
      <div className="w-64 flex items-center justify-center text-sm text-zinc-600 border-l border-zinc-800">
        Sélectionner un fichier
      </div>
    );
  }

  const path = metadata.path;
  async function handleOpenInFinder() {
    try {
      await invoke('open_in_finder', { path });
    } catch (err) {
      console.error('open_in_finder error:', err);
    }
  }

  const confidence = metadata.confidence != null ? Math.round(metadata.confidence * 100) : null;

  return (
    <div className="w-64 shrink-0 flex flex-col border-l border-zinc-800 overflow-y-auto">
      <div className="p-4 border-b border-zinc-800">
        <div className="text-sm font-medium text-zinc-100 break-all">{metadata.name}</div>
      </div>

      <div className="p-4 space-y-3 text-xs flex-1">
        <Row label="Catégorie" value={metadata.category ?? '—'} />
        <Row label="Sous-cat." value={metadata.subcategory ?? '—'} />
        <Row label="Taille" value={formatBytes(metadata.size_bytes)} />
        <Row label="Créé" value={formatDate(metadata.created_at)} />
        <Row label="Modifié" value={formatDate(metadata.modified_at)} />
        <Row label="Classifié par" value={metadata.classifier ?? '—'} />
        {confidence != null && (
          <div>
            <div className="text-zinc-500 mb-1">Confiance</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${confidence}%` }}
                />
              </div>
              <span className="text-zinc-400 tabular-nums">{confidence}%</span>
            </div>
          </div>
        )}
        {metadata.tags.length > 0 && (
          <div>
            <div className="text-zinc-500 mb-1.5">Tags</div>
            <div className="flex flex-wrap gap-1">
              {metadata.tags.map((t, i) => (
                <span key={`${t}-${i}`} className="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-300">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        <TagEditor fileId={metadata.id} />
      </div>

      <div className="p-4 border-t border-zinc-800">
        <button
          onClick={handleOpenInFinder}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs text-zinc-200 transition-colors"
        >
          <ExternalLink size={12} />
          Ouvrir dans Finder
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-zinc-500">{label} : </span>
      <span className="text-zinc-300">{value}</span>
    </div>
  );
}
