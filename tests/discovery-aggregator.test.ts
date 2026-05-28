import { describe, expect, it, vi } from "vitest";
import { SessionDiscoveryAggregator } from "../src/server/domains/discovery.js";

function source(items: unknown[]) {
  return { listDiscoveredSessions: vi.fn(async () => items) };
}

describe("SessionDiscoveryAggregator", () => {
  it("merges sessions from every discovery source", async () => {
    const cdp = source([{ sessionId: "c1", source: "cdp" }]);
    const tmux = source([{ sessionId: "t1", source: "tmux" }]);
    const screen = source([{ sessionId: "s1", source: "screen" }]);
    const unmanaged = { scan: vi.fn(async () => [{ sessionId: "u1", source: "unmanaged" }]) };
    const agg = new SessionDiscoveryAggregator({
      cdp,
      tmux,
      screen,
      unmanaged,
    } as never);

    const out = await agg.discover("/proj");

    expect(cdp.listDiscoveredSessions).toHaveBeenCalledWith("/proj");
    expect(out.map((s) => s.source).sort()).toEqual([
      "cdp",
      "screen",
      "tmux",
      "unmanaged",
    ]);
  });

  it("keeps unmanaged sessions not attachable", async () => {
    const agg = new SessionDiscoveryAggregator({
      cdp: source([]),
      tmux: source([]),
      screen: source([]),
      unmanaged: {
        scan: vi.fn(async () => [
          { sessionId: "u1", source: "unmanaged", attachable: false },
        ]),
      },
    } as never);

    const out = await agg.discover("/proj");

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: "unmanaged", attachable: false });
  });

  it("drops failed sources while returning successful discovery results", async () => {
    const agg = new SessionDiscoveryAggregator({
      cdp: {
        listDiscoveredSessions: vi.fn(async () => {
          throw new Error("cdp down");
        }),
      },
      tmux: source([{ sessionId: "t1", source: "tmux" }]),
      screen: source([]),
      unmanaged: { scan: vi.fn(async () => []) },
    } as never);

    await expect(agg.discover("/proj")).resolves.toEqual([
      { sessionId: "t1", source: "tmux" },
    ]);
  });
});
