import { spawnPty, type PtyHandle } from "../../pty/pty.js";
import {
  AgentSessionRegistry,
} from "../../domains/agent-sessions.js";
import type { Session } from "../../domains/types.js";
import { allUnknownCapabilities } from "../../domains/types.js";
import type { RealtimeBus } from "../../core/realtime/bus.js";
import { EVENT_TYPES, envelope } from "../../core/realtime/events.js";
import { AppError } from "../../core/errors.js";

interface PtyRuntime {
  session: Session;
  pty: PtyHandle;
  debugPort: number;
}

/**
 * Managed-PTY Antigravity sessions: spawn Antigravity inside a PTY so we get
 * both terminal output AND a CDP debug port. The CDP side is attached by the
 * existing AntigravityCdpAdapter; this module owns the PTY lifecycle.
 *
 * H15 / NFR-013A: every PTY child here is owned, so we WILL SIGTERM on
 * shutdown. Wrapper-registered sessions (separate adapter) are not owned.
 */
export class AntigravityPtyAdapter {
  readonly providerId = "antigravity" as const;
  private byId = new Map<string, PtyRuntime>();

  constructor(
    private opts: {
      sessions: AgentSessionRegistry;
      bus: RealtimeBus;
      command: string;
    },
  ) {}

  async launch(projectPath: string, debugPort: number): Promise<Session> {
    const handle = spawnPty({
      command: this.opts.command,
      args: [projectPath, `--remote-debugging-port=${debugPort}`],
      cwd: projectPath,
    });
    const session: Session = {
      sessionId: AgentSessionRegistry.newId(),
      providerId: this.providerId,
      source: "managed-pty",
      projectPath,
      status: "starting",
      lifecycle: "owned-launching",
      capabilities: allUnknownCapabilities(),
      owned: true,
      startedAt: Date.now(),
    };
    this.opts.sessions.set(session);
    const rt: PtyRuntime = { session, pty: handle, debugPort };
    this.byId.set(session.sessionId, rt);

    handle.onData((chunk) => {
      this.opts.bus.publish(
        envelope(EVENT_TYPES.TerminalOutput, { chunk }, {
          sessionId: session.sessionId,
        }),
      );
    });
    handle.onExit(({ exitCode, signal }) => {
      session.status = "stopped";
      session.lifecycle = "owned-stopped";
      this.opts.sessions.set(session);
      this.opts.bus.publish(
        envelope(
          EVENT_TYPES.SessionLifecycleChanged,
          { exitCode, signal },
          { sessionId: session.sessionId },
        ),
      );
    });

    return session;
  }

  sendInput(sessionId: string, input: string): void {
    const rt = this.byId.get(sessionId);
    if (!rt) {
      throw new AppError({
        code: "session_not_found",
        operation: "pty.sendInput",
        message: `No managed-PTY session ${sessionId}`,
        httpStatus: 404,
      });
    }
    rt.pty.write(input);
  }

  signal(sessionId: string, signal: NodeJS.Signals): void {
    const rt = this.byId.get(sessionId);
    if (!rt) {
      throw new AppError({
        code: "session_not_found",
        operation: "pty.signal",
        message: `No managed-PTY session ${sessionId}`,
        httpStatus: 404,
      });
    }
    if (signal === "SIGINT") {
      rt.pty.write("\x03");
      return;
    }
    rt.pty.kill(signal);
  }

  isAlive(sessionId: string): boolean {
    return this.byId.get(sessionId)?.pty.alive() ?? false;
  }

  async shutdown(): Promise<void> {
    for (const [, rt] of this.byId) {
      if (rt.session.owned && rt.pty.alive()) {
        rt.pty.kill("SIGTERM");
      }
    }
    this.byId.clear();
  }
}
