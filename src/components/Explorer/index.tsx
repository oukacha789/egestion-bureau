// src/components/Explorer/index.tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  FileText, Image, Music, Video, Archive, Code, HelpCircle, Mail,
} from 'lucide-react';
import { useAppStore, FileRecord, FileMetadata } from '../../store';
import { FileList } from './FileList';
import { MetadataPanel } from './MetadataPanel';

const CATEGORIES = [
  { id: 'photo',     label: 'Photos',    Icon: Image },
  { id: 'video',     label: 'Vidéos',    Icon: Video },
  { id: 'music',     label: 'Musiques',  Icon: Music },
  { id: 'document',  label: 'Documents', Icon: FileText },
  { id: 'archive',   label: 'Archives',  Icon: Archive },
  { id: 'code',      label: 'Code',      Icon: Code },
  { id: 'email',     label: 'E-mails',   Icon: Mail },
  { id: '_unsorted', label: '_Unsorted', Icon: HelpCircle },
];

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function Explorer() {
  const {
    selectedCategory, setSelectedCategory,
    selectedFileId, setSelectedFile,
    explorerFiles, setExplorerFiles,
    fileMetadata, setFileMetadata,
    explorerSort, setExplorerSort,
  } = useAppStore();

  const [focusZone, setFocusZone] = useState<'sidebar' | 'filelist'>('sidebar');

  // Load files when category or sort changes
  useEffect(() => {
    async function loadFiles() {
      try {
        const files = await invoke<FileRecord[]>('get_files_by_category', {
          category: selectedCategory,
          sortBy: explorerSort,
          page: 0,
        });
        setExplorerFiles(files);
      } catch (err) {
        console.error('get_files_by_category error:', err);
      }
    }
    loadFiles();
  }, [selectedCategory, explorerSort]);

  // Load metadata when file is selected
  useEffect(() => {
    if (!selectedFileId) {
      setFileMetadata(null);
      return;
    }
    async function loadMeta() {
      try {
        const meta = await invoke<FileMetadata>('get_file_metadata', { fileId: selectedFileId });
        setFileMetadata(meta);
      } catch (err) {
        console.error('get_file_metadata error:', err);
        setFileMetadata(null);
      }
    }
    loadMeta();
  }, [selectedFileId]);

  // (Space → QuickLook is handled inside FileList when focusZone === 'filelist')

  // Sidebar keyboard: ↑↓ navigate categories, → enter filelist
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (focusZone !== 'sidebar') return;

      const idx = CATEGORY_IDS.indexOf(selectedCategory);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(idx + 1, CATEGORY_IDS.length - 1);
        setSelectedCategory(CATEGORY_IDS[next]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(idx - 1, 0);
        setSelectedCategory(CATEGORY_IDS[prev]);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (explorerFiles.length > 0) setFocusZone('filelist');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusZone, selectedCategory, explorerFiles, setSelectedCategory]);

  return (
    <div className="flex h-full">
      {/* Category sidebar */}
      <div
        onClick={() => setFocusZone('sidebar')}
        className={`w-44 shrink-0 border-r py-4 flex flex-col gap-1 px-2 transition-colors cursor-default ${
          focusZone === 'sidebar' ? 'border-blue-600' : 'border-zinc-800'
        }`}
      >
        <div className="px-2 pb-2 text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Catégories
        </div>
        {CATEGORIES.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => { setSelectedCategory(id); setFocusZone('sidebar'); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedCategory === id
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-200 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* File list */}
      <div className="flex-1 min-w-0">
        <FileList
          files={explorerFiles}
          sort={explorerSort}
          onSortChange={setExplorerSort}
          selectedFileId={selectedFileId}
          onSelectFile={setSelectedFile}
          focusZone={focusZone}
          onFocusZoneChange={setFocusZone}
        />
      </div>

      {/* Metadata panel */}
      <MetadataPanel metadata={fileMetadata} />
    </div>
  );
}
