import { resolve } from "node:path";
import { spawnPty, type PtyHandle, type SpawnPtyOpts } from "../server/pty/pty.js";
import { ipcCall as realIpcCall } from "../server/ipc/client.js";
import { loadIpcNonce, ipcSocketPath } from "../server/ipc/nonce.js";
import { loadConfig } from "../server/core/config.js";
import { configFile } from "./paths.js";

interface WritableLike {
  write(s: string): boolean;
}

interface StdinLike {
  setRawMode?(mode: boolean): void;
  resume(): void;
  pause(): void;
  on(ev: "data", cb: (d: Buffer) => void): void;
}

export interface AgyWrapperDeps {
  nonce: string;
  sockPath: string;
  spawn: (opts: SpawnPtyOpts) => PtyHandle;
  ipcCall: typeof realIpcCall;
  stdout: WritableLike;
  stdin: StdinLike;
  pollMs: number;
}

export interface AgyWrapperHandle {
  shutdown: () => Promise<void>;
}

/**
 * `agent-remote-control agy <project>` — runs agy in a PTY in the user's
 * terminal, mirrors output to both the terminal and the server (IPC), and
 * polls the server for UI-queued input. No CDP. Session is owned:false.
 */
export async function runAgyWrapper(args: {
  project: string;
  command?: string;
  deps: AgyWrapperDeps;
}): Promise<AgyWrapperHandle> {
  const { deps } = args;
  const projectPath = resolve(args.project);
  const command = args.command ?? "agy";

  const handle = deps.spawn({
    command,
    args: ["--add-dir", projectPath],
    cwd: projectPath,
  });

  const { sessionId } = await deps.ipcCall<{ sessionId: string }>(
    deps.sockPath,
    deps.nonce,
    "agy-register",
    { pid: handle.pid, projectPath },
  );

  handle.onData((chunk) => {
    deps.stdout.write(chunk);
    void deps.ipcCall(deps.sockPath, deps.nonce, "agy-output", {
      sessionId,
      chunk,
    }).catch(() => {});
  });

  deps.stdin.setRawMode?.(true);
  deps.stdin.resume();
  deps.stdin.on("data", (d) => handle.write(d.toString("utf8")));

  const timer = setInterval(() => {
    void deps
      .ipcCall<{ input: string[] }>(deps.sockPath, deps.nonce, "agy-poll-input", {
        sessionId,
      })
      .then((r) => {
        for (const i of r.input) handle.write(i);
      })
      .catch(() => {});
  }, deps.pollMs);

  let stopped = false;
  const shutdown = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    deps.stdin.setRawMode?.(false);
    deps.stdin.pause();
    await deps.ipcCall(deps.sockPath, deps.nonce, "agy-unregister", { sessionId }).catch(() => {});
  };

  handle.onExit(() => {
    void shutdown();
  });
  return { shutdown };
}

/** Production CLI entry: builds real deps. The PTY's stdio keeps the process alive. */
export async function runAgyWrapperCli(project: string): Promise<void> {
  const nonce = await loadIpcNonce();
  if (!nonce) {
    process.stderr.write(
      "error: IPC nonce not found. Run `agent-remote-control install` and start the service first.\n",
    );
    process.exit(2);
    return;
  }
  const config = await loadConfig(configFile());
  await runAgyWrapper({
    project,
    command: config.providers.agy.command,
    deps: {
      nonce,
      sockPath: ipcSocketPath(),
      spawn: spawnPty,
      ipcCall: realIpcCall,
      stdout: process.stdout,
      stdin: process.stdin,
      pollMs: 150,
    },
  });
}
