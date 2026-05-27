import { execFile } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a binary with argv (never a shell string — avoids injection). Used by
 * the tmux/screen adapters. The caller passes args as a real array so
 * shell-special characters in prompt text cannot break out (see tmux send-keys
 * -l literal mode in the adapter).
 */
export function run(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { timeout: opts.timeoutMs ?? 5000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: number }).code === "number"
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({
          code,
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? "",
        });
      },
    );
  });
}

/** True if the binary is on PATH (resolves via `command -v`). */
export async function hasBinary(bin: string): Promise<boolean> {
  const r = await run("command", ["-v", bin]).catch(() => null);
  if (r && r.code === 0 && r.stdout.trim().length > 0) return true;
  // `command` is a shell builtin; fall back to `which`.
  const w = await run("which", [bin]).catch(() => null);
  return Boolean(w && w.code === 0 && w.stdout.trim().length > 0);
}
