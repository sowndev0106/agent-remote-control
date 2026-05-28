import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { defaultConfig } from "../src/server/core/config.js";
import { assembleServer } from "../src/server/assembly.js";
import type { PtyHandle, SpawnPtyOpts } from "../src/server/pty/pty.js";

function fakeHandle(): PtyHandle {
  return {
    pid: 777,
    alive: () => true,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: () => () => {},
    onExit: () => () => {},
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-agy-assembly-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("agy wiring", () => {
  it("wires the agy adapter and launches an owned agy-pty session", async () => {
    const spawn = vi.fn((_opts: SpawnPtyOpts) => fakeHandle());
    const { deps, shutdown } = await assembleServer({
      config: defaultConfig(),
      paths: {
        configFile: join(dir, "config.json"),
        secretFile: join(dir, "secret.key"),
        sessionsFile: join(dir, "sessions.json"),
        projectsFile: join(dir, "projects.json"),
      },
      overrides: {
        secret: randomBytes(32),
        skipIpc: true,
        skipWs: true,
        skipPermissionAudit: true,
        agySpawn: spawn,
      },
    });
    try {
      expect(deps.agy.providerId).toBe("agy");
      const session = await deps.agy.start("/tmp/proj");
      expect(session.source).toBe("agy-pty");
      expect(session.owned).toBe(true);
      expect(deps.agentSessions.get(session.sessionId)).toBeDefined();
      expect(spawn).toHaveBeenCalledOnce();
    } finally {
      await shutdown();
    }
  });
});
