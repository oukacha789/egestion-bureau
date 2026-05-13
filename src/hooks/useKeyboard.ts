import { useEffect } from 'react';
import { useAppStore } from '../store';

export function useKeyboard() {
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAssistantOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSearchOpen, setAssistantOpen]);
}
