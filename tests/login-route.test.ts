import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { defaultConfig } from "../src/server/core/config.js";
import { SessionStore } from "../src/server/core/session.js";
import { hashPassword } from "../src/server/core/auth.js";
import { buildApp, SESSION_COOKIE } from "../src/server/core/app.js";
import {
  registerLoginRoutes,
  _resetRateLimitForTests,
} from "../src/server/http/login.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
  _resetRateLimitForTests();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function makeApp(password = "correct-horse-battery") {
  const config = defaultConfig();
  const { hash, algorithm } = await hashPassword(password);
  config.server.passwordHash = hash;
  config.security.passwordHashAlgorithm = algorithm;
  const sessions = new SessionStore({
    path: join(dir, "sessions.json"),
    idleTimeoutMs: config.server.sessionIdleTimeoutMs,
  });
  await sessions.load();
  const app = await buildApp({
    config,
    configPath: join(dir, "config.json"),
    secret: randomBytes(32),
    sessions,
  });
  registerLoginRoutes(app, { config, sessions });
  await app.ready();
  return { app, sessions, config };
}

describe("login route", () => {
  it("GET /healthz works unauthenticated", async () => {
    const { app } = await makeApp();
    const r = await app.inject({ method: "GET", url: "/healthz" });
    expect(r.statusCode).toBe(200);
    await app.close();
  });

  it("GET /api/projects/recent without session returns 401", async () => {
    const { app } = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/projects/recent" });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe("auth_required");
    await app.close();
  });

  it("GET /login serves HTML (static fallback or SPA index)", async () => {
    const { app } = await makeApp();
    const r = await app.inject({ method: "GET", url: "/login" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    // Either the static login form ("Sign in" text) or the React mount point
    // — both are valid since the SPA owns the login screen once built.
    expect(r.body).toMatch(/(Sign in|id="root")/i);
    await app.close();
  });

  it("POST /api/auth/login wrong password → 401 generic", async () => {
    const { app } = await makeApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "nope-nope-nope-nope" },
    });
    expect(r.statusCode).toBe(401);
    const body = r.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).not.toMatch(/hash|argon|bcrypt|pbkdf2/i);
    await app.close();
  });

  it("POST /api/auth/login correct → 200 + sets session+csrf cookies", async () => {
    const { app } = await makeApp("correct-horse-battery");
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "correct-horse-battery" },
    });
    expect(r.statusCode).toBe(200);
    const setCookieHeader = r.headers["set-cookie"];
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader!];
    const sessionCookie = cookies.find((c) => c.includes(SESSION_COOKIE));
    const csrfCookie = cookies.find((c) => c.includes("arc_csrf"));
    expect(sessionCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();
    expect(sessionCookie!.toLowerCase()).toContain("httponly");
    expect(sessionCookie!.toLowerCase()).toContain("samesite=lax");
    expect(csrfCookie!.toLowerCase()).not.toContain("httponly");
    await app.close();
  });

  it("rate-limits after maxFailures", async () => {
    const { app } = await makeApp("correct-horse-battery");
    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: "wrong-wrong-wrong" },
      });
    }
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "wrong-wrong-wrong" },
    });
    expect(r.statusCode).toBe(429);
    expect(r.json().error.code).toBe("rate_limited");
    await app.close();
  });

  it("authenticated session can hit a protected route", async () => {
    const { app } = await makeApp("correct-horse-battery");
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "correct-horse-battery" },
    });
    const setCookies = ([] as string[]).concat(login.headers["set-cookie"] as never);
    const sidPair = setCookies
      .find((c) => c.includes(SESSION_COOKIE))!
      .split(";")[0]!;

    const r = await app.inject({
      method: "GET",
      url: "/api/auth/whoami",
      headers: { cookie: sidPair },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
    await app.close();
  });

  it("POST without CSRF token returns 403", async () => {
    const { app } = await makeApp("correct-horse-battery");
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "correct-horse-battery" },
    });
    const setCookies = ([] as string[]).concat(login.headers["set-cookie"] as never);
    const sidPair = setCookies
      .find((c) => c.includes(SESSION_COOKIE))!
      .split(";")[0]!;
    // logout requires CSRF since it's POST
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: sidPair },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("csrf_missing");
    await app.close();
  });

  it("POST with valid CSRF cookie+header passes", async () => {
    const { app } = await makeApp("correct-horse-battery");
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "correct-horse-battery" },
    });
    const setCookies = ([] as string[]).concat(login.headers["set-cookie"] as never);
    const sid = setCookies.find((c) => c.includes(SESSION_COOKIE))!.split(";")[0]!;
    const csrf = setCookies.find((c) => c.includes("arc_csrf"))!.split(";")[0]!;
    const csrfVal = csrf.split("=")[1]!;
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: `${sid}; ${csrf}`,
        "x-csrf-token": csrfVal,
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
    await app.close();
  });
});
