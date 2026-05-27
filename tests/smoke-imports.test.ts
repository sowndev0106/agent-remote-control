import { describe, it, expect } from "vitest";

describe("native ESM imports", () => {
  it("loads node-pty without throwing (per S01-T01 smoke import)", async () => {
    const pty = await import("node-pty");
    expect(typeof pty.spawn).toBe("function");
  });

  it("loads argon2 or bcrypt (hash backend present)", async () => {
    let ok = false;
    try {
      await import("argon2");
      ok = true;
    } catch {
      /* fall through to bcrypt */
    }
    if (!ok) {
      await import("bcrypt");
      ok = true;
    }
    expect(ok).toBe(true);
  });

  it("imports fastify under ESM", async () => {
    const f = await import("fastify");
    expect(typeof f.default).toBe("function");
  });
});
