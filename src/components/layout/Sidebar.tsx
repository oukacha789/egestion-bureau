import { LayoutDashboard, FolderOpen, Folder } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'explorer',  label: 'Explorer',   icon: Folder },
  { id: 'unsorted',  label: 'À valider',  icon: FolderOpen },
];

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  return (
    <div className="w-48 bg-bx-900 border-r border-bx-800 flex flex-col py-4">
      <div className="px-4 mb-6">
        <h1 className="text-sm font-bold text-zinc-100 tracking-tight">Egestion</h1>
      </div>
      <nav className="flex-1 px-2 space-y-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === id
                ? 'bg-bx-600 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-bx-800'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>
      <div className="px-4 pt-2 border-t border-bx-800">
        <p className="text-xs text-zinc-600">⌘K pour chercher</p>
      </div>
    </div>
  );
}
