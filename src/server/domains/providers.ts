import {
  allUnknownCapabilities,
  allUnsupportedCapabilities,
  type ProviderId,
  type ProviderInfo,
} from "./types.js";

export class ProviderRegistry {
  private readonly providers: Map<ProviderId, ProviderInfo>;

  constructor() {
    this.providers = new Map();
    // Antigravity — enabled but capabilities unknown until sprint 03 ships the
    // CDP adapter and detect() probes them.
    this.set({
      id: "antigravity",
      displayName: "Antigravity",
      enabled: true,
      available: false,
      status: "unavailable",
      capabilities: allUnknownCapabilities(),
      note: "Antigravity adapter not yet probed.",
    });
    // Future providers — visible but unavailable (REQ-024).
    for (const id of ["claude", "codex", "opencode"] as const) {
      this.set({
        id,
        displayName: this.displayNameFor(id),
        enabled: false,
        available: false,
        status: "future",
        capabilities: allUnsupportedCapabilities(),
        note: "Arrives after Antigravity (Phase 2).",
      });
    }
  }

  private displayNameFor(id: ProviderId): string {
    switch (id) {
      case "claude":
        return "Claude";
      case "codex":
        return "Codex";
      case "opencode":
        return "opencode";
      case "antigravity":
        return "Antigravity";
    }
  }

  set(p: ProviderInfo): void {
    this.providers.set(p.id, p);
  }

  get(id: ProviderId): ProviderInfo | undefined {
    return this.providers.get(id);
  }

  getAll(): ProviderInfo[] {
    return Array.from(this.providers.values());
  }
}
