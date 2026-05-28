import { describe, expect, it, vi } from "vitest";
import { SessionDiscoveryAggregator } from "../src/server/domains/discovery.js";
import type { Discoverable } from "../src/server/adapters/capabilities.js";

function fakeSource(items: unknown[]): Discoverable {
  return {
    providerId: "antigravity",
    listDiscoveredSessions: vi.fn(async () => items as never),
  };
}

describe("SessionDiscoveryAggregator", () => {
  it("merges sessions from every registered source", async () => {
    const agg = new SessionDiscoveryAggregator([
      fakeSource([{ sessionId: "c1", source: "cdp" }]),
      fakeSource([{ sessionId: "t1", source: "tmux" }]),
      fakeSource([{ sessionId: "s1", source: "screen" }]),
      fakeSource([{ sessionId: "u1", source: "unmanaged" }]),
    ]);

    const out = await agg.discover("/proj");

    expect(out.map((s) => (s as { source: string }).source).sort()).toEqual([
      "cdp",
      "screen",
      "tmux",
      "unmanaged",
    ]);
  });

  it("passes projectPath through to every source", async () => {
    const a = fakeSource([]);
    const b = fakeSource([]);
    const agg = new SessionDiscoveryAggregator([a, b]);

    await agg.discover("/proj");

    expect(a.listDiscoveredSessions).toHaveBeenCalledWith("/proj");
    expect(b.listDiscoveredSessions).toHaveBeenCalledWith("/proj");
  });

  it("keeps unmanaged-style sessions not attachable when a source returns them", async () => {
    const agg = new SessionDiscoveryAggregator([
      fakeSource([
        { sessionId: "u1", source: "unmanaged", attachable: false },
      ]),
    ]);

    const out = await agg.discover("/proj");

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: "unmanaged", attachable: false });
  });

  it("drops failed sources while returning successful discovery results", async () => {
    const failing: Discoverable = {
      providerId: "antigravity",
      listDiscoveredSessions: vi.fn(async () => {
        throw new Error("cdp down");
      }),
    };
    const agg = new SessionDiscoveryAggregator([
      failing,
      fakeSource([{ sessionId: "t1", source: "tmux" }]),
    ]);

    await expect(agg.discover("/proj")).resolves.toEqual([
      { sessionId: "t1", source: "tmux" },
    ]);
  });

  it("returns empty when no sources are registered", async () => {
    const agg = new SessionDiscoveryAggregator([]);
    await expect(agg.discover("/proj")).resolves.toEqual([]);
  });
});
