import type { ChildProcess } from "node:child_process";
import {
  allUnknownCapabilities,
  type CapabilityKey,
  type CapabilityMap,
  type ProviderId,
  type Session,
  type SessionStatus,
} from "../../domains/types.js";
import { AgentSessionRegistry } from "../../domains/agent-sessions.js";
import { AppError } from "../../core/errors.js";
import type {
  ActionDescriptor,
  ConversationDescriptor,
  DetectResult,
  DiscoveredSession,
  IProviderAdapter,
  PromptContext,
  SnapshotPayload,
} from "../IProviderAdapter.js";
import { connectCDP, type CDPClient } from "./cdp.js";
import {
  discoverCDP,
  fetchTargetsForPort,
  isWorkbenchTarget,
} from "./discover.js";
import { captureSnapshot } from "./snapshot.js";
import { ActionRegistry, extractActions } from "./targeting.js";
import { launchAntigravity, type LaunchResult } from "./launch.js";
import { RealtimeBus } from "../../core/realtime/bus.js";
import { EVENT_TYPES, envelope } from "../../core/realtime/events.js";

interface SessionRuntime {
  session: Session;
  cdp?: CDPClient;
  child?: ChildProcess;
  debugPort: number;
  actions: ActionRegistry;
  lastSnapshotHash?: string;
  pollTimer?: NodeJS.Timeout;
}

/**
 * CDP adapter for Antigravity. One adapter instance per server. Per-CDP-target
 * runtimes live in `byId`; each has its own pendingCalls map (via the CDP
 * client) and its own snapshot poll.
 */
export class AntigravityCdpAdapter implements IProviderAdapter {
  readonly providerId: ProviderId = "antigravity";

  private byId = new Map<string, SessionRuntime>();

  constructor(
    private opts: {
      sessions: AgentSessionRegistry;
      bus: RealtimeBus;
      command: string;
      debugPortRange: number[];
      launchTimeoutMs: number;
      snapshotPollMs: number;
      /** Connect override for tests. */
      connect?: (url: string) => Promise<CDPClient>;
    },
  ) {}

  /* ------------------------------------------------------------------ detect */

  async detect(): Promise<DetectResult> {
    const found = await discoverCDP(this.opts.debugPortRange);
    const reachable = found.some((r) => r.targets.length > 0);
    return {
      available: reachable,
      capabilities: reachable ? this.probedCapabilities() : allUnknownCapabilities(),
      note: reachable
        ? "Antigravity CDP target reachable."
        : "No Antigravity CDP target found on configured debug ports.",
    };
  }

  private probedCapabilities(): CapabilityMap {
    // After connecting we know these surfaces work in principle. Per-call
    // failures still update the per-session capability map.
    const c = allUnknownCapabilities();
    const supported: CapabilityKey[] = [
      "launch",
      "attach",
      "stop",
      "sendPrompt",
      "getSnapshot",
      "getActions",
      "performAction",
      "dispose",
    ];
    const unknown: CapabilityKey[] = ["listConversations", "selectConversation", "sendInput"];
    for (const k of supported) c[k] = "supported";
    for (const k of unknown) c[k] = "unknown";
    return c;
  }

  /* ----------------------------------------------------- listDiscoveredSessions */

  async listDiscoveredSessions(projectPath: string): Promise<DiscoveredSession[]> {
    const results = await discoverCDP(this.opts.debugPortRange);
    const out: DiscoveredSession[] = [];
    for (const r of results) {
      const wb = r.workbench;
      if (!wb) continue;
      // Treat each CDP target as a discovered session keyed by target id.
      const existing = this.findRuntimeByTargetId(wb.id);
      const sessionId = existing?.session.sessionId ?? AgentSessionRegistry.newId();
      const session: Session = {
        sessionId,
        providerId: this.providerId,
        source: "cdp",
        projectPath,
        status: existing?.session.status ?? "discovered" as SessionStatus,
        lifecycle: existing ? existing.session.lifecycle : "discovered",
        capabilities: this.probedCapabilities(),
        owned: existing?.session.owned ?? false,
      };
      out.push({
        sessionId,
        providerId: this.providerId,
        source: "cdp",
        projectPath,
        hint: `${wb.title} (port ${r.port})`,
        active: Boolean(existing?.cdp?.isOpen()),
      });
      // Persist a discovered session record (REQ-026B server-issued IDs).
      this.opts.sessions.set(session);
      void existing;
    }
    return out;
  }

