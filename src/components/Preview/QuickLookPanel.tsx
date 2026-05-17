import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileQuestion, Eye } from 'lucide-react';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
const TEXT_EXTS = new Set(['txt', 'md', 'json', 'ts', 'tsx', 'js', 'jsx', 'rs', 'toml', 'yaml', 'yml', 'sh', 'py', 'html', 'css']);

function getExt(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

function QuickLookButton({ path }: { path: string }) {
  const handleClick = () => invoke('open_quick_look', { path });
  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-200 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
    >
      <Eye size={11} />
      Aperçu rapide
    </button>
  );
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
      <>
        <div className="h-48 flex items-center justify-center bg-zinc-900/50 rounded-lg overflow-hidden mt-3">
          <img
            src={convertFileSrc(path)}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <div className="mt-2 flex justify-center">
          <QuickLookButton path={path} />
        </div>
      </>
    );
  }

  if (ext === 'pdf') {
    return (
      <>
        <div className="h-48 mt-3 rounded-lg overflow-hidden border border-zinc-700">
          <iframe
            src={convertFileSrc(path)}
            className="w-full h-full"
            title="PDF preview"
          />
        </div>
        <div className="mt-2 flex justify-center">
          <QuickLookButton path={path} />
        </div>
      </>
    );
  }

  if (TEXT_EXTS.has(ext) && textContent !== null) {
    return (
      <>
        <div className="mt-3 h-48 overflow-auto bg-zinc-900/50 rounded-lg border border-zinc-800 p-2">
          <pre className="text-xs text-zinc-200 whitespace-pre-wrap font-mono leading-relaxed">
            {textContent}
          </pre>
        </div>
        <div className="mt-2 flex justify-center">
          <QuickLookButton path={path} />
        </div>
      </>
    );
  }

  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-3 bg-zinc-900/30 rounded-lg border border-zinc-800 py-6">
      <FileQuestion size={20} className="text-zinc-400" />
      <span className="text-xs text-zinc-400">Pas d'aperçu disponible</span>
      <QuickLookButton path={path} />
    </div>
  );
}
