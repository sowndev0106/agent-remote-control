import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, loadConfig, saveConfig } from "../src/server/core/config.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("config", () => {
  it("default config matches REQUIEMENT defaults", () => {
    const c = defaultConfig();
    expect(c.server.host).toBe("127.0.0.1");
    expect(c.server.port).toBe(4096);
    expect(c.server.passwordHash).toBe("");
    expect(c.server.sessionIdleTimeoutMs).toBe(86_400_000);
    expect(c.security.passwordHashAlgorithm).toBe("argon2id");
    expect(c.security.loginRateLimit).toEqual({
      maxFailures: 10,
      windowMs: 300_000,
    });
    expect(c.providers.antigravity.snapshotPollMs).toBe(1000);
    expect(c.fileExplorer.maxPreviewBytes).toBe(524_288);
  });

  it("creates default config on first load", async () => {
    const path = join(dir, "config.json");
    const c = await loadConfig(path);
    expect(c.server.port).toBe(4096);
  });

  it("round-trips through save+load", async () => {
    const path = join(dir, "config.json");
    const c = defaultConfig();
    c.server.port = 5555;
    await saveConfig(path, c);
    const loaded = await loadConfig(path);
    expect(loaded.server.port).toBe(5555);
  });

  it("includes agy provider defaults", () => {
    const cfg = defaultConfig();
    expect(cfg.providers.agy).toMatchObject({
      enabled: true,
      command: "agy",
      wrapperCommands: ["agy"],
      controlSurfaces: ["agy-pty", "agy-wrapper"],
      snapshotPollMs: 500,
      scrollback: 4000,
      conversationsDir: "~/.gemini/antigravity-cli/conversations",
    });
  });
});
