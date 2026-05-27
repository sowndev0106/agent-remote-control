import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { loadConfig, saveConfig } from "../src/server/core/config.js";
import { ensureSecretKey } from "../src/server/core/secret-key.js";
import { SessionStore } from "../src/server/core/session.js";
import { hashPassword } from "../src/server/core/auth.js";
import { buildApp, SESSION_COOKIE } from "../src/server/core/app.js";
import {
  registerLoginRoutes,
  _resetRateLimitForTests,
} from "../src/server/http/login.js";
import { assertBindAllowed } from "../src/server/core/bind-guard.js";
import { tryBind } from "../src/server/core/port-check.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
  _resetRateLimitForTests();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("smoke (S01-T11)", () => {
  it("AC-003/AC-036: install hash → 401 unauth → login → 200 authed", async () => {
    const cfgPath = join(dir, "config.json");
    const config = await loadConfig(cfgPath);
    const { hash, algorithm } = await hashPassword("correct-horse-battery");
    config.server.passwordHash = hash;
    config.security.passwordHashAlgorithm = algorithm;
    await saveConfig(cfgPath, config);

    const secret = await ensureSecretKey(join(dir, "secret.key"));
    const sessions = new SessionStore({
      path: join(dir, "sessions.json"),
      idleTimeoutMs: config.server.sessionIdleTimeoutMs,
    });
    await sessions.load();
    const app = await buildApp({ config, configPath: cfgPath, secret, sessions });
    registerLoginRoutes(app, { config, sessions });
    await app.ready();

    const unauth = await app.inject({ method: "GET", url: "/api/projects/recent" });
    expect(unauth.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "correct-horse-battery" },
    });
    expect(login.statusCode).toBe(200);
    const setCookies = ([] as string[]).concat(login.headers["set-cookie"] as never);
    const sidPair = setCookies
      .find((c) => c.includes(SESSION_COOKIE))!
      .split(";")[0]!;

    const auth = await app.inject({
      method: "GET",
      url: "/api/auth/whoami",
      headers: { cookie: sidPair },
    });
    expect(auth.statusCode).toBe(200);
    expect(auth.json().ok).toBe(true);

    await app.close();
  });

  it("AC-026: bind 0.0.0.0 with default (empty) password → refused", async () => {
    const config = await loadConfig(join(dir, "config.json"));
    config.server.host = "0.0.0.0";
    config.server.passwordHash = "";
    expect(() => assertBindAllowed(config)).toThrow();
  });

  it("AC-027: port busy → clear error, no kill, recovery hint", async () => {
    const srv = createServer().listen(0, "127.0.0.1");
    await new Promise((r) => srv.once("listening", () => r(null)));
    const port = (srv.address() as { port: number }).port;
    try {
      const err = await tryBind(port, "127.0.0.1").catch((e) => e);
      expect(err).toBeDefined();
      expect(err.code).toBe("port_busy");
      expect(err.recoveryAction).toMatch(/server\.port|config\.json/i);
      // H1: ensure the holder is still alive
      expect(srv.listening).toBe(true);
    } finally {
      srv.close();
    }
  });

  it("AC-036b: hashed password never equals plaintext, session IDs are 32-byte random", async () => {
    const { hash } = await hashPassword("correct-horse-battery");
    expect(hash).not.toBe("correct-horse-battery");
    expect(hash.length).toBeGreaterThan(20);

    const sessions = new SessionStore({
      path: join(dir, "sessions.json"),
      idleTimeoutMs: 60_000,
    });
    await sessions.load();
    const a = await sessions.create();
    const b = await sessions.create();
    expect(a.id).not.toBe(b.id);
    // base64url(32 bytes) → 43 chars
    expect(a.id.length).toBeGreaterThanOrEqual(43);
  });

  // Touch randomBytes to keep import meaningful & assert envelope is intact.
  it("noise-free crypto import", () => {
    expect(randomBytes(8).length).toBe(8);
  });
});
