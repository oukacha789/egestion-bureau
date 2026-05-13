import { invoke } from '@tauri-apps/api/core';
import { Undo2, FileText, Image, Music, Video, Archive, HelpCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import type { ActivityItem } from '../../store';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  document: <FileText size={14} className="text-blue-400" />,
  photo:    <Image   size={14} className="text-green-400" />,
  music:    <Music   size={14} className="text-purple-400" />,
  video:    <Video   size={14} className="text-orange-400" />,
  archive:  <Archive size={14} className="text-yellow-400" />,
};

function formatRelative(ts: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - ts;
  if (diffSec < 60)  return 'à l\'instant';
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
  return `il y a ${Math.floor(diffSec / 86400)} j`;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const handleUndo = async () => {
    try {
      await invoke('perform_undo', { actionId: item.action_id });
      useAppStore.setState((s) => ({
        activity: s.activity.filter((a) => a.action_id !== item.action_id),
      }));
    } catch (e) {
      console.error('Undo failed:', e);
    }
  };

  const icon = CATEGORY_ICONS[item.category] ?? <HelpCircle size={14} className="text-zinc-400" />;
  const destFolder = item.path_after.split('/').slice(-2).join('/');

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-bx-800/60 group transition-colors">
      <div className="w-7 h-7 rounded-md bg-bx-800 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-100 truncate font-medium">{item.name}</p>
        <p className="text-xs text-zinc-500 truncate">→ {destFolder}</p>
      </div>
      <span className="text-[10px] text-zinc-700 flex-shrink-0 mr-1">
        {formatRelative(item.timestamp)}
      </span>
      <button
        onClick={handleUndo}
        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded hover:bg-bx-600"
      >
        <Undo2 size={11} />
        annuler
      </button>
    </div>
  );
}

export function ActivityFeed({ limit }: { limit?: number } = {}) {
  const activity = useAppStore((s) => s.activity);
  const items = limit ? activity.slice(0, limit) : activity;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
        <p className="text-sm">Aucune activité récente</p>
        <p className="text-xs mt-1">Les fichiers organisés apparaîtront ici</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-bx-800">
      {items.map((item) => (
        <ActivityRow key={item.action_id} item={item} />
      ))}
    </div>
  );
}
