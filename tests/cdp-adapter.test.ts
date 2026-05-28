import { describe, it, expect, vi } from "vitest";
import { AntigravityCdpAdapter } from "../src/server/adapters/antigravity/index.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";
import type { CDPClient } from "../src/server/adapters/antigravity/cdp.js";
import type { Envelope } from "../src/server/core/realtime/events.js";

function fakeCdp(captureScript: () => unknown): CDPClient {
  return {
    async call(method) {
      if (method === "Runtime.evaluate") {
        return { result: { value: JSON.stringify(captureScript()) } } as never;
      }
      if (method === "Runtime.enable") return {} as never;
      throw new Error(`unmocked CDP method: ${method}`);
    },
    close() {},
    isOpen() { return true; },
    onEvent() { return () => {}; },
    onClose() { return () => {}; },
  };
}

describe("AntigravityCdpAdapter (mocked CDP)", () => {
  it("attach + getSnapshot + getActions returns server-issued action IDs", async () => {
    const sessions = new AgentSessionRegistry();
    const bus = new RealtimeBus();
    const adapter = new AntigravityCdpAdapter({
      sessions,
      bus,
      command: "antigravity",
      debugPortRange: [9000],
      launchTimeoutMs: 500,
      snapshotPollMs: 60_000,
      connect: async () => fakeCdp(() => ({
        ok: true,
        html: `<div><button>Allow</button><button>Deny</button></div>`,
        text: "Allow Deny",
        title: "Antigravity",
      })),
    });

    // simulate a manually-set session in the registry (no real discover needed)
    const seed = AgentSessionRegistry.makeSession({
      providerId: "antigravity",
      source: "cdp",
      projectPath: "/x",
    });
    sessions.set(seed);

    // Patch findAllTargets to return one fake URL.
    const adapterAny = adapter as unknown as {
      findAllTargets: () => Promise<{ url: string; id: string }[]>;
    };
    adapterAny.findAllTargets = async () => [{ url: "ws://fake", id: "t1" }];

    const attached = await adapter.attach(seed);
    expect(attached.lifecycle).toBe("external-attached");

    const snap = await adapter.getSnapshot(seed);
    expect(snap.html).toMatch(/Allow/);
    expect(snap.hash).toMatch(/^[0-9a-f]{16}$/);

    const actions = await adapter.getActions(seed);
    expect(actions.length).toBe(2);
    for (const a of actions) {
      expect(a.actionId).toMatch(/^act_[0-9a-f]{16}$/);
    }
  });

  it("performAction throws action_not_found for unknown id", async () => {
    const sessions = new AgentSessionRegistry();
    const bus = new RealtimeBus();
    const adapter = new AntigravityCdpAdapter({
      sessions,
      bus,
      command: "antigravity",
      debugPortRange: [9000],
      launchTimeoutMs: 500,
      snapshotPollMs: 60_000,
      connect: async () => fakeCdp(() => ({
        ok: true,
        html: `<button>Allow</button>`,
        text: "Allow",
        title: "Antigravity",
      })),
    });
    const seed = AgentSessionRegistry.makeSession({
      providerId: "antigravity",
      source: "cdp",
      projectPath: "/x",
    });
    sessions.set(seed);
    const adapterAny = adapter as unknown as {
      findAllTargets: () => Promise<{ url: string; id: string }[]>;
    };
    adapterAny.findAllTargets = async () => [{ url: "ws://fake", id: "t1" }];
    await adapter.attach(seed);
    await adapter.getActions(seed); // populates registry
    await expect(
      adapter.performAction(seed, "act_deadbeefdeadbeef"),
    ).rejects.toMatchObject({ code: "action_not_found" });
  });

  it("snapshot poll broadcasts on hash change only", async () => {
    vi.useFakeTimers();
    try {
      const sessions = new AgentSessionRegistry();
      const bus = new RealtimeBus();
      const received: Envelope<unknown>[] = [];
      bus.subscribe((e) => received.push(e));

      let html = `<div><button>Allow</button></div>`;
      const adapter = new AntigravityCdpAdapter({
        sessions,
        bus,
        command: "antigravity",
        debugPortRange: [9000],
        launchTimeoutMs: 500,
        snapshotPollMs: 10,
        connect: async () => fakeCdp(() => ({
          ok: true,
          html,
          text: "x",
          title: "Antigravity",
        })),
      });

      const seed = AgentSessionRegistry.makeSession({
        providerId: "antigravity",
        source: "cdp",
        projectPath: "/x",
      });
      sessions.set(seed);
      const adapterAny = adapter as unknown as {
        findAllTargets: () => Promise<{ url: string; id: string }[]>;
      };
      adapterAny.findAllTargets = async () => [{ url: "ws://fake", id: "t1" }];
      await adapter.attach(seed);

      // Initial poll publishes status. Two more ticks without html change
      // should NOT publish snapshot.changed.
      received.length = 0;
      await vi.advanceTimersByTimeAsync(30);
      const snapshotsBefore = received.filter((e) => e.type === "provider.snapshot.changed").length;

      html = `<div><button>Allow</button><button>Deny</button></div>`;
      await vi.advanceTimersByTimeAsync(20);
      const snapshotsAfter = received.filter((e) => e.type === "provider.snapshot.changed").length;

      expect(snapshotsAfter).toBeGreaterThan(snapshotsBefore);

      // Cleanup
      await adapter.shutdown();
    } finally {
      vi.useRealTimers();
    }
  });
});
