import { useState } from 'react';
import { Send } from 'lucide-react';

interface Props {
  onSubmit: (query: string) => void;
  loading: boolean;
}

export function InputBar({ onSubmit, loading }: Props) {
  const [value, setValue] = useState('');

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !loading) {
        onSubmit(value.trim());
        setValue('');
      }
    }
  }

  function handleSubmit() {
    if (value.trim() && !loading) {
      onSubmit(value.trim());
      setValue('');
    }
  }

  return (
    <div className="border-t border-zinc-700 p-3 flex gap-2 items-end">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Trouvez des fichiers… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"
        rows={2}
        disabled={loading}
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-amber-500/50 resize-none disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || loading}
        aria-label="Envoyer"
        className="p-2 bg-bx-700 hover:bg-bx-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-100 transition-colors"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
