import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useAppStore, AssistantMessage, FileRecord } from '../../store';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';

export function AssistantOverlay() {
  const isOpen = useAppStore((s) => s.isAssistantOpen);
  const setOpen = useAppStore((s) => s.setAssistantOpen);
  const messages = useAppStore((s) => s.assistantMessages);
  const addMessage = useAppStore((s) => s.addAssistantMessage);
  const clearMessages = useAppStore((s) => s.clearAssistantMessages);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    clearMessages();
  }, [setOpen, clearMessages]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, close]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(query: string) {
    const userMsg: AssistantMessage = { role: 'user', content: query, files: [], createdAt: Date.now() };
    addMessage(userMsg);
    setLoading(true);

    // Build history including the new user message so multi-turn context is complete
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await invoke<{ files: FileRecord[]; text: string }>('ask_assistant', {
        query,
        history,
      });
      addMessage({
        role: 'assistant',
        content: response.text,
        files: response.files,
        createdAt: Date.now(),
      });
    } catch (err) {
      addMessage({
        role: 'assistant',
        content: `Erreur : ${err}`,
        files: [],
        createdAt: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="w-full max-w-xl h-[600px] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 shrink-0">
          <span className="text-sm font-medium text-zinc-200">Assistant Egestion</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">⌘J</span>
            <button
              onClick={close}
              aria-label="Fermer l'assistant"
              className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <MessageList messages={messages} />
        {loading && (
          <div className="px-4 pb-2 text-xs text-zinc-500 animate-pulse">Recherche en cours…</div>
        )}
        <div ref={bottomRef} />

        <InputBar onSubmit={handleSubmit} loading={loading} />
      </div>
    </div>
  );
}
