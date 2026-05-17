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

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="text-white font-semibold">
            {part}
          </strong>
        ) : (
          part
        )
      )}
    </>
  );
}

interface Props {
  result: SR;
  isSelected: boolean;
  query: string;
  onClick: () => void;
}

export function SearchResultItem({ result, isSelected, query, onClick }: Props) {
  const Icon = ICONS[result.category] ?? FileText;
  const relativePath = result.path.replace(/^.*\/Egestion\//, '');

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
      }`}
    >
      <Icon size={15} className={isSelected ? 'text-indigo-400' : 'text-zinc-500'} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-300 truncate">
          {highlightText(result.name, query)}
        </div>
        <div className="text-[10px] text-zinc-600 truncate mt-0.5">{relativePath}</div>
      </div>
    </button>
  );
}
