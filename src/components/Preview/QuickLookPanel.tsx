import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileQuestion } from 'lucide-react';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
const TEXT_EXTS = new Set(['txt', 'md', 'json', 'ts', 'tsx', 'js', 'jsx', 'rs', 'toml', 'yaml', 'yml', 'sh', 'py', 'html', 'css']);

function getExt(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

interface Props {
  path: string;
}

export function QuickLookPanel({ path }: Props) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const ext = getExt(path);

  useEffect(() => {
    if (TEXT_EXTS.has(ext)) {
      invoke<string>('read_text_preview', { path })
        .then(setTextContent)
        .catch(() => setTextContent(null));
    } else {
      setTextContent(null);
    }
  }, [path, ext]);

  if (IMAGE_EXTS.has(ext)) {
    return (
      <div className="h-48 flex items-center justify-center bg-zinc-900/50 rounded-lg overflow-hidden mt-3">
        <img
          src={convertFileSrc(path)}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  if (ext === 'pdf') {
    return (
      <div className="h-48 mt-3 rounded-lg overflow-hidden border border-zinc-700">
        <iframe
          src={convertFileSrc(path)}
          className="w-full h-full"
          title="PDF preview"
        />
      </div>
    );
  }

  if (TEXT_EXTS.has(ext) && textContent !== null) {
    return (
      <div className="mt-3 h-48 overflow-auto bg-zinc-900/50 rounded-lg border border-zinc-800 p-2">
        <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
          {textContent}
        </pre>
      </div>
    );
  }

  return (
    <div className="mt-3 h-20 flex flex-col items-center justify-center bg-zinc-900/30 rounded-lg border border-zinc-800 text-zinc-600">
      <FileQuestion size={20} />
      <span className="text-xs mt-1">Pas d'aperçu disponible</span>
    </div>
  );
}
