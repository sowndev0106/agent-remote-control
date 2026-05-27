import { createHash } from "node:crypto";
import {
  type CapabilityMap,
  type Session,
  allUnsupportedCapabilities,
} from "../../domains/types.js";
import { SessionStoreLite } from "../../domains/sessions.js";
import { AppError } from "../../core/errors.js";
import type { TmuxScreenTarget } from "../../core/config.js";
import { hasBinary, run } from "./mux-exec.js";
import type { DiscoveredSession, SnapshotPayload } from "../IProviderAdapter.js";

/**
 * tmux control surface (REQ-045D / REQ-094B). Text-only: no DOM, so no action
 * buttons. Input via `tmux send-keys -l` (literal, injection-safe), output via
 * `tmux capture-pane -p`. Stop via Ctrl-C send.
 */
export class AntigravityTmuxAdapter {
  readonly providerId = "antigravity" as const;

  constructor(
    private opts: {
      sessions: SessionStoreLite;
      targets: () => TmuxScreenTarget[];
      exec?: typeof run;
      binaryCheck?: typeof hasBinary;
    },
  ) {}

  private get exec() {
    return this.opts.exec ?? run;
  }

  static capabilities(): CapabilityMap {
    const c = allUnsupportedCapabilities();
    c.getSnapshot = "supported";
    c.sendPrompt = "supported";
    c.sendInput = "supported";
    c.stop = "supported";
    c.attach = "supported";
    // No DOM → no clickable actions / no conversation listing.
    c.getActions = "unsupported";
    c.performAction = "unsupported";
    c.listConversations = "unsupported";
    c.selectConversation = "unsupported";
    return c;
  }

  async available(): Promise<boolean> {
    const check = this.opts.binaryCheck ?? hasBinary;
    return check("tmux");
  }

  async listSessions(): Promise<string[]> {
    const r = await this.exec("tmux", [
      "list-sessions",
      "-F",
      "#{session_name}",
    ]);
    if (r.code !== 0) return [];
    return r.stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** Discovered tmux sessions = configured targets that actually exist. */
  async listDiscoveredSessions(): Promise<DiscoveredSession[]> {
    if (!(await this.available())) return [];
    const live = new Set(await this.listSessions());
    const out: DiscoveredSession[] = [];
    for (const t of this.opts.targets()) {
      if (!live.has(t.name)) continue;
      const sessionId = SessionStoreLite.newId();
      const session: Session = {
        sessionId,
        providerId: this.providerId,
        source: "tmux",
        status: "running",
        lifecycle: "external-attached",
        capabilities: AntigravityTmuxAdapter.capabilities(),
        owned: false,
      };
      if (t.project !== undefined) session.projectPath = t.project;
      this.opts.sessions.set(session);
      const ds: DiscoveredSession = {
        sessionId,
        providerId: this.providerId,
        source: "tmux",
        hint: `tmux: ${t.name}`,
      };
      if (t.project !== undefined) ds.projectPath = t.project;
      out.push(ds);
    }
    return out;
  }

  private targetSpec(target: TmuxScreenTarget): string {
    return target.windowOrPane ? `${target.name}:${target.windowOrPane}` : target.name;
  }

  private requireTarget(name: string): TmuxScreenTarget {
    const t = this.opts.targets().find((x) => x.name === name);
    if (!t) {
      throw new AppError({
        code: "tmux_target_missing",
        operation: "tmux",
        message: `No configured tmux target named ${name}`,
        recoveryAction: "Add the target in settings (providers.antigravity.tmuxTargets).",
        httpStatus: 404,
      });
    }
    return t;
  }

  async getSnapshot(targetName: string): Promise<SnapshotPayload> {
    const target = this.requireTarget(targetName);
    const r = await this.exec("tmux", [
      "capture-pane",
      "-p",
      "-t",
      this.targetSpec(target),
    ]);
    if (r.code !== 0) {
      throw new AppError({
        code: "tmux_target_missing",
        operation: "tmux.getSnapshot",
        message: `tmux capture-pane failed: ${r.stderr.trim()}`,
        httpStatus: 410,
      });
    }
    const text = r.stdout;
    return {
      hash: createHash("sha256").update(text).digest("hex").slice(0, 16),
      capturedAt: Date.now(),
      text,
    };
  }

  async sendPrompt(targetName: string, textToSend: string): Promise<void> {
    const target = this.requireTarget(targetName);
    // -l = literal: text is taken verbatim, no key-name interpretation, so
    // shell-special chars cannot escape the pane (S07-T09).
    const spec = this.targetSpec(target);
    const lit = await this.exec("tmux", ["send-keys", "-t", spec, "-l", textToSend]);
    if (lit.code !== 0) {
      throw new AppError({
        code: "tmux_send_failed",
        operation: "tmux.sendPrompt",
        message: `tmux send-keys failed: ${lit.stderr.trim()}`,
      });
    }
    await this.exec("tmux", ["send-keys", "-t", spec, "Enter"]);
  }

  async sendInput(targetName: string, input: string): Promise<void> {
    const target = this.requireTarget(targetName);
    const spec = this.targetSpec(target);
    // Translate a literal Ctrl-C (0x03) to the tmux key name; otherwise literal.
    if (input === "\x03") {
      await this.exec("tmux", ["send-keys", "-t", spec, "C-c"]);
      return;
    }
    await this.exec("tmux", ["send-keys", "-t", spec, "-l", input]);
  }

  async stop(targetName: string): Promise<void> {
    const target = this.requireTarget(targetName);
    await this.exec("tmux", ["send-keys", "-t", this.targetSpec(target), "C-c"]);
  }
}
