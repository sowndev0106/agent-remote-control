import { mkdir, rename, readFile, chmod, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";

export const CURRENT_VERSION = 1;

export class PersistenceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

interface Envelope<T> {
  version: number;
  data: T;
}

export async function writePersisted<T>(path: string, data: T): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => {
    /* dir might be ~/.config which is not ours to lock down */
  });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const envelope: Envelope<T> = { version: CURRENT_VERSION, data };
  await writeFile(tmp, JSON.stringify(envelope, null, 2), { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
  await chmod(path, 0o600);
}

export async function readPersisted<T>(path: string): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PersistenceError(`Invalid JSON at ${path}`, "invalid_json");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Envelope<T>).version !== "number"
  ) {
    throw new PersistenceError(
      `File ${path} is missing "version" — refusing to load`,
      "missing_version",
    );
  }
  const env = parsed as Envelope<T>;
  if (env.version > CURRENT_VERSION) {
    throw new PersistenceError(
      `binary too old: file ${path} version ${env.version} > ${CURRENT_VERSION}`,
      "version_too_new",
    );
  }
  return env.data;
}

export async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const release = await lockfile.lock(path, {
    retries: { retries: 5, maxTimeout: 200 },
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}
