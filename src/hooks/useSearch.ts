import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, SearchResult } from '../store';

export function useSearch() {
  const { setSearchResults } = useAppStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(query: string, category?: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const results = await invoke<SearchResult[]>('search_files', {
          query,
          limit: 20,
          category: category ?? null,
        });
        setSearchResults(results);
      } catch (err) {
        console.error('search_files error:', err);
        setSearchResults([]);
      }
    }, 200);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { search };
}
