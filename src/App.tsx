import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Unsorted } from './components/Unsorted';
import { Explorer } from './components/Explorer';
import { CommandPalette } from './components/Search/CommandPalette';
import { AssistantOverlay } from './components/Assistant/AssistantOverlay';
import { Sidebar } from './components/layout/Sidebar';
import { useFileEvents } from './hooks/useFileEvents';
import { useKeyboard } from './hooks/useKeyboard';
import { PreferencesView } from './components/Preferences/PreferencesView';
import { RulesView } from './components/Rules';
import { UndoToast } from './components/UndoToast';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  useFileEvents();
  useKeyboard();

  return (
    <div className="flex h-screen bg-bx-950 text-zinc-100 overflow-hidden">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />
      <main className="flex-1 overflow-hidden">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'explorer'  && <Explorer />}
        {currentView === 'unsorted'  && <Unsorted />}
        {currentView === 'preferences' && <PreferencesView />}
        {currentView === 'rules' && <RulesView />}
      </main>
      <CommandPalette />
      <AssistantOverlay />
      <UndoToast />
    </div>
  );
}

export default App;
