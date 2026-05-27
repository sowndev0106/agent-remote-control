import { create } from "zustand";
import { api } from "../lib/api.js";
import type { ActionDescriptor, SessionInfo, SnapshotPayload } from "./types.js";

interface DiscoveredSession {
  sessionId: string;
  providerId: string;
  source: string;
  hint: string;
  projectPath?: string;
  active?: boolean;
}

interface State {
  discovered: DiscoveredSession[];
  active: SessionInfo | null;
  snapshot: SnapshotPayload | null;
  actions: ActionDescriptor[];
  status:
    | "idle"
    | "connecting"
    | "connected"
    | "generating"
    | "approval-pending"
    | "error";
  errorMessage: string | null;

  discover: (projectId: string, providerId?: string) => Promise<void>;
  launch: (projectId: string, providerId?: string) => Promise<SessionInfo>;
  attach: (sessionId: string) => Promise<SessionInfo>;
  refreshSnapshot: () => Promise<void>;
  refreshActions: () => Promise<void>;
  sendPrompt: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  newConversation: () => Promise<void>;
  performAction: (actionId: string) => Promise<void>;
  setSnapshot: (snap: SnapshotPayload) => void;
  setActions: (actions: ActionDescriptor[]) => void;
  setStatus: (status: State["status"]) => void;
  setError: (msg: string | null) => void;
}

export const useSessions = create<State>((set, get) => ({
  discovered: [],
  active: null,
  snapshot: null,
  actions: [],
  status: "idle",
  errorMessage: null,

  async discover(projectId, providerId = "antigravity") {
    const url = `/api/sessions/discover?provider=${encodeURIComponent(providerId)}`;
    const data = await api.post<{ sessions: DiscoveredSession[] }>(url, { projectId });
    set({ discovered: data.sessions });
  },

  async launch(projectId, providerId = "antigravity") {
    set({ status: "connecting", errorMessage: null });
    try {
      const { session } = await api.post<{ session: SessionInfo }>(
        "/api/sessions/launch",
        { projectId, providerId },
      );
      set({ active: session, status: "connected" });
      return session;
    } catch (err) {
      set({ status: "error", errorMessage: (err as Error).message });
      throw err;
    }
  },

  async attach(sessionId) {
    set({ status: "connecting", errorMessage: null });
    try {
      const { session } = await api.post<{ session: SessionInfo }>(
        `/api/sessions/${sessionId}/attach`,
      );
      set({ active: session, status: "connected" });
      return session;
    } catch (err) {
      set({ status: "error", errorMessage: (err as Error).message });
      throw err;
    }
  },

  async refreshSnapshot() {
    const active = get().active;
    if (!active) return;
    const { snapshot } = await api.get<{ snapshot: SnapshotPayload }>(
      `/api/sessions/${active.sessionId}/snapshot`,
    );
    set({ snapshot });
  },

  async refreshActions() {
    const active = get().active;
    if (!active) return;
    const { actions } = await api.get<{ actions: ActionDescriptor[] }>(
      `/api/sessions/${active.sessionId}/actions`,
    );
    set({ actions });
  },

  async sendPrompt(text) {
    const active = get().active;
    if (!active) throw new Error("No active session");
    set({ status: "generating", errorMessage: null });
    try {
      await api.post(`/api/sessions/${active.sessionId}/prompt`, { text });
    } catch (err) {
      set({ status: "error", errorMessage: (err as Error).message });
      throw err;
    }
  },

  async stop() {
    const active = get().active;
    if (!active) return;
    await api.post(`/api/sessions/${active.sessionId}/stop`);
    set({ status: "connected" });
  },

  async newConversation() {
    const active = get().active;
    if (!active) return;
    await api.post(`/api/sessions/${active.sessionId}/new-conversation`);
  },

  async performAction(actionId) {
    const active = get().active;
    if (!active) throw new Error("No active session");
    // H9 + AC-034: only the server-issued actionId is sent. No selectors.
    await api.post(`/api/sessions/${active.sessionId}/actions/${actionId}`);
  },

  setSnapshot(snap) { set({ snapshot: snap }); },
  setActions(actions) { set({ actions }); },
  setStatus(status) { set({ status }); },
  setError(msg) { set({ errorMessage: msg, status: msg ? "error" : "connected" }); },
}));
