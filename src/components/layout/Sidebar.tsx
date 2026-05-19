import { LayoutDashboard, FolderOpen, Folder, FolderClosed, Mail, Settings, SlidersHorizontal, HelpCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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

const ABOUT_PARAGRAPHS = [
  "eGestion est une application de bureau macOS conçue pour organiser automatiquement vos fichiers, sans effort.",
  "Elle surveille en temps réel vos dossiers (Downloads, Desktop, Documents…) et classe chaque nouveau fichier selon des règles que vous définissez — par extension, par nom, par source. Un fichier PDF arrivé dans Downloads peut être automatiquement déplacé vers ~/Documents/PDF en quelques secondes.",
  "Quand aucune règle ne correspond, l'intelligence artificielle intégrée (Claude) analyse le fichier et suggère une catégorie. Vous validez en un clic, ou laissez eGestion décider.",
  "Les doublons sont détectés et signalés. Un historique complet de chaque action est conservé, avec la possibilité d'annuler à tout moment. Les notifications macOS vous tiennent informé discrètement.",
  "eGestion inclut aussi un assistant IA accessible depuis le panneau Aide — posez-lui n'importe quelle question sur vos fichiers ou sur le fonctionnement de l'app.",
  "Conçu pour les créatifs, les professionnels et tous ceux qui veulent reprendre le contrôle de leur espace numérique.",
];

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const { isWatching, watchedDirs, stats, setSelectedCategory, selectedCategory, rules } = useAppStore();
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    if (!aboutOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAboutOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aboutOpen]);
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
            <div className="flex items-baseline gap-1.5">
              <p className="text-[13px] font-bold text-zinc-100 leading-tight tracking-tight">Egestion</p>
              <button
                onClick={() => setAboutOpen(true)}
                className="text-[9px] text-zinc-400 hover:text-zinc-200 transition-colors leading-none"
              >
                À propos
              </button>
            </div>
            <p className="text-[9px] text-zinc-400">v0.1.0-beta</p>
          </div>
        </div>
      </div>

      {/* ── Modal À propos ─────────────────────────────────────── */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setAboutOpen(false)}
        >
          <div
            className="w-[500px] max-h-[80vh] flex flex-col bg-zinc-950 border border-bx-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative flex items-center gap-3 px-6 py-5 bg-gradient-to-r from-bx-900 to-zinc-950 border-b border-bx-800">
              <div className="w-9 h-9 bg-gradient-to-br from-bx-500 to-bx-800 rounded-xl flex items-center justify-center text-base font-bold text-zinc-100 shrink-0">
                E
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-100 tracking-tight">eGestion</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">Version 0.1.0-beta · macOS</p>
                <p className="text-[9px] text-amber-500/80 mt-0.5">Version bêta — usage personnel uniquement</p>
              </div>
              <button
                onClick={() => setAboutOpen(false)}
                className="absolute right-4 top-4 p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-bx-800 rounded-lg transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
              {ABOUT_PARAGRAPHS.map((p, i) => (
                <p
                  key={i}
                  className={`leading-relaxed ${
                    i === 0
                      ? 'text-sm font-medium text-zinc-200'
                      : i === ABOUT_PARAGRAPHS.length - 1
                      ? 'text-xs text-bx-300 italic'
                      : 'text-xs text-zinc-300'
                  }`}
                >
                  {p}
                </p>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-bx-800 bg-bx-900/40 flex flex-col gap-1">
              <p className="text-[10px] text-zinc-400 text-center font-medium">
                © 2026 Abdelouahhab Mellouki — Tous droits réservés
              </p>
              <p className="text-[9px] text-zinc-600 text-center">
                Logiciel propriétaire · Redistribution interdite sans autorisation
              </p>
            </div>
          </div>
        </div>
      )}

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
