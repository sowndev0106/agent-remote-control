import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureSecretKey } from "../src/server/core/secret-key.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ensureSecretKey", () => {
  it("creates a 32-byte file at 0600 on first call", async () => {
    const path = join(dir, "secret.key");
    const buf = await ensureSecretKey(path);
    expect(buf.length).toBe(32);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("loads existing secret on second call", async () => {
    const path = join(dir, "secret.key");
    const a = await ensureSecretKey(path);
    const b = await ensureSecretKey(path);
    expect(Buffer.compare(a, b)).toBe(0);
    const onDisk = await readFile(path);
    expect(Buffer.compare(a, onDisk)).toBe(0);
  });
});
