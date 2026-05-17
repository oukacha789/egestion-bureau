import { LayoutDashboard, FolderOpen, Folder, FolderClosed, Mail, Settings, SlidersHorizontal, HelpCircle } from 'lucide-react';
import { useAppStore } from '../../store';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'explorer',    label: 'Explorer',    icon: Folder },
  { id: 'unsorted',    label: 'À valider',   icon: FolderOpen },
  { id: 'emails',      label: 'E-mails',     icon: Mail },
  { id: 'rules',       label: 'Règles',      icon: SlidersHorizontal },
  { id: 'preferences', label: 'Préférences', icon: Settings },
  { id: 'help',        label: 'Aide',        icon: HelpCircle },
];

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const { isWatching, watchedDirs, stats, setSelectedCategory, selectedCategory, rules } = useAppStore();
  const unsortedCount = Math.max(0, stats.total_files - stats.organized_files);
  const enabledRulesCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="w-48 bg-bx-900 border-r border-bx-800 flex flex-col py-4">

      {/* ── Logo ───────────────────────────────────────────────── */}
      <div className="px-3.5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-bx-600 to-bx-800 rounded-lg flex items-center justify-center text-[13px] font-bold text-zinc-100 shrink-0 select-none">
            E
          </div>
          <div>
            <p className="text-[13px] font-bold text-zinc-100 leading-tight tracking-tight">Egestion</p>
            <p className="text-[9px] text-zinc-400">v0.1.0</p>
          </div>
        </div>
      </div>

      {/* ── Carte statut ───────────────────────────────────────── */}
      <div className="mx-2 mb-3 bg-[#2a0f1a] border border-bx-800 rounded-lg p-2.5">
        <p className="text-[8px] font-semibold uppercase tracking-[1.5px] text-zinc-400 mb-1.5">
          Dossiers surveillés
        </p>
        <div className="flex flex-col gap-1 mb-2">
          {watchedDirs.length > 0 ? (
            watchedDirs.map((dir) => (
              <div key={dir} className="flex items-center gap-1.5 text-[10px] text-zinc-200">
                <FolderClosed size={10} className="opacity-50 shrink-0" />
                {dir}
              </div>
            ))
          ) : (
            <div className="text-[10px] text-zinc-400">—</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isWatching ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          <span className={`text-[9px] font-medium ${isWatching ? 'text-emerald-400' : 'text-zinc-400'}`}>
            {isWatching ? 'Surveillance active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* ── Nav ────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = id === 'emails'
            ? (currentView === 'explorer' && selectedCategory === 'email')
            : currentView === id;

          return (
            <button
              key={id}
              onClick={() => {
                if (id === 'emails') {
                  setSelectedCategory('email');
                  onNavigate('explorer');
                } else {
                  onNavigate(id);
                }
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
                isActive
                  ? 'bg-bx-600 text-zinc-100'
                  : 'text-zinc-300 hover:text-zinc-200 hover:bg-bx-800'
              }`}
            >
              <Icon size={13} />
              <span>{label}</span>
              {id === 'unsorted' && unsortedCount > 0 && (
                <span className="ml-auto text-[9px] font-semibold bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full">
                  {unsortedCount}
                </span>
              )}
              {id === 'emails' && stats.email_files > 0 && (
                <span className="ml-auto text-[9px] font-semibold bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full">
                  {stats.email_files}
                </span>
              )}
              {id === 'rules' && enabledRulesCount > 0 && (
                <span className="ml-auto text-[9px] font-semibold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
                  {enabledRulesCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="px-3.5 pt-2 border-t border-bx-800 flex items-center justify-between">
        <p className="text-[10px] text-zinc-500">⌘K chercher</p>
        <kbd className="text-[9px] text-zinc-500 bg-bx-800 border border-bx-700 rounded px-1.5 py-0.5">K</kbd>
      </div>

    </div>
  );
}
