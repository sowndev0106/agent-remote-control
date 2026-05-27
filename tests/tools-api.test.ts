import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authedApp } from "./_authed-app.js";

let dir: string;
let root: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-tools-"));
  root = join(dir, "project");
  await mkdir(root, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function makeAuthedApp() {
  const fx = await authedApp({
    dir,
    configure: (c) => { c.projects.roots = [dir]; },
  });
  // Register the project (existing test flow).
  const created = await fx.assembled.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: fx.cookieHeader, "x-csrf-token": fx.csrfVal },
    payload: { path: root },
  });
  const projectId = created.json().data.project.id as string;
  return {
    app: fx.assembled.app,
    cookieHeader: fx.cookieHeader,
    csrfVal: fx.csrfVal,
    projectId,
    terminal: fx.assembled.deps.terminal,
  };
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
