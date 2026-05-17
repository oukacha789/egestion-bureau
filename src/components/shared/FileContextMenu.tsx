import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  separator?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function FileContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouse);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouse);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const menuW = 200;
  const menuH = items.length * 32 + 8;
  const left = x + menuW > window.innerWidth  ? x - menuW : x;
  const top  = y + menuH > window.innerHeight ? y - menuH : y;

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-[100] w-[200px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 text-xs"
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && i > 0 && <div className="my-1 border-t border-zinc-700" />}
          <button
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full text-left px-3 py-1.5 transition-colors ${
              item.danger
                ? 'text-rose-400 hover:bg-rose-500/10'
                : 'text-zinc-200 hover:bg-zinc-700'
            }`}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
