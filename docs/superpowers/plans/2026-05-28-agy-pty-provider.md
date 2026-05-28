# Independent `agy` PTY Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken "agy launches Antigravity over CDP" path with an independent `agy` provider that runs the real `agy` terminal agent in a server-owned PTY.

**Architecture:** `agy` becomes a standalone `IProviderAdapter` (`AgyPtyAdapter`) that spawns the `agy` Go CLI through `node-pty` (cwd = project, `--add-dir <project>`), renders PTY output through `@xterm/headless` into hashed snapshots, relays prompts/keystrokes/approvals, lists conversations from agy's data dir, and resumes via the native `--conversation <id>` launch flag. No CDP, no `--remote-debugging-port`. The `agy` branch is removed from the shared Antigravity wrapper CLI, and the snapshot HTML escape is moved off the Antigravity sanitizer so the agy adapter no longer imports from `antigravity/`.

**Why:** `agy 1.0.3` is a standalone Go terminal agent (the Gemini-CLI successor), not the Antigravity Electron IDE. It ignores `--remote-debugging-port`, so the current `runAntigravityWrapper` path can never mirror or control it. Its native control surface is its flags (`--add-dir`, `-c`, `--conversation=<id>`, `-p/--print`, `--dangerously-skip-permissions`) and its data home `~/.gemini/antigravity-cli/`.

**Tech Stack:** TypeScript ESM + NodeNext + strict, Fastify, `ws`, `node-pty`, `@xterm/headless`, Vitest.

**Scope:** Server-owned `agy-pty` surface only. The user-terminal `agy-wrapper` surface (IPC PTY bridge) and `agy-unmanaged` discovery are explicitly out of scope and belong to a later plan.

---

## Pre-flight

- Branch is already `agy-provider`. Work continues there.
- These agy modules already exist and are reused as-is (do **not** rewrite them):
  - `src/server/adapters/agy/detect.ts` — exports `detectAgy`, `agySupportedCapabilities`.
  - `src/server/adapters/agy/actions.ts` — exports `getAgyActions`, `inputForAgyAction`, `AGY_FIXED_ACTIONS`, `detectApprovalActions`.
  - `src/server/adapters/agy/conversations.ts` — exports `listAgyConversations`.
  - `src/server/adapters/agy/snapshot.ts` — exports `AgySnapshotBuffer` (only its import line changes in Task 1).
- `@xterm/headless` is already a dependency.
- **Do not** add `--dangerously-skip-permissions`: tool-approval prompts must surface to the UI through `getActions` (approve/deny), which is the intended remote-control UX.

Baseline — confirm green before starting:

```bash
pnpm test
pnpm typecheck
```

Expected: PASS. If the working tree is dirty with the in-progress `provider` edits to `src/cli/antigravity.ts` / `src/cli/index.ts` (see `git status`), that is expected — Task 2 reverts them.

---

## File Structure

```text
src/server/adapters/text-escape.ts          — NEW: provider-neutral escapeForAppDom (Task 1)
src/server/adapters/antigravity/sanitize.ts  — remove escapeForAppDom (Task 1)
src/server/adapters/agy/snapshot.ts          — import escape from ../text-escape.js (Task 1)
tests/cdp-sanitize.test.ts                    — re-point escapeForAppDom import (Task 1)

src/cli/antigravity.ts                        — antigravity-only wrapper, drop provider param (Task 2)
src/cli/index.ts                              — remove `agy` wrap command (Task 2)
tests/agy-wrapper-cli.test.ts                 — DELETE (documents the removed bug) (Task 2)

src/server/adapters/agy/pty.ts                — NEW: AgyPtyAdapter (Task 3)
tests/agy-pty-adapter.test.ts                 — NEW (Task 3)

src/server/assembly.ts                        — construct + wire agy adapter, agySpawn override (Task 4)
src/server/http/domain.ts                     — thread agy into adapter routes (Task 4)
src/server/http/adapter-routes.ts             — getAdapter routes "agy" (Task 4)
tests/agy-assembly.test.ts                    — NEW: wiring + launch (Task 4)
tests/agy-discover-route.test.ts              — NEW: agy no longer provider_disabled (Task 4)
```

