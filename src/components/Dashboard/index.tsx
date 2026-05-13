import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store';
import { ActivityFeed } from './ActivityFeed';
import {
  Files, CheckSquare, Copy, TrendingUp,
  BarChart2, Download, Circle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ReactNode;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }: StatCardProps) {
  return (
    <div className="bg-bx-900 border border-bx-800 rounded-xl p-4 flex flex-col gap-2 hover:border-bx-600 transition-colors duration-200">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-medium tracking-widest uppercase text-zinc-500 leading-none">
          {label}
        </span>
        <span className="text-zinc-700">{icon}</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className={`text-2xl font-mono font-light leading-none tabular-nums ${color}`}>
          {value}
        </span>
      </div>
      {sub && (
        <span className="text-[10px] text-zinc-600 font-mono">{sub}</span>
      )}
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function Dashboard() {
  const { stats, isWatching } = useAppStore();
  const [reportExporting, setReportExporting] = useState(false);

  const orgRate =
    stats.total_files > 0
      ? Math.round((stats.organized_files / stats.total_files) * 100)
      : 0;

  const today = useMemo(() => new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }), []);

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
    <div className="flex flex-col h-full bg-bx-950">

      {/* ── Topbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 h-11 border-b border-bx-800/80 shrink-0">
        <span className="text-sm font-semibold text-zinc-100 tracking-tight">Dashboard</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExportReport}
            disabled={reportExporting}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-bx-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <BarChart2 size={11} />
            Rapport
          </button>
          <button
            disabled
            title="À venir"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-bx-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={11} />
            CSV
          </button>
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-5 py-5 flex flex-col gap-5">

        {/* Hero */}
        <div className="bg-gradient-to-br from-bx-800 via-bx-900 to-bx-950 border border-bx-700 rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-lg font-semibold text-zinc-100 mb-1">Bonjour 👋</p>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <Circle
                  size={6}
                  className={isWatching ? 'fill-emerald-400 text-emerald-400' : 'fill-zinc-600 text-zinc-600'}
                />
                <span>{isWatching ? 'Surveillance active' : 'Inactive'}</span>
                <span className="text-bx-700">·</span>
                <span className="capitalize">{today}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-bx-950 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${orgRate}%` }}
              />
            </div>
            <span className="text-[11px] text-zinc-500 whitespace-nowrap">
              {orgRate}% organisés · objectif 90%
            </span>
          </div>
        </div>

        {/* Stats row — 4 colonnes */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Total indexés"
            value={stats.total_files.toLocaleString('fr-FR')}
            sub="fichiers détectés"
            color="text-zinc-100"
            icon={<Files size={13} />}
          />
          <StatCard
            label="Organisés"
            value={stats.organized_files.toLocaleString('fr-FR')}
            sub={stats.total_files > 0 ? `${orgRate}% du total` : '—'}
            color="text-emerald-400"
            icon={<CheckSquare size={13} />}
          />
          <StatCard
            label="Doublons"
            value={stats.duplicate_files.toLocaleString('fr-FR')}
            sub="à traiter"
            color="text-rose-400"
            icon={<Copy size={13} />}
          />
          <StatCard
            label="Taux d'org."
            value={`${orgRate}`}
            sub="objectif : 90%"
            color="text-amber-400"
            icon={<TrendingUp size={13} />}
          />
        </div>

        {/* Activity feed */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] tracking-widest uppercase text-zinc-600 font-medium">
              Activité récente
            </span>
          </div>
          <div className="bg-bx-900 border border-bx-800 rounded-xl overflow-hidden">
            <ActivityFeed />
          </div>
        </div>

      </div>
    </div>
  );
}
