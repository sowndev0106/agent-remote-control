import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadIpcNonce, ipcSocketPath } from "../server/ipc/nonce.js";
import { ipcCall } from "../server/ipc/client.js";
import { loadConfig } from "../server/core/config.js";
import { configFile } from "./paths.js";

export interface WrapperOpts {
  project: string;
}

/**
 * `agent-remote-control agy <project>` — wrapper command (alias: `antigravity`).
 *
 * Flow:
 *   1. Read IPC nonce + socket from the user-owned config dir.
 *   2. Ask the server to reserve a free debug port.
 *   3. spawn `agy <project> --remote-debugging-port=<port>` in the
 *      user's current terminal (inherit stdio — NOT a server-side PTY).
 *   4. After the process has launched, register the session by PID + port
 *      via IPC. The server tracks it as `owned: false` so it survives
 *      wrapper Ctrl+C and is never SIGTERMed at shutdown (NFR-013A).
 */
export async function runAntigravityWrapper(opts: WrapperOpts): Promise<void> {
  const projectPath = resolve(opts.project);
  const nonce = await loadIpcNonce();
  if (!nonce) {
    process.stderr.write(
      "error: IPC nonce not found.\n" +
        "Run `agent-remote-control install` and start the service first.\n",
    );
    process.exit(2);
  }
  const sockPath = ipcSocketPath();
  const { port: debugPort } = await ipcCall<{ port: number }>(
    sockPath,
    nonce,
    "reserve-port",
  );

  const config = await loadConfig(configFile());
  const command = config.providers.antigravity.command;
  const child = spawn(
    command,
    [projectPath, `--remote-debugging-port=${debugPort}`],
    {
      stdio: "inherit",
      detached: false,
    },
  );

  const pid = child.pid;
  if (pid) {
    // Register asynchronously so the user sees Antigravity start immediately.
    void ipcCall(sockPath, nonce, "register-session", {
      pid,
      debugPort,
      projectPath,
    }).catch((err) => {
      process.stderr.write(
        `warn: session registration failed: ${(err as Error).message}\n`,
      );
    });
  }

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
  child.on("error", (err) => {
    process.stderr.write(`error: failed to spawn ${command}: ${err.message}\n`);
    process.exit(1);
  });
}
