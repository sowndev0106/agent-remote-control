# `agy-wrapper` Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the `agy-wrapper` control surface so a user can run `agent-remote-control agy <project>` in their own terminal and mirror + control that agy session from the web UI — without CDP.

**Architecture:** A new `AgyWrapperAdapter` holds IPC-fed wrapper sessions (`source: "agy-wrapper"`, `owned: false`). The wrapper CLI owns the real PTY, mirrors it to the user's terminal, forwards output chunks to the server over the existing Unix-socket IPC, and **polls** the server for queued input. An `AgyAdapter` dispatcher implements `IProviderAdapter` and routes session-bound calls to `agy-pty` or `agy-wrapper` by `session.source`, so the `agy` provider exposes both surfaces behind one seam (mirrors the Antigravity CDP dispatcher pattern). New IPC methods (`agy-register`, `agy-output`, `agy-poll-input`, `agy-unregister`) carry the bridge; no `debugPort`.

**Tech Stack:** TypeScript ESM + NodeNext + strict, `node-pty`, `@xterm/headless`, Unix-socket IPC, Vitest.

**Non-goals:** streaming (we poll), in-TUI conversation switching for wrapper sessions (`selectConversation` is `unsupported` here — the launch-flag resume only applies to the server-owned `agy-pty`), and killing wrapper processes (`stop` is `unsupported` — `owned:false`, H15).

---

## File Structure

```text
src/server/adapters/agy/wrapper.ts   — NEW: AgyWrapperAdapter (IPC-fed sessions)
src/server/adapters/agy/index.ts     — NEW: AgyAdapter dispatcher (pty + wrapper by source)
src/server/ipc/wire.ts               — add agy-register/output/poll-input/unregister
src/cli/agy.ts                       — NEW: runAgyWrapper (PTY bridge, injectable deps)
src/cli/index.ts                     — re-add `agy <project>` command → runAgyWrapper
src/server/assembly.ts               — construct wrapper + dispatcher; deps.agy = dispatcher; pass wrapper to IPC
src/server/http/domain.ts            — deps.agy type → AgyAdapter
src/server/http/adapter-routes.ts    — Deps.agy type → AgyAdapter

tests/agy-wrapper-adapter.test.ts
tests/agy-dispatcher.test.ts
tests/agy-ipc-wire.test.ts
tests/agy-wrapper-cli.test.ts
```

---

## Task A — `AgyWrapperAdapter`

IPC-fed wrapper sessions. Output arrives via `receiveOutput`; the UI's input is queued and drained by the wrapper via `pollInput`. `owned:false` → never killed.

**Files:** Create `src/server/adapters/agy/wrapper.ts`, `tests/agy-wrapper-adapter.test.ts`.

- [ ] **A.1 Write failing tests**

```ts
// tests/agy-wrapper-adapter.test.ts
import { describe, expect, it } from "vitest";
import { AgyWrapperAdapter } from "../src/server/adapters/agy/wrapper.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";

function make() {
  const sessions = new AgentSessionRegistry();
  const adapter = new AgyWrapperAdapter({ sessions, bus: new RealtimeBus(), scrollback: 4000, conversationsDir: "" });
  return { sessions, adapter };
}

describe("AgyWrapperAdapter", () => {
  it("registers an unowned agy-wrapper session", () => {
    const { adapter, sessions } = make();
    const s = adapter.register({ pid: 100, projectPath: "/p" });
    expect(s.providerId).toBe("agy");
    expect(s.source).toBe("agy-wrapper");
    expect(s.owned).toBe(false);
    expect(s.capabilities.stop).toBe("unsupported");
    expect(s.capabilities.sendInput).toBe("supported");
    expect(sessions.get(s.sessionId)).toBeDefined();
  });

  it("dedupes by pid", () => {
    const { adapter } = make();
    const a = adapter.register({ pid: 100, projectPath: "/p" });
    const b = adapter.register({ pid: 100, projectPath: "/p" });
    expect(b.sessionId).toBe(a.sessionId);
  });

  it("captures output into the snapshot and drains queued input", async () => {
    const { adapter } = make();
    const s = adapter.register({ pid: 100, projectPath: "/p" });
    adapter.receiveOutput(s.sessionId, "hello from agy");
    await adapter.sendInput(s, "x");
    await adapter.performAction(s, "agy.ctrl_c");
    expect((await adapter.getSnapshot(s)).text).toContain("hello from agy");
    expect(adapter.pollInput(s.sessionId)).toEqual(["x", "\x03"]);
    expect(adapter.pollInput(s.sessionId)).toEqual([]);
  });

  it("stop and selectConversation are unsupported; dispose does not kill", async () => {
    const { adapter } = make();
    const s = adapter.register({ pid: 100 });
    await expect(adapter.stop(s)).rejects.toMatchObject({ code: "capability_unsupported" });
    await expect(adapter.selectConversation(s, "c1")).rejects.toMatchObject({ code: "capability_unsupported" });
    await adapter.dispose(s);
    expect(await adapter.getStatus(s)).toBe("stopped");
  });

  it("unregister marks the session stopped", () => {
    const { adapter, sessions } = make();
    const s = adapter.register({ pid: 7 });
    adapter.unregister(s.sessionId);
    expect(sessions.get(s.sessionId)?.status).toBe("stopped");
  });
});
```

