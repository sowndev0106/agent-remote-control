import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ipcCall } from "../src/server/ipc/client.js";
import {
  ensureIpcNonce,
  ipcNonceFile,
  ipcSocketPath,
  loadIpcNonce,
} from "../src/server/ipc/nonce.js";
import { DebugPortPool, startIpcServer } from "../src/server/ipc/wire.js";

let dir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-ipc-wire-"));
  process.env = { ...savedEnv, XDG_CONFIG_HOME: dir };
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(dir, { recursive: true, force: true });
});

describe("IPC nonce", () => {
  it("creates a 0600 nonce file and loads it back", async () => {
    const nonce = await ensureIpcNonce();
    const loaded = await loadIpcNonce();
    const mode = (await stat(ipcNonceFile())).mode & 0o777;

    expect(nonce).toHaveLength(43);
    expect(loaded).toBe(nonce);
    expect(mode).toBe(0o600);
  });

  it("reuses an existing valid nonce and regenerates a malformed one", async () => {
    await ensureIpcNonce();
    const first = await readFile(ipcNonceFile(), "utf8");
    await writeFile(ipcNonceFile(), "short\n");

    const second = await ensureIpcNonce();

    expect(first.trim()).toHaveLength(43);
    expect(second).toHaveLength(43);
    expect(second).not.toBe("short");
  });

  it("returns null when no nonce file exists", async () => {
    expect(await loadIpcNonce()).toBeNull();
  });
});

describe("IPC wire", () => {
  it("registers reserve/register/unregister IPC methods", async () => {
    const wrapper = {
      register: vi.fn(() => ({ sessionId: "s1" })),
      unregister: vi.fn(),
    };
    const server = await startIpcServer({
      wrapper: wrapper as never,
      reservePort: async () => 9222,
      releasePort: vi.fn(),
    });
    const nonce = (await loadIpcNonce())!;

    try {
      await expect(
        ipcCall<{ port: number }>(ipcSocketPath(), nonce, "reserve-port"),
      ).resolves.toEqual({ port: 9222 });
      await expect(
        ipcCall<{ sessionId: string }>(ipcSocketPath(), nonce, "register-session", {
          pid: 123,
          debugPort: 9222,
          projectPath: "/tmp/project",
        }),
      ).resolves.toEqual({ sessionId: "s1" });
      expect(wrapper.register).toHaveBeenCalledWith({
        pid: 123,
        debugPort: 9222,
        projectPath: "/tmp/project",
      });
      await expect(
        ipcCall(ipcSocketPath(), nonce, "unregister-session", { sessionId: "s1" }),
      ).resolves.toEqual({ ok: true });
      expect(wrapper.unregister).toHaveBeenCalledWith("s1");
    } finally {
      await server.stop();
    }
  });

  it("rejects register-session without a finite debugPort", async () => {
    const server = await startIpcServer({
      wrapper: { register: vi.fn(), unregister: vi.fn() } as never,
      reservePort: async () => 9222,
      releasePort: vi.fn(),
    });
    const nonce = (await loadIpcNonce())!;

    try {
      await expect(
        ipcCall(ipcSocketPath(), nonce, "register-session", {}),
      ).rejects.toThrow(/debugPort is required/);
    } finally {
      await server.stop();
    }
  });

  it("reserves, releases, and exhausts debug ports", () => {
    const pool = new DebugPortPool([9000, 9001]);
    expect(pool.reserve()).toBe(9000);
    expect(pool.reserve()).toBe(9001);
    expect(() => pool.reserve()).toThrow(/no free debug port/);
    pool.release(9000);
    expect(pool.reserve()).toBe(9000);
  });
});
