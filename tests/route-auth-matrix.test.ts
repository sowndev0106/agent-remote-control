import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authedApp, type AuthedAppFixture } from "./_authed-app.js";

let dir: string;
let fixture: AuthedAppFixture;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-route-auth-"));
  fixture = await authedApp({ dir });
});

afterEach(async () => {
  await fixture.assembled.shutdown();
  await rm(dir, { recursive: true, force: true });
});

describe("route auth matrix (H5)", () => {
  it("every sampled non-public HTTP route rejects unauthenticated requests", async () => {
    const protectedRoutes: Array<{
      method: "GET" | "POST" | "PUT" | "DELETE";
      url: string;
      payload?: unknown;
    }> = [
      { method: "GET", url: "/api/auth/whoami" },
      { method: "POST", url: "/api/auth/logout" },
      { method: "GET", url: "/api/config" },
      { method: "GET", url: "/api/providers" },
      { method: "GET", url: "/api/projects/browse" },
      { method: "GET", url: "/api/projects/recent" },
      { method: "GET", url: "/api/projects/p1" },
      { method: "POST", url: "/api/projects", payload: { path: "/tmp" } },
      { method: "DELETE", url: "/api/projects/p1" },
      { method: "PUT", url: "/api/projects/p1/last-provider", payload: { providerId: "antigravity" } },
      { method: "PUT", url: "/api/projects/p1/last-session", payload: { sessionId: "s1" } },
      { method: "GET", url: "/api/sessions" },
      { method: "POST", url: "/api/sessions/discover", payload: { projectId: "p1" } },
      { method: "POST", url: "/api/sessions/launch", payload: { projectId: "p1" } },
      { method: "POST", url: "/api/sessions/pty/launch", payload: { projectId: "p1" } },
      { method: "POST", url: "/api/sessions/s1/attach" },
      { method: "POST", url: "/api/sessions/s1/prompt", payload: { text: "hi" } },
      { method: "POST", url: "/api/sessions/s1/stop" },
      { method: "POST", url: "/api/sessions/s1/new-conversation" },
      { method: "GET", url: "/api/sessions/s1/snapshot" },
      { method: "GET", url: "/api/sessions/s1/actions" },
      { method: "POST", url: "/api/sessions/s1/actions/a1" },
      { method: "GET", url: "/api/sessions/s1/conversations" },
      { method: "POST", url: "/api/sessions/s1/conversations/c1/select" },
      { method: "POST", url: "/api/sessions/s1/scroll", payload: { fraction: 0.5 } },
      { method: "POST", url: "/api/sessions/s1/pty/input", payload: { input: "x" } },
      { method: "POST", url: "/api/sessions/s1/pty/signal", payload: { signal: "SIGINT" } },
      { method: "POST", url: "/api/sessions/s1/resume" },
      { method: "GET", url: "/api/files/tree" },
      { method: "GET", url: "/api/files/preview" },
      { method: "GET", url: "/api/files/search" },
      { method: "GET", url: "/api/terminal/tabs" },
      { method: "POST", url: "/api/terminal/tabs", payload: { projectId: "p1" } },
      { method: "DELETE", url: "/api/terminal/tabs/t1" },
      { method: "POST", url: "/api/terminal/tabs/t1/resize", payload: { cols: 80, rows: 24 } },
    ];

    for (const route of protectedRoutes) {
      const res = await fixture.assembled.app.inject(route);
      expect.soft(res.statusCode, `${route.method} ${route.url}`).toBe(401);
      expect.soft(res.json().error.code, `${route.method} ${route.url}`).toBe(
        "auth_required",
      );
    }
  });

  it("only health, login page, and login API are public", async () => {
    const app = fixture.assembled.app;

    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/login" })).statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "correct-horse-battery" },
    });
    expect(login.statusCode).toBe(200);
  });
});
