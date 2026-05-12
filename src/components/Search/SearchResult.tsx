// src/components/Search/SearchResult.tsx
import { FileText, Image, Music, Video, Archive, Code } from 'lucide-react';
import { SearchResult as SR } from '../../store';

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  document: FileText,
  photo:    Image,
  music:    Music,
  video:    Video,
  archive:  Archive,
  code:     Code,
};

interface Props {
  result: SR;
  isSelected: boolean;
  onClick: () => void;
}

export function SearchResultItem({ result, isSelected, onClick }: Props) {
  const Icon = ICONS[result.category] ?? FileText;
  const relativePath = result.path.replace(/^.*\/Egestion\//, '');

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        isSelected ? 'bg-zinc-700' : 'hover:bg-zinc-750'
      }`}
    >
      <Icon size={16} className="text-zinc-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-100 truncate">{result.name}</div>
        <div className="text-xs text-zinc-500 truncate">{relativePath}</div>
      </div>
      <span className="text-xs text-zinc-600 shrink-0 capitalize">{result.category}</span>
    </button>
  );
}
