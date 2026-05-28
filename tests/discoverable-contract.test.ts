import { describe, it, expect } from "vitest";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { AntigravityTmuxAdapter } from "../src/server/adapters/antigravity/tmux.js";
import { AntigravityScreenAdapter } from "../src/server/adapters/antigravity/screen.js";
import { UnmanagedDetector } from "../src/server/adapters/antigravity/unmanaged.js";
import type { Discoverable } from "../src/server/adapters/capabilities.js";

describe("Discoverable contract", () => {
  it("AntigravityTmuxAdapter satisfies Discoverable", () => {
    const sessions = new AgentSessionRegistry();
    const tmux: Discoverable = new AntigravityTmuxAdapter({
      sessions,
      targets: () => [],
    });
    expect(tmux.providerId).toBe("antigravity");
    expect(typeof tmux.listDiscoveredSessions).toBe("function");
  });

  it("AntigravityScreenAdapter satisfies Discoverable", () => {
    const sessions = new AgentSessionRegistry();
    const screen: Discoverable = new AntigravityScreenAdapter({
      sessions,
      targets: () => [],
    });
    expect(screen.providerId).toBe("antigravity");
    expect(typeof screen.listDiscoveredSessions).toBe("function");
  });

  it("UnmanagedDetector satisfies Discoverable", async () => {
    const detector: Discoverable = new UnmanagedDetector({
      sessions: new AgentSessionRegistry(),
      ownedPids: () => new Set(),
      wrapperPids: () => new Set(),
      procScan: async () => [], // no /proc on test
    });
    expect(detector.providerId).toBe("antigravity");
    expect(await detector.listDiscoveredSessions()).toEqual([]);
  });
});
