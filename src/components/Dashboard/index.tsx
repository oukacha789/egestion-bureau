import { useAppStore } from '../../store';
import { ActivityFeed } from './ActivityFeed';
import { Files, CheckSquare, Copy } from 'lucide-react';

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-zinc-800/60 rounded-xl p-4 flex items-center gap-3">
      <div className="text-zinc-400">{icon}</div>
      <div>
        <p className="text-2xl font-semibold text-zinc-100">{value.toLocaleString()}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { stats, isWatching } = useAppStore();

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-100">Dashboard</h1>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isWatching ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-xs text-zinc-500">{isWatching ? 'Actif' : 'Inactif'}</span>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 grid grid-cols-3 gap-3">
        <StatCard icon={<Files size={18} />} label="Total indexés" value={stats.total_files} />
        <StatCard icon={<CheckSquare size={18} />} label="Organisés" value={stats.organized_files} />
        <StatCard icon={<Copy size={18} />} label="Doublons" value={stats.duplicate_files} />
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-3">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Activité récente</h2>
        </div>
        <ActivityFeed />
      </div>
    </div>
  );
}
