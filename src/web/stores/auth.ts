import { create } from "zustand";
import { api, ApiError } from "../lib/api.js";

interface AuthState {
  signedIn: boolean | "unknown";
  pending: boolean;
  error: string | null;
  checkSession: () => Promise<void>;
  signIn: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  signedIn: "unknown",
  pending: false,
  error: null,

  async checkSession() {
    try {
      await api.get("/api/auth/whoami");
      set({ signedIn: true, error: null });
    } catch {
      set({ signedIn: false });
    }
  },

  async signIn(password) {
    set({ pending: true, error: null });
    try {
      await api.post("/api/auth/login", { password });
      set({ signedIn: true, pending: false });
    } catch (err) {
      const msg = err instanceof ApiError ? err.body.message : "Sign-in failed";
      set({ pending: false, error: msg });
      throw err;
    }
  },

  async signOut() {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore — clear local state regardless */
    }
    set({ signedIn: false });
  },
}));
