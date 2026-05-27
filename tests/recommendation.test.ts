import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectRecommendations } from "../src/server/domains/recommendations.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("detectRecommendations", () => {
  it("returns empty array for a bare folder", async () => {
    expect(await detectRecommendations(dir)).toEqual([]);
  });

  it("detects .git directory", async () => {
    await mkdir(join(dir, ".git"));
    const r = await detectRecommendations(dir);
    expect(r.map((m) => m.marker)).toContain(".git");
  });

  it("detects AGENTS.md file", async () => {
    await writeFile(join(dir, "AGENTS.md"), "x");
    const r = await detectRecommendations(dir);
    expect(r.map((m) => m.marker)).toContain("AGENTS.md");
  });

  it("detects all 7 markers when present", async () => {
    await mkdir(join(dir, ".git"));
    await writeFile(join(dir, "AGENTS.md"), "x");
    await writeFile(join(dir, "GEMINI.md"), "x");
    await mkdir(join(dir, ".agents"));
    await mkdir(join(dir, ".opencode"));
    await mkdir(join(dir, ".claude"));
    await mkdir(join(dir, ".codex"));
    const r = await detectRecommendations(dir);
    const markers = r.map((m) => m.marker).sort();
    expect(markers).toEqual(
      [
        ".agents/",
        ".claude/",
        ".codex/",
        ".git",
        ".opencode/",
        "AGENTS.md",
        "GEMINI.md",
      ].sort(),
    );
  });

  it("ignores file with directory marker name", async () => {
    await writeFile(join(dir, ".git"), "x");
    const r = await detectRecommendations(dir);
    expect(r.map((m) => m.marker)).not.toContain(".git");
  });
});