---

## Task 1 — Move the snapshot escape onto a provider-neutral seam

The agy snapshot buffer imports `escapeForAppDom` from `antigravity/sanitize.ts`. That is a cross-adapter dependency between two providers that must be independent. Move the escape to a neutral module both adapters import.

**Files:**
- Create: `src/server/adapters/text-escape.ts`
- Modify: `src/server/adapters/antigravity/sanitize.ts`
- Modify: `src/server/adapters/agy/snapshot.ts:3`
- Modify: `tests/cdp-sanitize.test.ts:1-3`

- [ ] **Step 1.1: Create the neutral escape module**

Create `src/server/adapters/text-escape.ts`:

```ts
/**
 * Escape arbitrary scraped/terminal text before inserting into app-owned DOM
 * (NFR-004). Provider-neutral: used by both the Antigravity DOM sanitizer and
 * the agy terminal snapshot renderer, so neither adapter depends on the other.
 */
export function escapeForAppDom(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

- [ ] **Step 1.2: Remove `escapeForAppDom` from the Antigravity sanitizer**

In `src/server/adapters/antigravity/sanitize.ts`, delete the entire `escapeForAppDom` function (lines 46-56, the trailing `export function escapeForAppDom(...) { ... }` block). Leave `sanitizeMirrorHtml` untouched. The file no longer exports `escapeForAppDom`.

- [ ] **Step 1.3: Re-point the agy snapshot import**

In `src/server/adapters/agy/snapshot.ts`, change line 3 from:

```ts
import { escapeForAppDom } from "../antigravity/sanitize.js";
```

to:

```ts
import { escapeForAppDom } from "../text-escape.js";
```

- [ ] **Step 1.4: Re-point the sanitize test import**

In `tests/cdp-sanitize.test.ts`, the import currently pulls `escapeForAppDom` (and `sanitizeMirrorHtml`) from the antigravity sanitizer. Split the import so `escapeForAppDom` comes from the neutral module. Change the top imports to:

```ts
import { sanitizeMirrorHtml } from "../src/server/adapters/antigravity/sanitize.js";
import { escapeForAppDom } from "../src/server/adapters/text-escape.js";
```

(If `sanitizeMirrorHtml` is not actually referenced by the test, import only `escapeForAppDom` from the neutral module and drop the sanitize import.)

- [ ] **Step 1.5: Verify**

Run: `pnpm test cdp-sanitize agy-snapshot && pnpm typecheck`
Expected: PASS. No file under `src/server/adapters/agy/` imports from `../antigravity/`.

Confirm the decoupling:

```bash
grep -rn "antigravity/" src/server/adapters/agy/
```

Expected: no output.

- [ ] **Step 1.6: Commit**

```bash
git add src/server/adapters/text-escape.ts src/server/adapters/antigravity/sanitize.ts src/server/adapters/agy/snapshot.ts tests/cdp-sanitize.test.ts
git commit -m "refactor(agy): move text escape to provider-neutral seam"
```

---

## Task 2 — Remove the broken `agy` wrapper CLI path

`runAntigravityWrapper` is shared by `agy` and `antigravity` and always appends `--remote-debugging-port`, then registers a `debugPort` over IPC — a CDP protocol `agy` does not speak. Make the wrapper Antigravity-only and drop the `agy` CLI command. The agy launch path is the web UI (`POST /api/sessions/launch`, Task 4), not this CLI.

**Files:**
- Delete: `tests/agy-wrapper-cli.test.ts`
- Modify: `src/cli/antigravity.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 2.1: Delete the bug-documenting test**

```bash
git rm tests/agy-wrapper-cli.test.ts
```

