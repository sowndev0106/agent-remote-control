import { create } from "zustand";
import { api } from "../lib/api.js";

export interface FileTreeEntry {
  name: string;
  path: string;
  relPath: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
}

export interface PreviewResult {
  kind: "text" | "binary" | "oversized";
  relPath: string;
  absPath: string;
  size: number;
  modifiedAt: number;
  content?: string;
}

interface SearchResult {
  path: string;
  relPath: string;
  score: number;
}

interface State {
  projectId: string | null;
  rootEntries: FileTreeEntry[];
  expanded: Record<string, FileTreeEntry[]>;
  showHidden: boolean;
  preview: PreviewResult | null;
  searchResults: SearchResult[];
  contextChips: { relPath: string; path: string }[];
  setProject: (projectId: string) => void;
  loadRoot: () => Promise<void>;
  toggleHidden: () => void;
  expand: (path: string) => Promise<void>;
  collapse: (path: string) => void;
  openPreview: (path: string) => Promise<void>;
  search: (q: string) => Promise<void>;
  addChip: (relPath: string, path: string) => void;
  removeChip: (path: string) => void;
}

export const useFiles = create<State>((set, get) => ({
  projectId: null,
  rootEntries: [],
  expanded: {},
  showHidden: false,
  preview: null,
  searchResults: [],
  contextChips: [],

  setProject(projectId) {
    set({ projectId, rootEntries: [], expanded: {}, preview: null, searchResults: [] });
  },

  async loadRoot() {
    const projectId = get().projectId;
    if (!projectId) return;
    const qs = new URLSearchParams({ projectId, showHidden: String(get().showHidden) });
    const data = await api.get<{ entries: FileTreeEntry[] }>(
      `/api/files/tree?${qs}`,
    );
    set({ rootEntries: data.entries });
  },

  toggleHidden() {
    set({ showHidden: !get().showHidden });
    void get().loadRoot();
  },

  async expand(path) {
    const projectId = get().projectId;
    if (!projectId) return;
    const qs = new URLSearchParams({
      projectId,
      path,
      showHidden: String(get().showHidden),
    });
    const data = await api.get<{ entries: FileTreeEntry[] }>(
      `/api/files/tree?${qs}`,
    );
    set({ expanded: { ...get().expanded, [path]: data.entries } });
  },

  collapse(path) {
    const next = { ...get().expanded };
    delete next[path];
    set({ expanded: next });
  },

  async openPreview(path) {
    const projectId = get().projectId;
    if (!projectId) return;
    const qs = new URLSearchParams({ projectId, path });
    const preview = await api.get<PreviewResult>(`/api/files/preview?${qs}`);
    set({ preview });
  },

  async search(q) {
    const projectId = get().projectId;
    if (!projectId || q.length === 0) {
      set({ searchResults: [] });
      return;
    }
    const qs = new URLSearchParams({ projectId, q });
    const data = await api.get<{ results: SearchResult[] }>(
      `/api/files/search?${qs}`,
    );
    set({ searchResults: data.results });
  },

  addChip(relPath, path) {
    if (get().contextChips.some((c) => c.path === path)) return;
    set({ contextChips: [...get().contextChips, { relPath, path }] });
  },
  removeChip(path) {
    set({ contextChips: get().contextChips.filter((c) => c.path !== path) });
  },
}));
