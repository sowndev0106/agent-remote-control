import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  passwordMock: vi.fn(),
  confirmMock: vi.fn(),
  saveConfigMock: vi.fn(async () => {}),
  loadConfigMock: vi.fn(),
  hashPasswordMock: vi.fn(async () => ({
    hash: "$argon2id$hash",
    algorithm: "argon2id",
  })),
}));

vi.mock("@inquirer/prompts", () => ({
  password: mocks.passwordMock,
  confirm: mocks.confirmMock,
}));
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 0));
    return child;
  }),
}));
vi.mock("../src/server/core/config.js", () => ({
  loadConfig: mocks.loadConfigMock,
  saveConfig: mocks.saveConfigMock,
}));
vi.mock("../src/server/core/secret-key.js", () => ({
  ensureSecretKey: vi.fn(async () => Buffer.alloc(32)),
}));
vi.mock("../src/cli/systemd.js", () => ({
  installUnit: vi.fn(async () => "/tmp/unit.service"),
}));
vi.mock("../src/server/core/auth.js", () => ({
  hashPassword: mocks.hashPasswordMock,
  pickAlgorithm: vi.fn(async () => "argon2id"),
}));

import { runInstall } from "../src/cli/install.js";

const savedEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...savedEnv, XDG_SESSION_TYPE: "x11" };
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...savedEnv };
});

describe("runInstall password handling", () => {
  it("re-prompts when the password is short, then hashes the valid one", async () => {
    mocks.loadConfigMock.mockResolvedValue({ server: {}, security: {} });
    mocks.passwordMock
      .mockResolvedValueOnce("short")
      .mockResolvedValueOnce("long-enough-pass")
      .mockResolvedValueOnce("long-enough-pass");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await runInstall();

    expect(mocks.hashPasswordMock).toHaveBeenCalledWith(
      "long-enough-pass",
      "argon2id",
    );
    expect(mocks.saveConfigMock).toHaveBeenCalled();
  });

  it("keeps the existing password when overwrite is declined", async () => {
    mocks.loadConfigMock.mockResolvedValue({
      server: { passwordHash: "$argon2id$existing" },
      security: {},
    });
    mocks.confirmMock.mockResolvedValueOnce(false);
    vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await runInstall();

    expect(mocks.confirmMock).toHaveBeenCalledTimes(1);
    expect(mocks.passwordMock).not.toHaveBeenCalled();
    expect(mocks.hashPasswordMock).not.toHaveBeenCalled();
  });
});
