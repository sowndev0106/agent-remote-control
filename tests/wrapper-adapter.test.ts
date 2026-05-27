import { describe, it, expect } from "vitest";
import { AntigravityWrapperAdapter } from "../src/server/adapters/antigravity/wrapper.js";
import { SessionStoreLite } from "../src/server/domains/sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";

function make() {
  const sessions = new SessionStoreLite();
  const bus = new RealtimeBus();
  const adapter = new AntigravityWrapperAdapter({ sessions, bus });
  return { sessions, bus, adapter };
}

describe("AntigravityWrapperAdapter", () => {
  it("registers a wrapper session as owned: false (NFR-013A)", () => {
    const { adapter, sessions } = make();
    const s = adapter.register({ pid: 4242, debugPort: 9000, projectPath: "/p" });
    expect(s.source).toBe("wrapper");
    expect(s.owned).toBe(false);
    expect(s.projectPath).toBe("/p");
    expect(sessions.get(s.sessionId)).toBeDefined();
  });

  it("dedupes by PID — same PID returns the same session", () => {
    const { adapter } = make();
    const a = adapter.register({ pid: 555, debugPort: 9000 });
    const b = adapter.register({ pid: 555, debugPort: 9001 });
    expect(a.sessionId).toBe(b.sessionId);
  });

  it("unregister marks the session discovered/stopped", () => {
    const { adapter, sessions } = make();
    const s = adapter.register({ pid: 1, debugPort: 9000 });
    adapter.unregister(s.sessionId);
    const stored = sessions.get(s.sessionId);
    expect(stored?.status).toBe("stopped");
    expect(stored?.lifecycle).toBe("discovered");
  });

  it("unregister throws for unknown session", () => {
    const { adapter } = make();
    expect(() => adapter.unregister("nope")).toThrowError(/No wrapper session/);
  });

  it("isPidAlive returns false for an impossible pid", () => {
    expect(AntigravityWrapperAdapter.isPidAlive(2147483646)).toBe(false);
  });
});
