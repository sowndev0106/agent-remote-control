import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditPermissions } from "../src/server/core/perms-audit.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-perms-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("auditPermissions", () => {
  it("fixes a 0644 file back to 0600 and a 0755 dir to 0700", async () => {
    const cfgDir = join(dir, "cfg");
    await mkdir(cfgDir, { mode: 0o755 });
    await chmod(cfgDir, 0o755);
    const file = join(cfgDir, "config.json");
    await writeFile(file, "{}", { mode: 0o644 });
    await chmod(file, 0o644);

    const { fixed } = await auditPermissions({ dir: cfgDir, files: [file] });
    expect(fixed).toContain(cfgDir);
    expect(fixed).toContain(file);
    expect((await stat(cfgDir)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("is a no-op when permissions are already correct", async () => {
    const cfgDir = join(dir, "cfg");
    await mkdir(cfgDir, { mode: 0o700 });
    await chmod(cfgDir, 0o700);
    const { fixed } = await auditPermissions({ dir: cfgDir, files: [] });
    expect(fixed).toEqual([]);
  });

  it("ignores missing files without throwing", async () => {
    await expect(
      auditPermissions({ dir: join(dir, "nope"), files: [join(dir, "ghost")] }),
    ).resolves.toEqual({ fixed: [] });
  });
});
