import { describe, it, expect } from "vitest";
import { spawnPty } from "../src/server/pty/pty.js";
import { DebugPortPool } from "../src/server/ipc/wire.js";

describe("spawnPty (shared PTY helper)", () => {
  it("spawns a process, streams data, and reports exit", async () => {
    const handle = spawnPty({ command: "printf", args: ["hello-pty"] });
    expect(handle.pid).toBeGreaterThan(0);

    const chunks: string[] = [];
    handle.onData((c) => chunks.push(c));

    const exit = await new Promise<{ exitCode: number }>((resolve) => {
      handle.onExit((info) => resolve(info));
    });
    expect(exit.exitCode).toBe(0);
    expect(chunks.join("")).toContain("hello-pty");
    expect(handle.alive()).toBe(false);
  });

  it("write goes to the process stdin", async () => {
    const handle = spawnPty({ command: "cat" });
    const chunks: string[] = [];
    handle.onData((c) => chunks.push(c));
    const exited = new Promise<void>((resolve) => handle.onExit(() => resolve()));
    handle.write("ping\n");
    await new Promise((r) => setTimeout(r, 200));
    expect(chunks.join("")).toContain("ping");
    handle.kill("SIGTERM");
    await exited;
  });
});

describe("DebugPortPool", () => {
  it("reserves distinct ports and releases them", () => {
    const pool = new DebugPortPool([9000, 9001]);
    const a = pool.reserve();
    const b = pool.reserve();
    expect(a).not.toBe(b);
    expect(() => pool.reserve()).toThrow(/no free debug port/);
    pool.release(a);
    expect(pool.reserve()).toBe(a);
  });
});
