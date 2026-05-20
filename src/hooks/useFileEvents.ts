import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, FileRecord } from '../store';

interface FileOrganizedPayload {
  action_id: string;
  file_id: string;
  name: string;
  path_before: string;
  path_after: string;
  category: string;
}

export function useFileEvents() {
  const { addActivity, setStats, setIsWatching, setWatchedDirs } = useAppStore();

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;

    setIsWatching(true);

    const unlistenPromise = listen<FileOrganizedPayload>('file-organized', (event) => {
      addActivity({
        action_id: event.payload.action_id,
        file_id: event.payload.file_id,
        name: event.payload.name,
        path_before: event.payload.path_before,
        path_after: event.payload.path_after,
        category: event.payload.category,
        timestamp: Math.floor(Date.now() / 1000),
      });

      invoke<{ total_files: number; organized_files: number; duplicate_files: number; email_files: number }>('get_stats')
        .then(setStats)
        .catch(console.error);

      // Refresh Explorer if the current category matches the organized file's category
      const { selectedCategory, explorerSort, setExplorerFiles } = useAppStore.getState();
      if (event.payload.category === selectedCategory) {
        invoke<FileRecord[]>('get_files_by_category', {
          category: selectedCategory,
          sortBy: explorerSort,
          page: 0,
        })
          .then(setExplorerFiles)
          .catch(console.error);
      }
    });

    invoke<{ total_files: number; organized_files: number; duplicate_files: number; email_files: number }>('get_stats')
      .then(setStats)
      .catch(console.error);

    invoke<string[]>('get_watch_dirs')
      .then(setWatchedDirs)
      .catch(console.error);

    return () => {
      unlistenPromise.then((fn) => fn());
      setIsWatching(false);
    };
  }, []);
}
