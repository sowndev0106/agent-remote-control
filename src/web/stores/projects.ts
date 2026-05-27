import { create } from "zustand";
import { api } from "../lib/api.js";
import type { ProjectInfo, RecommendationMarker } from "./types.js";

interface BrowseEntry {
  name: string;
  path: string;
  isDir: boolean;
  hidden: boolean;
  recommendations: RecommendationMarker[];
}

interface BrowseResult {
  path: string;
  parent: string | null;
  roots: string[];
  entries: BrowseEntry[];
}

interface ProjectsState {
  recent: ProjectInfo[];
  browse: BrowseResult | null;
  active: ProjectInfo | null;
  loading: boolean;
  error: string | null;
  loadRecent: () => Promise<void>;
  loadBrowse: (path?: string, showHidden?: boolean) => Promise<void>;
  select: (path: string, confirmManual?: boolean) => Promise<ProjectInfo>;
  setActive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setLastProvider: (id: string, providerId: string) => Promise<void>;
}

export const useProjects = create<ProjectsState>((set, get) => ({
  recent: [],
  browse: null,
  active: null,
  loading: false,
  error: null,

  async loadRecent() {
    set({ loading: true, error: null });
    try {
      const { projects } = await api.get<{ projects: ProjectInfo[] }>(
        "/api/projects/recent",
      );
      set({ recent: projects, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  async loadBrowse(path = "~", showHidden = false) {
    set({ loading: true, error: null });
    try {
      const qs = new URLSearchParams({ path, showHidden: String(showHidden) });
      const data = await api.get<BrowseResult>(`/api/projects/browse?${qs}`);
      set({ browse: data, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  async select(path, confirmManual) {
    const body: { path: string; confirmManual?: boolean } = { path };
    if (confirmManual) body.confirmManual = true;
    const { project } = await api.post<{ project: ProjectInfo }>(
      "/api/projects",
      body,
    );
    await get().loadRecent();
    set({ active: project });
    return project;
  },

  async setActive(id) {
    try {
      const { project } = await api.get<{ project: ProjectInfo }>(
        `/api/projects/${id}`,
      );
      set({ active: project });
    } catch {
      set({ active: null });
    }
  },

  async remove(id) {
    await api.delete(`/api/projects/${id}`);
    await get().loadRecent();
    if (get().active?.id === id) set({ active: null });
  },

  async setLastProvider(id, providerId) {
    await api.put(`/api/projects/${id}/last-provider`, { providerId });
    if (get().active?.id === id) {
      const { project } = await api.get<{ project: ProjectInfo }>(
        `/api/projects/${id}`,
      );
      set({ active: project });
    }
  },
}));
