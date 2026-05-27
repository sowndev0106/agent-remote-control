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
import { AntigravityPtyAdapter } from "../src/server/adapters/antigravity/pty.js";
import { AntigravityTmuxAdapter } from "../src/server/adapters/antigravity/tmux.js";
import { AntigravityScreenAdapter } from "../src/server/adapters/antigravity/screen.js";
import { UnmanagedDetector } from "../src/server/adapters/antigravity/unmanaged.js";
import { SessionDiscoveryAggregator } from "../src/server/domains/discovery.js";
import { DebugPortPool } from "../src/server/ipc/wire.js";
import { TerminalService } from "../src/server/domains/terminal.js";

let dir: string;
let root: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-tools-"));
  root = join(dir, "project");
  await mkdir(root, { recursive: true });
  _resetRateLimitForTests();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function makeAuthedApp() {
  const config = defaultConfig();
  config.projects.roots = [dir];
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
    command: "antigravity",
    debugPortRange: [9000],
    launchTimeoutMs: 500,
    snapshotPollMs: 60_000,
  });
  const pty = new AntigravityPtyAdapter({ sessions: sessionsLite, bus, command: "antigravity" });
  const portPool = new DebugPortPool([9000]);
  const terminal = new TerminalService({
    enabled: config.terminal.enabled,
    shell: "/bin/bash",
    maxTabs: config.terminal.maxTabs,
    scrollback: config.terminal.scrollback,
  });
  const tmux = new AntigravityTmuxAdapter({
    sessions: sessionsLite,
    targets: () => config.providers.antigravity.tmuxTargets,
  });
  const screen = new AntigravityScreenAdapter({
    sessions: sessionsLite,
    targets: () => config.providers.antigravity.screenTargets,
  });
  const unmanaged = new UnmanagedDetector({
    sessions: sessionsLite,
    ownedPids: () => new Set(),
    wrapperPids: () => new Set(),
    procScan: async () => [],
  });
  const discovery = new SessionDiscoveryAggregator({ cdp: antigravity, tmux, screen, unmanaged });

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
    pty,
    portPool,
    terminal,
    discovery,
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

  // Register the project.
  const created = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: cookieHeader, "x-csrf-token": csrfVal },
    payload: { path: root },
  });
  const projectId = created.json().data.project.id as string;

  return { app, cookieHeader, csrfVal, projectId, terminal };
}

describe("config + security headers", () => {
  it("GET /api/config returns sanitized config without passwordHash (S08)", async () => {
    const { app, cookieHeader } = await makeAuthedApp();
    const r = await app.inject({
      method: "GET",
      url: "/api/config",
      headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(200);
    const data = r.json().data;
    expect(data.server.passwordSet).toBe(true);
    // The secret field itself must be absent (passwordHashAlgorithm is fine).
    expect(data.server.passwordHash).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/"passwordHash":/);
    await app.close();
  });

  it("sets a strict CSP on the shell and omits it on /api JSON (S08-T10)", async () => {
    const { app, cookieHeader } = await makeAuthedApp();
    const shell = await app.inject({ method: "GET", url: "/healthz" });
    expect(shell.headers["content-security-policy"]).toMatch(/default-src 'self'/);
    expect(shell.headers["x-content-type-options"]).toBe("nosniff");

    const apiJson = await app.inject({
      method: "GET",
      url: "/api/providers",
      headers: { cookie: cookieHeader },
    });
    expect(apiJson.headers["content-security-policy"]).toBeUndefined();
    await app.close();
  });
});

describe("files API", () => {
  it("lists project tree (auth required)", async () => {
    await writeFile(join(root, "README.md"), "hi");
    const { app, cookieHeader, projectId } = await makeAuthedApp();
    const r = await app.inject({
      method: "GET",
      url: `/api/files/tree?projectId=${projectId}`,
      headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.entries.map((e: { name: string }) => e.name)).toContain(
      "README.md",
    );
    await app.close();
  });

  it("rejects path traversal with normalized error (AC-019)", async () => {
    const { app, cookieHeader, projectId } = await makeAuthedApp();
    const r = await app.inject({
      method: "GET",
      url: `/api/files/tree?projectId=${projectId}&path=${encodeURIComponent(
        join(root, "..", ".."),
      )}`,
      headers: { cookie: cookieHeader },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("path_outside_project");
    await app.close();
  });

  it("previews text files", async () => {
    await writeFile(join(root, "a.txt"), "hello");
    const { app, cookieHeader, projectId } = await makeAuthedApp();
    const r = await app.inject({
      method: "GET",
      url: `/api/files/preview?projectId=${projectId}&path=${encodeURIComponent(join(root, "a.txt"))}`,
      headers: { cookie: cookieHeader },
    });
    expect(r.json().data.kind).toBe("text");
    expect(r.json().data.content).toBe("hello");
    await app.close();
  });
});

describe("terminal API", () => {
  it("creates and lists a tab, then closes it", async () => {
    const { app, cookieHeader, csrfVal, projectId } = await makeAuthedApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/terminal/tabs",
      headers: { cookie: cookieHeader, "x-csrf-token": csrfVal },
      payload: { projectId },
    });
    expect(created.statusCode).toBe(200);
    const tabId = created.json().data.tab.id as string;

    const list = await app.inject({
      method: "GET",
      url: "/api/terminal/tabs",
      headers: { cookie: cookieHeader },
    });
    expect(list.json().data.tabs.length).toBe(1);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/terminal/tabs/${tabId}`,
      headers: { cookie: cookieHeader, "x-csrf-token": csrfVal },
    });
    expect(del.statusCode).toBe(200);
    await app.close();
  });

  it("terminal create requires auth (AC-025 surface)", async () => {
    const { app, projectId } = await makeAuthedApp();
    const r = await app.inject({
      method: "POST",
      url: "/api/terminal/tabs",
      payload: { projectId },
    });
    expect(r.statusCode).toBe(401);
    await app.close();
  });
});