This test asserts the current broken behaviour (agy routed through `antigravity.command` + `--remote-debugging-port`). It is removed with the path it documents.

- [ ] **Step 2.2: Make the wrapper Antigravity-only**

In `src/cli/antigravity.ts`, restore the single-provider shape. Replace the `WrapperOpts` interface and the command-resolution line.

Change:

```ts
export interface WrapperOpts {
  project: string;
  provider: "agy" | "antigravity";
}
```

to:

```ts
export interface WrapperOpts {
  project: string;
}
```

And change:

```ts
  const config = await loadConfig(configFile());
  const providerConfig = config.providers[opts.provider];
  const command = providerConfig.command;
```

to:

```ts
  const config = await loadConfig(configFile());
  const command = config.providers.antigravity.command;
```

- [ ] **Step 2.3: Remove the `agy` CLI command**

In `src/cli/index.ts`, replace the `wrap` helper block (the `const wrap = (cmd) => ...; wrap("agy"); wrap("antigravity");` section, lines ~61-74) with a single Antigravity command:

```ts
  // Antigravity wrapper command: launch Antigravity in the user's terminal and
  // register it with the local server over IPC (CDP control surface).
  program
    .command("antigravity <project>")
    .description(
      "Launch Antigravity for <project> and register it with the local server",
    )
    .action(async (project: string) => {
      await runAntigravityWrapper({ project });
    });
```

- [ ] **Step 2.4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. If any other test references the removed `agy` CLI command, update it to use the `antigravity` command or remove the agy-specific assertion.

Confirm the broken flag is gone from the agy path:

```bash
grep -rn "remote-debugging-port" src/cli/
```

Expected: it appears only in the Antigravity wrapper (`src/cli/antigravity.ts`), never gated on an `agy` provider.

- [ ] **Step 2.5: Commit**

```bash
git add src/cli/antigravity.ts src/cli/index.ts
git commit -m "feat(agy): remove broken agy-over-CDP wrapper path"
```

---

## Task 3 — Build the independent `AgyPtyAdapter`

A server-owned PTY provider implementing `IProviderAdapter`. It composes the existing detect/actions/conversations/snapshot modules. Resume relaunches the PTY with `--conversation <id>` under the same `sessionId`.

**Files:**
- Create: `src/server/adapters/agy/pty.ts`
- Create: `tests/agy-pty-adapter.test.ts`

- [ ] **Step 3.1: Write the failing adapter test**