- [ ] **A.2 Run to verify failure**: `pnpm test agy-wrapper-adapter` → FAIL (module missing).

- [ ] **A.3 Implement**

```ts
// src/server/adapters/agy/wrapper.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { AppError } from "../../core/errors.js";
import { EVENT_TYPES, envelope } from "../../core/realtime/events.js";
import type { RealtimeBus } from "../../core/realtime/bus.js";
import { AgentSessionRegistry } from "../../domains/agent-sessions.js";
import { allUnsupportedCapabilities, type CapabilityMap, type Session } from "../../domains/types.js";
import type { ActionDescriptor, ConversationDescriptor, SnapshotPayload } from "../IProviderAdapter.js";
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
    "attach", "sendPrompt", "sendInput", "listConversations",
    "getSnapshot", "getStatus", "getActions", "performAction", "dispose",
  ] as const) c[k] = "supported";
  return c; // launch, stop, selectConversation stay unsupported
}

export class AgyWrapperAdapter {
  readonly providerId = "agy" as const;
  private byPid = new Map<number, Runtime>();
  private byId = new Map<string, Runtime>();

  constructor(private opts: {
    sessions: AgentSessionRegistry;
    bus: RealtimeBus;
    scrollback: number;
    conversationsDir: string;
  }) {}

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
    if (args.pid !== undefined) { rt.pid = args.pid; this.byPid.set(args.pid, rt); }
    this.byId.set(session.sessionId, rt);
    this.opts.bus.publish(envelope(
      EVENT_TYPES.SessionLifecycleChanged,
      { lifecycle: session.lifecycle, source: "agy-wrapper" },
      { sessionId: session.sessionId },
    ));
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
    throw new AppError({ code: "capability_unsupported", operation: "agy.stop", message: "agy-wrapper sessions are user-owned; stop them in your terminal.", httpStatus: 409 });
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
    throw new AppError({ code: "capability_unsupported", operation: "agy.selectConversation", message: "Resume a wrapper session with `agy --conversation=<id>` in your terminal.", httpStatus: 409 });
  }

  async getSnapshot(session: Session): Promise<SnapshotPayload> {
    return this.requireRuntime(session, "agy.getSnapshot").snapshot.snapshot();
  }

  async getStatus(session: Session): Promise<Session["status"]> {
    return this.byId.get(session.sessionId)?.session.status ?? "stopped";
  }

  async getActions(session: Session): Promise<ActionDescriptor[]> {
    const rt = this.requireRuntime(session, "agy.getActions");
    return getAgyActions({ running: rt.session.status === "running", text: rt.snapshot.snapshot().text ?? "" });
  }

  async performAction(session: Session, actionId: string): Promise<void> {
    const input = inputForAgyAction(actionId);
    if (input === undefined) {
      throw new AppError({ code: "agy_action_unknown", operation: "agy.performAction", message: `Unknown agy action ${actionId}.`, httpStatus: 404 });
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
    this.opts.bus.publish(envelope(EVENT_TYPES.SessionLifecycleChanged, { lifecycle: "discovered", source: "agy-wrapper" }, { sessionId }));
  }

  async shutdown(): Promise<void> {
    this.byId.clear();
    this.byPid.clear();
  }

  private requireRuntime(session: Session, operation: string): Runtime {
    const rt = this.byId.get(session.sessionId);
    if (!rt) throw new AppError({ code: "session_not_attached", operation, message: `No agy-wrapper runtime for ${session.sessionId}.`, httpStatus: 409 });
    return rt;
  }
}
```

