import { invoke } from '@tauri-apps/api/core';
import { Undo2, FileText, Image, Music, Video, Archive, HelpCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import type { ActivityItem } from '../../store';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  document: <FileText size={16} className="text-blue-400" />,
  photo: <Image size={16} className="text-green-400" />,
  music: <Music size={16} className="text-purple-400" />,
  video: <Video size={16} className="text-orange-400" />,
  archive: <Archive size={16} className="text-yellow-400" />,
};

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

  const icon = CATEGORY_ICONS[item.category] ?? <HelpCircle size={16} className="text-zinc-400" />;
  const destFolder = item.path_after.split('/').slice(-2).join('/');

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 group transition-colors">
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-100 truncate font-medium">{item.name}</p>
        <p className="text-xs text-zinc-500 truncate">→ {destFolder}</p>
      </div>
      <button
        onClick={handleUndo}
        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-700"
      >
        <Undo2 size={12} />
        annuler
      </button>
    </div>
  );
}

export function ActivityFeed() {
  const activity = useAppStore((s) => s.activity);

  if (activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
        <p className="text-sm">Aucune activité récente</p>
        <p className="text-xs mt-1">Les fichiers organisés apparaîtront ici</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800">
      {activity.map((item) => (
        <ActivityRow key={item.action_id} item={item} />
      ))}
    </div>
  );
}