Create `tests/agy-pty-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { AgyPtyAdapter } from "../src/server/adapters/agy/pty.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";
import type { PtyHandle, SpawnPtyOpts } from "../src/server/pty/pty.js";

function fakePty() {
  const data = new Set<(chunk: string) => void>();
  const exits = new Set<(info: { exitCode: number; signal?: number }) => void>();
  const writes: string[] = [];
  const handle: PtyHandle = {
    pid: 4321,
    alive: vi.fn(() => true),
    write: vi.fn((chunk: string) => writes.push(chunk)),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (h) => { data.add(h); return () => data.delete(h); },
    onExit: (h) => { exits.add(h); return () => exits.delete(h); },
  };
  return {
    handle,
    writes,
    emit: (chunk: string) => data.forEach((h) => h(chunk)),
    exit: () => exits.forEach((h) => h({ exitCode: 0 })),
  };
}

function make() {
  const sessions = new AgentSessionRegistry();
  const bus = new RealtimeBus();
  const ptys: ReturnType<typeof fakePty>[] = [];
  const spawn = vi.fn((_opts: SpawnPtyOpts) => {
    const p = fakePty();
    ptys.push(p);
    return p.handle;
  });
  const adapter = new AgyPtyAdapter({
    sessions,
    bus,
    command: "agy",
    scrollback: 4000,
    conversationsDir: "",
    spawn,
  });
  return { sessions, bus, adapter, spawn, ptys };
}

describe("AgyPtyAdapter", () => {
  it("spawns agy as an owned agy-pty session with --add-dir + cwd", async () => {
    const { adapter, sessions, spawn } = make();
    const session = await adapter.start("/project");
    expect(spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "agy",
        args: ["--add-dir", "/project"],
        cwd: "/project",
      }),
    );
    expect(session.providerId).toBe("agy");
    expect(session.source).toBe("agy-pty");
    expect(session.owned).toBe(true);
    expect(session.status).toBe("running");
    expect(sessions.get(session.sessionId)).toBeDefined();
  });

  it("does not pass --remote-debugging-port", async () => {
    const { adapter, spawn } = make();
    await adapter.start("/project");
    const opts = spawn.mock.calls[0]![0] as SpawnPtyOpts;
    expect(opts.args?.some((a) => a.includes("remote-debugging-port"))).toBe(false);
  });

  it("sends prompts with a carriage return and raw input verbatim", async () => {
    const { adapter, ptys } = make();
    const session = await adapter.start("/project");
    await adapter.sendPrompt(session, "hello");
    await adapter.sendInput(session, "\x1b[A");
    expect(ptys[0]!.writes).toEqual(["hello\r", "\x1b[A"]);
  });

  it("maps a fixed action id to its input", async () => {
    const { adapter, ptys } = make();
    const session = await adapter.start("/project");
    await adapter.performAction(session, "agy.ctrl_c");
    expect(ptys[0]!.writes).toEqual(["\x03"]);
  });

  it("updates snapshot from PTY chunks", async () => {
    const { adapter, ptys } = make();
    const session = await adapter.start("/project");
    ptys[0]!.emit("hello from agy");
    const snap = await adapter.getSnapshot(session);
    expect(snap.text).toContain("hello from agy");
    expect(snap.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("resumes by relaunching with --conversation under the same sessionId", async () => {
    const { adapter, spawn } = make();
    const session = await adapter.start("/project");
    await adapter.selectConversation(session, "conv-9");
    expect(spawn).toHaveBeenCalledTimes(2);
    const secondArgs = (spawn.mock.calls[1]![0] as SpawnPtyOpts).args;
    expect(secondArgs).toEqual(["--add-dir", "/project", "--conversation", "conv-9"]);
    expect(await adapter.getStatus(session)).toBe("running");
  });

  it("marks an exited child stopped", async () => {
    const { adapter, sessions, ptys } = make();
    const session = await adapter.start("/project");
    ptys[0]!.exit();
    expect(sessions.get(session.sessionId)?.status).toBe("stopped");
    expect(sessions.get(session.sessionId)?.lifecycle).toBe("owned-stopped");
  });

  it("shutdown terminates owned PTYs", async () => {
    const { adapter, ptys } = make();
    await adapter.start("/project");
    await adapter.shutdown();
    expect(ptys[0]!.handle.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
```

- [ ] **Step 3.2: Run to verify failure**

Run: `pnpm test agy-pty-adapter`
Expected: FAIL — `src/server/adapters/agy/pty.js` does not exist.

- [ ] **Step 3.3: Implement the adapter**

Create `src/server/adapters/agy/pty.ts`:

```ts
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
  SnapshotPayload,
} from "../IProviderAdapter.js";
import type { IProviderAdapter } from "../IProviderAdapter.js";
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
```

- [ ] **Step 3.4: Verify**

Run: `pnpm test agy-pty-adapter && pnpm typecheck`
Expected: PASS. If `exactOptionalPropertyTypes` rejects `delete rt.lastSnapshotHash;`, that is the intended way to clear it; if a different lint complains, set it via a fresh object spread instead.

- [ ] **Step 3.5: Commit**

```bash
git add src/server/adapters/agy/pty.ts tests/agy-pty-adapter.test.ts
git commit -m "feat(agy): add server-owned PTY adapter"
```

---

## Task 4 — Wire `agy` into assembly and HTTP routes

