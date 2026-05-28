import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, stat, chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readPersisted,
  writePersisted,
  PersistenceError,
} from "../src/server/core/persistence.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("persistence", () => {
  it("writes file at 0600 and parent dir at 0700", async () => {
    const path = join(dir, "sub", "config.json");
    await writePersisted(path, { hello: "world" });
    const fileMode = (await stat(path)).mode & 0o777;
    const dirMode = (await stat(join(dir, "sub"))).mode & 0o777;
    expect(fileMode).toBe(0o600);
    expect(dirMode).toBe(0o700);
  });

  it("wraps payload in {version,data}", async () => {
    const path = join(dir, "x.json");
    await writePersisted(path, { a: 1 });
    const raw = JSON.parse(await readFile(path, "utf8"));
    expect(raw).toEqual({ version: 1, data: { a: 1 } });
  });

  it("round-trips through readPersisted", async () => {
    const path = join(dir, "x.json");
    await writePersisted(path, { a: 1 });
    expect(await readPersisted<{ a: number }>(path)).toEqual({ a: 1 });
  });

  it("does not collide temp filenames during concurrent writes", async () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    const path = join(dir, "x.json");

    await expect(
      Promise.all([
        writePersisted(path, { value: "a" }),
        writePersisted(path, { value: "b" }),
      ]),
    ).resolves.toHaveLength(2);

    const data = await readPersisted<{ value: string }>(path);
    expect(data?.value).toMatch(/^[ab]$/);
  });

  it("refuses files missing version", async () => {
    const path = join(dir, "x.json");
    await writeFile(path, JSON.stringify({ data: { a: 1 } }));
    await chmod(path, 0o600);
    await expect(readPersisted(path)).rejects.toBeInstanceOf(PersistenceError);
  });

  it("returns undefined when file does not exist", async () => {
    expect(await readPersisted(join(dir, "missing.json"))).toBeUndefined();
  });

  it("fails clearly when version is newer than supported", async () => {
    const path = join(dir, "x.json");
    await writeFile(path, JSON.stringify({ version: 999, data: {} }));
    await chmod(path, 0o600);
    await expect(readPersisted(path)).rejects.toThrow(/binary too old/);
  });
});
