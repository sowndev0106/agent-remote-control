import {
  AgentSessionRegistry,
} from "../../domains/agent-sessions.js";
import type { Session } from "../../domains/types.js";
import { allUnknownCapabilities } from "../../domains/types.js";
import type { RealtimeBus } from "../../core/realtime/bus.js";
import { EVENT_TYPES, envelope } from "../../core/realtime/events.js";
import { AppError } from "../../core/errors.js";

interface WrapperRuntime {
  session: Session;
  pid?: number;
  debugPort: number;
  registeredAt: number;
}

/**
 * Wrapper adapter — Antigravity launched via `agent-remote-control agy
 * <project>` (alias: `antigravity`) in the user's existing terminal. We do NOT own the PTY; the
 * wrapper CLI tells us "here's a session with this PID and debug port" via
 * IPC. Session is `owned: false` so shutdown will NOT SIGTERM it
 * (NFR-013A / H15).
 */
export class AntigravityWrapperAdapter {
  readonly providerId = "antigravity" as const;
  private byPid = new Map<number, WrapperRuntime>();
  private byId = new Map<string, WrapperRuntime>();

  constructor(
    private opts: {
      sessions: AgentSessionRegistry;
      bus: RealtimeBus;
    },
  ) {}

  register(args: { pid?: number; debugPort: number; projectPath?: string }): Session {
    if (args.pid !== undefined && this.byPid.has(args.pid)) {
      // Dedupe by PID — same Antigravity discovered twice (CDP + wrapper).
      return this.byPid.get(args.pid)!.session;
    }
    const session: Session = {
      sessionId: AgentSessionRegistry.newId(),
      providerId: this.providerId,
      source: "wrapper",
      status: "running",
      lifecycle: "external-attached",
      capabilities: allUnknownCapabilities(),
      owned: false,
      startedAt: Date.now(),
    };
    if (args.projectPath !== undefined) session.projectPath = args.projectPath;
    this.opts.sessions.set(session);
    const rt: WrapperRuntime = {
      session,
      debugPort: args.debugPort,
      registeredAt: Date.now(),
    };
    if (args.pid !== undefined) rt.pid = args.pid;
    if (args.pid !== undefined) this.byPid.set(args.pid, rt);
    this.byId.set(session.sessionId, rt);
    this.opts.bus.publish(
      envelope(
        EVENT_TYPES.SessionLifecycleChanged,
        { lifecycle: session.lifecycle, source: "wrapper" },
        { sessionId: session.sessionId },
      ),
    );
    return session;
  }

  unregister(sessionId: string): void {
    const rt = this.byId.get(sessionId);
    if (!rt) {
      throw new AppError({
        code: "session_not_found",
        operation: "wrapper.unregister",
        message: `No wrapper session ${sessionId}`,
        httpStatus: 404,
      });
    }
    rt.session.status = "stopped";
    rt.session.lifecycle = "discovered";
    this.opts.sessions.set(rt.session);
    this.byId.delete(sessionId);
    if (rt.pid !== undefined) this.byPid.delete(rt.pid);
    this.opts.bus.publish(
      envelope(
        EVENT_TYPES.SessionLifecycleChanged,
        { lifecycle: "discovered", source: "wrapper" },
        { sessionId },
      ),
    );
  }

  /** Pid still alive? Used by sweep on server start (NFR-012). */
  static isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
