import { create } from 'zustand';

export interface ActivityItem {
  action_id: string;
  file_id: string;
  name: string;
  path_before: string;
  path_after: string;
  category: string;
  timestamp: number;
}

export interface StatsData {
  total_files: number;
  organized_files: number;
  duplicate_files: number;
}

interface AppStore {
  activity: ActivityItem[];
  stats: StatsData;
  isWatching: boolean;
  addActivity: (item: ActivityItem) => void;
  setStats: (stats: StatsData) => void;
  setIsWatching: (v: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activity: [],
  stats: { total_files: 0, organized_files: 0, duplicate_files: 0 },
  isWatching: false,
  addActivity: (item) =>
    set((state) => ({
      activity: [item, ...state.activity].slice(0, 50),
    })),
  setStats: (stats) => set({ stats }),
  setIsWatching: (v) => set({ isWatching: v }),
}));
