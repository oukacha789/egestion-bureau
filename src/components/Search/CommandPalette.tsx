// src/components/Search/CommandPalette.tsx
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search } from 'lucide-react';
import { useAppStore } from '../../store';
import { useSearch } from '../../hooks/useSearch';
import { SearchResultItem } from './SearchResult';

export function CommandPalette() {
  const { isSearchOpen, setSearchOpen, searchResults, setSearchResults } = useAppStore();
  const { search } = useSearch();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      setQuery('');
      setSelectedIdx(0);
      search('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchResults([]);
    }
  }, [isSearchOpen]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [searchResults.length]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setSearchOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && searchResults[selectedIdx]) {
      openFile(searchResults[selectedIdx].path);
    }
  }

  async function openFile(path: string) {
    setSearchOpen(false);
    try {
      await invoke('open_in_finder', { path });
    } catch (err) {
      console.error('open_in_finder error:', err);
    }
  }

  if (!isSearchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm"
      onClick={() => setSearchOpen(false)}
    >
      <div
        className="w-[600px] bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-700">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              search(e.target.value);
            }}
            placeholder="Rechercher un fichier…"
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 text-sm outline-none"
          />
          <kbd className="text-xs text-zinc-600 bg-zinc-700 px-1.5 py-0.5 rounded">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto divide-y divide-zinc-700/50">
          {searchResults.length === 0 && query.trim() !== '' ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">Aucun résultat</div>
          ) : (
            searchResults.map((r, i) => (
              <SearchResultItem
                key={r.id}
                result={r}
                isSelected={i === selectedIdx}
                onClick={() => openFile(r.path)}
              />
            ))
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="px-4 py-2 border-t border-zinc-700 flex gap-4 text-xs text-zinc-600">
            <span>↑↓ naviguer</span>
            <span>↵ ouvrir dans Finder</span>
          </div>
        )}
      </div>
    </div>
  );
}