Construct the adapter in the composition root, expose it on `deps`, thread it into the adapter routes, and route `providerId === "agy"` to it. Add an `agySpawn` override so tests can inject a fake PTY.

**Files:**
- Modify: `src/server/assembly.ts`
- Modify: `src/server/http/domain.ts`
- Modify: `src/server/http/adapter-routes.ts`
- Create: `tests/agy-assembly.test.ts`
- Create: `tests/agy-discover-route.test.ts`

- [ ] **Step 4.1: Write the failing wiring + route tests**

Create `tests/agy-assembly.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { defaultConfig } from "../src/server/core/config.js";
import { assembleServer } from "../src/server/assembly.js";
import type { PtyHandle, SpawnPtyOpts } from "../src/server/pty/pty.js";

function fakeHandle(): PtyHandle {
  return {
    pid: 777,
    alive: () => true,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: () => () => {},
    onExit: () => () => {},
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-agy-assembly-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("agy wiring", () => {
  it("wires the agy adapter and launches an owned agy-pty session", async () => {
    const spawn = vi.fn((_opts: SpawnPtyOpts) => fakeHandle());
    const { deps, shutdown } = await assembleServer({
      config: defaultConfig(),
      paths: {
        configFile: join(dir, "config.json"),
        secretFile: join(dir, "secret.key"),
        sessionsFile: join(dir, "sessions.json"),
        projectsFile: join(dir, "projects.json"),
      },
      overrides: {
        secret: randomBytes(32),
        skipIpc: true,
        skipWs: true,
        skipPermissionAudit: true,
        agySpawn: spawn,
      },
    });
    try {
      expect(deps.agy.providerId).toBe("agy");
      const session = await deps.agy.start("/tmp/proj");
      expect(session.source).toBe("agy-pty");
      expect(session.owned).toBe(true);
      expect(deps.agentSessions.get(session.sessionId)).toBeDefined();
      expect(spawn).toHaveBeenCalledOnce();
    } finally {
      await shutdown();
    }
  });
});
```

Create `tests/agy-discover-route.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authedApp, type AuthedAppFixture } from "./_authed-app.js";

let dir: string;
let fx: AuthedAppFixture;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-agy-discover-"));
  fx = await authedApp({ dir });
});
afterEach(async () => {
  await fx.assembled.shutdown();
  await rm(dir, { recursive: true, force: true });
});

describe("agy discover route", () => {
  it("does not reject agy as a disabled provider", async () => {
    const res = await fx.assembled.app.inject({
      method: "POST",
      url: "/api/sessions/discover?provider=agy",
      headers: { cookie: fx.cookieHeader, "x-csrf-token": fx.csrfVal },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run to verify failure**

Run: `pnpm test agy-assembly agy-discover-route`
Expected: FAIL — `deps.agy` does not exist; `overrides.agySpawn` is not a known property; the discover route returns 409 `provider_disabled` for `provider=agy`.

- [ ] **Step 4.3: Add the `agySpawn` override and construct the adapter**

In `src/server/assembly.ts`:

Add the import near the other adapter imports:

```ts
import { AgyPtyAdapter } from "./adapters/agy/pty.js";
import type { PtyHandle, SpawnPtyOpts } from "./pty/pty.js";
```

Add to `AssembleOverrides`:

```ts
  /** Inject a fake PTY spawn for the agy adapter (tests). */
  agySpawn?: (opts: SpawnPtyOpts) => PtyHandle;
```

Add to `AssembledDeps`:

```ts
  agy: AgyPtyAdapter;
```

Construct it after the `unmanaged` adapter (before `discovery`):

```ts
  const agy = new AgyPtyAdapter({
    sessions: agentSessions,
    bus,
    command: config.providers.agy.command,
    scrollback: config.providers.agy.scrollback,
    conversationsDir: config.providers.agy.conversationsDir,
    ...(overrides.agySpawn ? { spawn: overrides.agySpawn } : {}),
  });
