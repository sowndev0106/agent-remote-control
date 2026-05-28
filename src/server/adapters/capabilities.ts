import type { ProviderId } from "../domains/types.js";
import type { DiscoveredSession } from "./IProviderAdapter.js";

/**
 * Capability-scoped seam: a source of discoverable provider sessions.
 *
 * Real implementers today: AntigravityCdpAdapter, AntigravityTmuxAdapter,
 * AntigravityScreenAdapter, UnmanagedDetector. `SessionDiscoveryAggregator`
 * consumes a `Discoverable[]` — see src/server/domains/discovery.ts.
 *
 * Wider seams (Controllable, Introspectable, Launchable, Conversational)
 * are deliberately NOT extracted here — each is CDP-only at the call-site
 * level today (LANGUAGE.md principle: one adapter = hypothetical seam).
 * Controllable/Introspectable land when Phase 1B routes start dispatching
 * to tmux/screen at a unified signature; Launchable lands when pty's
 * `launch(projectPath, port)` signature aligns with `start(projectPath,
 * options)`; Conversational waits for a second-implementer provider.
 * See docs/superpowers/plans/2026-05-28-discoverable-seam.md §Out-of-scope.
 */
export interface Discoverable {
  readonly providerId: ProviderId;
  listDiscoveredSessions(projectPath: string): Promise<DiscoveredSession[]>;
}
