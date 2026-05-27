import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../src/server/domains/projects.js";
import { AppError } from "../src/server/core/errors.js";

let dir: string;
let rootA: string;
let rootB: string;
let outside: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
  rootA = join(dir, "rootA");
  rootB = join(dir, "rootB");
  outside = join(dir, "outside");
  await mkdir(rootA);
  await mkdir(rootB);
  await mkdir(outside);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function newStore(opts?: { recentLimit?: number }) {
  return new ProjectStore({
    path: join(dir, "projects.json"),
    recentLimit: opts?.recentLimit ?? 50,
    configuredRoots: [rootA, rootB],
  });
}

describe("ProjectStore", () => {
  it("selects a folder inside a configured root", async () => {
    const proj = join(rootA, "p1");
    await mkdir(proj);
    await writeFile(join(proj, "AGENTS.md"), "x");

    const store = newStore();
    await store.load();
    const p = await store.select(proj, false);
    expect(p.path).toBe(proj);
    expect(p.recommendations.map((r) => r.marker)).toContain("AGENTS.md");
    expect(p.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it("rejects path outside roots without confirmManual", async () => {
    const store = newStore();
    await store.load();
    await expect(store.select(outside, false)).rejects.toMatchObject({
      code: "manual_confirm_required",
    });
  });

  it("accepts path outside roots when confirmManual=true", async () => {
    const store = newStore();
    await store.load();
    const p = await store.select(outside, true);
    expect(p.path).toBe(outside);
  });

  it("rejects path traversal even with confirm", async () => {
    const store = newStore();
    await store.load();
    await expect(
      store.select(join(rootA, "..", "..", "etc"), true),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("persists across reload", async () => {
    const proj = join(rootA, "p2");
    await mkdir(proj);
    const a = newStore();
    await a.load();
    const p = await a.select(proj, false);

    const b = newStore();
    await b.load();
    const found = b.get(p.id);
    expect(found?.path).toBe(proj);
  });

  it("caps stored projects at recentLimit", async () => {
    const store = newStore({ recentLimit: 2 });
    await store.load();
    for (let i = 0; i < 4; i++) {
      const path = join(rootA, `cap${i}`);
      await mkdir(path);
      await store.select(path, false);
    }
    expect(store.list().length).toBe(2);
  });

  it("delete removes from saved list", async () => {
    const proj = join(rootA, "p3");
    await mkdir(proj);
    const store = newStore();
    await store.load();
    const p = await store.select(proj, false);
    expect(await store.remove(p.id)).toBe(true);
    expect(store.get(p.id)).toBeUndefined();
    expect(await store.remove("nope")).toBe(false);
  });

  it("setLastProvider and setLastSession persist", async () => {
    const proj = join(rootA, "p4");
    await mkdir(proj);
    const store = newStore();
    await store.load();
    const p = await store.select(proj, false);
    await store.setLastProvider(p.id, "antigravity");
    await store.setLastSession(p.id, "sess-xyz");
    const reloaded = newStore();
    await reloaded.load();
    const found = reloaded.get(p.id)!;
    expect(found.lastProviderId).toBe("antigravity");
    expect(found.lastSessionId).toBe("sess-xyz");
  });

  it("setLastProvider throws for unknown id", async () => {
    const store = newStore();
    await store.load();
    await expect(
      store.setLastProvider("none", "antigravity"),
    ).rejects.toMatchObject({ code: "project_not_found" });
  });
});

describe("ProjectStore.browseDir", () => {
  it("returns entries with dirs first and recommendations", async () => {
    await mkdir(join(rootA, "p1"));
    await mkdir(join(rootA, "p1", ".git"));
    await writeFile(join(rootA, "p1", "a.txt"), "x");
    await mkdir(join(rootA, "p2"));
    const entries = await ProjectStore.browseDir(rootA, false);
    const p1 = entries.find((e) => e.name === "p1")!;
    expect(p1.isDir).toBe(true);
    expect(p1.recommendations.map((r) => r.marker)).toContain(".git");
    expect(entries[0]!.isDir).toBe(true);
  });

  it("hides dotfiles unless showHidden=true", async () => {
    await mkdir(join(rootA, ".hidden"));
    await mkdir(join(rootA, "visible"));
    expect(
      (await ProjectStore.browseDir(rootA, false)).map((e) => e.name),
    ).toEqual(["visible"]);
    expect(
      (await ProjectStore.browseDir(rootA, true)).map((e) => e.name).sort(),
    ).toEqual([".hidden", "visible"]);
  });
});