  /* --------------------------------------------------------------------- start */

  async start(projectPath: string): Promise<Session> {
    const launch: LaunchResult = await launchAntigravity({
      command: this.opts.command,
      projectPath,
      debugPortRange: this.opts.debugPortRange,
      timeoutMs: this.opts.launchTimeoutMs,
    });
    const targets = await fetchTargetsForPort(launch.debugPort);
    const wb = targets.find(isWorkbenchTarget) ?? targets[0];
    if (!wb) {
      launch.process.kill("SIGTERM");
      throw new AppError({
        code: "cdp_target_not_found",
        operation: "antigravity.start",
        message: "Antigravity launched but no CDP target found.",
      });
    }
    const session: Session = {
      sessionId: AgentSessionRegistry.newId(),
      providerId: this.providerId,
      source: "cdp",
      projectPath,
      status: "starting",
      lifecycle: "owned-launching",
      capabilities: this.probedCapabilities(),
      owned: true,
      startedAt: Date.now(),
    };
    this.opts.sessions.set(session);
    const rt: SessionRuntime = {
      session,
      child: launch.process,
      debugPort: launch.debugPort,
      actions: new ActionRegistry(),
    };
    this.byId.set(session.sessionId, rt);
    await this.attachExisting(rt, wb.webSocketDebuggerUrl);
    rt.session.status = "running";
    rt.session.lifecycle = "owned-running";
    this.opts.sessions.set(rt.session);
    this.broadcastStatus(rt);
    return rt.session;
  }

  /* -------------------------------------------------------------------- attach */

  async attach(session: Session): Promise<Session> {
    if (session.providerId !== this.providerId) {
      throw new AppError({
        code: "wrong_provider",
        operation: "antigravity.attach",
        message: `Session ${session.sessionId} is not Antigravity.`,
      });
    }
    let rt = this.byId.get(session.sessionId);
    if (!rt) {
      rt = {
        session,
        debugPort: 0,
        actions: new ActionRegistry(),
      };
      this.byId.set(session.sessionId, rt);
    }
    if (rt.cdp?.isOpen()) {
      // NFR-012A: re-attaching to an active session does not restart it.
      return rt.session;
    }
    // Re-discover the matching target.
    const targets = await this.findAllTargets();
    const wb = targets[0];
    if (!wb) {
      throw new AppError({
        code: "cdp_target_not_found",
        operation: "antigravity.attach",
        message: "No Antigravity CDP target reachable for attach.",
        recoveryAction: "Launch Antigravity or check debugPortRange.",
      });
    }
    await this.attachExisting(rt, wb.url);
    rt.session.status = "attached";
    rt.session.lifecycle = rt.session.owned ? "owned-running" : "external-attached";
    this.opts.sessions.set(rt.session);
    this.broadcastStatus(rt);
    return rt.session;
  }

  private async attachExisting(rt: SessionRuntime, wsUrl: string): Promise<void> {
    const cdp = await (this.opts.connect ?? connectCDP)(wsUrl);
    rt.cdp = cdp;
    try {
      await cdp.call("Runtime.enable");
    } catch {
      /* runtime already enabled is fine */
    }
    this.startPolling(rt);
  }

  private async findAllTargets(): Promise<{ url: string; id: string }[]> {
    const results = await discoverCDP(this.opts.debugPortRange);
    const out: { url: string; id: string }[] = [];
    for (const r of results) {
      if (r.workbench) out.push({ url: r.workbench.webSocketDebuggerUrl, id: r.workbench.id });
    }
    return out;
  }

  private findRuntimeByTargetId(_id: string): SessionRuntime | undefined {
    // For now we have no stable mapping from CDP target id → runtime; that
    // lands when discovery persists targets. Always return undefined.
    return undefined;
  }

  /* ------------------------------------------------------------------- stop */

