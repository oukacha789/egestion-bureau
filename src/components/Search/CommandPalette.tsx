import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search } from 'lucide-react';
import { useAppStore } from '../../store';
import { useSearch } from '../../hooks/useSearch';
import { SearchResultItem } from './SearchResult';
import { CategoryChips } from './CategoryChips';
import { SearchPreview } from './SearchPreview';
import type { SearchResult } from '../../store';

export function CommandPalette() {
  const {
    isSearchOpen, setSearchOpen,
    searchResults, setSearchResults,
    setCurrentView, setSelectedCategory, setSelectedFile,
  } = useAppStore();
  const { search } = useSearch();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (isSearchOpen) {
      setQuery('');
      setSelectedIdx(0);
      setActiveCategory(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchResults([]);
    }
  }, [isSearchOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [searchResults.length]);

  // Unified search trigger
  useEffect(() => {
    if (isSearchOpen) {
      search(query, activeCategory ?? undefined);
    }
  }, [query, activeCategory, isSearchOpen]);

  const selectedResult: SearchResult | null = searchResults[selectedIdx] ?? null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setSearchOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedResult) {
      if (e.metaKey) {
        navigateToExplorer(selectedResult);
      } else if (e.altKey) {
        copyPath(selectedResult.path);
      } else {
        openFile(selectedResult.path);
      }
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

  function navigateToExplorer(result: SearchResult) {
    setSearchOpen(false);
    setCurrentView('explorer');
    setSelectedCategory(result.category);
    setSelectedFile(result.id);
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      // clipboard API may fail silently in Tauri webview
    }
    setSearchOpen(false);
  }

  if (!isSearchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm"
      onClick={() => setSearchOpen(false)}
    >
      <div
        className="w-[760px] bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col max-h-[560px]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <Search size={15} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un fichier…"
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 text-sm outline-none"
          />
          <kbd className="text-xs text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">esc</kbd>
        </div>

        {/* Category chips */}
        <CategoryChips active={activeCategory} onChange={setActiveCategory} />

        {/* Body: two columns */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Results list */}
          <div className="w-[420px] overflow-y-auto border-r border-zinc-800 shrink-0">
            {searchResults.length === 0 && query.trim() !== '' ? (
              <div className="px-4 py-10 text-center text-sm text-zinc-600">Aucun résultat</div>
            ) : (
              searchResults.map((r, i) => (
                <SearchResultItem
                  key={r.id}
                  result={r}
                  isSelected={i === selectedIdx}
                  query={query}
                  onClick={() => setSelectedIdx(i)}
                />
              ))
            )}
          </div>

          {/* Preview panel */}
          <div className="flex-1 overflow-y-auto bg-zinc-900/50">
            {selectedResult ? (
              <SearchPreview
                result={selectedResult}
                onOpenFinder={openFile}
                onNavigateExplorer={navigateToExplorer}
                onCopyPath={copyPath}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-zinc-700">
                Sélectionner un résultat
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-800 flex gap-4 text-[10px] text-zinc-600 shrink-0">
          <span>↑↓ naviguer</span>
          <span>↵ Finder</span>
          <span>⌘↵ Explorer</span>
          <span>⌥↵ copier chemin</span>
        </div>
      </div>
    </div>
  );
}
