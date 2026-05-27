import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exitCode: 0,
  spawnMock: vi.fn(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", mocks.exitCode));
    return child;
  }),
  startServerMock: vi.fn(async () => {}),
}));

vi.mock("node:child_process", () => ({ spawn: mocks.spawnMock }));
vi.mock("../src/server/core/config.js", () => ({
  loadConfig: vi.fn(async () => ({ server: { host: "127.0.0.1", port: 4096 } })),
}));
vi.mock("../src/server/index.js", () => ({ startServer: mocks.startServerMock }));

import { runStart } from "../src/cli/start.js";
import { runStatus } from "../src/cli/status.js";
import { runStop } from "../src/cli/stop.js";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mocks.exitCode = 0;
});

describe("cli service controls", () => {
  it("start default calls systemctl --user start", async () => {
    await runStart();
    expect(mocks.spawnMock).toHaveBeenCalledWith(
      "systemctl",
      ["--user", "start", "agent-remote-control.service"],
      expect.anything(),
    );
  });

  it("start --foreground calls startServer directly, never systemctl", async () => {
    await runStart({ foreground: true });
    expect(mocks.startServerMock).toHaveBeenCalled();
    expect(mocks.spawnMock).not.toHaveBeenCalled();
  });

  it("stop rejects when systemctl exits non-zero", async () => {
    mocks.exitCode = 1;
    await expect(runStop()).rejects.toThrow(/exited 1/);
  });

  it("status prints the bind URL then runs systemctl status", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runStatus();
    expect(String(out.mock.calls[0]![0])).toContain("http://127.0.0.1:4096");
    expect(mocks.spawnMock).toHaveBeenCalledWith(
      "systemctl",
      ["--user", "status", "--no-pager", "agent-remote-control.service"],
      expect.anything(),
    );
  });
});