```

Pass it into `registerDomainRoutes`:

```ts
  registerDomainRoutes(app, {
    projects,
    providers,
    sessions: agentSessions,
    bus,
    antigravity,
    pty,
    agy,
    portPool,
    terminal,
    discovery,
    config,
  });
```

Add it to the `deps` object:

```ts
    agy,
```

Add it to `shutdown` (before `app.close()`):

```ts
    await agy.shutdown();
```

- [ ] **Step 4.4: Thread agy through the domain routes**

In `src/server/http/domain.ts`:

Add the import:

```ts
import { AgyPtyAdapter } from "../adapters/agy/pty.js";
```

Add to `DomainDeps`:

```ts
  agy: AgyPtyAdapter;
```

Pass it into `registerAdapterRoutes`:

```ts
  registerAdapterRoutes(app, {
    antigravity: deps.antigravity,
    agy: deps.agy,
    projects: deps.projects,
    sessions: deps.sessions,
    discovery: deps.discovery,
  });
```

- [ ] **Step 4.5: Route `agy` in `getAdapter`**

In `src/server/http/adapter-routes.ts`:

Add the import:

```ts
import type { AgyPtyAdapter } from "../adapters/agy/pty.js";
```

Add to the `Deps` interface:

```ts
  agy: AgyPtyAdapter;
```

Extend `getAdapter`:

```ts
function getAdapter(deps: Deps, providerId: ProviderId): IProviderAdapter {
  if (providerId === "antigravity") return deps.antigravity;
  if (providerId === "agy") return deps.agy;
  throw new AppError({
    code: "provider_disabled",
    operation: "select adapter",
    message: `Provider ${providerId} is not enabled in Phase 1.`,
    httpStatus: 409,
  });
}
```

- [ ] **Step 4.6: Verify**

Run: `pnpm test agy-assembly agy-discover-route && pnpm typecheck`
Expected: PASS.

Then run the full suite:

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: PASS. The `agy` provider now launches, mirrors, accepts prompts/input/actions, lists conversations, resumes, and stops through the standard `/api/sessions/*` routes — no Antigravity coupling.

- [ ] **Step 4.7: Commit**

```bash
git add src/server/assembly.ts src/server/http/domain.ts src/server/http/adapter-routes.ts tests/agy-assembly.test.ts tests/agy-discover-route.test.ts
git commit -m "feat(agy): wire independent agy provider into assembly and routes"
```

---

## Self-Review

- **Spec coverage:** decouple from antigravity → Task 1 (escape seam) + Task 2 (CLI) + Task 3 (no CDP). Independent PTY agent → Task 3. UI can drive it through existing routes → Task 4. Native resume flag → Task 3 `selectConversation`. Conversations from agy data dir → Task 3 `listConversations` (reuses `listAgyConversations`).
- **Out of scope (intentional):** `agy-wrapper` IPC PTY bridge, `agy-unmanaged` discovery, reading `history.jsonl` as the conversation index (a later refinement of `conversations.ts`), and the `agy --print` headless adapter. None are required for an independent, UI-drivable `agy-pty` provider.
- **Type consistency:** `AgyPtyAdapter` implements every `IProviderAdapter` method (`detect`, `listDiscoveredSessions`, `start`, `attach`, `stop`, `dispose`, `sendPrompt`, `sendInput`, `listConversations`, `selectConversation`, `getSnapshot`, `getStatus`, `getActions`, `performAction`) plus `shutdown` (called by assembly). Capability set comes from the existing `agySupportedCapabilities`. `Session.source` uses the already-defined `"agy-pty"`. Constructor option names (`command`, `scrollback`, `conversationsDir`, `spawn`) match the assembly call site.
- **Doc follow-up (not a code task):** `docs/architecture.md` §7.2/§9.2 still describe agy as Antigravity's managed-PTY surface spawned with `--remote-debugging-port`. Patch those sections when this lands so the docs stop conflating the agy Go TUI with the Antigravity Electron IDE.
