import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureSecretKey(path: string): Promise<Buffer> {
  try {
    const buf = await readFile(path);
    if (buf.length === 32) return buf;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700).catch(() => {
    /* dir may not be ours to lock down */
  });
  const buf = randomBytes(32);
  await writeFile(path, buf, { mode: 0o600 });
  await chmod(path, 0o600);
  return buf;
}
