import { describe, expect, it, vi } from "vitest";
import { runAgyWrapper } from "../src/cli/agy.js";
import type { PtyHandle } from "../src/server/pty/pty.js";

function fakePty() {
  const data = new Set<(c: string) => void>();
  const exits = new Set<(i: { exitCode: number }) => void>();
  const writes: string[] = [];
  const handle: PtyHandle = {
    pid: 555,
    alive: () => true,
    write: (c) => {
      writes.push(c);
    },
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (h) => {
      data.add(h);
      return () => data.delete(h);
    },
    onExit: (h) => {
      exits.add(h);
      return () => exits.delete(h);
    },
  };
  return {
    handle,
    writes,
    emit: (c: string) => data.forEach((h) => h(c)),
    exit: () => exits.forEach((h) => h({ exitCode: 0 })),
  };
}

describe("runAgyWrapper", () => {
  it("registers, mirrors output to the terminal + server, and writes polled input", async () => {
    const pty = fakePty();
    const out: string[] = [];
    const ipcCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
    let pollQueue: string[] = ["from-ui\r"];

    const ipcCall = vi.fn(
      async (
        _sock: string,
        _nonce: string,
        method: string,
        params: Record<string, unknown> = {},
      ) => {
        ipcCalls.push({ method, params });
        if (method === "agy-register") return { sessionId: "sess-1" };
        if (method === "agy-poll-input") {
          const q = pollQueue;
          pollQueue = [];
          return { input: q };
        }
        return { ok: true };
      },
    );

    const handle = await runAgyWrapper({
      project: "/proj",
      deps: {
        nonce: "n",
        sockPath: "/sock",
        spawn: () => pty.handle,
        ipcCall: ipcCall as never,
        stdout: { write: (s: string) => { out.push(s); return true; } },
        stdin: {
          setRawMode: vi.fn(),
          resume: vi.fn(),
          pause: vi.fn(),
          on: vi.fn(),
        } as never,
        pollMs: 5,
      },
    });

    expect(ipcCalls[0]!.method).toBe("agy-register");
    expect(ipcCalls[0]!.params).toMatchObject({ projectPath: "/proj", pid: 555 });

    pty.emit("AGY-OUT");
    expect(out.join("")).toContain("AGY-OUT");
    await new Promise((r) => setTimeout(r, 5));
    expect(
      ipcCalls.some((c) => c.method === "agy-output" && c.params.chunk === "AGY-OUT"),
    ).toBe(true);

    await new Promise((r) => setTimeout(r, 25));
    expect(pty.writes).toContain("from-ui\r");

    await handle.shutdown();
    expect(ipcCalls.some((c) => c.method === "agy-unregister")).toBe(true);
  });
});
