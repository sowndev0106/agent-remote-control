import { homedir } from "node:os";
import { join } from "node:path";
import { AppError } from "../../core/errors.js";
import { EVENT_TYPES, envelope } from "../../core/realtime/events.js";
import type { RealtimeBus } from "../../core/realtime/bus.js";
import { AgentSessionRegistry } from "../../domains/agent-sessions.js";
import { allUnsupportedCapabilities, type CapabilityMap, type Session } from "../../domains/types.js";
import type {
  ActionDescriptor,
  ConversationDescriptor,
  DiscoveredSession,
  SnapshotPayload,
} from "../IProviderAdapter.js";
import { getAgyActions, inputForAgyAction } from "./actions.js";
import { listAgyConversations } from "./conversations.js";
import { AgySnapshotBuffer } from "./snapshot.js";

interface Runtime {
  session: Session;
  pid?: number;
  snapshot: AgySnapshotBuffer;
  pendingInput: string[];
  lastSnapshotHash?: string;
}

function expandHome(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

export function agyWrapperCapabilities(): CapabilityMap {
  const c = allUnsupportedCapabilities();
  for (const k of [
    "attach",
    "sendPrompt",
    "sendInput",
    "listConversations",
    "getSnapshot",
    "getStatus",
    "getActions",
    "performAction",
    "dispose",
  ] as const) {
    c[k] = "supported";
  }
  // launch, stop, selectConversation stay unsupported: the user owns the process.
  return c;
}

/**
 * agy-wrapper surface: agy is launched by the user via `agent-remote-control agy
 * <project>` in their own terminal. The wrapper CLI owns the real PTY and feeds
 * us over IPC — output via receiveOutput, input drained via pollInput. We never
 * own the process (owned:false, H15): stop is unsupported.
 */
export class AgyWrapperAdapter {
  readonly providerId = "agy" as const;
  private byPid = new Map<number, Runtime>();
  private byId = new Map<string, Runtime>();

  constructor(
    private opts: {
      sessions: AgentSessionRegistry;
      bus: RealtimeBus;
      scrollback: number;
      conversationsDir: string;
    },
  ) {}

  register(args: { pid?: number; projectPath?: string }): Session {
    if (args.pid !== undefined && this.byPid.has(args.pid)) {
      return this.byPid.get(args.pid)!.session;
    }
    const session: Session = {
      sessionId: AgentSessionRegistry.newId(),
      providerId: "agy",
      source: "agy-wrapper",
      status: "running",
      lifecycle: "external-attached",
      capabilities: agyWrapperCapabilities(),
      owned: false,
      startedAt: Date.now(),
    };
    if (args.projectPath !== undefined) session.projectPath = args.projectPath;
    this.opts.sessions.set(session);
    const rt: Runtime = {
      session,
      snapshot: new AgySnapshotBuffer({ cols: 100, rows: 30, scrollback: this.opts.scrollback }),
      pendingInput: [],
    };
    if (args.pid !== undefined) {
      rt.pid = args.pid;
      this.byPid.set(args.pid, rt);
    }
    this.byId.set(session.sessionId, rt);
    this.opts.bus.publish(
      envelope(
        EVENT_TYPES.SessionLifecycleChanged,
        { lifecycle: session.lifecycle, source: "agy-wrapper" },
        { sessionId: session.sessionId },
      ),
    );
    return session;
  }

  receiveOutput(sessionId: string, chunk: string): void {
    const rt = this.byId.get(sessionId);
    if (!rt) return;
    rt.snapshot.write(chunk);
    this.opts.bus.publish(envelope(EVENT_TYPES.TerminalOutput, { chunk }, { sessionId }));
    const snap = rt.snapshot.snapshot();
    if (snap.hash !== rt.lastSnapshotHash) {
      rt.lastSnapshotHash = snap.hash;
      this.opts.bus.publish(envelope(EVENT_TYPES.ProviderSnapshotChanged, snap, { sessionId }));
    }
  }

  /** Surface currently-registered wrapper sessions to the discovery aggregator. */
  async listDiscoveredSessions(_projectPath?: string): Promise<DiscoveredSession[]> {
    const out: DiscoveredSession[] = [];
    for (const rt of this.byId.values()) {
      if (rt.session.status !== "running") continue;
      const hint =
        `agy ${rt.pid ? `pid ${rt.pid} ` : ""}${rt.session.projectPath ?? ""}`.trim();
      const d: DiscoveredSession = {
        sessionId: rt.session.sessionId,
        providerId: "agy",
        source: "agy-wrapper",
        hint,
        active: true,
      };
      if (rt.session.projectPath !== undefined) d.projectPath = rt.session.projectPath;
      out.push(d);
    }
    return out;
  }

  pollInput(sessionId: string): string[] {
    const rt = this.byId.get(sessionId);
    if (!rt) return [];
    const out = rt.pendingInput;
    rt.pendingInput = [];
    return out;
  }

  async attach(session: Session): Promise<Session> {
    const rt = this.requireRuntime(session, "agy.attach");
    rt.session.status = "running";
    this.opts.sessions.set(rt.session);
    return rt.session;
  }

  async stop(_session: Session): Promise<void> {
    throw new AppError({
      code: "capability_unsupported",
      operation: "agy.stop",
      message: "agy-wrapper sessions are user-owned; stop them in your terminal.",
      httpStatus: 409,
    });
  }

  async dispose(session: Session): Promise<void> {
    const rt = this.byId.get(session.sessionId);
    if (!rt) return;
    rt.session.status = "stopped";
    rt.session.lifecycle = "discovered";
    this.opts.sessions.set(rt.session);
    this.byId.delete(session.sessionId);
    if (rt.pid !== undefined) this.byPid.delete(rt.pid);
  }

  async sendPrompt(session: Session, text: string): Promise<void> {
    await this.sendInput(session, `${text}\r`);
  }

  async sendInput(session: Session, input: string): Promise<void> {
    const rt = this.requireRuntime(session, "agy.sendInput");
    rt.pendingInput.push(input);
  }

  async listConversations(_session: Session): Promise<ConversationDescriptor[]> {
    if (!this.opts.conversationsDir) return [];
    return listAgyConversations(expandHome(this.opts.conversationsDir));
  }

  async selectConversation(_session: Session, _id: string): Promise<void> {
    throw new AppError({
      code: "capability_unsupported",
      operation: "agy.selectConversation",
      message: "Resume a wrapper session with `agy --conversation=<id>` in your terminal.",
      httpStatus: 409,
    });
  }

  async getSnapshot(session: Session): Promise<SnapshotPayload> {
    return this.requireRuntime(session, "agy.getSnapshot").snapshot.snapshot();
  }

  async getStatus(session: Session): Promise<Session["status"]> {
    return this.byId.get(session.sessionId)?.session.status ?? "stopped";
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

  unregister(sessionId: string): void {
    const rt = this.byId.get(sessionId);
    if (!rt) return;
    rt.session.status = "stopped";
    rt.session.lifecycle = "discovered";
    this.opts.sessions.set(rt.session);
    this.byId.delete(sessionId);
    if (rt.pid !== undefined) this.byPid.delete(rt.pid);
    this.opts.bus.publish(
      envelope(
        EVENT_TYPES.SessionLifecycleChanged,
        { lifecycle: "discovered", source: "agy-wrapper" },
        { sessionId },
      ),
    );
  }

  async shutdown(): Promise<void> {
    this.byId.clear();
    this.byPid.clear();
  }

  private requireRuntime(session: Session, operation: string): Runtime {
    const rt = this.byId.get(session.sessionId);
    if (!rt) {
      throw new AppError({
        code: "session_not_attached",
        operation,
        message: `No agy-wrapper runtime for ${session.sessionId}.`,
        httpStatus: 409,
      });
    }
    return rt;
  }
}
