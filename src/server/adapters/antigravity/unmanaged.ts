import { readdir, readFile, readlink } from "node:fs/promises";
import { AgentSessionRegistry } from "../../domains/agent-sessions.js";
import {
  type Session,
  allUnsupportedCapabilities,
} from "../../domains/types.js";
import type { DiscoveredSession } from "../IProviderAdapter.js";

export interface UnmanagedDetectorDeps {
  sessions: AgentSessionRegistry;
  /** PIDs the app owns (managed-PTY launches, CDP launches). */
  ownedPids: () => Set<number>;
  /** PIDs registered via the wrapper IPC. */
  wrapperPids: () => Set<number>;
  /** PIDs that already expose CDP on a configured port. */
  cdpPids?: () => Set<number>;
  /** Process-name match — defaults to "antigravity" (the Electron binary). */
  processName?: string;
  /** Inject a fake /proc reader for tests. */
  procScan?: () => Promise<RawProcess[]>;
}

export interface RawProcess {
  pid: number;
  comm: string;
  cmdline: string;
  cwd?: string;
}

export interface UnmanagedSession extends DiscoveredSession {
  attachable: false;
  guidance: { message: string; recommendedCommand: string };
}

/**
 * Best-effort detector for Antigravity processes running outside the app's
 * control (no CDP, no wrapper, no managed PTY). Linux /proc only (Phase 1 is
 * Ubuntu). Never sends signals — read-only (NFR-013A / REQ-100, REQ-101).
 */
export class UnmanagedDetector {
  constructor(private deps: UnmanagedDetectorDeps) {}

  private get name(): string {
    return this.deps.processName ?? "antigravity";
  }

  async scan(): Promise<UnmanagedSession[]> {
    const procs = this.deps.procScan
      ? await this.deps.procScan()
      : await scanProc(this.name);

    const excluded = new Set<number>([
      ...this.deps.ownedPids(),
      ...this.deps.wrapperPids(),
      ...(this.deps.cdpPids ? this.deps.cdpPids() : []),
    ]);

    const out: UnmanagedSession[] = [];
    for (const p of procs) {
      if (excluded.has(p.pid)) continue;
      const matches =
        p.comm.includes(this.name) || p.cmdline.includes(this.name);
      if (!matches) continue;

      const sessionId = AgentSessionRegistry.newId();
      const session: Session = {
        sessionId,
        providerId: "antigravity",
        source: "unmanaged",
        status: "running",
        lifecycle: "external-unmanaged",
        capabilities: allUnsupportedCapabilities(),
        owned: false,
        note: "External Antigravity process — not controllable by the app.",
      };
      if (p.cwd !== undefined) session.projectPath = p.cwd;
      this.deps.sessions.set(session);

      const recommendedCommand = p.cwd
        ? `agent-remote-control agy ${p.cwd}`
        : `agent-remote-control agy <project>`;
      const entry: UnmanagedSession = {
        sessionId,
        providerId: "antigravity",
        source: "unmanaged",
        hint: `External pid ${p.pid}`,
        attachable: false,
        guidance: {
          message:
            "This Antigravity process is running outside the app and exposes " +
            "no control surface (no CDP debug port, not wrapper-launched). " +
            "The app cannot control it. Re-launch via the wrapper to gain control.",
          recommendedCommand,
        },
      };
      if (p.cwd !== undefined) entry.projectPath = p.cwd;
      out.push(entry);
    }
    return out;
  }
}

/** Read /proc for processes whose comm/cmdline contains `needle`. */
export async function scanProc(needle: string): Promise<RawProcess[]> {
  const out: RawProcess[] = [];
  let pids: string[];
  try {
    pids = await readdir("/proc");
  } catch {
    return out; // not Linux / no /proc
  }
  await Promise.all(
    pids.map(async (entry) => {
      if (!/^\d+$/.test(entry)) return;
      const pid = Number(entry);
      try {
        const comm = (await readFile(`/proc/${entry}/comm`, "utf8")).trim();
        const cmdlineRaw = await readFile(`/proc/${entry}/cmdline`, "utf8");
        const cmdline = cmdlineRaw.replace(/\0/g, " ").trim();
        if (!comm.includes(needle) && !cmdline.includes(needle)) return;
        let cwd: string | undefined;
        try {
          cwd = await readlink(`/proc/${entry}/cwd`);
        } catch {
          /* not readable — other user's process */
        }
        const rp: RawProcess = { pid, comm, cmdline };
        if (cwd !== undefined) rp.cwd = cwd;
        out.push(rp);
      } catch {
        /* process vanished or unreadable */
      }
    }),
  );
  return out;
}
