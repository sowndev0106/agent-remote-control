import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { configDir } from "../../cli/paths.js";

export function ipcSocketPath(): string {
  return join(configDir(), "ipc.sock");
}
export function ipcNonceFile(): string {
  return join(configDir(), "ipc.nonce");
}

/**
 * Ensure a server-issued nonce exists in the user-owned config directory.
 * Wrapper CLI reads this nonce out-of-band (same user, same machine) and
 * presents it on each IPC call. Without the nonce no wrapper can register a
 * session — defends the IPC surface even if a different local user could
 * connect to the socket.
 */
export async function ensureIpcNonce(): Promise<string> {
  const path = ipcNonceFile();
  try {
    const buf = await readFile(path, "utf8");
    if (buf.trim().length >= 32) return buf.trim();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const nonce = randomBytes(32).toString("base64url");
  await writeFile(path, nonce + "\n", { mode: 0o600 });
  await chmod(path, 0o600);
  return nonce;
}

export async function loadIpcNonce(): Promise<string | null> {
  try {
    const buf = await readFile(ipcNonceFile(), "utf8");
    return buf.trim() || null;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
