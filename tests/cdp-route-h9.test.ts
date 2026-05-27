/**
 * H9 + AC-034 guard: prove no remote-action endpoint accepts selectors, DOM
 * paths, button text, occurrence indexes, or provider raw commands from the
 * client. Only the server-issued `actionId` is honored.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routesPath = join(
  __dirname,
  "..",
  "src",
  "server",
  "http",
  "adapter-routes.ts",
);

const FORBIDDEN_BODY_FIELDS = [
  "selector",
  "css",
  "xpath",
  "occurrenceIndex",
  "buttonText",
  "rawCommand",
  "method",
  "params",
  "expression",
];

describe("H9 / AC-034: remote-action endpoints reject selector inputs", () => {
  it("performAction route only accepts :actionId path param", async () => {
    const src = await readFile(routesPath, "utf8");
    // The route body for performAction must not destructure any forbidden field.
    const routeBlockMatch = src.match(
      /"\/api\/sessions\/:id\/actions\/:actionId"[\s\S]+?\}\s*,\s*\)/,
    );
    expect(routeBlockMatch).not.toBeNull();
    const block = routeBlockMatch![0];
    for (const f of FORBIDDEN_BODY_FIELDS) {
      expect(block.includes(`req.body?.${f}`)).toBe(false);
      expect(block.includes(`req.body.${f}`)).toBe(false);
      expect(block.includes(`req.body["${f}"]`)).toBe(false);
    }
    // The route MUST read `req.params.actionId` and pass it straight through.
    expect(block).toMatch(/req\.params\.actionId/);
  });
});
