import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authedApp, type AuthedAppFixture } from "./_authed-app.js";
import { SessionStoreLite } from "../src/server/domains/sessions.js";

let dir: string;
let root: string;
let fixture: AuthedAppFixture;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-http-edges-"));
  root = join(dir, "project");
  await mkdir(root, { recursive: true });
  fixture = await authedApp({
    dir,
    configure: (config) => {
      config.projects.roots = [dir];
    },
  });
});

afterEach(async () => {
  await fixture.assembled.shutdown();
  await rm(dir, { recursive: true, force: true });
});

function authHeaders() {
  return {
    cookie: fixture.cookieHeader,
    "x-csrf-token": fixture.csrfVal,
  };
}

async function createProject(): Promise<string> {
  const res = await fixture.assembled.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: authHeaders(),
    payload: { path: root },
  });
  expect(res.statusCode).toBe(200);
  return res.json().data.project.id as string;
}

describe("project route edge branches", () => {
  it("covers browse, missing body, missing project, and metadata validation", async () => {
    const app = fixture.assembled.app;

    const browse = await app.inject({
      method: "GET",
      url: `/api/projects/browse?path=${encodeURIComponent(root)}`,
      headers: { cookie: fixture.cookieHeader },
    });
    expect(browse.statusCode).toBe(200);

    const missingPath = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: authHeaders(),
      payload: {},
    });
    expect(missingPath.statusCode).toBe(400);
    expect(missingPath.json().error.code).toBe("path_required");

    const missingGet = await app.inject({
      method: "GET",
      url: "/api/projects/nope",
      headers: { cookie: fixture.cookieHeader },
    });
    expect(missingGet.statusCode).toBe(404);

    const missingDelete = await app.inject({
      method: "DELETE",
      url: "/api/projects/nope",
      headers: authHeaders(),
    });
    expect(missingDelete.statusCode).toBe(404);

    const noProvider = await app.inject({
      method: "PUT",
      url: "/api/projects/nope/last-provider",
      headers: authHeaders(),
      payload: {},
    });
    expect(noProvider.statusCode).toBe(400);
    expect(noProvider.json().error.code).toBe("provider_id_required");

    const noSession = await app.inject({
      method: "PUT",
      url: "/api/projects/nope/last-session",
      headers: authHeaders(),
      payload: {},
    });
    expect(noSession.statusCode).toBe(400);
    expect(noSession.json().error.code).toBe("session_id_required");
  });
});

