import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Unsorted } from './components/Unsorted';
import { Explorer } from './components/Explorer';
import { CommandPalette } from './components/Search/CommandPalette';
import { Sidebar } from './components/layout/Sidebar';
import { useFileEvents } from './hooks/useFileEvents';
import { useKeyboard } from './hooks/useKeyboard';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  useFileEvents();
  useKeyboard();

  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />
      <main className="flex-1 overflow-hidden">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'explorer'  && <Explorer />}
        {currentView === 'unsorted'  && <Unsorted />}
      </main>
      <CommandPalette />
    </div>
  );
}

export default App;
