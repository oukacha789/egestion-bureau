import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Unsorted } from './components/Unsorted';
import { Sidebar } from './components/layout/Sidebar';
import { useFileEvents } from './hooks/useFileEvents';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  useFileEvents();

  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />
      <main className="flex-1 overflow-hidden">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'unsorted' && <Unsorted />}
      </main>
    </div>
  );
}

export default App;
