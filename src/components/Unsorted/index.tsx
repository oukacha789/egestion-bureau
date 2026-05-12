import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, X } from 'lucide-react';

interface FileRecord {
  id: string;
  name: string;
  path: string;
  extension: string | null;
  size_bytes: number;
  category: string | null;
  confidence: number | null;
}

const CATEGORIES = ['document', 'photo', 'video', 'music', 'archive', 'installer', 'code', 'other'];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Unsorted() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await invoke<FileRecord[]>('get_unsorted_files');
      setFiles(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const validate = async (fileId: string, category: string) => {
    await invoke('validate_unsorted_file', { fileId, category, subcategory: null });
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const dismiss = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">Chargement...</p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600">
        <Check size={32} className="mb-3 text-green-500" />
        <p className="text-sm">Tout est classifié</p>
        <p className="text-xs mt-1">Aucun fichier en attente de validation</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-100">À valider</h1>
        <p className="text-xs text-zinc-500 mt-0.5">{files.length} fichier(s) en attente</p>
      </div>
      <div className="flex-1 overflow-auto divide-y divide-zinc-800">
        {files.map((file) => (
          <div key={file.id} className="px-6 py-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">{file.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {formatSize(file.size_bytes)} · {file.extension ?? 'inconnu'}
                  {file.confidence !== null && ` · confiance ${Math.round(file.confidence * 100)}%`}
                </p>
              </div>
              <button
                onClick={() => dismiss(file.id)}
                className="text-zinc-600 hover:text-zinc-400 p-1"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => validate(file.id, cat)}
                  className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors capitalize"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