  async stop(session: Session): Promise<void> {
    const rt = this.requireRuntime(session);
    // Best-effort: stop the conversation via the action panel if visible.
    try {
      const snap = await captureSnapshot(rt.cdp!);
      const actions = extractActions(snap.html ?? "");
      const stopBtn = actions.find((a) => a.text.toLowerCase().includes("stop"));
      if (stopBtn) {
        rt.actions.rebuild(actions);
        await this.dispatchClick(rt, stopBtn.actionId);
      }
    } catch {
      /* no snapshot → no stop button to click */
    }
  }

  async dispose(session: Session): Promise<void> {
    const rt = this.byId.get(session.sessionId);
    if (!rt) return;
    if (rt.pollTimer) clearInterval(rt.pollTimer);
    rt.cdp?.close();
    if (rt.session.owned && rt.child && !rt.child.killed) {
      rt.child.kill("SIGTERM");
    }
    rt.session.status = "stopped";
    rt.session.lifecycle = rt.session.owned ? "owned-stopped" : "discovered";
    this.opts.sessions.set(rt.session);
    this.broadcastStatus(rt);
    this.byId.delete(session.sessionId);
  }

  /* -------------------------------------------------------------- sendPrompt */

  async sendPrompt(
    session: Session,
    text: string,
    _ctx?: PromptContext,
  ): Promise<void> {
    const rt = this.requireRuntime(session);
    const safe = JSON.stringify(text); // POC pattern — JSON.stringify is the input sanitizer.
    const script = `
      (() => {
        const input =
          document.querySelector('textarea[aria-label*="prompt" i]') ||
          document.querySelector('textarea') ||
          document.querySelector('div[contenteditable="true"]');
        if (!input) return { ok: false, reason: 'no input field' };
        if (input.tagName === 'TEXTAREA') {
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          setter.call(input, ${safe});
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          input.textContent = ${safe};
          input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        }
        const form = input.closest('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          return { ok: true, mode: 'form' };
        }
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return { ok: true, mode: 'keydown' };
      })();
    `;
    await rt.cdp!.call("Runtime.evaluate", {
      expression: script,
      returnByValue: true,
      awaitPromise: false,
    });
  }

  async sendInput(): Promise<void> {
    throw new AppError({
      code: "capability_unsupported",
      operation: "antigravity.sendInput",
      message: "Direct keystroke input is not supported on the CDP surface.",
    });
  }

  /* ------------------------------------------------------------ conversations */

  async listConversations(_session: Session): Promise<ConversationDescriptor[]> {
    // History scrape lives in sprint 04+ UI; baseline returns empty.
    return [];
  }
  async selectConversation(): Promise<void> {
    throw new AppError({
      code: "capability_unsupported",
      operation: "antigravity.selectConversation",
      message: "Conversation selection is not yet implemented.",
    });
  }

  /* ----------------------------------------------------------------- snapshot */

  async getSnapshot(session: Session): Promise<SnapshotPayload> {
    const rt = this.requireRuntime(session);
    const snap = await captureSnapshot(rt.cdp!);
    rt.lastSnapshotHash = snap.hash;
    rt.actions.rebuild(extractActions(snap.html ?? ""));
    return snap;
  }

  async getStatus(session: Session): Promise<Session["status"]> {
    const rt = this.byId.get(session.sessionId);
    if (!rt) return "unknown";
    if (rt.cdp?.isOpen()) return rt.session.status;
    return "detached";
  }

  /* ------------------------------------------------------------------ actions */

  async getActions(session: Session): Promise<ActionDescriptor[]> {
    const rt = this.requireRuntime(session);
    const snap = await captureSnapshot(rt.cdp!);
    rt.actions.rebuild(extractActions(snap.html ?? ""));
    return rt.actions.list();
  }

  async performAction(session: Session, actionId: string): Promise<void> {
    const rt = this.requireRuntime(session);
    await this.dispatchClick(rt, actionId);
  }

