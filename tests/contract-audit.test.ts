/**
 * Cross-cutting contract audits for sprint 08 (S08-T01, T05, T11, T12).
 * These are static-source checks that fail the build when a new route or
 * emitter drifts from the locked contracts.
 */
import { describe, it, expect } from "vitest";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src", "server");

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...(await walk(p)));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("S08-T12: auth-everywhere", () => {
  it("the only public routes are the documented allowlist", async () => {
    const appSrc = await readFile(join(SRC, "core", "app.ts"), "utf8");
    // PUBLIC set must be exactly /api/auth/login (plus /healthz + non-/api shell)
    expect(appSrc).toMatch(/PUBLIC_API_EXACT = new Set<string>\(\["\/api\/auth\/login"\]\)/);
    // The gate must auth every /api/* route by default.
    expect(appSrc).toMatch(/if \(!path\.startsWith\("\/api\/"\)\) return true;/);
  });
});

describe("S08-T05/T11: no client-supplied selectors, no stray innerHTML", () => {
  it("no route file reads selector-like fields from the request body", async () => {
    const files = await walk(join(SRC, "http"));
    const forbidden = ["selector", "xpath", "occurrenceIndex", "buttonText", "rawCommand", "expression"];
    for (const f of files) {
      const src = await readFile(f, "utf8");
      for (const field of forbidden) {
        expect(
          src.includes(`req.body?.${field}`) || src.includes(`req.body.${field}`),
          `${f} must not read req.body.${field}`,
        ).toBe(false);
      }
    }
  });

  it("no server source uses dangerouslySetInnerHTML", async () => {
    const files = await walk(SRC);
    for (const f of files) {
      const src = await readFile(f, "utf8");
      expect(src.includes("dangerouslySetInnerHTML"), f).toBe(false);
    }
  });
});

describe("S08-T01: every HTTP route file imports the envelope helper", () => {
  it("route modules use okEnvelope/errEnvelope, not bespoke shapes", async () => {
    const files = (await walk(join(SRC, "http"))).filter(
      (f) => f.endsWith("-routes.ts") || /\/(projects|providers|sessions|login)\.ts$/.test(f),
    );
    for (const f of files) {
      const src = await readFile(f, "utf8");
      // Each route file should reference the shared envelope helpers.
      const usesEnvelope =
        src.includes("okEnvelope") || src.includes("errEnvelope");
      expect(usesEnvelope, `${f} should use the shared envelope helper`).toBe(true);
    }
  });
});

describe("S08-T02/T03: realtime event catalog", () => {
  it("covers the REQ-112 event families", async () => {
    const events = await readFile(
      join(SRC, "core", "realtime", "events.ts"),
      "utf8",
    );
    for (const t of [
      "provider.status.changed",
      "provider.snapshot.changed",
      "provider.actions.changed",
      "session.lifecycle.changed",
      "terminal.output",
      "terminal.lifecycle.changed",
    ]) {
      expect(events, `events.ts must declare ${t}`).toContain(t);
    }
  });
});
