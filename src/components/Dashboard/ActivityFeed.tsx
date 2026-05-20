import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Undo2, FileText, Image, Music, Video, Archive, HelpCircle, Mail } from 'lucide-react';
import { useAppStore } from '../../store';
import type { ActivityItem } from '../../store';
import { FileContextMenu } from '../shared/FileContextMenu';
import { formatRelative } from '../../utils/formatRelative';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  document: <FileText size={14} className="text-blue-400" />,
  photo:    <Image   size={14} className="text-green-400" />,
  music:    <Music   size={14} className="text-purple-400" />,
  video:    <Video   size={14} className="text-orange-400" />,
  archive:  <Archive size={14} className="text-yellow-400" />,
  email:    <Mail    size={14} className="text-cyan-400" />,
};


function ActivityRow({ item, focused = false, dataIdx, onClick }: {
  item: ActivityItem;
  focused?: boolean;
  dataIdx?: number;
  onClick?: () => void;
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

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

  async function openInFinder(path: string) {
    try { await invoke('open_in_finder', { path }); } catch (err) { console.error(err); }
  }

  async function copyPath(path: string) {
    try { await navigator.clipboard.writeText(path); } catch (err) { console.error(err); }
  }

  async function trashFile(path: string) {
    try { await invoke('trash_file', { path }); } catch (err) { console.error(err); }
  }

  async function moveFile(path: string) {
    try {
      const dir = await open({ directory: true, title: 'Choisir un dossier de destination' });
      if (dir) await invoke('move_file', { path, destDir: dir });
    } catch (err) { console.error(err); }
  }

  const icon = CATEGORY_ICONS[item.category] ?? <HelpCircle size={14} className="text-zinc-200" />;
  const destFolder = item.path_after.split('/').slice(-2).join('/');

  return (
    <div
      data-activity-idx={dataIdx}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-bx-800/60 group transition-colors relative cursor-default ${
        focused ? 'bg-bx-800/60 ring-1 ring-inset ring-blue-600/40' : ''
      }`}
      onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}
    >
      <div className="w-7 h-7 rounded-md bg-bx-800 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-100 truncate font-medium">{item.name}</p>
        <p className="text-xs text-zinc-300 truncate">→ {destFolder}</p>
      </div>
      <span className="text-[10px] text-zinc-300 flex-shrink-0 mr-1">
        {formatRelative(item.timestamp)}
      </span>
      <button
        onClick={handleUndo}
        className={`transition-opacity flex items-center gap-1 text-xs text-zinc-200 hover:text-zinc-100 px-2 py-1 rounded hover:bg-bx-600 ${
          focused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <Undo2 size={11} />
        annuler
      </button>

      {ctx && (
        <FileContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { label: 'Afficher dans le Finder', onClick: () => openInFinder(item.path_after) },
            { label: 'Copier le chemin',        onClick: () => copyPath(item.path_after), separator: true },
            { label: 'Déplacer…',              onClick: () => moveFile(item.path_after) },
            { label: 'Supprimer',              onClick: () => trashFile(item.path_after), danger: true, separator: true },
            { label: 'Annuler l\'action',       onClick: handleUndo, separator: true },
          ]}
        />
      )}
    </div>
  );
}

export function ActivityFeed({ limit }: { limit?: number } = {}) {
  const activity = useAppStore((s) => s.activity);
  const items = limit ? activity.slice(0, limit) : activity;
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load historical activity from DB on first mount
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    invoke<ActivityItem[]>('get_recent_activity', { limit: 50 })
      .then((dbItems) => {
        useAppStore.setState((s) => ({
          activity: s.activity.length === 0 ? dbItems.slice(0, 50) : s.activity,
        }));
      })
      .catch(console.error);
  }, []);

  function scrollToIdx(idx: number) {
    const el = listRef.current?.querySelector(`[data-activity-idx="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  // Keyboard navigation: ↑↓ navigate, Enter open in Finder, U undo, Esc deselect
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((i) => {
          const next = i === null ? 0 : Math.min(i + 1, items.length - 1);
          scrollToIdx(next);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((i) => {
          const prev = i === null ? 0 : Math.max(i - 1, 0);
          scrollToIdx(prev);
          return prev;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIdx !== null) {
          invoke('open_in_finder', { path: items[focusedIdx].path_after }).catch(console.error);
        }
      } else if (e.key === 'u' || e.key === 'U') {
        if (focusedIdx !== null) {
          e.preventDefault();
          const item = items[focusedIdx];
          invoke('perform_undo', { actionId: item.action_id })
            .then(() => useAppStore.setState((s) => ({
              activity: s.activity.filter((a) => a.action_id !== item.action_id),
            })))
            .catch(console.error);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setFocusedIdx(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, focusedIdx]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
        <p className="text-sm">Aucune activité récente</p>
        <p className="text-xs mt-1">Les fichiers organisés apparaîtront ici</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="divide-y divide-bx-800">
      {items.map((item, idx) => (
        <ActivityRow
          key={item.action_id}
          item={item}
          focused={focusedIdx === idx}
          dataIdx={idx}
          onClick={() => setFocusedIdx(idx)}
        />
      ))}
    </div>
  );
}
