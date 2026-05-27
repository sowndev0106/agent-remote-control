import { chmod, stat } from "node:fs/promises";
import type { Logger } from "pino";

/**
 * Startup permission audit (S08-T07 / REQ-090A / H13). Ensures the config
 * directory is 0700 and each persisted file is 0600. Fixes drift in place;
 * warns rather than crashing so a permission quirk never blocks startup.
 */
export async function auditPermissions(
  paths: { dir: string; files: string[] },
  log?: Pick<Logger, "warn">,
): Promise<{ fixed: string[] }> {
  const fixed: string[] = [];
  await enforce(paths.dir, 0o700, fixed, log);
  for (const f of paths.files) {
    await enforce(f, 0o600, fixed, log);
  }
  return { fixed };
}

async function enforce(
  path: string,
  mode: number,
  fixed: string[],
  log?: Pick<Logger, "warn">,
): Promise<void> {
  let current: number;
  try {
    current = (await stat(path)).mode & 0o777;
  } catch {
    return; // file/dir does not exist yet — nothing to enforce
  }
  if (current === mode) return;
  try {
    await chmod(path, mode);
    fixed.push(path);
    log?.warn(
      { path, was: current.toString(8), now: mode.toString(8) },
      "fixed file permissions",
    );
  } catch (err) {
    log?.warn({ path, err }, "could not fix file permissions");
  }
}
