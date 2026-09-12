import { FileText, Image, Music, Video, Archive, Code, LayoutGrid } from 'lucide-react';

interface Category {
  key: string | null;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }> | null;
}

const CATEGORIES: Category[] = [
  { key: null,       label: 'Tout',     Icon: LayoutGrid },
  { key: 'document', label: 'Document', Icon: FileText },
  { key: 'photo',    label: 'Photo',    Icon: Image },
  { key: 'music',    label: 'Musique',  Icon: Music },
  { key: 'video',    label: 'Vidéo',    Icon: Video },
  { key: 'archive',  label: 'Archive',  Icon: Archive },
  { key: 'code',     label: 'Code',     Icon: Code },
];

interface Props {
  active: string | null;
  onChange: (category: string | null) => void;
}

export function CategoryChips({ active, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-zinc-800 overflow-x-auto scrollbar-none">
      {CATEGORIES.map(({ key, label, Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key ?? 'all'}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0 ${
              isActive
                ? 'bg-amber-500/80 text-zinc-900'
                : 'bg-zinc-800 text-zinc-200 hover:text-zinc-200 hover:bg-zinc-700'
            }`}
          >
            {Icon && <Icon size={11} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
