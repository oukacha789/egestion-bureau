import { useAppStore } from './store';
import { Dashboard } from './components/Dashboard';
import { Unsorted } from './components/Unsorted';
import { Explorer } from './components/Explorer';
import { CommandPalette } from './components/Search/CommandPalette';
import { AssistantOverlay } from './components/Assistant/AssistantOverlay';
import { Sidebar } from './components/layout/Sidebar';
import { TitleBar } from './components/layout/TitleBar';
import { useFileEvents } from './hooks/useFileEvents';
import { useKeyboard } from './hooks/useKeyboard';
import { PreferencesView } from './components/Preferences/PreferencesView';
import { RulesView } from './components/Rules';
import { HelpView } from './components/Help';
import { UndoToast } from './components/UndoToast';

function App() {
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  useFileEvents();
  useKeyboard();

  return (
    <div className="flex flex-col h-screen bg-bx-950 text-zinc-100 overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={currentView} onNavigate={setCurrentView} />
        <main className="flex-1 overflow-hidden">
          {currentView === 'dashboard'    && <Dashboard />}
          {currentView === 'explorer'     && <Explorer />}
          {currentView === 'unsorted'     && <Unsorted />}
          {currentView === 'preferences'  && <PreferencesView />}
          {currentView === 'rules'        && <RulesView />}
          {currentView === 'help'         && <HelpView />}
        </main>
      </div>
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-tl from-bx-900 to-transparent z-[5]" aria-hidden="true" />
      <CommandPalette />
      <AssistantOverlay />
      <UndoToast />
    </div>
  );
}

export default App;
