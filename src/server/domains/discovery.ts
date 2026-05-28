import type { Discoverable } from "../adapters/capabilities.js";
import type { DiscoveredSession } from "../adapters/IProviderAdapter.js";

/**
 * Aggregates discovered sessions across every registered Discoverable source.
 * Each source is best-effort: a failing source yields nothing rather than
 * failing the whole discovery (REQ-092..099, REQ-104, REQ-105). No logging
 * is emitted on rejection — by design, the aggregator has no logger
 * dependency; surface diagnostics belong to the adapter that failed.
 *
 * Sources are passed in at construction time (no named slots). New sources
 * arrive as new entries in `assembleServer` — this module never changes.
 */
export class SessionDiscoveryAggregator {
  constructor(private readonly sources: readonly Discoverable[]) {}

  async discover(projectPath: string): Promise<DiscoveredSession[]> {
    const results = await Promise.allSettled(
      this.sources.map((s) => s.listDiscoveredSessions(projectPath)),
    );
    const out: DiscoveredSession[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") out.push(...r.value);
    }
    return out;
  }
}
