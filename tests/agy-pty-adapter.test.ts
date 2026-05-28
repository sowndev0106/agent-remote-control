import { describe, expect, it, vi } from "vitest";
import { AgyPtyAdapter } from "../src/server/adapters/agy/pty.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";
import type { PtyHandle, SpawnPtyOpts } from "../src/server/pty/pty.js";

function fakePty() {
  const data = new Set<(chunk: string) => void>();
  const exits = new Set<(info: { exitCode: number; signal?: number }) => void>();
  const writes: string[] = [];
  const handle: PtyHandle = {
    pid: 4321,
    alive: vi.fn(() => true),
    write: vi.fn((chunk: string) => writes.push(chunk)),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (h) => { data.add(h); return () => data.delete(h); },
    onExit: (h) => { exits.add(h); return () => exits.delete(h); },
  };
  return {
    handle,
    writes,
    emit: (chunk: string) => data.forEach((h) => h(chunk)),
    exit: () => exits.forEach((h) => h({ exitCode: 0 })),
  };
}

function make() {
  const sessions = new AgentSessionRegistry();
  const bus = new RealtimeBus();
  const ptys: ReturnType<typeof fakePty>[] = [];
  const spawn = vi.fn((_opts: SpawnPtyOpts) => {
    const p = fakePty();
    ptys.push(p);
    return p.handle;
  });
  const adapter = new AgyPtyAdapter({
    sessions,
    bus,
    command: "agy",
    scrollback: 4000,
    conversationsDir: "",
    spawn,
  });
  return { sessions, bus, adapter, spawn, ptys };
}

describe("AgyPtyAdapter", () => {
  it("spawns agy as an owned agy-pty session with --add-dir + cwd", async () => {
    const { adapter, sessions, spawn } = make();
    const session = await adapter.start("/project");
    expect(spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "agy",
        args: ["--add-dir", "/project"],
        cwd: "/project",
      }),
    );
    expect(session.providerId).toBe("agy");
    expect(session.source).toBe("agy-pty");
    expect(session.owned).toBe(true);
    expect(session.status).toBe("running");
    expect(sessions.get(session.sessionId)).toBeDefined();
  });

  it("does not pass --remote-debugging-port", async () => {
    const { adapter, spawn } = make();
    await adapter.start("/project");
    const opts = spawn.mock.calls[0]![0] as SpawnPtyOpts;
    expect(opts.args?.some((a) => a.includes("remote-debugging-port"))).toBe(false);
  });

  it("sends prompts with a carriage return and raw input verbatim", async () => {
    const { adapter, ptys } = make();
    const session = await adapter.start("/project");
    await adapter.sendPrompt(session, "hello");
    await adapter.sendInput(session, "\x1b[A");
    expect(ptys[0]!.writes).toEqual(["hello\r", "\x1b[A"]);
  });

  it("maps a fixed action id to its input", async () => {
    const { adapter, ptys } = make();
    const session = await adapter.start("/project");
    await adapter.performAction(session, "agy.ctrl_c");
    expect(ptys[0]!.writes).toEqual(["\x03"]);
  });

  it("updates snapshot from PTY chunks", async () => {
    const { adapter, ptys } = make();
    const session = await adapter.start("/project");
    ptys[0]!.emit("hello from agy");
    const snap = await adapter.getSnapshot(session);
    expect(snap.text).toContain("hello from agy");
    expect(snap.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("resumes by relaunching with --conversation under the same sessionId", async () => {
    const { adapter, spawn } = make();
    const session = await adapter.start("/project");
    await adapter.selectConversation(session, "conv-9");
    expect(spawn).toHaveBeenCalledTimes(2);
    const secondArgs = (spawn.mock.calls[1]![0] as SpawnPtyOpts).args;
    expect(secondArgs).toEqual(["--add-dir", "/project", "--conversation", "conv-9"]);
    expect(await adapter.getStatus(session)).toBe("running");
  });

  it("marks an exited child stopped", async () => {
    const { adapter, sessions, ptys } = make();
    const session = await adapter.start("/project");
    ptys[0]!.exit();
    expect(sessions.get(session.sessionId)?.status).toBe("stopped");
    expect(sessions.get(session.sessionId)?.lifecycle).toBe("owned-stopped");
  });

  it("shutdown terminates owned PTYs", async () => {
    const { adapter, ptys } = make();
    await adapter.start("/project");
    await adapter.shutdown();
    expect(ptys[0]!.handle.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
