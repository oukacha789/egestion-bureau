import { FileText, Image, Music, Video, Archive, Code, FolderOpen } from 'lucide-react';
import { SearchResult } from '../../store';

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  document: FileText,
  photo:    Image,
  music:    Music,
  video:    Video,
  archive:  Archive,
  code:     Code,
};

const CATEGORY_COLORS: Record<string, string> = {
  document: 'text-blue-400 bg-blue-900/30',
  photo:    'text-emerald-400 bg-emerald-900/30',
  music:    'text-purple-400 bg-purple-900/30',
  video:    'text-rose-400 bg-rose-900/30',
  archive:  'text-amber-400 bg-amber-900/30',
  code:     'text-cyan-400 bg-cyan-900/30',
};

interface Props {
  result: SearchResult;
  onOpenFinder: (path: string) => void;
  onNavigateExplorer: (result: SearchResult) => void;
  onCopyPath: (path: string) => void;
}

export function SearchPreview({ result, onOpenFinder, onNavigateExplorer, onCopyPath }: Props) {
  const Icon = ICONS[result.category] ?? FileText;
  const colorClass = CATEGORY_COLORS[result.category] ?? 'text-zinc-400 bg-zinc-800';

  return (
    <div className="flex flex-col h-full px-5 py-4 gap-4">
      {/* Icône + nom */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-zinc-800 rounded-lg shrink-0">
          <Icon size={20} className="text-zinc-300" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100 break-all leading-snug">{result.name}</p>
          {result.subcategory && (
            <p className="text-xs text-zinc-500 mt-0.5">{result.subcategory}</p>
          )}
        </div>
      </div>

      {/* Chemin */}
      <div className="flex items-start gap-2">
        <FolderOpen size={13} className="text-zinc-600 shrink-0 mt-0.5" />
        <p className="text-xs text-zinc-500 break-all leading-relaxed">{result.path}</p>
      </div>

      {/* Catégorie + année */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${colorClass}`}>
          {result.category}
        </span>
        {result.year > 0 && (
          <span className="text-[10px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
            {result.year}
          </span>
        )}
      </div>

      {/* Tags */}
      {result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.tags.map((tag) => (
            <span key={tag} className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => onOpenFinder(result.path)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          <span>Ouvrir dans Finder</span>
          <kbd className="text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded text-[10px]">↵</kbd>
        </button>
        <button
          onClick={() => onNavigateExplorer(result)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          <span>Voir dans Explorer</span>
          <kbd className="text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded text-[10px]">⌘↵</kbd>
        </button>
        <button
          onClick={() => onCopyPath(result.path)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          <span>Copier le chemin</span>
          <kbd className="text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded text-[10px]">⌥↵</kbd>
        </button>
      </div>
    </div>
  );
}
