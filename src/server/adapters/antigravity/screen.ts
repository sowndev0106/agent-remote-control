import { createHash, randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
 * GNU screen control surface (REQ-045D). Input via `screen -X stuff`, snapshot
 * via `screen -X hardcopy <file>` then read the file. Text-only, same
 * capability profile as tmux.
 */
export class AntigravityScreenAdapter {
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
    c.getActions = "unsupported";
    c.performAction = "unsupported";
    c.listConversations = "unsupported";
    c.selectConversation = "unsupported";
    return c;
  }

  async available(): Promise<boolean> {
    const check = this.opts.binaryCheck ?? hasBinary;
    return check("screen");
  }

  async listSessions(): Promise<string[]> {
    const r = await this.exec("screen", ["-ls"]);
    // `screen -ls` exits 1 when sessions exist (quirk); parse regardless.
    const names: string[] = [];
    for (const line of r.stdout.split("\n")) {
      const m = /^\s*\d+\.(\S+)\s/.exec(line);
      if (m) names.push(m[1]!);
    }
    return names;
  }

  async listDiscoveredSessions(): Promise<DiscoveredSession[]> {
    if (!(await this.available())) return [];
    const live = new Set(await this.listSessions());
    const out: DiscoveredSession[] = [];
    for (const t of this.opts.targets()) {
      // screen target name may be "pid.tty.host" or a user session name.
      const match = [...live].some((n) => n === t.name || n.endsWith("." + t.name));
      if (!match) continue;
      const sessionId = SessionStoreLite.newId();
      const session: Session = {
        sessionId,
        providerId: this.providerId,
        source: "screen",
        status: "running",
        lifecycle: "external-attached",
        capabilities: AntigravityScreenAdapter.capabilities(),
        owned: false,
      };
      if (t.project !== undefined) session.projectPath = t.project;
      this.opts.sessions.set(session);
      const ds: DiscoveredSession = {
        sessionId,
        providerId: this.providerId,
        source: "screen",
        hint: `screen: ${t.name}`,
      };
      if (t.project !== undefined) ds.projectPath = t.project;
      out.push(ds);
    }
    return out;
  }

  private requireTarget(name: string): TmuxScreenTarget {
    const t = this.opts.targets().find((x) => x.name === name);
    if (!t) {
      throw new AppError({
        code: "screen_target_missing",
        operation: "screen",
        message: `No configured screen target named ${name}`,
        recoveryAction: "Add the target in settings (providers.antigravity.screenTargets).",
        httpStatus: 404,
      });
    }
    return t;
  }

  async getSnapshot(targetName: string): Promise<SnapshotPayload> {
    const target = this.requireTarget(targetName);
    const file = join(tmpdir(), `arc-screen-${randomBytes(6).toString("hex")}.txt`);
    const r = await this.exec("screen", [
      "-S",
      target.name,
      "-X",
      "hardcopy",
      file,
    ]);
    if (r.code !== 0) {
      throw new AppError({
        code: "screen_target_missing",
        operation: "screen.getSnapshot",
        message: `screen hardcopy failed: ${r.stderr.trim()}`,
        httpStatus: 410,
      });
    }
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } finally {
      await rm(file, { force: true }).catch(() => {});
    }
    return {
      hash: createHash("sha256").update(text).digest("hex").slice(0, 16),
      capturedAt: Date.now(),
      text,
    };
  }

  async sendPrompt(targetName: string, textToSend: string): Promise<void> {
    const target = this.requireTarget(targetName);
    // `stuff` injects literal text; append \r to submit. The text is passed as
    // a single argv element so the shell never re-parses it.
    const r = await this.exec("screen", [
      "-S",
      target.name,
      "-X",
      "stuff",
      textToSend + "\r",
    ]);
    if (r.code !== 0) {
      throw new AppError({
        code: "screen_send_failed",
        operation: "screen.sendPrompt",
        message: `screen stuff failed: ${r.stderr.trim()}`,
      });
    }
  }

  async sendInput(targetName: string, input: string): Promise<void> {
    const target = this.requireTarget(targetName);
    await this.exec("screen", ["-S", target.name, "-X", "stuff", input]);
  }

  async stop(targetName: string): Promise<void> {
    const target = this.requireTarget(targetName);
    // Send Ctrl-C via stuff (0x03).
    await this.exec("screen", ["-S", target.name, "-X", "stuff", "\x03"]);
  }
}
