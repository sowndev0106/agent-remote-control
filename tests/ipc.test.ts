import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IpcServer } from "../src/server/ipc/server.js";
import { ipcCall } from "../src/server/ipc/client.js";

let dir: string;
let server: IpcServer;
const NONCE = "test-nonce-1234567890-abcdefghij";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-ipc-"));
  server = new IpcServer(join(dir, "ipc.sock"), NONCE);
  server.register("echo", async (params) => ({ echoed: params.value }));
  await server.start();
});
afterEach(async () => {
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});

describe("IPC server", () => {
  it("accepts a request with the correct nonce", async () => {
    const res = await ipcCall<{ echoed: string }>(
      join(dir, "ipc.sock"),
      NONCE,
      "echo",
      { value: "hi" },
    );
    expect(res.echoed).toBe("hi");
  });

  it("rejects an invalid nonce", async () => {
    await expect(
      ipcCall(join(dir, "ipc.sock"), "wrong-nonce", "echo", { value: "x" }),
    ).rejects.toThrow(/invalid nonce/);
  });

  it("rejects unknown methods", async () => {
    await expect(
      ipcCall(join(dir, "ipc.sock"), NONCE, "nope", {}),
    ).rejects.toThrow(/no method nope/);
  });
});
