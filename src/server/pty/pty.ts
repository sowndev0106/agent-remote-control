import * as pty from "node-pty";
import type { IPty } from "node-pty";

/**
 * Shared PTY helper used by:
 *  - Managed-PTY Antigravity adapter (sprint 05)
 *  - Browser terminal (sprint 06)
 *
 * Wraps node-pty.spawn with a minimal event surface and tracks exit so callers
 * can decide whether the process is still useful.
 */

export interface SpawnPtyOpts {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface PtyHandle {
  pid: number;
  alive(): boolean;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: NodeJS.Signals): void;
  onData(handler: (chunk: string) => void): () => void;
  onExit(handler: (info: { exitCode: number; signal?: number }) => void): () => void;
}

export function spawnPty(opts: SpawnPtyOpts): PtyHandle {
  const child: IPty = pty.spawn(opts.command, opts.args ?? [], {
    name: "xterm-256color",
    cols: opts.cols ?? 80,
    rows: opts.rows ?? 24,
    cwd: opts.cwd ?? process.cwd(),
    env: { ...(process.env as Record<string, string>), ...(opts.env ?? {}) },
  });

  let alive = true;
  const dataHandlers = new Set<(chunk: string) => void>();
  const exitHandlers = new Set<(info: { exitCode: number; signal?: number }) => void>();

  child.onData((chunk) => {
    for (const h of dataHandlers) {
      try {
        h(chunk);
      } catch {
        /* swallow */
      }
    }
  });
  child.onExit((info) => {
    alive = false;
    for (const h of exitHandlers) {
      try {
        const arg: { exitCode: number; signal?: number } = { exitCode: info.exitCode };
        if (info.signal !== undefined) arg.signal = info.signal;
        h(arg);
      } catch {
        /* swallow */
      }
    }
  });

  return {
    pid: child.pid,
    alive() {
      return alive;
    },
    write(data: string) {
      if (alive) child.write(data);
    },
    resize(cols: number, rows: number) {
      if (alive) child.resize(cols, rows);
    },
    kill(signal: NodeJS.Signals = "SIGTERM") {
      if (alive) child.kill(signal);
    },
    onData(handler) {
      dataHandlers.add(handler);
      return () => dataHandlers.delete(handler);
    },
    onExit(handler) {
      exitHandlers.add(handler);
      return () => exitHandlers.delete(handler);
    },
  };
}