  /**
   * Server-side selector resolution — never accepts selectors from clients.
   */
  private async dispatchClick(rt: SessionRuntime, actionId: string): Promise<void> {
    const target = rt.actions.resolve(actionId);
    if (!target) {
      throw new AppError({
        code: "action_not_found",
        operation: "antigravity.performAction",
        message: `Action ${actionId} is no longer present in the snapshot.`,
        recoveryAction: "Refresh the snapshot and use the new action ID.",
        httpStatus: 404,
      });
    }
    const safeTag = JSON.stringify(target.tag);
    const safeText = JSON.stringify(target.text);
    const safeIdx = JSON.stringify(target.occurrenceIndex);
    const script = `
      (() => {
        const tag = ${safeTag};
        const wanted = ${safeText};
        const idx = ${safeIdx};
        const candidates = Array.from(document.querySelectorAll(
          tag === 'a' ? 'a' : tag === 'button' ? 'button' : '[role=button]'
        ));
        let occ = -1;
        let target = null;
        for (const el of candidates) {
          const tx = (el.textContent || '').trim().replace(/\\s+/g, ' ');
          if (tx === wanted) {
            occ += 1;
            if (occ === idx) { target = el; break; }
          }
        }
        if (!target) return { ok: false, reason: 'no match' };
        target.click();
        return { ok: true };
      })();
    `;
    const result = await rt.cdp!.call<{ result: { value?: { ok?: boolean; reason?: string } } }>(
      "Runtime.evaluate",
      { expression: script, returnByValue: true, awaitPromise: false },
    );
    const v = result?.result?.value;
    if (!v?.ok) {
      throw new AppError({
        code: "action_target_missing",
        operation: "antigravity.performAction",
        message: `Could not click action: ${v?.reason ?? "unknown"}`,
        httpStatus: 410,
      });
    }
    this.broadcastActions(rt);
  }

  /* -------------------------------------------------- snapshot polling + WS */

  private startPolling(rt: SessionRuntime): void {
    if (rt.pollTimer) return;
    const tick = async (): Promise<void> => {
      try {
        if (!rt.cdp?.isOpen()) return;
        const snap = await captureSnapshot(rt.cdp);
        if (snap.hash !== rt.lastSnapshotHash) {
          rt.lastSnapshotHash = snap.hash;
          rt.actions.rebuild(extractActions(snap.html ?? ""));
          this.broadcastSnapshot(rt, snap);
          this.broadcastActions(rt);
        }
      } catch {
        /* swallow; sessions surface errors via getSnapshot()  */
      }
    };
    rt.pollTimer = setInterval(() => void tick(), this.opts.snapshotPollMs);
  }

  private broadcastSnapshot(rt: SessionRuntime, snap: SnapshotPayload): void {
    this.opts.bus.publish(
      envelope(EVENT_TYPES.ProviderSnapshotChanged, snap, {
        sessionId: rt.session.sessionId,
      }),
    );
  }
  private broadcastActions(rt: SessionRuntime): void {
    this.opts.bus.publish(
      envelope(
        EVENT_TYPES.ProviderActionsChanged,
        { actions: rt.actions.list() },
        { sessionId: rt.session.sessionId },
      ),
    );
  }
  private broadcastStatus(rt: SessionRuntime): void {
    this.opts.bus.publish(
      envelope(
        EVENT_TYPES.ProviderStatusChanged,
        {
          status: rt.session.status,
          lifecycle: rt.session.lifecycle,
          debugPort: rt.debugPort,
        },
        { sessionId: rt.session.sessionId },
      ),
    );
  }

  /* ------------------------------------------------------------- internals */

  private requireRuntime(session: Session): SessionRuntime {
    const rt = this.byId.get(session.sessionId);
    if (!rt || !rt.cdp) {
      throw new AppError({
        code: "session_not_attached",
        operation: "antigravity.runtime",
        message: `Session ${session.sessionId} is not attached.`,
        recoveryAction: "Call POST /api/sessions/:id/attach first.",
        httpStatus: 409,
      });
    }
    return rt;
  }

  /** Dispose all owned runtimes — wired into app close (NFR-013). */
  async shutdown(): Promise<void> {
    for (const [, rt] of this.byId) {
      if (rt.pollTimer) clearInterval(rt.pollTimer);
      rt.cdp?.close();
      if (rt.session.owned && rt.child && !rt.child.killed) {
        rt.child.kill("SIGTERM");
      }
    }
    this.byId.clear();
  }
}