- [ ] **A.4 Verify**: `pnpm test agy-wrapper-adapter && pnpm typecheck` → PASS.
- [ ] **A.5 Commit**: `feat(agy): add IPC-fed agy-wrapper adapter`.

---

## Task B — `AgyAdapter` dispatcher

One `IProviderAdapter` that routes session-bound calls to `agy-pty` or `agy-wrapper` by `session.source`. `start`/`detect`/`listDiscoveredSessions` go to the pty adapter.

**Files:** Create `src/server/adapters/agy/index.ts`, `tests/agy-dispatcher.test.ts`.

- [ ] **B.1 Write failing tests**

```ts
// tests/agy-dispatcher.test.ts
import { describe, expect, it, vi } from "vitest";
import { AgyAdapter } from "../src/server/adapters/agy/index.js";
import { AgyPtyAdapter } from "../src/server/adapters/agy/pty.js";
import { AgyWrapperAdapter } from "../src/server/adapters/agy/wrapper.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";
import type { PtyHandle, SpawnPtyOpts } from "../src/server/pty/pty.js";

function fakeHandle(): PtyHandle {
  return { pid: 1, alive: () => true, write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: () => () => {}, onExit: () => () => {} };
}
function make() {
  const sessions = new AgentSessionRegistry();
  const bus = new RealtimeBus();
  const spawn = vi.fn((_o: SpawnPtyOpts) => fakeHandle());
  const pty = new AgyPtyAdapter({ sessions, bus, command: "agy", scrollback: 4000, conversationsDir: "", spawn });
  const wrapper = new AgyWrapperAdapter({ sessions, bus, scrollback: 4000, conversationsDir: "" });
  return { sessions, pty, wrapper, adapter: new AgyAdapter({ pty, wrapper }) };
}

describe("AgyAdapter dispatcher", () => {
  it("start delegates to the pty surface", async () => {
    const { adapter } = make();
    const s = await adapter.start("/p");
    expect(s.source).toBe("agy-pty");
  });

  it("routes session-bound calls by source", async () => {
    const { adapter, wrapper } = make();
    const w = wrapper.register({ pid: 5, projectPath: "/p" });
    wrapper.receiveOutput(w.sessionId, "WRAPPED");
    const snap = await adapter.getSnapshot(w);
    expect(snap.text).toContain("WRAPPED");
    // wrapper input is queued, not written to a pty
    await adapter.sendInput(w, "z");
    expect(wrapper.pollInput(w.sessionId)).toEqual(["z"]);
  });

  it("exposes providerId agy and empty discovery", async () => {
    const { adapter } = make();
    expect(adapter.providerId).toBe("agy");
    expect(await adapter.listDiscoveredSessions("/p")).toEqual([]);
  });
});
```

- [ ] **B.2 Run to verify failure**: `pnpm test agy-dispatcher` → FAIL.

- [ ] **B.3 Implement**

