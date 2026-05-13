import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store';
import { ActivityFeed } from './ActivityFeed';
import {
  Files, CheckSquare, Copy, TrendingUp,
  BarChart2, Download, Circle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'apercu' | 'activite';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  icon: React.ReactNode;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, icon }: StatCardProps) {
  return (
    <div className="group relative bg-[#220810] border border-[#3D1525] rounded-xl p-5 flex flex-col gap-3 hover:border-[#5C1A2A] transition-colors duration-200 overflow-hidden">
      {/* accent line */}
      <div className={`absolute top-0 left-0 right-0 h-px ${accent}`} />

      <div className="flex items-start justify-between">
        <span className="text-[10px] font-medium tracking-widest uppercase text-zinc-500 leading-none">
          {label}
        </span>
        <span className="text-zinc-700 group-hover:text-zinc-500 transition-colors">
          {icon}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-mono font-light text-zinc-100 leading-none tabular-nums">
          {value}
        </span>
        {sub && (
          <span className="text-xs text-zinc-600 mb-0.5 font-mono">{sub}</span>
        )}
      </div>
    </div>
  );
}

// ─── TabPill ─────────────────────────────────────────────────────────────────

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
        active
          ? 'bg-[#5C1A2A] text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function Dashboard() {
  const { stats, isWatching } = useAppStore();
  const [tab, setTab] = useState<Tab>('apercu');
  const [reportExporting, setReportExporting] = useState(false);

  const orgRate =
    stats.total_files > 0
      ? Math.round((stats.organized_files / stats.total_files) * 100)
      : 0;

  async function handleExportReport() {
    setReportExporting(true);
    try {
      const html = await invoke<string>('export_report');
      const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `egestion-rapport-${Date.now()}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error('export_report error:', err);
    } finally {
      setReportExporting(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#1A0408]">

      {/* ── Topbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 h-11 border-b border-[#3D1525]/80 shrink-0">

        {/* Status dot + label */}
        <div className="flex items-center gap-2">
          <Circle
            size={6}
            className={isWatching ? 'fill-emerald-400 text-emerald-400' : 'fill-zinc-600 text-zinc-600'}
          />
          <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-medium select-none">
            {isWatching ? 'Actif' : 'Inactif'}
          </span>
        </div>

        {/* Tab pills */}
        <div className="flex items-center gap-0.5 bg-[#220810] border border-[#3D1525] rounded-lg p-0.5">
          <TabPill active={tab === 'apercu'} onClick={() => setTab('apercu')}>
            Aperçu
          </TabPill>
          <TabPill active={tab === 'activite'} onClick={() => setTab('activite')}>
            Activité
          </TabPill>
        </div>

        {/* Action group */}
        <div className="flex items-center gap-1 bg-[#220810] border border-[#3D1525] rounded-lg p-1">
          <button
            onClick={handleExportReport}
            disabled={reportExporting}
            title="Générer rapport HTML"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-[#4A1525] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <BarChart2 size={11} />
            Rapport
          </button>
          <div className="w-px h-4 bg-[#3D1525]" />
          <button
            title="Exporter CSV"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-[#4A1525] transition-all"
          >
            <Download size={11} />
            CSV
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      {tab === 'apercu' && (
        <div className="flex-1 overflow-auto px-5 py-5 flex flex-col gap-5">

          {/* Stat grid 2×2 */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Total indexés"
              value={stats.total_files.toLocaleString()}
              accent="bg-gradient-to-r from-indigo-500/60 to-transparent"
              icon={<Files size={14} />}
            />
            <StatCard
              label="Organisés"
              value={stats.organized_files.toLocaleString()}
              accent="bg-gradient-to-r from-emerald-500/60 to-transparent"
              icon={<CheckSquare size={14} />}
            />
            <StatCard
              label="Doublons"
              value={stats.duplicate_files.toLocaleString()}
              accent="bg-gradient-to-r from-rose-500/60 to-transparent"
              icon={<Copy size={14} />}
            />
            <StatCard
              label="Taux d'org."
              value={`${orgRate}`}
              sub="%"
              accent="bg-gradient-to-r from-amber-500/60 to-transparent"
              icon={<TrendingUp size={14} />}
            />
          </div>

          {/* Activity preview */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-zinc-600 font-medium">
                Activité récente
              </span>
              <button
                onClick={() => setTab('activite')}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Tout voir →
              </button>
            </div>
            <div className="bg-[#220810] border border-[#3D1525] rounded-xl overflow-hidden">
              <ActivityFeed limit={5} />
            </div>
          </div>
        </div>
      )}

      {tab === 'activite' && (
        <div className="flex-1 overflow-auto">
          <div className="px-5 py-4">
            <span className="text-[10px] tracking-widest uppercase text-zinc-600 font-medium">
              Historique complet
            </span>
          </div>
          <div className="px-5 pb-5">
            <div className="bg-[#220810] border border-[#3D1525] rounded-xl overflow-hidden">
              <ActivityFeed />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
