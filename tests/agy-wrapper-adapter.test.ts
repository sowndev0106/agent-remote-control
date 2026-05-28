import { describe, expect, it } from "vitest";
import { AgyWrapperAdapter } from "../src/server/adapters/agy/wrapper.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";

function make() {
  const sessions = new AgentSessionRegistry();
  const adapter = new AgyWrapperAdapter({
    sessions,
    bus: new RealtimeBus(),
    scrollback: 4000,
    conversationsDir: "",
  });
  return { sessions, adapter };
}

describe("AgyWrapperAdapter", () => {
  it("registers an unowned agy-wrapper session", () => {
    const { adapter, sessions } = make();
    const s = adapter.register({ pid: 100, projectPath: "/p" });
    expect(s.providerId).toBe("agy");
    expect(s.source).toBe("agy-wrapper");
    expect(s.owned).toBe(false);
    expect(s.capabilities.stop).toBe("unsupported");
    expect(s.capabilities.sendInput).toBe("supported");
    expect(sessions.get(s.sessionId)).toBeDefined();
  });

  it("dedupes by pid", () => {
    const { adapter } = make();
    const a = adapter.register({ pid: 100, projectPath: "/p" });
    const b = adapter.register({ pid: 100, projectPath: "/p" });
    expect(b.sessionId).toBe(a.sessionId);
  });

  it("captures output into the snapshot and drains queued input", async () => {
    const { adapter } = make();
    const s = adapter.register({ pid: 100, projectPath: "/p" });
    adapter.receiveOutput(s.sessionId, "hello from agy");
    await adapter.sendInput(s, "x");
    await adapter.performAction(s, "agy.ctrl_c");
    expect((await adapter.getSnapshot(s)).text).toContain("hello from agy");
    expect(adapter.pollInput(s.sessionId)).toEqual(["x", "\x03"]);
    expect(adapter.pollInput(s.sessionId)).toEqual([]);
  });

  it("stop and selectConversation are unsupported; dispose does not kill", async () => {
    const { adapter } = make();
    const s = adapter.register({ pid: 100 });
    await expect(adapter.stop(s)).rejects.toMatchObject({ code: "capability_unsupported" });
    await expect(adapter.selectConversation(s, "c1")).rejects.toMatchObject({ code: "capability_unsupported" });
    await adapter.dispose(s);
    expect(await adapter.getStatus(s)).toBe("stopped");
  });

  it("surfaces registered sessions to discovery and drops unregistered ones", async () => {
    const { adapter } = make();
    const a = adapter.register({ pid: 11, projectPath: "/p" });
    const b = adapter.register({ pid: 12, projectPath: "/q" });
    const discovered = await adapter.listDiscoveredSessions();
    expect(discovered.map((d) => d.sessionId).sort()).toEqual(
      [a.sessionId, b.sessionId].sort(),
    );
    expect(discovered[0]!.source).toBe("agy-wrapper");
    expect(discovered.find((d) => d.sessionId === a.sessionId)!.projectPath).toBe("/p");
    adapter.unregister(a.sessionId);
    const after = await adapter.listDiscoveredSessions();
    expect(after.map((d) => d.sessionId)).toEqual([b.sessionId]);
  });

  it("unregister marks the session stopped", () => {
    const { adapter, sessions } = make();
    const s = adapter.register({ pid: 7 });
    adapter.unregister(s.sessionId);
    expect(sessions.get(s.sessionId)?.status).toBe("stopped");
  });
});
