import { homedir } from "node:os";
import { join } from "node:path";
import { AppError } from "../../core/errors.js";
import { EVENT_TYPES, envelope } from "../../core/realtime/events.js";
import type { RealtimeBus } from "../../core/realtime/bus.js";
import { AgentSessionRegistry } from "../../domains/agent-sessions.js";
import type { Session } from "../../domains/types.js";
import { spawnPty, type PtyHandle, type SpawnPtyOpts } from "../../pty/pty.js";
import type {
  ActionDescriptor,
  ConversationDescriptor,
  DetectResult,
  DiscoveredSession,
  IProviderAdapter,
  SnapshotPayload,
} from "../IProviderAdapter.js";
import { detectAgy, agySupportedCapabilities } from "./detect.js";
import { getAgyActions, inputForAgyAction } from "./actions.js";
import { listAgyConversations } from "./conversations.js";
import { AgySnapshotBuffer } from "./snapshot.js";

const COLS = 100;
const ROWS = 30;

interface Runtime {
  session: Session;
  pty: PtyHandle;
  snapshot: AgySnapshotBuffer;
  detachPty: () => void;
  lastSnapshotHash?: string;
}

function expandHome(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

/**
 * Independent agy provider over a server-owned PTY. Spawns the `agy` Go CLI
 * with cwd = project and `--add-dir <project>`; renders output through
 * @xterm/headless; resumes by relaunching with `--conversation <id>`. No CDP,
 * no `--remote-debugging-port`. H15: children here are owned and SIGTERMed on
 * shutdown.
 */
export class AgyPtyAdapter implements IProviderAdapter {
  readonly providerId = "agy" as const;
  private byId = new Map<string, Runtime>();

  constructor(
    private opts: {
      sessions: AgentSessionRegistry;
      bus: RealtimeBus;
      command: string;
      scrollback: number;
      conversationsDir: string;
      spawn?: (opts: SpawnPtyOpts) => PtyHandle;
    },
  ) {}

  async detect(): Promise<DetectResult> {
    const r = await detectAgy({ command: this.opts.command });
    const out: DetectResult = { available: r.available, capabilities: r.capabilities };
    if (r.note !== undefined) out.note = r.note;
    return out;
  }

  async listDiscoveredSessions(_projectPath?: string): Promise<DiscoveredSession[]> {
    // agy-pty owns only the sessions it launches; discovery of external agy
    // processes is the future agy-unmanaged surface.
    return [];
  }

  async start(projectPath: string): Promise<Session> {
    const handle = this.spawnAgy(projectPath);
    const session: Session = {
      sessionId: AgentSessionRegistry.newId(),
      providerId: "agy",
      source: "agy-pty",
      projectPath,
      status: "running",
      lifecycle: "owned-running",
      capabilities: agySupportedCapabilities(),
      owned: true,
      startedAt: Date.now(),
    };
    this.opts.sessions.set(session);
    const rt: Runtime = {
      session,
      pty: handle,
      snapshot: new AgySnapshotBuffer({ cols: COLS, rows: ROWS, scrollback: this.opts.scrollback }),
      detachPty: () => {},
    };
    this.byId.set(session.sessionId, rt);
    this.wirePty(rt);
    this.opts.bus.publish(
      envelope(
        EVENT_TYPES.ProviderStatusChanged,
        { status: session.status, lifecycle: session.lifecycle },
        { sessionId: session.sessionId },
      ),
    );
    return session;
  }

  async attach(session: Session): Promise<Session> {
    const rt = this.requireRuntime(session, "agy.attach");
    rt.session.status = "running";
    this.opts.sessions.set(rt.session);
    return rt.session;
  }

  async stop(session: Session): Promise<void> {
    const rt = this.requireRuntime(session, "agy.stop");
    if (rt.pty.alive()) rt.pty.kill("SIGTERM");
  }

  async dispose(session: Session): Promise<void> {
    const rt = this.byId.get(session.sessionId);
    if (!rt) return;
    rt.detachPty();
    if (rt.session.owned && rt.pty.alive()) rt.pty.kill("SIGTERM");
    this.byId.delete(session.sessionId);
  }

  async sendPrompt(session: Session, text: string): Promise<void> {
    await this.sendInput(session, `${text}\r`);
  }

  async sendInput(session: Session, input: string): Promise<void> {
    const rt = this.requireRuntime(session, "agy.sendInput");
    if (rt.session.status !== "running") {
      throw new AppError({
        code: "agy_action_disabled",
        operation: "agy.sendInput",
        message: "agy session is not running.",
        httpStatus: 409,
      });
    }
    rt.pty.write(input);
  }

  async listConversations(_session: Session): Promise<ConversationDescriptor[]> {
    if (!this.opts.conversationsDir) return [];
    return listAgyConversations(expandHome(this.opts.conversationsDir));
  }

  async selectConversation(session: Session, conversationId: string): Promise<void> {
    const rt = this.requireRuntime(session, "agy.selectConversation");
    const cwd = rt.session.projectPath ?? process.cwd();
    rt.detachPty();
    if (rt.pty.alive()) rt.pty.kill("SIGTERM");
    rt.pty = this.spawnAgy(cwd, conversationId);
    rt.snapshot = new AgySnapshotBuffer({ cols: COLS, rows: ROWS, scrollback: this.opts.scrollback });
    delete rt.lastSnapshotHash;
    rt.session.status = "running";
    rt.session.lifecycle = "owned-running";
    this.opts.sessions.set(rt.session);
    this.wirePty(rt);
    this.opts.bus.publish(
      envelope(
        EVENT_TYPES.SessionLifecycleChanged,
        { lifecycle: rt.session.lifecycle, conversationId },
        { sessionId: rt.session.sessionId },
      ),
    );
  }

  async getSnapshot(session: Session): Promise<SnapshotPayload> {
    return this.requireRuntime(session, "agy.getSnapshot").snapshot.snapshot();
  }

  async getStatus(session: Session): Promise<Session["status"]> {
    return this.byId.get(session.sessionId)?.session.status ?? "unknown";
  }

  async getActions(session: Session): Promise<ActionDescriptor[]> {
    const rt = this.requireRuntime(session, "agy.getActions");
    return getAgyActions({
      running: rt.session.status === "running",
      text: rt.snapshot.snapshot().text ?? "",
    });
  }

  async performAction(session: Session, actionId: string): Promise<void> {
    const input = inputForAgyAction(actionId);
    if (input === undefined) {
      throw new AppError({
        code: "agy_action_unknown",
        operation: "agy.performAction",
        message: `Unknown agy action ${actionId}.`,
        httpStatus: 404,
      });
    }
    await this.sendInput(session, input);
  }

  async shutdown(): Promise<void> {
    for (const rt of this.byId.values()) {
      rt.detachPty();
      if (rt.session.owned && rt.pty.alive()) rt.pty.kill("SIGTERM");
    }
    this.byId.clear();
  }

  private spawnAgy(projectPath: string, conversationId?: string): PtyHandle {
    const args = ["--add-dir", projectPath];
    if (conversationId) args.push("--conversation", conversationId);
    try {
      return (this.opts.spawn ?? spawnPty)({
        command: this.opts.command,
        args,
        cwd: projectPath,
        cols: COLS,
        rows: ROWS,
      });
    } catch (err) {
      throw new AppError({
        code: "agy_pty_spawn_failed",
        operation: "agy.start",
        message: `Failed to spawn agy: ${(err as Error).message}`,
      });
    }
  }

  private wirePty(rt: Runtime): void {
    const offData = rt.pty.onData((chunk) => {
      rt.snapshot.write(chunk);
      this.opts.bus.publish(
        envelope(EVENT_TYPES.TerminalOutput, { chunk }, { sessionId: rt.session.sessionId }),
      );
      this.maybeBroadcastSnapshot(rt);
      this.broadcastActions(rt);
    });
    const offExit = rt.pty.onExit(({ exitCode, signal }) => {
      rt.session.status = "stopped";
      rt.session.lifecycle = "owned-stopped";
      this.opts.sessions.set(rt.session);
      this.opts.bus.publish(
        envelope(
          EVENT_TYPES.SessionLifecycleChanged,
          { exitCode, signal, lifecycle: rt.session.lifecycle },
          { sessionId: rt.session.sessionId },
        ),
      );
    });
    rt.detachPty = () => {
      offData();
      offExit();
    };
  }

  private maybeBroadcastSnapshot(rt: Runtime): void {
    const snap = rt.snapshot.snapshot();
    if (snap.hash === rt.lastSnapshotHash) return;
    rt.lastSnapshotHash = snap.hash;
    this.opts.bus.publish(
      envelope(EVENT_TYPES.ProviderSnapshotChanged, snap, { sessionId: rt.session.sessionId }),
    );
  }

  private broadcastActions(rt: Runtime): void {
    this.opts.bus.publish(
      envelope(
        EVENT_TYPES.ProviderActionsChanged,
        {
          actions: getAgyActions({
            running: rt.session.status === "running",
            text: rt.snapshot.snapshot().text ?? "",
          }),
        },
        { sessionId: rt.session.sessionId },
      ),
    );
  }

  private requireRuntime(session: Session, operation: string): Runtime {
    const rt = this.byId.get(session.sessionId);
    if (!rt) {
      throw new AppError({
        code: "session_not_attached",
        operation,
        message: `No agy runtime for session ${session.sessionId}.`,
        httpStatus: 409,
      });
    }
    return rt;
  }
}