```ts
// src/server/adapters/agy/index.ts
import type { Session } from "../../domains/types.js";
import type {
  ActionDescriptor, ConversationDescriptor, DetectResult,
  DiscoveredSession, IProviderAdapter, SnapshotPayload,
} from "../IProviderAdapter.js";
import { AgyPtyAdapter } from "./pty.js";
import { AgyWrapperAdapter } from "./wrapper.js";

interface AgySessionOps {
  attach(s: Session): Promise<Session>;
  stop(s: Session): Promise<void>;
  dispose(s: Session): Promise<void>;
  sendPrompt(s: Session, text: string): Promise<void>;
  sendInput(s: Session, input: string): Promise<void>;
  listConversations(s: Session): Promise<ConversationDescriptor[]>;
  selectConversation(s: Session, id: string): Promise<void>;
  getSnapshot(s: Session): Promise<SnapshotPayload>;
  getStatus(s: Session): Promise<Session["status"]>;
  getActions(s: Session): Promise<ActionDescriptor[]>;
  performAction(s: Session, id: string): Promise<void>;
}

/** agy provider seam: routes by session.source to the pty or wrapper surface. */
export class AgyAdapter implements IProviderAdapter {
  readonly providerId = "agy" as const;
  constructor(private inner: { pty: AgyPtyAdapter; wrapper: AgyWrapperAdapter }) {}

  private route(session: Session): AgySessionOps {
    return session.source === "agy-wrapper" ? this.inner.wrapper : this.inner.pty;
  }

  detect(): Promise<DetectResult> { return this.inner.pty.detect(); }
  listDiscoveredSessions(p?: string): Promise<DiscoveredSession[]> { return this.inner.pty.listDiscoveredSessions(p); }
  start(projectPath: string): Promise<Session> { return this.inner.pty.start(projectPath); }

  attach(s: Session): Promise<Session> { return this.route(s).attach(s); }
  stop(s: Session): Promise<void> { return this.route(s).stop(s); }
  dispose(s: Session): Promise<void> { return this.route(s).dispose(s); }
  sendPrompt(s: Session, t: string): Promise<void> { return this.route(s).sendPrompt(s, t); }
  sendInput(s: Session, i: string): Promise<void> { return this.route(s).sendInput(s, i); }
  listConversations(s: Session): Promise<ConversationDescriptor[]> { return this.route(s).listConversations(s); }
  selectConversation(s: Session, id: string): Promise<void> { return this.route(s).selectConversation(s, id); }
  getSnapshot(s: Session): Promise<SnapshotPayload> { return this.route(s).getSnapshot(s); }
  getStatus(s: Session): Promise<Session["status"]> { return this.route(s).getStatus(s); }
  getActions(s: Session): Promise<ActionDescriptor[]> { return this.route(s).getActions(s); }
  performAction(s: Session, id: string): Promise<void> { return this.route(s).performAction(s, id); }

  async shutdown(): Promise<void> {
    await this.inner.pty.shutdown();
    await this.inner.wrapper.shutdown();
  }
}
```

- [ ] **B.4 Verify**: `pnpm test agy-dispatcher && pnpm typecheck` → PASS.
- [ ] **B.5 Commit**: `feat(agy): add provider dispatcher routing pty vs wrapper by source`.

---

## Task C — IPC wire methods for `agy-wrapper`

**Files:** Modify `src/server/ipc/wire.ts`, create `tests/agy-ipc-wire.test.ts`.

- [ ] **C.1 Write failing test** (drives the wired methods through a started IPC server + `ipcCall`)

```ts
// tests/agy-ipc-wire.test.ts
import { describe, expect, it, afterEach } from "vitest";
import { startIpcServer } from "../src/server/ipc/wire.js";
import { ipcCall } from "../src/server/ipc/client.js";
import { ipcSocketPath, ensureIpcNonce } from "../src/server/ipc/nonce.js";
import { AgyWrapperAdapter } from "../src/server/adapters/agy/wrapper.js";
import { AntigravityWrapperAdapter } from "../src/server/adapters/antigravity/wrapper.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";

let stop: (() => Promise<void>) | null = null;
afterEach(async () => { if (stop) await stop(); stop = null; });

describe("agy IPC wire", () => {
  it("registers, forwards output, polls input, unregisters", async () => {
    const sessions = new AgentSessionRegistry();
    const bus = new RealtimeBus();
    const agyWrapper = new AgyWrapperAdapter({ sessions, bus, scrollback: 4000, conversationsDir: "" });
    const wrapper = new AntigravityWrapperAdapter({ sessions, bus });
    const server = await startIpcServer({
      wrapper, agyWrapper,
      reservePort: async () => 9000,
      releasePort: () => {},
    });
    stop = () => server.stop();
    const sock = ipcSocketPath();
    const nonce = await ensureIpcNonce();

    const reg = await ipcCall<{ sessionId: string }>(sock, nonce, "agy-register", { pid: 42, projectPath: "/p" });
    expect(reg.sessionId).toBeTruthy();

    await ipcCall(sock, nonce, "agy-output", { sessionId: reg.sessionId, chunk: "HELLO-IPC" });
    expect((await agyWrapper.getSnapshot(sessions.get(reg.sessionId)!)).text).toContain("HELLO-IPC");

    await agyWrapper.sendInput(sessions.get(reg.sessionId)!, "Q");
    const polled = await ipcCall<{ input: string[] }>(sock, nonce, "agy-poll-input", { sessionId: reg.sessionId });
    expect(polled.input).toEqual(["Q"]);

    await ipcCall(sock, nonce, "agy-unregister", { sessionId: reg.sessionId });
    expect(sessions.get(reg.sessionId)?.status).toBe("stopped");
  });
});
```

