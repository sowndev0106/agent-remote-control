// tests/assembly.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { defaultConfig } from "../src/server/core/config.js";
import { hashPassword } from "../src/server/core/auth.js";
import { assembleServer } from "../src/server/assembly.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-asm-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("assembleServer", () => {
  it("returns a wired AssembledServer with a ready Fastify app", async () => {
    const config = defaultConfig();
    const { hash, algorithm } = await hashPassword("correct-horse-battery");
    config.server.passwordHash = hash;
    config.security.passwordHashAlgorithm = algorithm;

    const assembled = await assembleServer({
      config,
      paths: {
        configFile: join(dir, "config.json"),
        secretFile: join(dir, "secret.key"),
        sessionsFile: join(dir, "sessions.json"),
        projectsFile: join(dir, "projects.json"),
      },
      overrides: { secret: randomBytes(32) },
    });

    await assembled.app.ready();
    const r = await assembled.app.inject({ method: "GET", url: "/healthz" });
    expect(r.statusCode).toBe(200);

    // Composition root exposes the deps it built so tests can poke them.
    expect(assembled.deps.projects).toBeDefined();
    expect(assembled.deps.bus).toBeDefined();
    expect(assembled.deps.antigravity).toBeDefined();
    expect(assembled.deps.pty).toBeDefined();
    expect(assembled.deps.terminal).toBeDefined();
    expect(assembled.deps.discovery).toBeDefined();

    // Shutdown is one call; never throws on a freshly-built server.
    await assembled.shutdown();
  });
});
