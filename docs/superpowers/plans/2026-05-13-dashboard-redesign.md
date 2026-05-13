# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le Dashboard à onglets par un layout page unique : hero section, stats en ligne 4 colonnes, feed d'activité complet avec timestamps relatifs.

**Architecture:** Modification de deux fichiers React (`Dashboard/index.tsx`, `Dashboard/ActivityFeed.tsx`). Pas de nouveau composant, pas de nouvelle dépendance. Tailwind v4 + thème bordeaux `bx-*` déjà configuré.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide React, Zustand

---

## Fichiers touchés

| Fichier | Action |
|---------|--------|
| `src/components/Dashboard/index.tsx` | Modifier — supprimer onglets, ajouter Hero, grille 4 col |
| `src/components/Dashboard/ActivityFeed.tsx` | Modifier — ajouter timestamp relatif |

---

### Task 1 : Refactor `Dashboard/index.tsx` — supprimer les onglets et réécrire le layout

**Files:**
- Modify: `src/components/Dashboard/index.tsx`

- [ ] **Step 1 : Vérifier le rendu actuel (baseline)**

```bash
# Le serveur tourne déjà sur :1420, prendre un screenshot de référence
```
Ouvre http://localhost:1420 et note l'état actuel (onglets Aperçu/Activité).

- [ ] **Step 2 : Remplacer tout le contenu de `Dashboard/index.tsx`**

```tsx
import { useState } from 'react';
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

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-bx-800 transition-all"
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
```

- [ ] **Step 3 : Vérifier que TypeScript compile sans erreur**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -30
```

Attendu : aucune erreur (ou uniquement des warnings Tauri irrelevants).

- [ ] **Step 4 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src/components/Dashboard/index.tsx
git commit -m "feat: dashboard hero + stats 4-col + single feed, remove tab system"
```

---

### Task 2 : Ajouter les timestamps relatifs dans `ActivityFeed.tsx`

**Files:**
- Modify: `src/components/Dashboard/ActivityFeed.tsx`

`ActivityItem.timestamp` est un entier Unix en **secondes** (vient du backend Rust via Tauri).

- [ ] **Step 1 : Remplacer le contenu de `ActivityFeed.tsx`**

```tsx
import { invoke } from '@tauri-apps/api/core';
import { Undo2, FileText, Image, Music, Video, Archive, HelpCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import type { ActivityItem } from '../../store';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  document: <FileText size={14} className="text-blue-400" />,
  photo:    <Image   size={14} className="text-green-400" />,
  music:    <Music   size={14} className="text-purple-400" />,
  video:    <Video   size={14} className="text-orange-400" />,
  archive:  <Archive size={14} className="text-yellow-400" />,
};

function formatRelative(ts: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - ts;
  if (diffSec < 60)  return 'à l\'instant';
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
  return `il y a ${Math.floor(diffSec / 86400)} j`;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const handleUndo = async () => {
    try {
      await invoke('perform_undo', { actionId: item.action_id });
      useAppStore.setState((s) => ({
        activity: s.activity.filter((a) => a.action_id !== item.action_id),
      }));
    } catch (e) {
      console.error('Undo failed:', e);
    }
  };

  const icon = CATEGORY_ICONS[item.category] ?? <HelpCircle size={14} className="text-zinc-400" />;
  const destFolder = item.path_after.split('/').slice(-2).join('/');

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-bx-800/60 group transition-colors">
      <div className="w-7 h-7 rounded-md bg-bx-800 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-100 truncate font-medium">{item.name}</p>
        <p className="text-xs text-zinc-500 truncate">→ {destFolder}</p>
      </div>
      <span className="text-[10px] text-zinc-700 flex-shrink-0 mr-1">
        {formatRelative(item.timestamp)}
      </span>
      <button
        onClick={handleUndo}
        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded hover:bg-bx-600"
      >
        <Undo2 size={11} />
        annuler
      </button>
    </div>
  );
}

export function ActivityFeed({ limit }: { limit?: number } = {}) {
  const activity = useAppStore((s) => s.activity);
  const items = limit ? activity.slice(0, limit) : activity;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
        <p className="text-sm">Aucune activité récente</p>
        <p className="text-xs mt-1">Les fichiers organisés apparaîtront ici</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-bx-800">
      {items.map((item) => (
        <ActivityRow key={item.action_id} item={item} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier TypeScript**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -30
```

Attendu : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git add src/components/Dashboard/ActivityFeed.tsx
git commit -m "feat: activity feed with relative timestamps and icon container"
```

---

### Task 3 : Vérification visuelle Playwright + push

**Files:** aucun fichier modifié — vérification uniquement.

- [ ] **Step 1 : Recharger la page et prendre un screenshot**

Naviguer vers http://localhost:1420, attendre 2s, screenshot pleine page.

- [ ] **Step 2 : Vérifier que le rendu correspond au mockup**

Checklist :
- [ ] Hero visible (Bonjour 👋 + date + barre de progression)
- [ ] 4 stat-cards en ligne (pas 2×2)
- [ ] Aucun onglet Aperçu/Activité
- [ ] Feed d'activité visible directement sous les stats
- [ ] Boutons Rapport et CSV dans la topbar à droite

- [ ] **Step 3 : Push**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion"
git push
```
