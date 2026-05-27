import { create } from "zustand";
import { api } from "../lib/api.js";
import type { ProviderInfo } from "./types.js";

interface State {
  providers: ProviderInfo[];
  load: () => Promise<void>;
}

export const useProviders = create<State>((set) => ({
  providers: [],
  async load() {
    const { providers } = await api.get<{ providers: ProviderInfo[] }>(
      "/api/providers",
    );
    set({ providers });
  },
}));
