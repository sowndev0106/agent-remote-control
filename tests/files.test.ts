import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesService, isBinary, fuzzyScore } from "../src/server/domains/files.js";
import { AppError } from "../src/server/core/errors.js";

let dir: string;
let root: string;
const cfg = {
  ignore: [".git", "node_modules"],
  showHiddenDefault: false,
  maxPreviewBytes: 1024,
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-files-"));
  root = join(dir, "project");
  await mkdir(root, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FilesService.tree", () => {
  it("lists entries, dirs first, ignoring configured + hidden", async () => {
    await mkdir(join(root, "src"));
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "README.md"), "x");
    await writeFile(join(root, ".env"), "secret");
    const svc = new FilesService(root, cfg);
    const { entries } = await svc.tree(root, false);
    const names = entries.map((e) => e.name);
    expect(names).toContain("src");
    expect(names).toContain("README.md");
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain(".env");
    expect(entries[0]!.isDir).toBe(true);
  });

  it("shows hidden when requested", async () => {
    await writeFile(join(root, ".env"), "x");
    const svc = new FilesService(root, cfg);
    const { entries } = await svc.tree(root, true);
    expect(entries.map((e) => e.name)).toContain(".env");
  });

  it("rejects path traversal outside project (REQ-087, AC-019)", async () => {
    const svc = new FilesService(root, cfg);
    await expect(svc.tree(join(root, "..", ".."), false)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("rejects symlink escaping project root", async () => {
    const outside = join(dir, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "secret.txt"), "leak");
    await symlink(outside, join(root, "link"));
    const svc = new FilesService(root, cfg);
    await expect(svc.tree(join(root, "link"), false)).rejects.toMatchObject({
      code: "path_outside_project",
    });
  });
});

describe("FilesService.preview", () => {
  it("returns text content for small text files", async () => {
    await writeFile(join(root, "a.txt"), "hello world");
    const svc = new FilesService(root, cfg);
    const p = await svc.preview(join(root, "a.txt"));
    expect(p.kind).toBe("text");
    expect(p.content).toBe("hello world");
  });

  it("returns binary metadata, not content (AC-018)", async () => {
    await writeFile(join(root, "bin.dat"), Buffer.from([0x00, 0x01, 0x02, 0x00]));
    const svc = new FilesService(root, cfg);
    const p = await svc.preview(join(root, "bin.dat"));
    expect(p.kind).toBe("binary");
    expect(p.content).toBeUndefined();
  });

  it("gates oversized files (AC-018)", async () => {
    await writeFile(join(root, "big.txt"), "x".repeat(2048));
    const svc = new FilesService(root, cfg);
    const p = await svc.preview(join(root, "big.txt"));
    expect(p.kind).toBe("oversized");
    expect(p.content).toBeUndefined();
  });

  it("rejects traversal in preview", async () => {
    const svc = new FilesService(root, cfg);
    await expect(
      svc.preview(join(root, "..", "..", "etc", "passwd")),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("FilesService.search", () => {
  it("fuzzy-matches file paths within project", async () => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "server.ts"), "x");
    await writeFile(join(root, "src", "client.ts"), "x");
    const svc = new FilesService(root, cfg);
    const results = await svc.search("srv");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.relPath).toContain("server.ts");
  });
});

describe("helpers", () => {
  it("isBinary detects null bytes", () => {
    expect(isBinary(Buffer.from([0x00, 0x41]))).toBe(true);
    expect(isBinary(Buffer.from("plain text", "utf8"))).toBe(false);
  });
  it("fuzzyScore returns 0 for non-subsequence", () => {
    expect(fuzzyScore("xyz", "abc")).toBe(0);
    expect(fuzzyScore("ab", "xaxb")).toBeGreaterThan(0);
  });
});