describe("files route edge branches", () => {
  it("covers disabled, missing project, missing path, and search branches", async () => {
    const app = fixture.assembled.app;

    const missingProject = await app.inject({
      method: "GET",
      url: "/api/files/tree",
      headers: { cookie: fixture.cookieHeader },
    });
    expect(missingProject.statusCode).toBe(400);
    expect(missingProject.json().error.code).toBe("project_required");

    const projectId = await createProject();
    const missingPath = await app.inject({
      method: "GET",
      url: `/api/files/preview?projectId=${projectId}`,
      headers: { cookie: fixture.cookieHeader },
    });
    expect(missingPath.statusCode).toBe(400);
    expect(missingPath.json().error.code).toBe("path_required");

    await writeFile(join(root, "hello.txt"), "hello route search");
    const search = await app.inject({
      method: "GET",
      url: `/api/files/search?projectId=${projectId}&q=hello`,
      headers: { cookie: fixture.cookieHeader },
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().data.results[0].relPath).toBe("hello.txt");

    fixture.assembled.deps.config.fileExplorer.enabled = false;
    const disabled = await app.inject({
      method: "GET",
      url: `/api/files/tree?projectId=${projectId}`,
      headers: { cookie: fixture.cookieHeader },
    });
    expect(disabled.statusCode).toBe(409);
    expect(disabled.json().error.code).toBe("files_disabled");
  });
});

describe("adapter and pty route edge branches", () => {
  it("covers disabled provider, launch validation, scroll, and pty resume errors", async () => {
    const app = fixture.assembled.app;

    const disabledProvider = await app.inject({
      method: "POST",
      url: "/api/sessions/discover?provider=claude",
      headers: authHeaders(),
      payload: { projectId: "p1" },
    });
    expect(disabledProvider.statusCode).toBe(409);
    expect(disabledProvider.json().error.code).toBe("provider_disabled");

    const missingLaunchProject = await app.inject({
      method: "POST",
      url: "/api/sessions/launch",
      headers: authHeaders(),
      payload: {},
    });
    expect(missingLaunchProject.statusCode).toBe(400);

    const unknownLaunchProject = await app.inject({
      method: "POST",
      url: "/api/sessions/launch",
      headers: authHeaders(),
      payload: { projectId: "missing" },
    });
    expect(unknownLaunchProject.statusCode).toBe(404);

    const claudeSession = SessionStoreLite.makeSession({
      providerId: "claude",
      source: "cdp",
    });
    fixture.assembled.deps.agentSessions.set(claudeSession);
    const scroll = await app.inject({
      method: "POST",
      url: `/api/sessions/${claudeSession.sessionId}/scroll`,
      headers: authHeaders(),
      payload: { fraction: 0.5 },
    });
    expect(scroll.statusCode).toBe(409);
    expect(scroll.json().error.code).toBe("capability_unsupported");

    const managed = SessionStoreLite.makeSession({
      providerId: "antigravity",
      source: "managed-pty",
    });
    fixture.assembled.deps.agentSessions.set(managed);
    const missingInput = await app.inject({
      method: "POST",
      url: `/api/sessions/${managed.sessionId}/pty/input`,
      headers: authHeaders(),
      payload: {},
    });
    expect(missingInput.statusCode).toBe(400);

    const resumeDead = await app.inject({
      method: "POST",
      url: `/api/sessions/${managed.sessionId}/resume`,
      headers: authHeaders(),
    });
    expect(resumeDead.statusCode).toBe(410);
    expect(resumeDead.json().error.code).toBe("managed_pty_resume_failed");
  });
});

describe("terminal route edge branches", () => {
  it("covers terminal create, close, foreground-job, and resize validations", async () => {
    const app = fixture.assembled.app;

    const missingProject = await app.inject({
      method: "POST",
      url: "/api/terminal/tabs",
      headers: authHeaders(),
      payload: {},
    });
    expect(missingProject.statusCode).toBe(400);

    const unknownProject = await app.inject({
      method: "POST",
      url: "/api/terminal/tabs",
      headers: authHeaders(),
      payload: { projectId: "missing" },
    });
    expect(unknownProject.statusCode).toBe(404);

    const missingClose = await app.inject({
      method: "DELETE",
      url: "/api/terminal/tabs/missing",
      headers: authHeaders(),
    });
    expect(missingClose.statusCode).toBe(404);

    const terminal = fixture.assembled.deps.terminal;
    const close = vi.spyOn(terminal, "close").mockImplementation(() => {});
    vi.spyOn(terminal, "get").mockReturnValue({} as never);
    vi.spyOn(terminal, "hasForegroundJob").mockReturnValue(true);
    const foreground = await app.inject({
      method: "DELETE",
      url: "/api/terminal/tabs/t1",
      headers: authHeaders(),
    });
    expect(foreground.statusCode).toBe(409);
    expect(foreground.json().error.code).toBe("foreground_job_running");

    const force = await app.inject({
      method: "DELETE",
      url: "/api/terminal/tabs/t1?force=true",
      headers: authHeaders(),
    });
    expect(force.statusCode).toBe(200);
    expect(close).toHaveBeenCalledWith("t1");

    const resize = vi.spyOn(terminal, "resize").mockImplementation(() => {});
    const resized = await app.inject({
      method: "POST",
      url: "/api/terminal/tabs/t1/resize",
      headers: authHeaders(),
      payload: { cols: 100, rows: 40 },
    });
    expect(resized.statusCode).toBe(200);
    expect(resize).toHaveBeenCalledWith("t1", 100, 40);
  });
});
