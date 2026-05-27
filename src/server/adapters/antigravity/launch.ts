import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fetchTargetsForPort } from "./discover.js";
import { AppError } from "../../core/errors.js";

export interface LaunchOptions {
  command: string;
  projectPath: string;
  debugPortRange: number[];
  timeoutMs: number;
}

export interface LaunchResult {
  pid: number;
  debugPort: number;
  process: ChildProcess;
}

/**
 * Find a free debug port from the configured range.
 */
async function findFreePort(range: number[]): Promise<number | null> {
  for (const port of range) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      srv.listen(port, "127.0.0.1");
    });
    if (free) return port;
  }
  return null;
}

/**
 * Launch Antigravity with a CDP debug port. Returns the spawned process so
 * the session registry can track ownership (NFR-013 / NFR-013A — never SIGTERM
 * unmanaged externals).
 */
export async function launchAntigravity(opts: LaunchOptions): Promise<LaunchResult> {
  const debugPort = await findFreePort(opts.debugPortRange);
  if (debugPort == null) {
    throw new AppError({
      code: "no_free_debug_port",
      operation: "launch antigravity",
      message: `No free port in range ${opts.debugPortRange.join(",")}.`,
      recoveryAction: "Stop other CDP sessions or widen providers.antigravity.debugPortRange.",
    });
  }

  const child = spawn(
    opts.command,
    [opts.projectPath, `--remote-debugging-port=${debugPort}`],
    {
      stdio: "ignore",
      detached: false,
    },
  );

  const started = await waitForCdpReady(debugPort, opts.timeoutMs);
  if (!started) {
    child.kill("SIGTERM");
    throw new AppError({
      code: "launch_timeout",
      operation: "launch antigravity",
      message: `Antigravity did not expose CDP on port ${debugPort} within ${opts.timeoutMs}ms.`,
      recoveryAction:
        "Verify the installed Antigravity build supports --remote-debugging-port.",
    });
  }

  return { pid: child.pid ?? -1, debugPort, process: child };
}

async function waitForCdpReady(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const targets = await fetchTargetsForPort(port);
    if (targets.length > 0) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
