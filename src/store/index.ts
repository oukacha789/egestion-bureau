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
  email_files: number;
}

export interface SearchResult {
  id: string;
  name: string;
  path: string;
  category: string;
  subcategory: string;
  tags: string[];
  year: number;
  score: number;
}

export interface FileRecord {
  id: string;
  path: string;
  name: string;
  extension: string | null;
  size_bytes: number;
  category: string | null;
  subcategory: string | null;
  confidence: number | null;
  classifier: string | null;
  modified_at: number;
  created_at: number;
}

export interface FileMetadata {
  id: string;
  name: string;
  path: string;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  size_bytes: number;
  created_at: number;
  modified_at: number;
  confidence: number | null;
  classifier: string | null;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  files: FileRecord[];
  createdAt: number;
}

export interface RuleRecord {
  id: string;
  name: string;
  condition_type: 'extension' | 'name_contains' | 'source';
  condition_value: string;
  target_dir: string;
  auto_tag: string | null;
  priority: number;
  enabled: boolean;
  created_at: number;
}

interface AppStore {
  // Dashboard
  activity: ActivityItem[];
  stats: StatsData;
  isWatching: boolean;
  addActivity: (item: ActivityItem) => void;
  setStats: (stats: StatsData) => void;
  setIsWatching: (v: boolean) => void;

  // Sidebar
  watchedDirs: string[];
  setWatchedDirs: (dirs: string[]) => void;

  // Search
  isSearchOpen: boolean;
  searchResults: SearchResult[];
  setSearchOpen: (open: boolean) => void;
  setSearchResults: (results: SearchResult[]) => void;

  // Assistant
  isAssistantOpen: boolean;
  assistantMessages: AssistantMessage[];
  setAssistantOpen: (open: boolean) => void;
  addAssistantMessage: (msg: AssistantMessage) => void;
  clearAssistantMessages: () => void;

  // Explorer
  selectedCategory: string;
  selectedFileId: string | null;
  explorerFiles: FileRecord[];
  fileMetadata: FileMetadata | null;
  explorerSort: string;
  setSelectedCategory: (cat: string) => void;
  setSelectedFile: (id: string | null) => void;
  setExplorerFiles: (files: FileRecord[]) => void;
  setFileMetadata: (meta: FileMetadata | null) => void;
  setExplorerSort: (sort: string) => void;

  // Rules
  rules: RuleRecord[];
  setRules: (rules: RuleRecord[]) => void;
  addRule: (rule: RuleRecord) => void;
  removeRule: (id: string) => void;
  updateRule: (rule: RuleRecord) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activity: [],
  stats: { total_files: 0, organized_files: 0, duplicate_files: 0, email_files: 0 },
  isWatching: false,
  addActivity: (item) =>
    set((state) => ({ activity: [item, ...state.activity].slice(0, 50) })),
  setStats: (stats) => set({ stats }),
  setIsWatching: (v) => set({ isWatching: v }),

  watchedDirs: [],
  setWatchedDirs: (dirs) => set({ watchedDirs: dirs }),

  isSearchOpen: false,
  searchResults: [],
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setSearchResults: (results) => set({ searchResults: results }),

  isAssistantOpen: false,
  assistantMessages: [],
  setAssistantOpen: (open) => set({ isAssistantOpen: open }),
  addAssistantMessage: (msg) =>
    set((state) => ({ assistantMessages: [...state.assistantMessages, msg] })),
  clearAssistantMessages: () => set({ assistantMessages: [] }),

  selectedCategory: 'document',
  selectedFileId: null,
  explorerFiles: [],
  fileMetadata: null,
  explorerSort: 'date',
  setSelectedCategory: (cat) => set({ selectedCategory: cat, selectedFileId: null, fileMetadata: null }),
  setSelectedFile: (id) => set({ selectedFileId: id }),
  setExplorerFiles: (files) => set({ explorerFiles: files }),
  setFileMetadata: (meta) => set({ fileMetadata: meta }),
  setExplorerSort: (sort) => set({ explorerSort: sort }),

  rules: [],
  setRules: (rules) => set({ rules }),
  addRule: (rule) => set((s) => ({ rules: [...s.rules, rule] })),
  removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
  updateRule: (rule) =>
    set((s) => ({ rules: s.rules.map((r) => (r.id === rule.id ? rule : r)) })),
}));
