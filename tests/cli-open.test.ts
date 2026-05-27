import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawnMock: vi.fn(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 0));
    return child;
  }),
  loadConfigMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: mocks.spawnMock }));
vi.mock("../src/server/core/config.js", () => ({
  loadConfig: mocks.loadConfigMock,
}));

import { runOpen } from "../src/cli/open.js";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("runOpen", () => {
  it("rewrites a 0.0.0.0 bind to 127.0.0.1 in the opened URL", async () => {
    mocks.loadConfigMock.mockResolvedValue({
      server: { host: "0.0.0.0", port: 4096 },
    });
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runOpen();
    expect(String(out.mock.calls[0]![0])).toContain("http://127.0.0.1:4096");
    expect(mocks.spawnMock).toHaveBeenCalledWith(
      "xdg-open",
      ["http://127.0.0.1:4096"],
      expect.anything(),
    );
  });

  it("keeps a loopback host as-is", async () => {
    mocks.loadConfigMock.mockResolvedValue({
      server: { host: "127.0.0.1", port: 9999 },
    });
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runOpen();
    expect(mocks.spawnMock).toHaveBeenCalledWith(
      "xdg-open",
      ["http://127.0.0.1:9999"],
      expect.anything(),
    );
  });
});