- [ ] **C.2 Run to verify failure**: `pnpm test agy-ipc-wire` → FAIL (methods + dep missing).

- [ ] **C.3 Implement** — extend `WireDeps` and register methods:

```ts
// src/server/ipc/wire.ts — add to imports:
import type { AgyWrapperAdapter } from "../adapters/agy/wrapper.js";

// extend WireDeps:
interface WireDeps {
  wrapper: AntigravityWrapperAdapter;
  agyWrapper: AgyWrapperAdapter;
  reservePort: () => Promise<number>;
  releasePort: (port: number) => void;
}

// inside startIpcServer, after the existing registrations:
  server.register("agy-register", async (params) => {
    const args: { pid?: number; projectPath?: string } = {};
    if (typeof params.pid === "number") args.pid = params.pid;
    if (typeof params.projectPath === "string") args.projectPath = params.projectPath;
    const session = deps.agyWrapper.register(args);
    return { sessionId: session.sessionId };
  });

  server.register("agy-output", async (params) => {
    const sessionId = String(params.sessionId);
    const chunk = typeof params.chunk === "string" ? params.chunk : "";
    deps.agyWrapper.receiveOutput(sessionId, chunk);
    return { ok: true };
  });

  server.register("agy-poll-input", async (params) => {
    const sessionId = String(params.sessionId);
    return { input: deps.agyWrapper.pollInput(sessionId) };
  });

  server.register("agy-unregister", async (params) => {
    const sessionId = String(params.sessionId);
    deps.agyWrapper.unregister(sessionId);
    return { ok: true };
  });
```

- [ ] **C.4 Verify**: `pnpm test agy-ipc-wire && pnpm typecheck` → PASS. (Assembly call site updates in Task E.)
- [ ] **C.5 Commit**: `feat(agy): add agy-wrapper IPC bridge methods`.

---

## Task D — Re-add the `agy` wrapper CLI with the PTY bridge

The wrapper owns a real PTY, mirrors it to the user's terminal, forwards output to the server, and polls queued input. Dependencies are injected so the wiring is unit-testable without a TTY.

**Files:** Create `src/cli/agy.ts`, `tests/agy-wrapper-cli.test.ts`. Modify `src/cli/index.ts`.

- [ ] **D.1 Write failing test** (drives the bridge with fakes; no real TTY)

```ts
// tests/agy-wrapper-cli.test.ts
import { describe, expect, it, vi } from "vitest";
import { runAgyWrapper } from "../src/cli/agy.js";
import type { PtyHandle } from "../src/server/pty/pty.js";

function fakePty() {
  const data = new Set<(c: string) => void>();
  const exits = new Set<(i: { exitCode: number }) => void>();
  const writes: string[] = [];
  const handle: PtyHandle = {
    pid: 555, alive: () => true,
    write: (c) => { writes.push(c); },
    resize: vi.fn(), kill: vi.fn(),
    onData: (h) => { data.add(h); return () => data.delete(h); },
    onExit: (h) => { exits.add(h); return () => exits.delete(h); },
  };
  return { handle, writes, emit: (c: string) => data.forEach((h) => h(c)), exit: () => exits.forEach((h) => h({ exitCode: 0 })) };
}

describe("runAgyWrapper", () => {
  it("registers, mirrors output to the terminal + server, and writes polled input", async () => {
    const pty = fakePty();
    const out: string[] = [];
    const ipcCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
    let pollQueue: string[] = ["from-ui\r"];

    const ipcCall = vi.fn(async (_sock: string, _nonce: string, method: string, params: Record<string, unknown> = {}) => {
      ipcCalls.push({ method, params });
      if (method === "agy-register") return { sessionId: "sess-1" };
      if (method === "agy-poll-input") { const q = pollQueue; pollQueue = []; return { input: q }; }
      return { ok: true };
    });

    const handle = await runAgyWrapper({
      project: "/proj",
      deps: {
        nonce: "n", sockPath: "/sock",
        spawn: () => pty.handle,
        ipcCall: ipcCall as never,
        stdout: { write: (s: string) => { out.push(s); return true; } },
        stdin: { setRawMode: vi.fn(), resume: vi.fn(), pause: vi.fn(), on: vi.fn() } as never,
        pollMs: 5,
      },
    });

    // server told us our session id
    expect(ipcCalls[0]!.method).toBe("agy-register");
    expect(ipcCalls[0]!.params).toMatchObject({ projectPath: "/proj", pid: 555 });

    // agy output is mirrored to the terminal AND forwarded to the server
    pty.emit("AGY-OUT");
    expect(out.join("")).toContain("AGY-OUT");
    expect(ipcCalls.some((c) => c.method === "agy-output" && c.params.chunk === "AGY-OUT")).toBe(true);

    // one poll cycle drains queued UI input into the pty
    await new Promise((r) => setTimeout(r, 20));
    expect(pty.writes).toContain("from-ui\r");

    await handle.shutdown();
    expect(ipcCalls.some((c) => c.method === "agy-unregister")).toBe(true);
  });
});
```

