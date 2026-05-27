import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSafe, expandHome } from "../src/server/core/path-safety.js";
import { AppError } from "../src/server/core/errors.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("resolveSafe", () => {
  it("returns the canonical path when input lives under a root", async () => {
    const root = join(dir, "root");
    const sub = join(root, "a", "b");
    await mkdir(sub, { recursive: true });
    expect(await resolveSafe(sub, [root])).toBe(sub);
  });

  it("rejects ../ escape", async () => {
    const root = join(dir, "root");
    const sibling = join(dir, "sibling");
    await mkdir(root, { recursive: true });
    await mkdir(sibling, { recursive: true });
    await expect(resolveSafe(sibling, [root])).rejects.toBeInstanceOf(AppError);
  });

  it("rejects symlink escapes", async () => {
    const root = join(dir, "root");
    const outside = join(dir, "outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "secret"), "ok");
    await symlink(outside, join(root, "link"));
    await expect(resolveSafe(join(root, "link"), [root])).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("expandHome expands ~ and ~/sub", () => {
    expect(expandHome("~")).toMatch(/^\//);
    expect(expandHome("~/x")).toMatch(/\/x$/);
    expect(expandHome("/absolute/x")).toBe("/absolute/x");
  });

  it("errors with path_not_found for missing paths", async () => {
    await expect(
      resolveSafe(join(dir, "missing"), [dir]),
    ).rejects.toMatchObject({ code: "path_not_found" });
  });
});
