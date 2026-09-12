import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { FileRecord } from '../../store';

const FAQ_ITEMS = [
  "Comment créer une règle de classification ?",
  "Pourquoi un fichier reste-t-il dans « À valider » ?",
  "Comment fonctionne la surveillance automatique ?",
  "Comment exporter mes fichiers ou l'historique ?",
  "Comment annuler une organisation automatique ?",
];

interface AssistantResponse {
  text: string;
  files: FileRecord[];
}

export function HelpView() {
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [error, setError] = useState('');

  async function askQuestion(question: string) {
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const resp = await invoke<AssistantResponse>('ask_assistant', {
        query: question,
        history: [],
      });
      setAnswer(resp.text);
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err as Error)?.message ?? String(err);
      if (msg.includes('not set') || msg.includes('api_key') || msg.includes('ANTHROPIC')) {
        setError('Clé API non configurée — allez dans Préférences → Intelligence Artificielle.');
      } else {
        setError(msg || 'Erreur lors de la requête.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-bx-950">
      {/* Topbar */}
      <div className="flex items-center px-5 h-11 border-b border-bx-800/80 shrink-0">
        <span className="text-sm font-semibold text-zinc-100 tracking-tight">Aide</span>
      </div>

      <div className="flex-1 overflow-auto px-5 py-5 flex flex-col gap-5">

        {/* FAQ questions */}
        <section>
          <p className="text-[10px] tracking-widest uppercase text-zinc-400 font-medium mb-3">
            Questions fréquentes
          </p>
          <div className="flex flex-col gap-1.5">
            {FAQ_ITEMS.map((q) => (
              <button
                key={q}
                onClick={() => askQuestion(q)}
                disabled={loading}
                className="text-left px-3 py-2.5 rounded-lg bg-bx-900 border border-bx-800 text-xs text-zinc-300 hover:text-zinc-100 hover:border-bx-600 transition-all disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </section>

        {/* Answer area */}
        {(loading || answer || error) && (
          <section>
            <p className="text-[10px] tracking-widest uppercase text-zinc-400 font-medium mb-3">
              Réponse
            </p>
            <div className="bg-bx-900 border border-bx-800 rounded-xl px-4 py-3 text-xs text-zinc-300 leading-relaxed min-h-[80px]">
              {loading && (
                <div className="flex items-center gap-2 text-zinc-300">
                  <Loader2 size={13} className="animate-spin" />
                  Chargement…
                </div>
              )}
              {!loading && error && <span className="text-rose-400">{error}</span>}
              {!loading && answer && (
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-sm font-semibold text-zinc-100 mt-3 mb-1">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xs font-semibold text-zinc-200 mt-3 mb-1">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-xs font-medium text-zinc-300 mt-2 mb-1">{children}</h3>,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
                    em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2">{children}</ol>,
                    li: ({ children }) => <li className="text-zinc-300">{children}</li>,
                    code: ({ children }) => <code className="bg-zinc-800 text-amber-300/90 px-1 py-0.5 rounded text-[10px] font-mono">{children}</code>,
                    pre: ({ children }) => <pre className="bg-zinc-800 rounded-lg p-3 overflow-x-auto mb-2 text-[10px] font-mono">{children}</pre>,
                    blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-600 pl-3 text-zinc-200 italic mb-2">{children}</blockquote>,
                  }}
                >
                  {answer}
                </ReactMarkdown>
              )}
            </div>
          </section>
        )}

        {/* Custom question */}
        <section>
          <p className="text-[10px] tracking-widest uppercase text-zinc-400 font-medium mb-3">
            Poser une question
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customQuery.trim()) {
                  askQuestion(customQuery.trim());
                  setCustomQuery('');
                }
              }}
              placeholder="Comment puis-je vous aider ?"
              className="flex-1 bg-bx-900 border border-bx-800 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-bx-600"
            />
            <button
              onClick={() => {
                if (customQuery.trim()) {
                  askQuestion(customQuery.trim());
                  setCustomQuery('');
                }
              }}
              disabled={loading || !customQuery.trim()}
              className="px-3 py-2 bg-bx-800 hover:bg-bx-700 disabled:opacity-40 rounded-lg text-zinc-300 transition-colors"
            >
              <Send size={13} />
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
