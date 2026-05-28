import { describe, expect, it, vi } from "vitest";
import { AgyAdapter } from "../src/server/adapters/agy/index.js";
import { AgyPtyAdapter } from "../src/server/adapters/agy/pty.js";
import { AgyWrapperAdapter } from "../src/server/adapters/agy/wrapper.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";
import type { PtyHandle, SpawnPtyOpts } from "../src/server/pty/pty.js";

function fakeHandle(): PtyHandle {
  return {
    pid: 1,
    alive: () => true,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: () => () => {},
    onExit: () => () => {},
  };
}

function make() {
  const sessions = new AgentSessionRegistry();
  const bus = new RealtimeBus();
  const spawn = vi.fn((_o: SpawnPtyOpts) => fakeHandle());
  const pty = new AgyPtyAdapter({ sessions, bus, command: "agy", scrollback: 4000, conversationsDir: "", spawn });
  const wrapper = new AgyWrapperAdapter({ sessions, bus, scrollback: 4000, conversationsDir: "" });
  return { sessions, pty, wrapper, adapter: new AgyAdapter({ pty, wrapper }) };
}

describe("AgyAdapter dispatcher", () => {
  it("start delegates to the pty surface", async () => {
    const { adapter } = make();
    const s = await adapter.start("/p");
    expect(s.source).toBe("agy-pty");
  });

  it("routes session-bound calls by source", async () => {
    const { adapter, wrapper } = make();
    const w = wrapper.register({ pid: 5, projectPath: "/p" });
    wrapper.receiveOutput(w.sessionId, "WRAPPED");
    const snap = await adapter.getSnapshot(w);
    expect(snap.text).toContain("WRAPPED");
    await adapter.sendInput(w, "z");
    expect(wrapper.pollInput(w.sessionId)).toEqual(["z"]);
  });

  it("exposes providerId agy and empty discovery", async () => {
    const { adapter } = make();
    expect(adapter.providerId).toBe("agy");
    expect(await adapter.listDiscoveredSessions("/p")).toEqual([]);
  });
});
