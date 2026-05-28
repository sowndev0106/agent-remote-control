import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IpcServer } from "../src/server/ipc/server.js";
import { registerIpcMethods } from "../src/server/ipc/wire.js";
import { ipcCall } from "../src/server/ipc/client.js";
import { AgyWrapperAdapter } from "../src/server/adapters/agy/wrapper.js";
import { AntigravityWrapperAdapter } from "../src/server/adapters/antigravity/wrapper.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";

let dir: string;
let server: IpcServer | null = null;
let sockPath = "";
const nonce = "test-nonce-1234567890";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-agy-ipc-"));
  sockPath = join(dir, "ipc.sock");
});
afterEach(async () => {
  if (server) await server.stop();
  server = null;
  await rm(dir, { recursive: true, force: true });
});

describe("agy IPC wire", () => {
  it("registers, forwards output, polls input, unregisters", async () => {
    const sessions = new AgentSessionRegistry();
    const bus = new RealtimeBus();
    const agyWrapper = new AgyWrapperAdapter({ sessions, bus, scrollback: 4000, conversationsDir: "" });
    const wrapper = new AntigravityWrapperAdapter({ sessions, bus });

    server = new IpcServer(sockPath, nonce);
    registerIpcMethods(server, {
      wrapper,
      agyWrapper,
      reservePort: async () => 9000,
      releasePort: () => {},
    });
    await server.start();

    const reg = await ipcCall<{ sessionId: string }>(sockPath, nonce, "agy-register", {
      pid: 42,
      projectPath: "/p",
    });
    expect(reg.sessionId).toBeTruthy();

    await ipcCall(sockPath, nonce, "agy-output", {
      sessionId: reg.sessionId,
      chunk: "HELLO-IPC",
    });
    expect((await agyWrapper.getSnapshot(sessions.get(reg.sessionId)!)).text).toContain("HELLO-IPC");

    await agyWrapper.sendInput(sessions.get(reg.sessionId)!, "Q");
    const polled = await ipcCall<{ input: string[] }>(sockPath, nonce, "agy-poll-input", {
      sessionId: reg.sessionId,
    });
    expect(polled.input).toEqual(["Q"]);

    await ipcCall(sockPath, nonce, "agy-unregister", { sessionId: reg.sessionId });
    expect(sessions.get(reg.sessionId)?.status).toBe("stopped");
  });
});
