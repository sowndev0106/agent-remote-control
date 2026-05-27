import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { RecommendationMarker } from "./types.js";

const MARKERS: { name: RecommendationMarker["marker"]; isDir: boolean }[] = [
  { name: ".git", isDir: true },
  { name: "AGENTS.md", isDir: false },
  { name: "GEMINI.md", isDir: false },
  { name: ".agents/", isDir: true },
  { name: ".opencode/", isDir: true },
  { name: ".claude/", isDir: true },
  { name: ".codex/", isDir: true },
];

export async function detectRecommendations(
  dir: string,
): Promise<RecommendationMarker[]> {
  const results: RecommendationMarker[] = [];
  await Promise.all(
    MARKERS.map(async ({ name, isDir }) => {
      const fsName = name.endsWith("/") ? name.slice(0, -1) : name;
      try {
        const s = await stat(join(dir, fsName));
        if (isDir ? s.isDirectory() : s.isFile()) {
          results.push({ marker: name });
        }
      } catch {
        /* missing or unreadable — not a marker */
      }
    }),
  );
  return results;
}
