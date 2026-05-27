/**
 * Mirror iframe must use sandbox="" (no allow-scripts). Scraped script tags
 * are already stripped by the server sanitizer, but the iframe attribute is
 * the second line of defense — even if a script leaks through, it must not
 * execute.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("MirrorTimeline iframe security", () => {
  it("uses sandbox= with empty value (no scripts allowed)", async () => {
    const src = await readFile(
      join(__dirname, "..", "src", "web", "components", "MirrorTimeline.tsx"),
      "utf8",
    );
    expect(src).toMatch(/sandbox=""/);
    expect(src).not.toMatch(/sandbox="[^"]*allow-scripts[^"]*"/);
  });

  it("renders snapshot via srcDoc, never dangerouslySetInnerHTML", async () => {
    const src = await readFile(
      join(__dirname, "..", "src", "web", "components", "MirrorTimeline.tsx"),
      "utf8",
    );
    expect(src).toMatch(/srcDoc=/);
    expect(src).not.toMatch(/dangerouslySetInnerHTML/);
  });
});
