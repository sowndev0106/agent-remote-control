import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
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
import { registerDomainRoutes } from "../src/server/http/domain.js";
import { ProjectStore } from "../src/server/domains/projects.js";
import { ProviderRegistry } from "../src/server/domains/providers.js";
import { SessionStoreLite } from "../src/server/domains/sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";
import { AntigravityCdpAdapter } from "../src/server/adapters/antigravity/index.js";

let dir: string;
let rootA: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
  rootA = join(dir, "root");
  await mkdir(rootA);
  _resetRateLimitForTests();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function makeAuthedApp() {
  const config = defaultConfig();
  config.projects.roots = [rootA];
  const { hash, algorithm } = await hashPassword("correct-horse-battery");
  config.server.passwordHash = hash;
  config.security.passwordHashAlgorithm = algorithm;

  const cookieSessions = new SessionStore({
    path: join(dir, "sessions.json"),
    idleTimeoutMs: config.server.sessionIdleTimeoutMs,
  });
  await cookieSessions.load();

  const projects = new ProjectStore({
    path: join(dir, "projects.json"),
    recentLimit: config.projects.recentLimit,
    configuredRoots: config.projects.roots,
  });
  await projects.load();
  const providers = new ProviderRegistry();
  const sessionsLite = new SessionStoreLite();
  const bus = new RealtimeBus();
  const antigravity = new AntigravityCdpAdapter({
    sessions: sessionsLite,
    bus,
    command: config.providers.antigravity.command,
    debugPortRange: config.providers.antigravity.debugPortRange,
    launchTimeoutMs: 500,
    snapshotPollMs: 60_000,
  });

  const app = await buildApp({
    config,
    configPath: join(dir, "config.json"),
    secret: randomBytes(32),
    sessions: cookieSessions,
  });
  registerLoginRoutes(app, { config, sessions: cookieSessions });
  registerDomainRoutes(app, {
    projects,
    providers,
    sessions: sessionsLite,
    bus,
    antigravity,
    config,
  });
  await app.ready();

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { password: "correct-horse-battery" },
  });
  const setCookies = ([] as string[]).concat(login.headers["set-cookie"] as never);
  const sid = setCookies.find((c) => c.includes(SESSION_COOKIE))!.split(";")[0]!;
  const csrf = setCookies.find((c) => c.includes("arc_csrf"))!.split(";")[0]!;
  const csrfVal = csrf.split("=")[1]!;
  const cookieHeader = `${sid}; ${csrf}`;
  return { app, cookieHeader, csrfVal };
}

describe("HTTP /api/providers", () => {
  it("returns the 4 providers (auth required)", async () => {
    const { app, cookieHeader } = await makeAuthedApp();
    const r = await app.inject({
      method: "GET",
      url: "/api/providers",
      headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.ok).toBe(true);
    expect(body.data.providers.length).toBe(4);
    expect(body.data.providers.find((p: { id: string }) => p.id === "antigravity")
        .enabled).toBe(true);
    await app.close();
  });

  it("returns 401 without session", async () => {
    const { app } = await makeAuthedApp();
    const r = await app.inject({ method: "GET", url: "/api/providers" });
    expect(r.statusCode).toBe(401);
    await app.close();
  });
});

describe("HTTP /api/projects", () => {
  it("browse returns entries under a configured root", async () => {
    await mkdir(join(rootA, "proj-a"));
    await mkdir(join(rootA, "proj-a", ".git"));
    const { app, cookieHeader } = await makeAuthedApp();
    const r = await app.inject({
      method: "GET",
      url: `/api/projects/browse?path=${encodeURIComponent(rootA)}`,
      headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.data.entries.length).toBeGreaterThan(0);
    const projA = body.data.entries.find(
      (e: { name: string }) => e.name === "proj-a",
    );
    expect(projA.recommendations.map((r: { marker: string }) => r.marker)).toContain(
      ".git",
    );
    await app.close();
  });

  it("register inside root works without confirmManual", async () => {
    await mkdir(join(rootA, "proj-b"));
    const { app, cookieHeader, csrfVal } = await makeAuthedApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: cookieHeader, "x-csrf-token": csrfVal },
      payload: { path: join(rootA, "proj-b") },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.project.path).toBe(join(rootA, "proj-b"));
    await app.close();
  });

  it("register outside root requires confirmManual", async () => {
    const outside = join(dir, "outside");
    await mkdir(outside);
    const { app, cookieHeader, csrfVal } = await makeAuthedApp();
    const blocked = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: cookieHeader, "x-csrf-token": csrfVal },
      payload: { path: outside },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("manual_confirm_required");

    const ok = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: cookieHeader, "x-csrf-token": csrfVal },
      payload: { path: outside, confirmManual: true },
    });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it("recent → list → setLastProvider → recent reflects change", async () => {
    await mkdir(join(rootA, "proj-c"));
    await writeFile(join(rootA, "proj-c", "AGENTS.md"), "x");
    const { app, cookieHeader, csrfVal } = await makeAuthedApp();

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: cookieHeader, "x-csrf-token": csrfVal },
      payload: { path: join(rootA, "proj-c") },
    });
    const id = created.json().data.project.id;

    await app.inject({
      method: "PUT",
      url: `/api/projects/${id}/last-provider`,
      headers: { cookie: cookieHeader, "x-csrf-token": csrfVal },
      payload: { providerId: "antigravity" },
    });

    const detail = await app.inject({
      method: "GET",
      url: `/api/projects/${id}`,
      headers: { cookie: cookieHeader },
    });
    expect(detail.json().data.project.lastProviderId).toBe("antigravity");

    const recent = await app.inject({
      method: "GET",
      url: "/api/projects/recent",
      headers: { cookie: cookieHeader },
    });
    expect(recent.json().data.projects.length).toBeGreaterThan(0);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/projects/${id}`,
      headers: { cookie: cookieHeader, "x-csrf-token": csrfVal },
    });
    expect(del.statusCode).toBe(200);
    await app.close();
  });
});

describe("HTTP /api/sessions", () => {
  it("returns empty list (sprint 02 baseline)", async () => {
    const { app, cookieHeader } = await makeAuthedApp();
    const r = await app.inject({
      method: "GET",
      url: "/api/sessions",
      headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.sessions).toEqual([]);
    await app.close();
  });
});

describe("stub adapters", () => {
  it("DisabledAdapter reports unsupported capabilities and throws on actions",
     async () => {
    const { ClaudeAdapter } = await import(
      "../src/server/adapters/stub/claude.js"
    );
    const a = new ClaudeAdapter();
    const det = await a.detect();
    expect(det.available).toBe(false);
    expect(det.capabilities.launch).toBe("unsupported");
    await expect(a.start()).rejects.toMatchObject({ code: "provider_disabled" });
  });
});
