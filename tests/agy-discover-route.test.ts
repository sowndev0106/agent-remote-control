import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authedApp, type AuthedAppFixture } from "./_authed-app.js";

let dir: string;
let fx: AuthedAppFixture;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-agy-discover-"));
  fx = await authedApp({ dir });
});
afterEach(async () => {
  await fx.assembled.shutdown();
  await rm(dir, { recursive: true, force: true });
});

describe("agy discover route", () => {
  it("does not reject agy as a disabled provider", async () => {
    const res = await fx.assembled.app.inject({
      method: "POST",
      url: "/api/sessions/discover?provider=agy",
      headers: { cookie: fx.cookieHeader, "x-csrf-token": fx.csrfVal },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
  });

  it("surfaces a registered agy-wrapper session in /api/sessions/discover", async () => {
    // Simulate what the wrapper CLI does via IPC: register a user-owned session.
    const w = fx.assembled.deps.agyWrapper.register({
      pid: 9999,
      projectPath: "/tmp/agy-wrapper-demo",
    });

    const res = await fx.assembled.app.inject({
      method: "POST",
      url: "/api/sessions/discover?provider=agy",
      headers: { cookie: fx.cookieHeader, "x-csrf-token": fx.csrfVal },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const sources = body.data.sessions.map((s: { source: string }) => s.source);
    expect(sources).toContain("agy-wrapper");
    const found = body.data.sessions.find(
      (s: { sessionId: string }) => s.sessionId === w.sessionId,
    );
    expect(found).toMatchObject({
      providerId: "agy",
      source: "agy-wrapper",
      projectPath: "/tmp/agy-wrapper-demo",
    });
  });
});
