import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Plus } from 'lucide-react';

interface Props {
  fileId: string;
}

export function TagEditor({ fileId }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    loadTags();
  }, [fileId]);

  async function loadTags() {
    try {
      const result = await invoke<string[]>('get_tags', { fileId });
      setTags(result);
    } catch (err) {
      console.error('get_tags error:', err);
    }
  }

  async function handleAdd() {
    const tag = input.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    try {
      await invoke('add_tag', { fileId, tag });
      setTags((prev) => [...prev, tag]);
      setInput('');
    } catch (err) {
      console.error('add_tag error:', err);
    }
  }

  async function handleRemove(tag: string) {
    try {
      await invoke('remove_tag', { fileId, tag });
      setTags((prev) => prev.filter((t) => t !== tag));
    } catch (err) {
      console.error('remove_tag error:', err);
    }
  }

  return (
    <div>
      <div className="text-zinc-500 mb-1.5 text-xs">Tags manuels</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-900/60 border border-indigo-700/50 rounded text-indigo-200 text-xs"
          >
            {t}
            <button
              onClick={() => handleRemove(t)}
              className="text-indigo-400 hover:text-indigo-200 transition-colors"
              aria-label={`Supprimer tag ${t}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Ajouter un tag…"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleAdd}
          className="p-1 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors text-zinc-300"
          aria-label="Ajouter tag"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