- [ ] **D.2 Run to verify failure**: `pnpm test agy-wrapper-cli` → FAIL.

- [ ] **D.3 Implement**

```ts
// src/cli/agy.ts
import { resolve } from "node:path";
import { spawnPty, type PtyHandle, type SpawnPtyOpts } from "../server/pty/pty.js";
import { ipcCall as realIpcCall } from "../server/ipc/client.js";
import { loadIpcNonce, ipcSocketPath } from "../server/ipc/nonce.js";
import { loadConfig } from "../server/core/config.js";
import { configFile } from "./paths.js";

interface WritableLike { write(s: string): boolean }
interface StdinLike {
  setRawMode?(mode: boolean): void;
  resume(): void;
  pause(): void;
  on(ev: "data", cb: (d: Buffer) => void): void;
}

export interface AgyWrapperDeps {
  nonce: string;
  sockPath: string;
  spawn: (opts: SpawnPtyOpts) => PtyHandle;
  ipcCall: typeof realIpcCall;
  stdout: WritableLike;
  stdin: StdinLike;
  pollMs: number;
}

export interface AgyWrapperHandle {
  shutdown: () => Promise<void>;
}

/**
 * `agent-remote-control agy <project>` — runs agy in a PTY in the user's
 * terminal, mirrors output to both the terminal and the server (IPC), and
 * polls the server for UI-queued input. No CDP. Session is owned:false.
 */
export async function runAgyWrapper(args: {
  project: string;
  command?: string;
  deps: AgyWrapperDeps;
}): Promise<AgyWrapperHandle> {
  const { deps } = args;
  const projectPath = resolve(args.project);
  const command = args.command ?? "agy";

  const handle = deps.spawn({ command, args: ["--add-dir", projectPath], cwd: projectPath });

  const { sessionId } = await deps.ipcCall<{ sessionId: string }>(
    deps.sockPath, deps.nonce, "agy-register", { pid: handle.pid, projectPath },
  );

  handle.onData((chunk) => {
    deps.stdout.write(chunk);
    void deps.ipcCall(deps.sockPath, deps.nonce, "agy-output", { sessionId, chunk }).catch(() => {});
  });

  deps.stdin.setRawMode?.(true);
  deps.stdin.resume();
  deps.stdin.on("data", (d) => handle.write(d.toString("utf8")));

  const timer = setInterval(() => {
    void deps.ipcCall<{ input: string[] }>(deps.sockPath, deps.nonce, "agy-poll-input", { sessionId })
      .then((r) => { for (const i of r.input) handle.write(i); })
      .catch(() => {});
  }, deps.pollMs);

  let stopped = false;
  const shutdown = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    deps.stdin.setRawMode?.(false);
    deps.stdin.pause();
    await deps.ipcCall(deps.sockPath, deps.nonce, "agy-unregister", { sessionId }).catch(() => {});
  };

  handle.onExit(() => { void shutdown(); });
  return { shutdown };
}

/** Production entry: builds real deps and blocks until agy exits. */
export async function runAgyWrapperCli(project: string): Promise<void> {
  const nonce = await loadIpcNonce();
  if (!nonce) {
    process.stderr.write("error: IPC nonce not found. Run `agent-remote-control install` and start the service first.\n");
    process.exit(2);
    return;
  }
  const config = await loadConfig(configFile());
  await runAgyWrapper({
    project,
    command: config.providers.agy.command,
    deps: {
      nonce,
      sockPath: ipcSocketPath(),
      spawn: spawnPty,
      ipcCall: realIpcCall,
      stdout: process.stdout,
      stdin: process.stdin,
      pollMs: 150,
    },
  });
  // Keep the process alive; runAgyWrapper exits via handle.onExit → process stays
  // attached through the PTY's own stdio lifecycle.
}
```

