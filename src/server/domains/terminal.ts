import { randomBytes } from "node:crypto";
import { spawnPty, type PtyHandle } from "../pty/pty.js";
import { AppError } from "../core/errors.js";

export interface TerminalTabMeta {
  id: string;
  title: string;
  projectPath: string;
  cols: number;
  rows: number;
  createdAt: number;
  alive: boolean;
}

interface Tab {
  meta: TerminalTabMeta;
  pty: PtyHandle;
  /** RAM-only ring buffer of recent output (REQ-065 — never persisted). */
  ring: string[];
  ringBytes: number;
}

const RING_MAX_BYTES = 256 * 1024;

/**
 * PTY pool for browser terminal tabs. Generic project shells — they do NOT
 * auto-register provider sessions (sprint 06 scope note).
 */
export class TerminalService {
  private tabs = new Map<string, Tab>();

  constructor(
    private readonly cfg: {
      enabled: boolean;
      shell: string;
      maxTabs: number;
      scrollback: number;
    },
  ) {}

  get enabled(): boolean {
    return this.cfg.enabled;
  }

  private assertEnabled(): void {
    if (!this.cfg.enabled) {
      throw new AppError({
        code: "terminal_disabled",
        operation: "terminal",
        message: "Terminal is disabled in config (terminal.enabled = false).",
        httpStatus: 409,
      });
    }
  }

  list(): TerminalTabMeta[] {
    return Array.from(this.tabs.values()).map((t) => ({
      ...t.meta,
      alive: t.pty.alive(),
    }));
  }

  create(projectPath: string, opts?: { cols?: number; rows?: number }): TerminalTabMeta {
    this.assertEnabled();
    if (this.tabs.size >= this.cfg.maxTabs) {
      throw new AppError({
        code: "max_tabs_reached",
        operation: "terminal.create",
        message: `Terminal tab limit reached (${this.cfg.maxTabs}).`,
        recoveryAction: "Close an existing tab first.",
        httpStatus: 409,
      });
    }
    const shell = this.cfg.shell || process.env["SHELL"] || "/bin/bash";
    const id = randomBytes(8).toString("hex");
    const cols = opts?.cols ?? 80;
    const rows = opts?.rows ?? 24;
    const handle = spawnPty({ command: shell, cwd: projectPath, cols, rows });
    const tab: Tab = {
      meta: {
        id,
        title: shell.split("/").pop() ?? "shell",
        projectPath,
        cols,
        rows,
        createdAt: Date.now(),
        alive: true,
      },
      pty: handle,
      ring: [],
      ringBytes: 0,
    };
    handle.onData((chunk) => this.pushRing(tab, chunk));
    handle.onExit(() => {
      tab.meta.alive = false;
    });
    this.tabs.set(id, tab);
    return tab.meta;
  }

  private pushRing(tab: Tab, chunk: string): void {
    tab.ring.push(chunk);
    tab.ringBytes += Buffer.byteLength(chunk);
    while (tab.ringBytes > RING_MAX_BYTES && tab.ring.length > 1) {
      const dropped = tab.ring.shift()!;
      tab.ringBytes -= Buffer.byteLength(dropped);
    }
  }

  buffer(id: string): string {
    return this.tabs.get(id)?.ring.join("") ?? "";
  }

  get(id: string): Tab | undefined {
    return this.tabs.get(id);
  }

  write(id: string, data: string): void {
    const tab = this.requireTab(id);
    tab.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const tab = this.requireTab(id);
    tab.pty.resize(cols, rows);
    tab.meta.cols = cols;
    tab.meta.rows = rows;
  }

  /** Is a foreground job (not the shell itself) running? Best-effort via
   *  /proc/<pid>/stat tpgid vs pid. Returns false if it cannot tell. */
  hasForegroundJob(id: string): boolean {
    const tab = this.tabs.get(id);
    if (!tab || !tab.pty.alive()) return false;
    return ptyHasForegroundJob(tab.pty.pid);
  }

  close(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (tab.pty.alive()) tab.pty.kill("SIGHUP");
    this.tabs.delete(id);
  }

  onData(id: string, handler: (chunk: string) => void): () => void {
    const tab = this.requireTab(id);
    return tab.pty.onData(handler);
  }
  onExit(id: string, handler: (info: { exitCode: number }) => void): () => void {
    const tab = this.requireTab(id);
    return tab.pty.onExit(handler);
  }

  shutdown(): void {
    for (const [, tab] of this.tabs) {
      if (tab.pty.alive()) tab.pty.kill("SIGHUP");
    }
    this.tabs.clear();
  }

  private requireTab(id: string): Tab {
    const tab = this.tabs.get(id);
    if (!tab) {
      throw new AppError({
        code: "terminal_tab_not_found",
        operation: "terminal",
        message: `No terminal tab ${id}`,
        httpStatus: 404,
      });
    }
    return tab;
  }
}

/**
 * Read /proc/<pid>/stat field 8 (tpgid). If the controlling terminal's
 * foreground process group differs from the shell PID, a foreground job is
 * running (REQ-068). Linux-only; returns false elsewhere or on parse failure.
 */
export function ptyHasForegroundJob(shellPid: number): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");
    const stat = fs.readFileSync(`/proc/${shellPid}/stat`, "utf8");
    // Fields after "(comm)" are space-separated; tpgid is field 8 (1-based)
    // counting from pid. After the closing paren, index 5 is tpgid.
    const afterComm = stat.slice(stat.lastIndexOf(")") + 2);
    const fields = afterComm.split(" ");
    // fields[0]=state, [1]=ppid, [2]=pgrp, [3]=session, [4]=tty_nr, [5]=tpgid
    const tpgid = Number(fields[5]);
    if (!Number.isFinite(tpgid) || tpgid <= 0) return false;
    return tpgid !== shellPid;
  } catch {
    return false;
  }
}
