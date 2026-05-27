/**
 * H9 + AC-034 frontend guard: prove no UI surface submits selectors, button
 * text, occurrence indexes, or provider raw commands. The Sessions store
 * only sends `actionId` to the API.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sessionsStorePath = join(
  __dirname,
  "..",
  "src",
  "web",
  "stores",
  "sessions.ts",
);

describe("frontend H9/AC-034: performAction only sends actionId", () => {
  it("Sessions store posts to .../actions/${actionId} with no body", async () => {
    const src = await readFile(sessionsStorePath, "utf8");
    // Find the performAction implementation.
    const m = src.match(/async performAction\([^)]+\)[\s\S]+?\}\s*,/);
    expect(m).not.toBeNull();
    const body = m![0];

    expect(body).toMatch(/api\.post\(`\/api\/sessions\/\$\{[^}]+\}\/actions\/\$\{actionId\}`\)/);

    // Never include selector-ish fields in the body.
    for (const f of [
      "selector",
      "css",
      "xpath",
      "buttonText",
      "occurrenceIndex",
      "rawCommand",
      "method",
      "params",
      "expression",
    ]) {
      expect(body).not.toMatch(new RegExp(`\\b${f}\\b`));
    }
  });
});