- [ ] **D.4 Re-add the CLI command** in `src/cli/index.ts` (import `runAgyWrapperCli`, add before the antigravity command):

```ts
  program
    .command("agy <project>")
    .description("Run agy for <project> in this terminal and mirror it to the local server")
    .action(async (project: string) => {
      await runAgyWrapperCli(project);
    });
```

- [ ] **D.5 Verify**: `pnpm test agy-wrapper-cli && pnpm typecheck` → PASS.
- [ ] **D.6 Commit**: `feat(agy): re-add agy wrapper CLI with IPC PTY bridge`.

---

## Task E — Wire the dispatcher + wrapper into assembly

**Files:** Modify `src/server/assembly.ts`, `src/server/http/domain.ts`, `src/server/http/adapter-routes.ts`.

- [ ] **E.1 assembly.ts**
  - Import `AgyAdapter` from `./adapters/agy/index.js` and `AgyWrapperAdapter` from `./adapters/agy/wrapper.js`. Keep the `AgyPtyAdapter` import.
  - Rename the local pty var: `const agyPty = new AgyPtyAdapter({...});` (same opts as today, including `overrides.agySpawn`).
  - `const agyWrapper = new AgyWrapperAdapter({ sessions: agentSessions, bus, scrollback: config.providers.agy.scrollback, conversationsDir: config.providers.agy.conversationsDir });`
  - `const agy = new AgyAdapter({ pty: agyPty, wrapper: agyWrapper });`
  - `AssembledDeps.agy` type → `AgyAdapter`; also add `agyWrapper: AgyWrapperAdapter`.
  - Pass `agyWrapper` into `startIpcServer({ wrapper, agyWrapper, reservePort, releasePort })`.
  - `deps` object: `agy` (dispatcher) + `agyWrapper`.
  - `shutdown`: replace `await agy.shutdown()` — the dispatcher's `shutdown()` already covers both surfaces.

- [ ] **E.2 domain.ts**: change the `agy` import/type to `AgyAdapter` (`import { AgyAdapter } from "../adapters/agy/index.js"`), `DomainDeps.agy: AgyAdapter`. The `registerAdapterRoutes(... agy: deps.agy ...)` call is unchanged.

- [ ] **E.3 adapter-routes.ts**: change the type import to `AgyAdapter` (`import type { AgyAdapter } from "../adapters/agy/index.js"`), `Deps.agy: AgyAdapter`. `getAdapter` already returns `deps.agy` for `"agy"` — unchanged.

- [ ] **E.4 Verify**: `pnpm test && pnpm typecheck && pnpm build` → PASS. Existing `tests/agy-assembly.test.ts` still passes (dispatcher `.start()` delegates to pty; `.providerId === "agy"`).
- [ ] **E.5 Commit**: `feat(agy): wire wrapper surface + dispatcher into assembly`.

---

## Verification & manual check

- Unit + typecheck + build green after Task E.
- e2e: the existing `agy-provider.spec.ts` (agy-pty) keeps passing.
- **Manual (needs a real TTY, cannot be automated here):** with the service running, run `agent-remote-control agy <project>` in a terminal; in the web UI select `agy`, the wrapper session should appear and mirror; sending input from the UI should reach the terminal session within ~150ms. Document the result.

## Self-Review

- **Two surfaces, one seam:** dispatcher routes by `session.source` (Task B); both surfaces share snapshot/actions/conversations modules.
- **No CDP / no debugPort:** wrapper registers via `agy-register` (Task C); CLI forwards PTY chunks + polls input (Task D).
- **Ownership:** wrapper sessions are `owned:false`; `stop` is `unsupported`; `dispose`/`unregister` never kill (H15).
- **Type consistency:** `deps.agy` becomes `AgyAdapter` everywhere (assembly, domain, adapter-routes). `AgyWrapperAdapter` and `AgyPtyAdapter` both satisfy the dispatcher's `AgySessionOps`.
- **Out of scope:** streaming IPC, wrapper `selectConversation`, an agy-wrapper e2e (needs a TTY).
