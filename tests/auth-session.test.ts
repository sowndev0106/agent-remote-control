import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthSessionStore } from "../src/server/core/auth-session.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("AuthSessionStore", () => {
  it("creates a random 32-byte id and persists it across reloads", async () => {
    const store = new AuthSessionStore({
      path: join(dir, "sessions.json"),
      idleTimeoutMs: 60_000,
    });
    await store.load();
    const a = await store.create();
    const b = await store.create();
    expect(a.id).not.toBe(b.id);
    expect(a.id.length).toBeGreaterThanOrEqual(43);

    const peer = new AuthSessionStore({
      path: join(dir, "sessions.json"),
      idleTimeoutMs: 60_000,
    });
    await peer.load();
    expect(peer.get(a.id)).toBeDefined();
  });

  it("get() returns undefined for expired sessions", async () => {
    let t = 0;
    const store = new AuthSessionStore({
      path: join(dir, "s.json"),
      idleTimeoutMs: 1,
      now: () => t,
    });
    await store.load();
    const s = await store.create();
    t = 100;
    expect(store.get(s.id)).toBeUndefined();
  });

  it("touch() extends expiry", async () => {
    let t = 0;
    const store = new AuthSessionStore({
      path: join(dir, "s.json"),
      idleTimeoutMs: 100,
      now: () => t,
    });
    await store.load();
    const s = await store.create();
    t = 50;
    await store.touch(s.id);
    t = 120;
    expect(store.get(s.id)).toBeDefined();
  });

  it("destroy() removes the session", async () => {
    const store = new AuthSessionStore({
      path: join(dir, "s.json"),
      idleTimeoutMs: 60_000,
    });
    await store.load();
    const s = await store.create();
    await store.destroy(s.id);
    expect(store.get(s.id)).toBeUndefined();
  });
});
