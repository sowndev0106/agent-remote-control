import type { AntigravityCdpAdapter } from "../adapters/antigravity/index.js";
import type { AntigravityTmuxAdapter } from "../adapters/antigravity/tmux.js";
import type { AntigravityScreenAdapter } from "../adapters/antigravity/screen.js";
import type { UnmanagedDetector } from "../adapters/antigravity/unmanaged.js";
import type { DiscoveredSession } from "../adapters/IProviderAdapter.js";

/**
 * Aggregates discovered Antigravity sessions across every Phase 1 control
 * surface (REQ-092..099, REQ-104, REQ-105). Each source is best-effort: a
 * failing source logs and yields nothing rather than failing the whole
 * discovery.
 */
export class SessionDiscoveryAggregator {
  constructor(
    private deps: {
      cdp: AntigravityCdpAdapter;
      tmux: AntigravityTmuxAdapter;
      screen: AntigravityScreenAdapter;
      unmanaged: UnmanagedDetector;
    },
  ) {}

  async discover(projectPath: string): Promise<DiscoveredSession[]> {
    const results = await Promise.allSettled([
      this.deps.cdp.listDiscoveredSessions(projectPath),
      this.deps.tmux.listDiscoveredSessions(),
      this.deps.screen.listDiscoveredSessions(),
      this.deps.unmanaged.listDiscoveredSessions(),
    ]);
    const out: DiscoveredSession[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") out.push(...r.value);
    }
    return out;
  }
}
