import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';

interface FileOrganizedPayload {
  action_id: string;
  file_id: string;
  name: string;
  path_before: string;
  path_after: string;
  category: string;
}

export function useFileEvents() {
  const { addActivity, setStats, setIsWatching } = useAppStore();

  useEffect(() => {
    setIsWatching(true);

    const unlistenPromise = listen<FileOrganizedPayload>('file-organized', (event) => {
      addActivity({
        action_id: event.payload.action_id,
        file_id: event.payload.file_id,
        name: event.payload.name,
        path_before: event.payload.path_before,
        path_after: event.payload.path_after,
        category: event.payload.category,
        timestamp: Date.now(),
      });

      invoke<{ total_files: number; organized_files: number; duplicate_files: number }>('get_stats')
        .then(setStats)
        .catch(console.error);
    });

    invoke<{ total_files: number; organized_files: number; duplicate_files: number }>('get_stats')
      .then(setStats)
      .catch(console.error);

    return () => {
      unlistenPromise.then((fn) => fn());
      setIsWatching(false);
    };
  }, []);
}
