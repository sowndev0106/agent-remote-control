# `agy` Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `agy` provider for the Antigravity Go CLI so the phone UI can launch, mirror, control, approve, list conversations, resume, and stop owned `agy` TUI sessions without changing Antigravity IDE behaviour.

**Architecture:** `agy` becomes a separate provider ID next to `antigravity`, with an `AgyAdapter` composition root that implements `IProviderAdapter` and routes to source-specific internals: `agy-pty`, `agy-wrapper`, and `agy-unmanaged`. PTY output is captured through `node-pty`, rendered through `@xterm/headless`, hashed, and broadcast only on hash changes. Wrapper-launched `agy` sessions are controllable by adding an IPC PTY bridge: the wrapper owns the user's terminal-facing PTY, forwards PTY chunks to the server, and polls queued server input, because PID-only registration cannot provide mirror or input control.

**Tech Stack:** TypeScript ESM + NodeNext + strict, Fastify, `ws`, `node-pty`, `@xterm/headless`, Vitest, Playwright, React 18 + Zustand + Tailwind.

---

## Pre-flight

- **Spec input:** `docs/superpowers/specs/2026-05-28-agy-provider-design.md`.
- **Required baseline:** start after `docs/superpowers/plans/2026-05-28-discoverable-seam.md` lands. This plan assumes `SessionDiscoveryAggregator` already accepts `Discoverable[]`.
- **Branch:** use `agy-provider` from the integration branch after current in-flight `discoverable-seam` work is merged or parked.
- **Do not rename** `docs/REQUIEMENT.md`.
- **Hard rules:** preserve H3, H5, H7, H8, H9, H10, H11, H13, H14, H15, H17 from `AGENTS.md`.
- **Dependency note:** use `@xterm/headless`, imported as `import { Terminal } from "@xterm/headless";`. The npm package documents this import path even though its README text also mentions the historical `xterm-headless` name.
- **Wrapper reality check:** `wrap-agy` cannot be "full control" if it only sends `{ pid, cwd }`. The wrapper must proxy PTY output and server input over IPC. This plan implements that while keeping the public CLI names required by the spec.

Baseline commands:

```bash
git checkout main
git pull --ff-only
git checkout -b agy-provider
pnpm install
pnpm test
pnpm test:e2e
pnpm build
```

Expected baseline: all commands pass before implementation. If the current branch is dirty, do not move or revert unrelated work; create the feature branch only after the dirty work is resolved.

---

## File Structure

```text
package.json                         — add @xterm/headless
pnpm-lock.yaml                       — dependency lock update

src/server/domains/types.ts          — add provider/source/marker/types
src/server/core/config.ts            — add providers.agy config block
src/server/domains/providers.ts      — register agy enabled + slash commands
src/server/domains/recommendations.ts — detect .antigravitycli/
src/server/domains/discovery.ts      — optional provider filter
src/server/adapters/IProviderAdapter.ts — add getStatus capability if still missing in CAPABILITY_KEYS

src/server/adapters/agy/
  index.ts                           — AgyAdapter implements IProviderAdapter
  detect.ts                          — which/version/help parsing
  pty.ts                             — app-launched node-pty child
  wrapper.ts                         — wrapper IPC bridge session registry
  unmanaged.ts                       — /proc detector for uncontrolled agy
  conversations.ts                   — protobuf best-effort reader
  snapshot.ts                        — @xterm/headless buffer + html/text/hash
  actions.ts                         — fixed shortcuts + approval detection

src/server/ipc/wire.ts               — provider-aware register-session + agy bridge methods
src/cli/antigravity.ts               — split wrap-antigravity and wrap-agy
src/cli/index.ts                     — CLI commands and aliases
src/server/assembly.ts               — instantiate agy adapter and discovery sources
src/server/http/domain.ts            — route deps include agy
src/server/http/adapter-routes.ts    — provider dispatch + /input and /action aliases

src/web/stores/types.ts              — add agy provider and conversation types
src/web/stores/providers.ts          — expose slash commands from provider info
src/web/stores/sessions.ts           — input/action/conversation methods
src/web/components/ProviderSelector.tsx — show agy enabled
src/web/components/SessionDiscoveryList.tsx — agy labels and launch selected provider
src/web/components/ActionPanel.tsx   — fixed shortcuts + conversations
src/web/components/MirrorTimeline.tsx — provider-neutral iframe title
src/web/components/SlashCommandPalette.tsx — merge agy commands
src/web/components/Workspace.tsx     — pass selected provider into discovery/list

tests/agy-detect.test.ts
tests/agy-actions.test.ts
tests/agy-snapshot.test.ts
tests/agy-conversations.test.ts
tests/agy-pty-adapter.test.ts
tests/agy-wrapper-adapter.test.ts
tests/agy-unmanaged.test.ts
tests/agy-discovery-integration.test.ts
tests/agy-http.test.ts
tests/config.test.ts                 — extend defaults/merge expectations
tests/providers.test.ts              — expect five providers
tests/recommendation.test.ts         — .antigravitycli marker
tests/contract-audit.test.ts         — agy raw keystroke audit
tests/web/*.test.tsx                 — provider selector, action panel, slash palette

e2e/fixtures/agy-stub.ts             — executable stub binary
e2e/fixtures/server.ts               — optional PATH/config overrides for agy tests
e2e/agy-provider.spec.ts             — 11 required scenarios
```

---

## Task 1 — Provider, Source, Config, and Marker Types

Add the static shapes first. This should fail at compile/test level before implementation exists.

**Files:**
- Modify: `src/server/domains/types.ts`
- Modify: `src/web/stores/types.ts`
- Modify: `src/server/core/config.ts`
- Modify: `src/server/domains/providers.ts`
- Modify: `src/server/domains/recommendations.ts`
- Modify: `tests/config.test.ts`
- Modify: `tests/providers.test.ts`
- Modify: `tests/recommendation.test.ts`

- [ ] **Step 1.1: Write failing provider/config/marker tests**

Add these expectations to existing tests:

```ts
// tests/providers.test.ts
expect(ids).toEqual(["agy", "antigravity", "claude", "codex", "opencode"]);
const agy = reg.get("agy")!;
expect(agy.displayName).toBe("agy");
expect(agy.enabled).toBe(true);
expect(agy.capabilities.launch).toBe("unknown");
expect(agy.note).toMatch(/Antigravity CLI/i);
```

```ts
// tests/config.test.ts
it("includes agy provider defaults", () => {
  const cfg = defaultConfig();
  expect(cfg.providers.agy).toMatchObject({
    enabled: true,
    command: "agy",
    wrapperCommands: ["agy"],
    controlSurfaces: ["agy-pty", "agy-wrapper"],
    snapshotPollMs: 500,
    scrollback: 4000,
    conversationsDir: "~/.gemini/antigravity-cli/conversations",
  });
});
```

```ts
// tests/recommendation.test.ts
it("detects .antigravitycli directory", async () => {
  await mkdir(join(dir, ".antigravitycli"));
  const r = await detectRecommendations(dir);
  expect(r.map((m) => m.marker)).toContain(".antigravitycli/");
});
```

- [ ] **Step 1.2: Run tests to verify failure**

Run: `pnpm test providers config recommendation`
Expected: FAIL because `agy` types/defaults/marker do not exist.

- [ ] **Step 1.3: Update shared server types**

Change provider/source/marker unions:

```ts
// src/server/domains/types.ts
export type ProviderId = "antigravity" | "agy" | "claude" | "codex" | "opencode";

export const CAPABILITY_KEYS = [
  "launch",
  "attach",
  "stop",
  "sendPrompt",
  "sendInput",
  "listConversations",
  "selectConversation",
  "getSnapshot",
  "getStatus",
  "getActions",
  "performAction",
  "dispose",
] as const;

export type SourceType =
  | "cdp"
  | "managed-pty"
  | "wrapper"
  | "tmux"
  | "screen"
  | "unmanaged"
  | "agy-pty"
  | "agy-wrapper"
  | "agy-unmanaged";

export interface RecommendationMarker {
  marker:
    | ".git"
    | "AGENTS.md"
    | "GEMINI.md"
    | ".agents/"
    | ".opencode/"
    | ".claude/"
    | ".codex/"
    | ".antigravitycli/";
}

export interface SlashCommandDescriptor {
  id: string;
  label: string;
  command: string;
  enabled: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  displayName: string;
  enabled: boolean;
  available: boolean;
  status: "future" | "unavailable" | "ready";
  capabilities: CapabilityMap;
  note?: string;
  slashCommands?: SlashCommandDescriptor[];
}
```

- [ ] **Step 1.4: Update frontend mirror types**

Mirror the provider and capability keys:

```ts
// src/web/stores/types.ts
export type ProviderId = "antigravity" | "agy" | "claude" | "codex" | "opencode";

export interface CapabilityMap {
  launch: Capability;
  attach: Capability;
  stop: Capability;
  sendPrompt: Capability;
  sendInput: Capability;
  listConversations: Capability;
  selectConversation: Capability;
  getSnapshot: Capability;
  getStatus: Capability;
  getActions: Capability;
  performAction: Capability;
  dispose: Capability;
}

export interface SlashCommandDescriptor {
  id: string;
  label: string;
  command: string;
  enabled: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  displayName: string;
  enabled: boolean;
  available: boolean;
  status: "future" | "unavailable" | "ready";
  capabilities: CapabilityMap;
  note?: string;
  slashCommands?: SlashCommandDescriptor[];
}

export interface ConversationDescriptor {
  conversationId: string;
  title: string;
  startedAt?: number;
  projectPath?: string;
}
```

- [ ] **Step 1.5: Update config defaults and merge**

Extend `AppConfig.providers`:

```ts
providers: {
  antigravity: {
    enabled: boolean;
    adapter: string;
    command: string;
    wrapperCommands: string[];
    controlSurfaces: string[];
    debugPort: number;
    debugPortRange: number[];
    launchTimeoutMs: number;
    snapshotPollMs: number;
    tmuxTargets: TmuxScreenTarget[];
    screenTargets: TmuxScreenTarget[];
  };
  agy: {
    enabled: boolean;
    command: string;
    wrapperCommands: string[];
    controlSurfaces: string[];
    snapshotPollMs: number;
    scrollback: number;
    conversationsDir: string;
  };
};
```

Add defaults:

```ts
agy: {
  enabled: true,
  command: "agy",
  wrapperCommands: ["agy"],
  controlSurfaces: ["agy-pty", "agy-wrapper"],
  snapshotPollMs: 500,
  scrollback: 4000,
  conversationsDir: "~/.gemini/antigravity-cli/conversations",
},
```

Merge with defaults:

```ts
providers: {
  antigravity: {
    ...d.providers.antigravity,
    ...((loaded.providers ?? {}).antigravity ?? {}),
  },
  agy: {
    ...d.providers.agy,
    ...((loaded.providers ?? {}).agy ?? {}),
  },
},
```

- [ ] **Step 1.6: Register agy provider**

Add `agy` before future providers:

```ts
this.set({
  id: "agy",
  displayName: "agy",
  enabled: true,
  available: false,
  status: "unavailable",
  capabilities: allUnknownCapabilities(),
  note: "Antigravity CLI adapter not yet probed.",
  slashCommands: [],
});
```

Update `displayNameFor`:

```ts
case "agy":
  return "agy";
```

- [ ] **Step 1.7: Add `.antigravitycli/` marker**

```ts
const MARKERS: { name: RecommendationMarker["marker"]; isDir: boolean }[] = [
  { name: ".git", isDir: true },
  { name: "AGENTS.md", isDir: false },
  { name: "GEMINI.md", isDir: false },
  { name: ".agents/", isDir: true },
  { name: ".opencode/", isDir: true },
  { name: ".claude/", isDir: true },
  { name: ".codex/", isDir: true },
  { name: ".antigravitycli/", isDir: true },
];
```

- [ ] **Step 1.8: Verify**

Run: `pnpm test providers config recommendation && pnpm build:server`
Expected: PASS.

- [ ] **Step 1.9: Commit**

```bash
git add src/server/domains/types.ts src/web/stores/types.ts src/server/core/config.ts src/server/domains/providers.ts src/server/domains/recommendations.ts tests/providers.test.ts tests/config.test.ts tests/recommendation.test.ts
git commit -m "feat(providers): add agy provider types and defaults"
```

---

## Task 2 — `agy` Detection and Slash Command Parsing

Detect whether `agy` exists, parse version loosely, and parse help output into slash commands.

**Files:**
- Create: `src/server/adapters/agy/detect.ts`
- Create: `tests/agy-detect.test.ts`

- [ ] **Step 2.1: Write failing tests**

```ts
// tests/agy-detect.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  detectAgy,
  parseAgyHelp,
  parseAgyVersion,
} from "../src/server/adapters/agy/detect.js";

describe("agy detection", () => {
  it("parses loose version output", () => {
    expect(parseAgyVersion("agy version 0.4.1\n")).toBe("0.4.1");
    expect(parseAgyVersion("Antigravity CLI 2026.05.28")).toBe("2026.05.28");
    expect(parseAgyVersion("weird")).toBeUndefined();
  });

  it("parses slash commands from help output", () => {
    const out = parseAgyHelp(`
Commands:
  /help      Show help
  /resume   Resume a conversation
  /clear     Clear screen
`);
    expect(out.map((c) => c.command)).toEqual(["/help", "/resume", "/clear"]);
    expect(out[0]).toMatchObject({ id: "agy.help", label: "/help", enabled: true });
  });

  it("reports unavailable when which fails", async () => {
    const exec = vi.fn(async () => ({ code: 1, stdout: "", stderr: "" }));
    const result = await detectAgy({ command: "agy", exec });
    expect(result.available).toBe(false);
    expect(result.errorCode).toBe("agy_not_installed");
    expect(result.capabilities.launch).toBe("unsupported");
  });

  it("reports available with parsed version and commands", async () => {
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === "which") return { code: 0, stdout: "/usr/bin/agy\n", stderr: "" };
      if (args.includes("--version")) return { code: 0, stdout: "agy 0.4.1\n", stderr: "" };
      if (args.includes("--help")) return { code: 0, stdout: "/help Help\n/resume Resume\n", stderr: "" };
      return { code: 1, stdout: "", stderr: "unexpected" };
    });
    const result = await detectAgy({ command: "agy", exec });
    expect(result.available).toBe(true);
    expect(result.version).toBe("0.4.1");
    expect(result.slashCommands.map((c) => c.command)).toEqual(["/help", "/resume"]);
    expect(result.capabilities.launch).toBe("supported");
  });
});
```

- [ ] **Step 2.2: Run to verify failure**

Run: `pnpm test agy-detect`
Expected: FAIL because module does not exist.

- [ ] **Step 2.3: Implement detection**

```ts
// src/server/adapters/agy/detect.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  allUnsupportedCapabilities,
  allUnknownCapabilities,
  type CapabilityKey,
  type CapabilityMap,
  type SlashCommandDescriptor,
} from "../../domains/types.js";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type ExecFn = (cmd: string, args: string[]) => Promise<ExecResult>;

export interface AgyDetectResult {
  available: boolean;
  capabilities: CapabilityMap;
  note?: string;
  version?: string;
  slashCommands: SlashCommandDescriptor[];
  errorCode?: "agy_not_installed";
}

const supportedKeys: CapabilityKey[] = [
  "launch",
  "attach",
  "sendPrompt",
  "sendInput",
  "listConversations",
  "selectConversation",
  "getSnapshot",
  "getStatus",
  "getActions",
  "performAction",
  "dispose",
];

export function agySupportedCapabilities(): CapabilityMap {
  const c = allUnknownCapabilities();
  for (const k of supportedKeys) c[k] = "supported";
  c.stop = "supported";
  return c;
}

export function agyUnavailableCapabilities(): CapabilityMap {
  return allUnsupportedCapabilities();
}

export function parseAgyVersion(output: string): string | undefined {
  const m = output.match(/(\d+(?:\.\d+){1,3})/);
  return m?.[1];
}

export function parseAgyHelp(output: string): SlashCommandDescriptor[] {
  const seen = new Set<string>();
  const out: SlashCommandDescriptor[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/(^|\s)(\/[a-z][a-z0-9_-]*)\b/i);
    if (!m) continue;
    const command = m[2]!;
    if (seen.has(command)) continue;
    seen.add(command);
    out.push({
      id: `agy.${command.slice(1).replaceAll("-", "_")}`,
      label: command,
      command,
      enabled: true,
    });
  }
  return out;
}

export async function defaultExec(cmd: string, args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      encoding: "utf8",
      timeout: 5_000,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

export async function detectAgy(args: {
  command: string;
  exec?: ExecFn;
}): Promise<AgyDetectResult> {
  const exec = args.exec ?? defaultExec;
  const which = await exec("which", [args.command]);
  if (which.code !== 0 || !which.stdout.trim()) {
    return {
      available: false,
      capabilities: agyUnavailableCapabilities(),
      slashCommands: [],
      errorCode: "agy_not_installed",
      note: "`agy` was not found on PATH.",
    };
  }

  const versionOut = await exec(args.command, ["--version"]);
  const helpOut = await exec(args.command, ["--help"]);
  return {
    available: true,
    capabilities: agySupportedCapabilities(),
    version: parseAgyVersion(versionOut.stdout || versionOut.stderr),
    slashCommands: parseAgyHelp(helpOut.stdout || helpOut.stderr),
    note: "`agy` CLI is available.",
  };
}
```

- [ ] **Step 2.4: Verify**

Run: `pnpm test agy-detect && pnpm build:server`
Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/server/adapters/agy/detect.ts tests/agy-detect.test.ts
git commit -m "feat(agy): detect CLI availability"
```

---

## Task 3 — Actions: Fixed Shortcuts and Approval Detection

Action IDs are server-issued. The frontend will only ever send IDs returned by this module.

**Files:**
- Create: `src/server/adapters/agy/actions.ts`
- Create: `tests/agy-actions.test.ts`

- [ ] **Step 3.1: Write failing tests**

```ts
// tests/agy-actions.test.ts
import { describe, expect, it } from "vitest";
import {
  AGY_FIXED_ACTIONS,
  detectApprovalActions,
  getAgyActions,
  inputForAgyAction,
} from "../src/server/adapters/agy/actions.js";

describe("agy actions", () => {
  it("returns fixed shortcut actions when running", () => {
    const actions = getAgyActions({ running: true, text: "" });
    expect(actions.map((a) => a.actionId)).toContain("agy.send");
    expect(actions.map((a) => a.actionId)).toContain("agy.ctrl_c");
    expect(actions.every((a) => a.enabled)).toBe(true);
  });

  it("disables fixed actions when not running", () => {
    const actions = getAgyActions({ running: false, text: "" });
    expect(actions.find((a) => a.actionId === "agy.send")?.enabled).toBe(false);
  });

  it.each([
    ["[Y/n]", ["agy.approve"]],
    [" [y/N] ", ["agy.approve"]],
    ["Approve? (y/n)", ["agy.approve"]],
    ["Press y to approve", ["agy.approve"]],
    ["(a)pprove (d)eny", ["agy.approve", "agy.deny"]],
    ["ordinary output", []],
    ["y/n appears inside a sentence", []],
    ["Approve all? maybe later", []],
  ])("detects approvals in %j", (line, ids) => {
    expect(detectApprovalActions(line).map((a) => a.actionId)).toEqual(ids);
  });

  it("maps action IDs to server-side inputs", () => {
    expect(inputForAgyAction("agy.send")).toBe("\r");
    expect(inputForAgyAction("agy.cancel")).toBe("\x1b");
    expect(inputForAgyAction("agy.approve")).toBe("y\n");
    expect(inputForAgyAction("agy.deny")).toBe("n\n");
    expect(inputForAgyAction("not.real")).toBeUndefined();
  });

  it("keeps every fixed action under the agy namespace", () => {
    expect(AGY_FIXED_ACTIONS.every((a) => a.actionId.startsWith("agy."))).toBe(true);
  });
});
```

- [ ] **Step 3.2: Run to verify failure**

Run: `pnpm test agy-actions`
Expected: FAIL because module does not exist.

- [ ] **Step 3.3: Implement action catalog**

```ts
// src/server/adapters/agy/actions.ts
import type { ActionDescriptor } from "../IProviderAdapter.js";

interface AgyAction extends ActionDescriptor {
  input: string;
}

export const AGY_FIXED_ACTIONS: AgyAction[] = [
  { actionId: "agy.send", label: "Send", kind: "button", enabled: true, input: "\r" },
  { actionId: "agy.cancel", label: "Cancel / Esc", kind: "button", enabled: true, input: "\x1b" },
  { actionId: "agy.up", label: "Up", kind: "button", enabled: true, input: "\x1b[A" },
  { actionId: "agy.down", label: "Down", kind: "button", enabled: true, input: "\x1b[B" },
  { actionId: "agy.right", label: "Right", kind: "button", enabled: true, input: "\x1b[C" },
  { actionId: "agy.left", label: "Left", kind: "button", enabled: true, input: "\x1b[D" },
  { actionId: "agy.tab", label: "Tab", kind: "button", enabled: true, input: "\t" },
  { actionId: "agy.ctrl_c", label: "Ctrl-C", kind: "button", enabled: true, input: "\x03" },
  { actionId: "agy.slash", label: "Slash", kind: "button", enabled: true, input: "/" },
];

const APPROVE_ONLY: RegExp[] = [
  /^\s*\[[Yy]\/[Nn]\]\s*$/,
  /\[[Yy]\/[Nn]\]/,
  /^\s*Approve\??\s*\([Yy]\/[Nn]\)\s*$/,
  /Press y to approve/i,
];

const APPROVE_DENY = /\(a\)pprove\s*\(d\)eny/i;

export function detectApprovalActions(text: string): ActionDescriptor[] {
  const lastLines = text.split(/\r?\n/).slice(-30).join("\n");
  if (APPROVE_DENY.test(lastLines)) {
    return [
      { actionId: "agy.approve", label: "Approve", kind: "approval", enabled: true },
      { actionId: "agy.deny", label: "Deny", kind: "approval", enabled: true },
    ];
  }
  if (APPROVE_ONLY.some((r) => r.test(lastLines))) {
    return [
      { actionId: "agy.approve", label: "Approve", kind: "approval", enabled: true },
    ];
  }
  return [];
}

export function getAgyActions(args: {
  running: boolean;
  text: string;
}): ActionDescriptor[] {
  const fixed = AGY_FIXED_ACTIONS.map(({ input: _input, ...a }) => ({
    ...a,
    enabled: args.running,
  }));
  const approvals = detectApprovalActions(args.text).map((a) => ({
    ...a,
    enabled: args.running,
  }));
  return [...fixed, ...approvals];
}

export function inputForAgyAction(actionId: string): string | undefined {
  if (actionId === "agy.approve") return "y\n";
  if (actionId === "agy.deny") return "n\n";
  return AGY_FIXED_ACTIONS.find((a) => a.actionId === actionId)?.input;
}
```

- [ ] **Step 3.4: Verify**

Run: `pnpm test agy-actions && pnpm build:server`
Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/server/adapters/agy/actions.ts tests/agy-actions.test.ts
git commit -m "feat(agy): add server-issued TUI actions"
```

---

## Task 4 — Headless Snapshot Buffer

Add `@xterm/headless`, feed PTY chunks into a bounded terminal buffer, serialize visible lines + scrollback, and emit sanitized iframe HTML.

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/server/adapters/agy/snapshot.ts`
- Create: `tests/agy-snapshot.test.ts`

- [ ] **Step 4.1: Add dependency**

Run:

```bash
pnpm add @xterm/headless
```

Expected: `package.json` contains `@xterm/headless` and the lockfile updates.

- [ ] **Step 4.2: Write failing snapshot tests**

```ts
// tests/agy-snapshot.test.ts
import { describe, expect, it } from "vitest";
import { AgySnapshotBuffer } from "../src/server/adapters/agy/snapshot.js";

describe("AgySnapshotBuffer", () => {
  it("captures text, html, timestamp, and a stable hash", () => {
    const buffer = new AgySnapshotBuffer({ cols: 40, rows: 6, scrollback: 100 });
    buffer.write("hello \x1b[31mred\x1b[0m\nnext");
    const a = buffer.snapshot();
    const b = buffer.snapshot();
    expect(a.text).toContain("hello red");
    expect(a.text).toContain("next");
    expect(a.html).toContain("hello");
    expect(a.html).not.toContain("<script");
    expect(a.hash).toBe(b.hash);
    expect(a.capturedAt).toBeGreaterThan(0);
  });

  it("changes hash when new output arrives", () => {
    const buffer = new AgySnapshotBuffer({ cols: 20, rows: 4, scrollback: 100 });
    buffer.write("before");
    const before = buffer.snapshot().hash;
    buffer.write("\nafter");
    expect(buffer.snapshot().hash).not.toBe(before);
  });

  it("escapes TUI text in html", () => {
    const buffer = new AgySnapshotBuffer({ cols: 20, rows: 4, scrollback: 100 });
    buffer.write("<img src=x onerror=alert(1)>");
    const snap = buffer.snapshot();
    expect(snap.text).toContain("<img");
    expect(snap.html).toContain("&lt;img");
    expect(snap.html).not.toContain("onerror=");
  });
});
```

- [ ] **Step 4.3: Run to verify failure**

Run: `pnpm test agy-snapshot`
Expected: FAIL because module does not exist.

- [ ] **Step 4.4: Implement snapshot buffer**

```ts
// src/server/adapters/agy/snapshot.ts
import { createHash } from "node:crypto";
import { Terminal } from "@xterm/headless";
import { escapeForAppDom } from "../antigravity/sanitize.js";
import type { SnapshotPayload } from "../IProviderAdapter.js";

export interface AgySnapshotBufferOpts {
  cols?: number;
  rows?: number;
  scrollback: number;
}

export class AgySnapshotBuffer {
  private readonly term: Terminal;

  constructor(opts: AgySnapshotBufferOpts) {
    this.term = new Terminal({
      cols: opts.cols ?? 100,
      rows: opts.rows ?? 30,
      scrollback: opts.scrollback,
      allowProposedApi: true,
    });
  }

  write(chunk: string): void {
    this.term.write(chunk);
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows);
  }

  snapshot(): SnapshotPayload {
    const text = this.serializeText();
    const html = this.renderHtml(text);
    return {
      hash: createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16),
      capturedAt: Date.now(),
      text,
      html,
    };
  }

  private serializeText(): string {
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i += 1) {
      const line = buffer.getLine(i);
      if (!line) continue;
      lines.push(line.translateToString(true));
    }
    return lines.join("\n").replace(/\s+$/u, "");
  }

  private renderHtml(text: string): string {
    const escaped = escapeForAppDom(text);
    return `<pre class="agy-terminal" data-provider="agy">${escaped}</pre>`;
  }
}
```

- [ ] **Step 4.5: Verify**

Run: `pnpm test agy-snapshot && pnpm build:server`
Expected: PASS. If `Terminal.write` is asynchronous in the installed version, wrap writes in a `writeSync` helper using the parser API or adjust tests to await a microtask, then document that in this plan before continuing.

- [ ] **Step 4.6: Commit**

```bash
git add package.json pnpm-lock.yaml src/server/adapters/agy/snapshot.ts tests/agy-snapshot.test.ts
git commit -m "feat(agy): render PTY snapshots with xterm headless"
```

---

## Task 5 — Conversation Reader

Implement best-effort `.pb` reading. Missing directory returns `[]`; parse failures are logged by callers later and do not abort the whole list.

**Files:**
- Create: `src/server/adapters/agy/conversations.ts`
- Create: `tests/agy-conversations.test.ts`

- [ ] **Step 5.1: Write failing tests**

```ts
// tests/agy-conversations.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listAgyConversations,
  parseConversationProto,
} from "../src/server/adapters/agy/conversations.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-agy-conv-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function field(tag: number, value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([tag << 3 | 2, body.length]), body]);
}

describe("agy conversation protobuf reader", () => {
  it("parses minimal length-delimited fields", () => {
    const buf = Buffer.concat([
      field(1, "conv-1"),
      field(2, "My conversation"),
      field(4, "/project"),
    ]);
    expect(parseConversationProto(buf)).toMatchObject({
      conversationId: "conv-1",
      title: "My conversation",
      projectPath: "/project",
    });
  });

  it("falls back to filename and mtime when parsing fails", async () => {
    await writeFile(join(dir, "broken.pb"), Buffer.from([0xff, 0xff]));
    const out = await listAgyConversations(dir);
    expect(out).toHaveLength(1);
    expect(out[0]!.conversationId).toBe("broken");
    expect(out[0]!.title).toBe("broken");
    expect(out[0]!.startedAt).toBeGreaterThan(0);
  });

  it("returns [] for missing directory", async () => {
    await expect(listAgyConversations(join(dir, "missing"))).resolves.toEqual([]);
  });

  it("ignores non-pb files", async () => {
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "notes.txt"), "x");
    expect(await listAgyConversations(dir)).toEqual([]);
  });
});
```

- [ ] **Step 5.2: Run to verify failure**

Run: `pnpm test agy-conversations`
Expected: FAIL because module does not exist.

- [ ] **Step 5.3: Implement proto reader**

```ts
// src/server/adapters/agy/conversations.ts
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ConversationDescriptor } from "../IProviderAdapter.js";

export interface AgyConversationDescriptor extends ConversationDescriptor {
  projectPath?: string;
}

interface ProtoParsed {
  conversationId?: string;
  title?: string;
  startedAt?: number;
  projectPath?: string;
}

export function parseConversationProto(buf: Buffer): AgyConversationDescriptor {
  const parsed: ProtoParsed = {};
  let i = 0;
  while (i < buf.length) {
    const key = readVarint(buf, i);
    i = key.next;
    const fieldNo = Number(key.value >> 3n);
    const wire = Number(key.value & 0x07n);
    if (wire === 2) {
      const len = readVarint(buf, i);
      i = len.next;
      const end = i + Number(len.value);
      if (end > buf.length) throw new Error("length-delimited field exceeds buffer");
      const value = buf.subarray(i, end).toString("utf8").replace(/\0/g, "").trim();
      i = end;
      if (fieldNo === 1 && value) parsed.conversationId = value;
      if (fieldNo === 2 && value) parsed.title = value;
      if (fieldNo === 4 && value) parsed.projectPath = value;
      continue;
    }
    if (wire === 0) {
      const value = readVarint(buf, i);
      i = value.next;
      if (fieldNo === 3) parsed.startedAt = Number(value.value);
      continue;
    }
    throw new Error(`unsupported protobuf wire type ${wire}`);
  }
  if (!parsed.conversationId && !parsed.title) {
    throw new Error("no conversation fields found");
  }
  return {
    conversationId: parsed.conversationId ?? parsed.title ?? "unknown",
    title: parsed.title ?? parsed.conversationId ?? "Untitled",
    ...(parsed.startedAt !== undefined ? { startedAt: parsed.startedAt } : {}),
    ...(parsed.projectPath !== undefined ? { projectPath: parsed.projectPath } : {}),
  };
}

function readVarint(buf: Buffer, offset: number): { value: bigint; next: number } {
  let result = 0n;
  let shift = 0n;
  for (let i = offset; i < buf.length; i += 1) {
    const b = BigInt(buf[i]!);
    result |= (b & 0x7fn) << shift;
    if ((b & 0x80n) === 0n) return { value: result, next: i + 1 };
    shift += 7n;
    if (shift > 63n) throw new Error("varint too long");
  }
  throw new Error("truncated varint");
}

export async function listAgyConversations(dir: string): Promise<AgyConversationDescriptor[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: AgyConversationDescriptor[] = [];
  for (const name of entries.filter((n) => n.endsWith(".pb")).sort()) {
    const path = join(dir, name);
    const id = basename(name, ".pb");
    const s = await stat(path).catch(() => undefined);
    try {
      const parsed = parseConversationProto(await readFile(path));
      out.push({
        ...parsed,
        conversationId: parsed.conversationId || id,
        startedAt: parsed.startedAt ?? s?.mtimeMs,
      });
    } catch {
      out.push({
        conversationId: id,
        title: id,
        ...(s ? { startedAt: s.mtimeMs } : {}),
      });
    }
  }
  return out;
}
```

- [ ] **Step 5.4: Verify**

Run: `pnpm test agy-conversations && pnpm build:server`
Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/server/adapters/agy/conversations.ts tests/agy-conversations.test.ts
git commit -m "feat(agy): read conversation metadata"
```

---

## Task 6 — Managed `agy-pty` Adapter

Launch `agy` in a server-owned PTY, capture snapshots, relay prompt/input/action, and kill only owned children on shutdown.

**Files:**
- Create: `src/server/adapters/agy/pty.ts`
- Create: `tests/agy-pty-adapter.test.ts`

- [ ] **Step 6.1: Write failing tests**

```ts
// tests/agy-pty-adapter.test.ts
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
    pid: 1234,
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
  const pty = fakePty();
  const spawn = vi.fn((_opts: SpawnPtyOpts) => pty.handle);
  const adapter = new AgyPtyAdapter({
    sessions,
    bus,
    command: "agy",
    scrollback: 4000,
    spawn,
  });
  return { sessions, adapter, pty, spawn };
}

describe("AgyPtyAdapter", () => {
  it("spawns agy as an owned agy-pty session", async () => {
    const { adapter, sessions, spawn } = make();
    const session = await adapter.start("/project");
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
      command: "agy",
      args: [],
      cwd: "/project",
    }));
    expect(session.providerId).toBe("agy");
    expect(session.source).toBe("agy-pty");
    expect(session.owned).toBe(true);
    expect(sessions.get(session.sessionId)).toBeDefined();
  });

  it("writes prompts with newline and raw input verbatim", async () => {
    const { adapter, pty } = make();
    const session = await adapter.start("/project");
    await adapter.sendPrompt(session, "hello");
    await adapter.sendInput(session, "\x1b[A");
    expect(pty.writes).toEqual(["hello\n", "\x1b[A"]);
  });

  it("updates snapshot from PTY chunks", async () => {
    const { adapter, pty } = make();
    const session = await adapter.start("/project");
    pty.emit("hello from agy");
    const snap = await adapter.getSnapshot(session);
    expect(snap.text).toContain("hello from agy");
    expect(snap.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("marks exited child stopped", async () => {
    const { adapter, sessions, pty } = make();
    const session = await adapter.start("/project");
    pty.exit();
    expect(sessions.get(session.sessionId)?.status).toBe("stopped");
    expect(sessions.get(session.sessionId)?.lifecycle).toBe("owned-stopped");
  });

  it("shutdown terminates owned PTYs", async () => {
    const { adapter, pty } = make();
    await adapter.start("/project");
    await adapter.shutdown();
    expect(pty.handle.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
```

- [ ] **Step 6.2: Run to verify failure**

Run: `pnpm test agy-pty-adapter`
Expected: FAIL because module does not exist.

- [ ] **Step 6.3: Implement managed PTY adapter**

```ts
// src/server/adapters/agy/pty.ts
import { AppError } from "../../core/errors.js";
import { EVENT_TYPES, envelope } from "../../core/realtime/events.js";
import type { RealtimeBus } from "../../core/realtime/bus.js";
import { AgentSessionRegistry } from "../../domains/agent-sessions.js";
import { allUnsupportedCapabilities, type CapabilityMap, type Session } from "../../domains/types.js";
import { spawnPty, type PtyHandle, type SpawnPtyOpts } from "../../pty/pty.js";
import type { ActionDescriptor, ConversationDescriptor, SnapshotPayload } from "../IProviderAdapter.js";
import { getAgyActions, inputForAgyAction } from "./actions.js";
import { AgySnapshotBuffer } from "./snapshot.js";
import { listAgyConversations } from "./conversations.js";

interface Runtime {
  session: Session;
  pty: PtyHandle;
  snapshot: AgySnapshotBuffer;
  lastSnapshotHash?: string;
}

export function agyPtyCapabilities(): CapabilityMap {
  const c = allUnsupportedCapabilities();
  for (const k of [
    "launch",
    "attach",
    "stop",
    "sendPrompt",
    "sendInput",
    "listConversations",
    "selectConversation",
    "getSnapshot",
    "getStatus",
    "getActions",
    "performAction",
    "dispose",
  ] as const) c[k] = "supported";
  return c;
}

export class AgyPtyAdapter {
  readonly providerId = "agy" as const;
  private byId = new Map<string, Runtime>();

  constructor(private opts: {
    sessions: AgentSessionRegistry;
    bus: RealtimeBus;
    command: string;
    scrollback: number;
    conversationsDir?: string;
    spawn?: (opts: SpawnPtyOpts) => PtyHandle;
  }) {}

  async start(projectPath: string): Promise<Session> {
    let handle: PtyHandle;
    try {
      handle = (this.opts.spawn ?? spawnPty)({
        command: this.opts.command,
        args: [],
        cwd: projectPath,
        env: {},
      });
    } catch (err) {
      throw new AppError({
        code: "agy_pty_spawn_failed",
        operation: "agy.start",
        message: `Failed to spawn agy: ${(err as Error).message}`,
      });
    }

    const session: Session = {
      sessionId: AgentSessionRegistry.newId(),
      providerId: "agy",
      source: "agy-pty",
      projectPath,
      status: "running",
      lifecycle: "owned-running",
      capabilities: agyPtyCapabilities(),
      owned: true,
      startedAt: Date.now(),
    };
    this.opts.sessions.set(session);

    const rt: Runtime = {
      session,
      pty: handle,
      snapshot: new AgySnapshotBuffer({ scrollback: this.opts.scrollback }),
    };
    this.byId.set(session.sessionId, rt);

    handle.onData((chunk) => {
      rt.snapshot.write(chunk);
      this.opts.bus.publish(envelope(EVENT_TYPES.TerminalOutput, { chunk }, {
        sessionId: session.sessionId,
      }));
      this.maybeBroadcastSnapshot(rt);
      this.broadcastActions(rt);
    });

    handle.onExit(({ exitCode, signal }) => {
      session.status = "stopped";
      session.lifecycle = "owned-stopped";
      this.opts.sessions.set(session);
      this.opts.bus.publish(envelope(
        EVENT_TYPES.SessionLifecycleChanged,
        { exitCode, signal, lifecycle: session.lifecycle },
        { sessionId: session.sessionId },
      ));
    });

    this.opts.bus.publish(envelope(
      EVENT_TYPES.ProviderStatusChanged,
      { status: session.status, lifecycle: session.lifecycle },
      { sessionId: session.sessionId },
    ));
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
    rt.pty.kill("SIGTERM");
  }

  async dispose(session: Session): Promise<void> {
    const rt = this.byId.get(session.sessionId);
    if (!rt) return;
    if (rt.session.owned && rt.pty.alive()) rt.pty.kill("SIGTERM");
    this.byId.delete(session.sessionId);
  }

  async sendPrompt(session: Session, text: string): Promise<void> {
    await this.sendInput(session, `${text}\n`);
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
    return listAgyConversations(this.opts.conversationsDir ?? "");
  }

  async selectConversation(session: Session, conversationId: string): Promise<void> {
    const before = (await this.getSnapshot(session)).hash;
    await this.sendInput(session, `/resume ${conversationId}\n`);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if ((await this.getSnapshot(session)).hash !== before) return;
    }
    throw new AppError({
      code: "agy_resume_failed",
      operation: "agy.selectConversation",
      message: "Resume command did not change the agy buffer within 5s.",
      recoveryAction: "Check whether the conversation id still exists.",
    });
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
      if (rt.session.owned && rt.pty.alive()) rt.pty.kill("SIGTERM");
    }
    this.byId.clear();
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

  private maybeBroadcastSnapshot(rt: Runtime): void {
    const snap = rt.snapshot.snapshot();
    if (snap.hash === rt.lastSnapshotHash) return;
    rt.lastSnapshotHash = snap.hash;
    this.opts.bus.publish(envelope(EVENT_TYPES.ProviderSnapshotChanged, snap, {
      sessionId: rt.session.sessionId,
    }));
  }

  private broadcastActions(rt: Runtime): void {
    this.opts.bus.publish(envelope(
      EVENT_TYPES.ProviderActionsChanged,
      { actions: getAgyActions({ running: rt.session.status === "running", text: rt.snapshot.snapshot().text ?? "" }) },
      { sessionId: rt.session.sessionId },
    ));
  }
}
```

- [ ] **Step 6.4: Verify**

Run: `pnpm test agy-pty-adapter && pnpm build:server`
Expected: PASS. If TypeScript reports `getStatus` capability drift, fix Task 1's `CAPABILITY_KEYS` and frontend type mirrors before continuing.

- [ ] **Step 6.5: Commit**

```bash
git add src/server/adapters/agy/pty.ts tests/agy-pty-adapter.test.ts
git commit -m "feat(agy): add managed PTY adapter"
```

---

## Task 7 — Wrapper IPC Bridge for `wrap-agy`

Implement controllable wrapper sessions. The wrapper owns the actual PTY and user's terminal, forwards chunks to the server, and polls queued writes from the server.

**Files:**
- Create: `src/server/adapters/agy/wrapper.ts`
- Modify: `src/server/ipc/wire.ts`
- Modify: `src/cli/antigravity.ts`
- Modify: `src/cli/index.ts`
- Create: `tests/agy-wrapper-adapter.test.ts`
- Modify: `tests/ipc.test.ts`
- Modify: `tests/cli-spawn.test.ts`

- [ ] **Step 7.1: Write failing wrapper adapter tests**

```ts
// tests/agy-wrapper-adapter.test.ts
import { describe, expect, it } from "vitest";
import { AgyWrapperAdapter } from "../src/server/adapters/agy/wrapper.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";

function make() {
  const sessions = new AgentSessionRegistry();
  const adapter = new AgyWrapperAdapter({
    sessions,
    bus: new RealtimeBus(),
    scrollback: 4000,
  });
  return { sessions, adapter };
}

describe("AgyWrapperAdapter", () => {
  it("registers provider-owned bridge as unowned agy-wrapper", () => {
    const { adapter, sessions } = make();
    const s = adapter.register({ pid: 100, projectPath: "/p" });
    expect(s.providerId).toBe("agy");
    expect(s.source).toBe("agy-wrapper");
    expect(s.owned).toBe(false);
    expect(s.capabilities.stop).toBe("unsupported");
    expect(sessions.get(s.sessionId)).toBeDefined();
  });

  it("dedupes by pid", () => {
    const { adapter } = make();
    const a = adapter.register({ pid: 100, projectPath: "/p" });
    const b = adapter.register({ pid: 100, projectPath: "/p" });
    expect(b.sessionId).toBe(a.sessionId);
  });

  it("captures output and exposes queued input for wrapper polling", async () => {
    const { adapter } = make();
    const s = adapter.register({ pid: 100, projectPath: "/p" });
    adapter.receiveOutput(s.sessionId, "hello");
    await adapter.sendInput(s, "x");
    expect((await adapter.getSnapshot(s)).text).toContain("hello");
    expect(adapter.pollInput(s.sessionId)).toEqual(["x"]);
    expect(adapter.pollInput(s.sessionId)).toEqual([]);
  });

  it("dispose does not terminate wrapper sessions", async () => {
    const { adapter } = make();
    const s = adapter.register({ pid: 100 });
    await adapter.dispose(s);
    expect(await adapter.getStatus(s)).toBe("stopped");
  });
});
```

- [ ] **Step 7.2: Run to verify failure**

Run: `pnpm test agy-wrapper-adapter`
Expected: FAIL because module does not exist.

- [ ] **Step 7.3: Implement wrapper adapter**

Use the same public methods as `AgyPtyAdapter`, but queue writes for wrapper polling:

```ts
// src/server/adapters/agy/wrapper.ts
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
}

export function agyWrapperCapabilities(): CapabilityMap {
  const c = allUnsupportedCapabilities();
  for (const k of [
    "attach",
    "sendPrompt",
    "sendInput",
    "listConversations",
    "selectConversation",
    "getSnapshot",
    "getStatus",
    "getActions",
    "performAction",
  ] as const) c[k] = "supported";
  return c;
}

export class AgyWrapperAdapter {
  readonly providerId = "agy" as const;
  private byPid = new Map<number, Runtime>();
  private byId = new Map<string, Runtime>();

  constructor(private opts: {
    sessions: AgentSessionRegistry;
    bus: RealtimeBus;
    scrollback: number;
    conversationsDir?: string;
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
    const rt: Runtime = {
      session,
      pid: args.pid,
      snapshot: new AgySnapshotBuffer({ scrollback: this.opts.scrollback }),
      pendingInput: [],
    };
    this.byId.set(session.sessionId, rt);
    if (args.pid !== undefined) this.byPid.set(args.pid, rt);
    this.opts.sessions.set(session);
    this.opts.bus.publish(envelope(EVENT_TYPES.SessionLifecycleChanged, {
      lifecycle: session.lifecycle,
      source: session.source,
    }, { sessionId: session.sessionId }));
    return session;
  }

  receiveOutput(sessionId: string, chunk: string): void {
    const rt = this.requireId(sessionId, "agy.wrapperOutput");
    rt.snapshot.write(chunk);
    this.opts.bus.publish(envelope(EVENT_TYPES.TerminalOutput, { chunk }, { sessionId }));
    this.opts.bus.publish(envelope(EVENT_TYPES.ProviderSnapshotChanged, rt.snapshot.snapshot(), { sessionId }));
    this.opts.bus.publish(envelope(EVENT_TYPES.ProviderActionsChanged, {
      actions: getAgyActions({ running: rt.session.status === "running", text: rt.snapshot.snapshot().text ?? "" }),
    }, { sessionId }));
  }

  pollInput(sessionId: string): string[] {
    const rt = this.requireId(sessionId, "agy.wrapperPoll");
    const out = rt.pendingInput;
    rt.pendingInput = [];
    return out;
  }

  markExited(sessionId: string, exitCode?: number): void {
    const rt = this.requireId(sessionId, "agy.wrapperExit");
    rt.session.status = "stopped";
    rt.session.lifecycle = "discovered";
    this.opts.sessions.set(rt.session);
    this.opts.bus.publish(envelope(EVENT_TYPES.SessionLifecycleChanged, {
      exitCode,
      lifecycle: rt.session.lifecycle,
    }, { sessionId }));
  }

  async attach(session: Session): Promise<Session> {
    return this.requireRuntime(session, "agy.attach").session;
  }

  async stop(): Promise<void> {
    throw new AppError({
      code: "capability_unsupported",
      operation: "agy.stop",
      message: "Wrapper-launched agy sessions are not owned by the server.",
      httpStatus: 409,
    });
  }

  async dispose(session: Session): Promise<void> {
    const rt = this.byId.get(session.sessionId);
    if (!rt) return;
    rt.session.status = "stopped";
    rt.session.lifecycle = "discovered";
    this.opts.sessions.set(rt.session);
  }

  async sendPrompt(session: Session, text: string): Promise<void> {
    await this.sendInput(session, `${text}\n`);
  }

  async sendInput(session: Session, input: string): Promise<void> {
    this.requireRuntime(session, "agy.sendInput").pendingInput.push(input);
  }

  async listConversations(): Promise<ConversationDescriptor[]> {
    return listAgyConversations(this.opts.conversationsDir ?? "");
  }

  async selectConversation(session: Session, conversationId: string): Promise<void> {
    const before = (await this.getSnapshot(session)).hash;
    await this.sendInput(session, `/resume ${conversationId}\n`);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if ((await this.getSnapshot(session)).hash !== before) return;
    }
    throw new AppError({
      code: "agy_resume_failed",
      operation: "agy.selectConversation",
      message: "Resume command did not change the agy buffer within 5s.",
      recoveryAction: "Check whether the conversation id still exists.",
    });
  }

  async getSnapshot(session: Session): Promise<SnapshotPayload> {
    return this.requireRuntime(session, "agy.getSnapshot").snapshot.snapshot();
  }

  async getStatus(session: Session): Promise<Session["status"]> {
    return this.byId.get(session.sessionId)?.session.status ?? "unknown";
  }

  async getActions(session: Session): Promise<ActionDescriptor[]> {
    const rt = this.requireRuntime(session, "agy.getActions");
    return getAgyActions({ running: rt.session.status === "running", text: rt.snapshot.snapshot().text ?? "" });
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

  wrapperPids(): Set<number> {
    return new Set(this.byPid.keys());
  }

  private requireRuntime(session: Session, operation: string): Runtime {
    return this.requireId(session.sessionId, operation);
  }

  private requireId(sessionId: string, operation: string): Runtime {
    const rt = this.byId.get(sessionId);
    if (!rt) {
      throw new AppError({
        code: "session_not_found",
        operation,
        message: `No agy wrapper session ${sessionId}.`,
        httpStatus: 404,
      });
    }
    return rt;
  }
}
```

- [ ] **Step 7.4: Extend IPC server methods**

Modify `src/server/ipc/wire.ts`:

```ts
import type { AgyWrapperAdapter } from "../adapters/agy/wrapper.js";

interface WireDeps {
  wrapper: AntigravityWrapperAdapter;
  agyWrapper?: AgyWrapperAdapter;
  reservePort: () => Promise<number>;
  releasePort: (port: number) => void;
}
```

Update `register-session` to default old payloads to Antigravity:

```ts
const pid = typeof params.pid === "number" ? params.pid : undefined;
const projectPath =
  typeof params.projectPath === "string" ? params.projectPath : undefined;
const provider = params.provider === "agy" ? "agy" : "antigravity";
if (provider === "agy") {
  if (!deps.agyWrapper) throw new Error("agy wrapper is not configured");
  const session = deps.agyWrapper.register({ pid, projectPath });
  return { sessionId: session.sessionId };
}
const debugPort = Number(params.debugPort);
if (!Number.isFinite(debugPort)) {
  throw new Error("debugPort is required");
}
const args: { pid?: number; debugPort: number; projectPath?: string } = {
  debugPort,
};
if (pid !== undefined) args.pid = pid;
if (projectPath !== undefined) args.projectPath = projectPath;
const session = deps.wrapper.register(args);
return { sessionId: session.sessionId };
```

Add bridge methods:

```ts
server.register("agy-wrapper-output", async (params) => {
  if (!deps.agyWrapper) throw new Error("agy wrapper is not configured");
  deps.agyWrapper.receiveOutput(String(params.sessionId), String(params.chunk ?? ""));
  return { ok: true };
});

server.register("agy-wrapper-poll", async (params) => {
  if (!deps.agyWrapper) throw new Error("agy wrapper is not configured");
  return { inputs: deps.agyWrapper.pollInput(String(params.sessionId)) };
});

server.register("agy-wrapper-exit", async (params) => {
  if (!deps.agyWrapper) throw new Error("agy wrapper is not configured");
  deps.agyWrapper.markExited(
    String(params.sessionId),
    typeof params.exitCode === "number" ? params.exitCode : undefined,
  );
  return { ok: true };
});
```

- [ ] **Step 7.5: Split CLI wrappers**

In `src/cli/antigravity.ts`, keep the existing Antigravity IDE wrapper as `runAntigravityWrapper` and add:

```ts
export async function runAgyWrapper(opts: WrapperOpts): Promise<void> {
  const projectPath = resolve(opts.project);
  const nonce = await loadIpcNonce();
  if (!nonce) {
    process.stderr.write(
      "error: IPC nonce not found.\nRun `agent-remote-control install` and start the service first.\n",
    );
    process.exit(2);
  }

  const sockPath = ipcSocketPath();
  const config = await loadConfig(configFile());
  const command = config.providers.agy.command;
  const { spawnPty } = await import("../server/pty/pty.js");
  const child = spawnPty({ command, args: [], cwd: projectPath });

  const { sessionId } = await ipcCall<{ sessionId: string }>(
    sockPath,
    nonce,
    "register-session",
    { provider: "agy", pid: child.pid, projectPath },
  );

  child.onData((chunk) => {
    process.stdout.write(chunk);
    void ipcCall(sockPath, nonce, "agy-wrapper-output", { sessionId, chunk }).catch(() => {});
  });

  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk: Buffer) => {
    child.write(chunk.toString("utf8"));
  });

  const poll = setInterval(() => {
    void ipcCall<{ inputs: string[] }>(sockPath, nonce, "agy-wrapper-poll", { sessionId })
      .then(({ inputs }) => inputs.forEach((input) => child.write(input)))
      .catch(() => {});
  }, 50);

  child.onExit((info) => {
    clearInterval(poll);
    void ipcCall(sockPath, nonce, "agy-wrapper-exit", {
      sessionId,
      exitCode: info.exitCode,
    }).finally(() => process.exit(info.exitCode ?? 0));
  });
}
```

In `src/cli/index.ts`, expose:

```ts
program
  .command("wrap-antigravity <project>")
  .description("Launch Antigravity IDE for <project> and register it with the local server")
  .action(async (project: string) => {
    await runAntigravityWrapper({ project });
  });

program
  .command("wrap-agy <project>")
  .description("Launch agy CLI for <project> and register it with the local server")
  .action(async (project: string) => {
    await runAgyWrapper({ project });
  });

program.command("agy <project>").description("Alias for `wrap-agy`").action(async (project: string) => {
  await runAgyWrapper({ project });
});

program.command("antigravity <project>").description("Alias for `wrap-antigravity`").action(async (project: string) => {
  await runAntigravityWrapper({ project });
});
```

- [ ] **Step 7.6: Verify**

Run: `pnpm test agy-wrapper-adapter ipc cli-spawn && pnpm build:server`
Expected: PASS.

- [ ] **Step 7.7: Commit**

```bash
git add src/server/adapters/agy/wrapper.ts src/server/ipc/wire.ts src/cli/antigravity.ts src/cli/index.ts tests/agy-wrapper-adapter.test.ts tests/ipc.test.ts tests/cli-spawn.test.ts
git commit -m "feat(agy): add controllable wrapper bridge"
```

---

## Task 8 — Unmanaged `agy` Detection

Detect external `agy` processes, exclude app-owned/wrapper PIDs, and return non-attachable guidance.

**Files:**
- Create: `src/server/adapters/agy/unmanaged.ts`
- Create: `tests/agy-unmanaged.test.ts`

- [ ] **Step 8.1: Write failing tests**

```ts
// tests/agy-unmanaged.test.ts
import { describe, expect, it } from "vitest";
import { AgyUnmanagedDetector, type RawProcess } from "../src/server/adapters/agy/unmanaged.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";

function detector(procs: RawProcess[], owned: number[] = [], wrapper: number[] = []) {
  return new AgyUnmanagedDetector({
    sessions: new AgentSessionRegistry(),
    ownedPids: () => new Set(owned),
    wrapperPids: () => new Set(wrapper),
    procScan: async () => procs,
  });
}

describe("AgyUnmanagedDetector", () => {
  it("flags external agy as not controllable", async () => {
    const det = detector([
      { pid: 1, comm: "agy", cmdline: "agy", cwd: "/p" },
    ]);
    const out = await det.listDiscoveredSessions("/p");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      providerId: "agy",
      source: "agy-unmanaged",
      attachable: false,
      projectPath: "/p",
    });
    expect(out[0]!.guidance.recommendedCommand).toContain("agent-remote-control agy /p");
  });

  it("excludes owned and wrapper pids", async () => {
    const procs = [
      { pid: 1, comm: "agy", cmdline: "agy" },
      { pid: 2, comm: "agy", cmdline: "agy" },
    ];
    expect(await detector(procs, [1], [2]).listDiscoveredSessions("/p")).toEqual([]);
  });
});
```

- [ ] **Step 8.2: Run to verify failure**

Run: `pnpm test agy-unmanaged`
Expected: FAIL because module does not exist.

- [ ] **Step 8.3: Implement detector**

Use the existing Antigravity unmanaged detector pattern, but provider/source/command values are `agy`:

```ts
// src/server/adapters/agy/unmanaged.ts
import { AgentSessionRegistry } from "../../domains/agent-sessions.js";
import { allUnsupportedCapabilities, type Session } from "../../domains/types.js";
import type { DiscoveredSession } from "../IProviderAdapter.js";
import type { Discoverable } from "../capabilities.js";
import { scanProc, type RawProcess } from "../antigravity/unmanaged.js";

export type { RawProcess };

export interface AgyUnmanagedSession extends DiscoveredSession {
  attachable: false;
  guidance: { message: string; recommendedCommand: string };
}

export class AgyUnmanagedDetector implements Discoverable {
  readonly providerId = "agy" as const;

  constructor(private deps: {
    sessions: AgentSessionRegistry;
    ownedPids: () => Set<number>;
    wrapperPids: () => Set<number>;
    procScan?: () => Promise<RawProcess[]>;
  }) {}

  async listDiscoveredSessions(projectPath?: string): Promise<AgyUnmanagedSession[]> {
    const procs = this.deps.procScan ? await this.deps.procScan() : await scanProc("agy");
    const excluded = new Set<number>([
      ...this.deps.ownedPids(),
      ...this.deps.wrapperPids(),
    ]);
    const out: AgyUnmanagedSession[] = [];
    for (const p of procs) {
      if (excluded.has(p.pid)) continue;
      if (!p.comm.includes("agy") && !p.cmdline.includes("agy")) continue;
      if (projectPath && p.cwd && p.cwd !== projectPath) continue;
      const sessionId = AgentSessionRegistry.newId();
      const session: Session = {
        sessionId,
        providerId: "agy",
        source: "agy-unmanaged",
        status: "running",
        lifecycle: "external-unmanaged",
        capabilities: allUnsupportedCapabilities(),
        owned: false,
        note: "External agy process — not controllable by the app.",
      };
      if (p.cwd !== undefined) session.projectPath = p.cwd;
      this.deps.sessions.set(session);
      const recommendedCommand = p.cwd
        ? `agent-remote-control agy ${p.cwd}`
        : "agent-remote-control agy <project>";
      out.push({
        sessionId,
        providerId: "agy",
        source: "agy-unmanaged",
        hint: `agy pid ${p.pid}`,
        ...(p.cwd !== undefined ? { projectPath: p.cwd } : {}),
        attachable: false,
        guidance: {
          message: "This agy process is running outside the app wrapper and cannot be controlled. Re-launch through the wrapper to enable phone control.",
          recommendedCommand,
        },
      });
    }
    return out;
  }
}
```

- [ ] **Step 8.4: Verify**

Run: `pnpm test agy-unmanaged && pnpm build:server`
Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add src/server/adapters/agy/unmanaged.ts tests/agy-unmanaged.test.ts
git commit -m "feat(agy): detect unmanaged CLI processes"
```

---

## Task 9 — Compose `AgyAdapter` and Discovery Filtering

Expose one `IProviderAdapter` for HTTP dispatch and one `Discoverable` source for discovery.

**Files:**
- Create: `src/server/adapters/agy/index.ts`
- Modify: `src/server/domains/discovery.ts`
- Create: `tests/agy-discovery-integration.test.ts`
- Modify: `tests/discovery-aggregator.test.ts`

- [ ] **Step 9.1: Write failing tests**

```ts
// tests/agy-discovery-integration.test.ts
import { describe, expect, it, vi } from "vitest";
import { AgyAdapter } from "../src/server/adapters/agy/index.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import { RealtimeBus } from "../src/server/core/realtime/bus.js";

describe("AgyAdapter discovery", () => {
  it("merges pty launch source, wrapper source, and unmanaged source", async () => {
    const sessions = new AgentSessionRegistry();
    const adapter = new AgyAdapter({
      sessions,
      bus: new RealtimeBus(),
      command: "agy",
      scrollback: 4000,
      snapshotPollMs: 500,
      conversationsDir: "/missing",
      detect: vi.fn(async () => ({
        available: true,
        capabilities: {} as never,
        slashCommands: [],
        note: "ok",
      })),
      unmanagedProcScan: async () => [
        { pid: 7, comm: "agy", cmdline: "agy", cwd: "/p" },
      ],
    });
    sessions.set({
      sessionId: "owned-pty",
      providerId: "agy",
      source: "agy-pty",
      projectPath: "/p",
      status: "running",
      lifecycle: "owned-running",
      capabilities: {} as never,
      owned: true,
    });
    adapter.wrapper.register({ pid: 10, projectPath: "/p" });
    const out = await adapter.listDiscoveredSessions("/p");
    expect(out.map((s) => s.source)).toContain("agy-pty");
    expect(out.map((s) => s.source)).toContain("agy-wrapper");
    expect(out.map((s) => s.source)).toContain("agy-unmanaged");
  });
});
```

Add provider filtering to `tests/discovery-aggregator.test.ts`:

```ts
it("filters by provider when requested", async () => {
  const agg = new SessionDiscoveryAggregator([
    { providerId: "antigravity", listDiscoveredSessions: vi.fn(async () => [{ sessionId: "a", providerId: "antigravity", source: "cdp", hint: "a" }]) },
    { providerId: "agy", listDiscoveredSessions: vi.fn(async () => [{ sessionId: "g", providerId: "agy", source: "agy-unmanaged", hint: "g" }]) },
  ]);
  const out = await agg.discover("/p", "agy");
  expect(out).toHaveLength(1);
  expect(out[0]!.providerId).toBe("agy");
});
```

- [ ] **Step 9.2: Run to verify failure**

Run: `pnpm test agy-discovery-integration discovery-aggregator`
Expected: FAIL because `AgyAdapter` and provider filter do not exist.

- [ ] **Step 9.3: Implement provider filter**

```ts
// src/server/domains/discovery.ts
import type { ProviderId } from "./types.js";

async discover(projectPath: string, providerId?: ProviderId): Promise<DiscoveredSession[]> {
  const sources = providerId
    ? this.sources.filter((s) => s.providerId === providerId)
    : this.sources;
  const results = await Promise.allSettled(
    sources.map((s) => s.listDiscoveredSessions(projectPath)),
  );
  // existing fulfilled-result merge stays the same
}
```

- [ ] **Step 9.4: Implement `AgyAdapter` composition**

```ts
// src/server/adapters/agy/index.ts
import { AppError } from "../../core/errors.js";
import type { RealtimeBus } from "../../core/realtime/bus.js";
import { AgentSessionRegistry } from "../../domains/agent-sessions.js";
import type { Session } from "../../domains/types.js";
import type {
  ActionDescriptor,
  ConversationDescriptor,
  DetectResult,
  DiscoveredSession,
  IProviderAdapter,
  PromptContext,
  SnapshotPayload,
} from "../IProviderAdapter.js";
import { detectAgy, type AgyDetectResult, type ExecFn } from "./detect.js";
import { AgyPtyAdapter } from "./pty.js";
import { AgyWrapperAdapter } from "./wrapper.js";
import { AgyUnmanagedDetector, type RawProcess } from "./unmanaged.js";

export class AgyAdapter implements IProviderAdapter {
  readonly providerId = "agy" as const;
  readonly pty: AgyPtyAdapter;
  readonly wrapper: AgyWrapperAdapter;
  readonly unmanaged: AgyUnmanagedDetector;
  private lastDetect: AgyDetectResult | null = null;

  constructor(private opts: {
    sessions: AgentSessionRegistry;
    bus: RealtimeBus;
    command: string;
    scrollback: number;
    snapshotPollMs: number;
    conversationsDir: string;
    exec?: ExecFn;
    detect?: typeof detectAgy;
    unmanagedProcScan?: () => Promise<RawProcess[]>;
  }) {
    this.pty = new AgyPtyAdapter({
      sessions: opts.sessions,
      bus: opts.bus,
      command: opts.command,
      scrollback: opts.scrollback,
      conversationsDir: opts.conversationsDir,
    });
    this.wrapper = new AgyWrapperAdapter({
      sessions: opts.sessions,
      bus: opts.bus,
      scrollback: opts.scrollback,
      conversationsDir: opts.conversationsDir,
    });
    this.unmanaged = new AgyUnmanagedDetector({
      sessions: opts.sessions,
      ownedPids: () => new Set(),
      wrapperPids: () => this.wrapper.wrapperPids(),
      procScan: opts.unmanagedProcScan,
    });
  }

  async detect(): Promise<DetectResult> {
    this.lastDetect = await (this.opts.detect ?? detectAgy)({
      command: this.opts.command,
      exec: this.opts.exec,
    });
    return {
      available: this.lastDetect.available,
      capabilities: this.lastDetect.capabilities,
      note: this.lastDetect.note,
    };
  }

  get slashCommands() {
    return this.lastDetect?.slashCommands ?? [];
  }

  async listDiscoveredSessions(projectPath: string): Promise<DiscoveredSession[]> {
    const existing = this.opts.sessions
      .list()
      .filter((s) =>
        s.providerId === "agy" &&
        (s.source === "agy-pty" || s.source === "agy-wrapper") &&
        (!s.projectPath || s.projectPath === projectPath),
      )
      .map((s): DiscoveredSession => ({
        sessionId: s.sessionId,
        providerId: "agy",
        source: s.source,
        hint: s.source === "agy-pty" ? "agy managed PTY" : "agy wrapper",
        ...(s.projectPath ? { projectPath: s.projectPath } : {}),
        active: s.status === "running",
      }));
    return [
      ...existing,
      ...(await this.unmanaged.listDiscoveredSessions(projectPath)),
    ];
  }

  start(projectPath: string, _options?: Record<string, unknown>): Promise<Session> {
    return this.pty.start(projectPath);
  }

  attach(session: Session): Promise<Session> {
    return this.delegate(session).attach(session);
  }

  stop(session: Session): Promise<void> {
    return this.delegate(session).stop(session);
  }

  dispose(session: Session): Promise<void> {
    return this.delegate(session).dispose(session);
  }

  sendPrompt(session: Session, text: string, context?: PromptContext): Promise<void> {
    void context;
    return this.delegate(session).sendPrompt(session, text);
  }

  sendInput(session: Session, input: string): Promise<void> {
    return this.delegate(session).sendInput(session, input);
  }

  listConversations(session: Session): Promise<ConversationDescriptor[]> {
    return this.delegate(session).listConversations(session);
  }

  selectConversation(session: Session, conversationId: string): Promise<void> {
    return this.delegate(session).selectConversation(session, conversationId);
  }

  getSnapshot(session: Session): Promise<SnapshotPayload> {
    return this.delegate(session).getSnapshot(session);
  }

  getStatus(session: Session): Promise<Session["status"]> {
    return this.delegate(session).getStatus(session);
  }

  getActions(session: Session): Promise<ActionDescriptor[]> {
    return this.delegate(session).getActions(session);
  }

  performAction(session: Session, actionId: string): Promise<void> {
    return this.delegate(session).performAction(session, actionId);
  }

  async shutdown(): Promise<void> {
    await this.pty.shutdown();
  }

  private delegate(session: Session): AgyPtyAdapter | AgyWrapperAdapter {
    if (session.source === "agy-pty") return this.pty;
    if (session.source === "agy-wrapper") return this.wrapper;
    throw new AppError({
      code: "capability_unsupported",
      operation: "agy.delegate",
      message: `Source ${session.source} is not controllable.`,
      httpStatus: 409,
    });
  }
}
```

- [ ] **Step 9.5: Verify**

Run: `pnpm test agy-discovery-integration discovery-aggregator && pnpm build:server`
Expected: PASS.

- [ ] **Step 9.6: Commit**

```bash
git add src/server/adapters/agy/index.ts src/server/domains/discovery.ts tests/agy-discovery-integration.test.ts tests/discovery-aggregator.test.ts
git commit -m "feat(agy): compose provider adapter"
```

---

## Task 10 — Assembly and HTTP Dispatch

Wire `agy` through the composition root and existing HTTP envelope. Add canonical `/input` and `/action` aliases without removing existing routes.

**Files:**
- Modify: `src/server/assembly.ts`
- Modify: `src/server/http/domain.ts`
- Modify: `src/server/http/adapter-routes.ts`
- Create: `tests/agy-http.test.ts`
- Modify: `tests/assembly.test.ts`
- Modify: `tests/route-auth-matrix.test.ts`

- [ ] **Step 10.1: Write failing HTTP tests**

```ts
// tests/agy-http.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authedApp } from "./_authed-app.js";

let dir: string;
let projectRoot: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-agy-http-"));
  projectRoot = join(dir, "project");
  await mkdir(projectRoot);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function fx() {
  return authedApp({
    dir,
    configure: (c) => {
      c.projects.roots = [projectRoot];
      c.providers.agy.command = "printf";
    },
  });
}

describe("HTTP agy provider", () => {
  it("launches an agy session through normalized envelope", async () => {
    const a = await fx();
    const created = await a.assembled.deps.projects.add(projectRoot);
    const r = await a.assembled.app.inject({
      method: "POST",
      url: "/api/sessions/launch",
      headers: { cookie: a.cookieHeader, "x-csrf-token": a.csrfVal },
      payload: { projectId: created.id, providerId: "agy" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.session.providerId).toBe("agy");
    expect(r.json().data.session.source).toBe("agy-pty");
    await a.assembled.shutdown();
  });

  it("accepts canonical input and action endpoints", async () => {
    const a = await fx();
    const created = await a.assembled.deps.projects.add(projectRoot);
    const launch = await a.assembled.app.inject({
      method: "POST",
      url: "/api/sessions/launch",
      headers: { cookie: a.cookieHeader, "x-csrf-token": a.csrfVal },
      payload: { projectId: created.id, providerId: "agy" },
    });
    const id = launch.json().data.session.sessionId;
    const input = await a.assembled.app.inject({
      method: "POST",
      url: `/api/sessions/${id}/input`,
      headers: { cookie: a.cookieHeader, "x-csrf-token": a.csrfVal },
      payload: { input: "\x1b[A" },
    });
    expect(input.statusCode).toBe(200);
    const action = await a.assembled.app.inject({
      method: "POST",
      url: `/api/sessions/${id}/action`,
      headers: { cookie: a.cookieHeader, "x-csrf-token": a.csrfVal },
      payload: { actionId: "agy.send" },
    });
    expect(action.statusCode).toBe(200);
    await a.assembled.shutdown();
  });
});
```

- [ ] **Step 10.2: Run to verify failure**

Run: `pnpm test agy-http assembly route-auth-matrix`
Expected: FAIL because app does not assemble or route `agy`.

- [ ] **Step 10.3: Wire assembly**

In `src/server/assembly.ts`:

```ts
import { AgyAdapter } from "./adapters/agy/index.js";
import { allUnsupportedCapabilities } from "./domains/types.js";
```

Add to deps:

```ts
agy: AgyAdapter;
```

Instantiate:

```ts
const agy = new AgyAdapter({
  sessions: agentSessions,
  bus,
  command: config.providers.agy.command,
  scrollback: config.providers.agy.scrollback,
  snapshotPollMs: config.providers.agy.snapshotPollMs,
  conversationsDir: config.providers.agy.conversationsDir.replace(/^~/, process.env.HOME ?? "~"),
});
```

Probe provider registry best-effort:

```ts
let agyDetectError: unknown;
try {
  const det = await agy.detect();
  providers.set({
    id: "agy",
    displayName: "agy",
    enabled: config.providers.agy.enabled,
    available: det.available,
    status: det.available ? "ready" : "unavailable",
    capabilities: det.capabilities,
    note: det.note,
    slashCommands: agy.slashCommands,
  });
} catch (err) {
  agyDetectError = err;
  providers.set({
    id: "agy",
    displayName: "agy",
    enabled: config.providers.agy.enabled,
    available: false,
    status: "unavailable",
    capabilities: allUnsupportedCapabilities(),
    note: "agy detection failed.",
    slashCommands: [],
  });
}
```

After `const app = await buildApp(...)`, log the deferred warning:

```ts
if (agyDetectError) app.log.warn({ err: agyDetectError }, "agy detect failed");
```

Add discovery source:

```ts
const discovery = new SessionDiscoveryAggregator([
  antigravity,
  tmux,
  screen,
  unmanaged,
  agy,
]);
```

Pass IPC:

```ts
ipc = await startIpcServer({
  wrapper,
  agyWrapper: agy.wrapper,
  reservePort: async () => portPool.reserve(),
  releasePort: (p) => portPool.release(p),
});
```

Shutdown:

```ts
await agy.shutdown();
await pty.shutdown();
await antigravity.shutdown();
```

- [ ] **Step 10.4: Wire HTTP domain deps**

Add `agy: AgyAdapter` to `DomainDeps` and pass it to `registerAdapterRoutes`.

- [ ] **Step 10.5: Update adapter route dispatch**

```ts
interface Deps {
  antigravity: AntigravityCdpAdapter;
  agy: AgyAdapter;
  projects: ProjectStore;
  sessions: AgentSessionRegistry;
  discovery: SessionDiscoveryAggregator;
}

function getAdapter(deps: Deps, providerId: ProviderId): IProviderAdapter {
  if (providerId === "antigravity") return deps.antigravity;
  if (providerId === "agy") return deps.agy;
  throw new AppError({ /* existing disabled error */ });
}
```

Filter discovery:

```ts
const sessions = await deps.discovery.discover(projectPath, providerId);
```

Add the spec-compatible GET discovery alias while preserving the existing POST route:

```ts
app.get<{
  Querystring: { provider?: ProviderId; projectPath?: string };
}>("/api/sessions/discover", async (req, reply) => {
  const providerId = req.query.provider ?? "antigravity";
  getAdapter(deps, providerId);
  const projectPath = typeof req.query.projectPath === "string"
    ? req.query.projectPath
    : "";
  const sessions = await deps.discovery.discover(projectPath, providerId);
  reply.send(okEnvelope({ sessions }));
});
```

Add canonical input route:

```ts
app.post<{
  Params: { id: string };
  Body: { input?: string };
}>("/api/sessions/:id/input", async (req, reply) => {
  const session = rejectIfMissing(deps.sessions, req.params.id, reply,
    `${req.method} ${req.url.split("?")[0]}`);
  if (!session) return;
  const input = requireBodyString(req.body, "input", "session.input");
  const adapter = getAdapter(deps, session.providerId);
  await adapter.sendInput(session, input);
  reply.send(okEnvelope({ ok: true }));
});
```

Add canonical action route:

```ts
app.post<{
  Params: { id: string };
  Body: { actionId?: string };
}>("/api/sessions/:id/action", async (req, reply) => {
  const session = rejectIfMissing(deps.sessions, req.params.id, reply,
    `${req.method} ${req.url.split("?")[0]}`);
  if (!session) return;
  const actionId = requireBodyString(req.body, "actionId", "session.action");
  const adapter = getAdapter(deps, session.providerId);
  await adapter.performAction(session, actionId);
  reply.send(okEnvelope({ ok: true }));
});
```

Add the spec-compatible conversation selection alias while preserving `/conversations/:cid/select`:

```ts
app.post<{
  Params: { id: string };
  Body: { conversationId?: string };
}>("/api/sessions/:id/conversation", async (req, reply) => {
  const session = rejectIfMissing(deps.sessions, req.params.id, reply,
    `${req.method} ${req.url.split("?")[0]}`);
  if (!session) return;
  const conversationId = requireBodyString(
    req.body,
    "conversationId",
    "session.conversation",
  );
  const adapter = getAdapter(deps, session.providerId);
  await adapter.selectConversation(session, conversationId);
  reply.send(okEnvelope({ ok: true }));
});
```

Keep `/api/sessions/:id/actions/:actionId` for existing UI compatibility.

- [ ] **Step 10.6: Verify**

Run: `pnpm test agy-http assembly route-auth-matrix && pnpm build:server`
Expected: PASS.

- [ ] **Step 10.7: Commit**

```bash
git add src/server/assembly.ts src/server/http/domain.ts src/server/http/adapter-routes.ts tests/agy-http.test.ts tests/assembly.test.ts tests/route-auth-matrix.test.ts
git commit -m "feat(agy): wire provider through HTTP"
```

---

## Task 11 — Frontend Provider, Actions, Conversations, and Slash Commands

Make `agy` visible and usable in the existing workspace without raw keystrokes from the frontend.

**Files:**
- Modify: `src/web/stores/sessions.ts`
- Modify: `src/web/stores/providers.ts`
- Modify: `src/web/components/ProviderSelector.tsx`
- Modify: `src/web/components/SessionDiscoveryList.tsx`
- Modify: `src/web/components/ActionPanel.tsx`
- Modify: `src/web/components/MirrorTimeline.tsx`
- Modify: `src/web/components/SlashCommandPalette.tsx`
- Modify: `src/web/components/Workspace.tsx`
- Modify: `tests/web/ProviderSelector.test.tsx`
- Modify: `tests/web/ActionPanel.test.tsx`
- Modify: `tests/web/SessionDiscoveryList.test.tsx`
- Modify: `tests/web/SlashCommandPalette.test.tsx`
- Modify: `tests/web/store-sessions.test.ts`

- [ ] **Step 11.1: Write failing frontend tests**

Add these expectations:

```ts
// tests/web/ProviderSelector.test.tsx
expect(await screen.findByTestId("provider-agy")).toBeEnabled();
expect(screen.getByTestId("provider-agy")).toHaveTextContent("agy");
```

```ts
// tests/web/ActionPanel.test.tsx
expect(screen.getByTestId("action-agy.send")).toHaveTextContent("Send");
expect(screen.getByTestId("action-agy.approve")).toHaveTextContent("Approve");
expect(screen.getByText(/Conversations/i)).toBeInTheDocument();
```

```ts
// tests/web/SlashCommandPalette.test.tsx
expect(screen.getByTestId("palette-cmd-agy.help")).toHaveTextContent("/help");
```

```ts
// tests/web/store-sessions.test.ts
await useSessions.getState().sendInput("\x1b[A");
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining("/api/sessions/s1/input"),
  expect.objectContaining({ body: JSON.stringify({ input: "\x1b[A" }) }),
);
```

- [ ] **Step 11.2: Run to verify failure**

Run: `pnpm test ProviderSelector ActionPanel SessionDiscoveryList SlashCommandPalette store-sessions`
Expected: FAIL because frontend does not understand `agy` conversations/input/slash commands yet.

- [ ] **Step 11.3: Add session store methods**

In `src/web/stores/sessions.ts` add state:

```ts
conversations: ConversationDescriptor[];
sendInput: (input: string) => Promise<void>;
listConversations: () => Promise<void>;
selectConversation: (conversationId: string) => Promise<void>;
```

Implement:

```ts
async sendInput(input) {
  const active = get().active;
  if (!active) throw new Error("No active session");
  await api.post(`/api/sessions/${active.sessionId}/input`, { input });
},

async listConversations() {
  const active = get().active;
  if (!active) return;
  const { conversations } = await api.get<{ conversations: ConversationDescriptor[] }>(
    `/api/sessions/${active.sessionId}/conversations`,
  );
  set({ conversations });
},

async selectConversation(conversationId) {
  const active = get().active;
  if (!active) return;
  await api.post(`/api/sessions/${active.sessionId}/conversations/${encodeURIComponent(conversationId)}/select`);
  await get().refreshSnapshot();
},
```

- [ ] **Step 11.4: Use active provider for discovery and launch**

Update `Workspace`:

```tsx
<SessionDiscoveryList projectId={active.id} providerId={activeProvider ?? "antigravity"} />
```

Update `SessionDiscoveryList` props and calls:

```tsx
export function SessionDiscoveryList({
  projectId,
  providerId = "antigravity",
}: { projectId: string; providerId?: ProviderId }) {
  const { discovered, discover, attach, launch } = useSessions();

  useEffect(() => {
    void discover(projectId, providerId);
  }, [discover, projectId, providerId]);

  const refresh = () => void discover(projectId, providerId);
  const launchSelected = () => void launch(projectId, providerId);

  return (
    <div>
      <button type="button" onClick={refresh}>refresh</button>
      <button type="button" onClick={launchSelected}>launch new</button>
      {discovered.map((s) => (
        <button key={s.sessionId} type="button" onClick={() => void attach(s.sessionId)}>
          {s.hint}
        </button>
      ))}
    </div>
  );
}
```

Add labels:

```ts
"agy-pty": "agy PTY",
"agy-wrapper": "agy Wrapper",
"agy-unmanaged": "agy External",
```

Use heading:

```tsx
Discovered {providerId === "agy" ? "agy" : "Antigravity"} sessions
```

- [ ] **Step 11.5: Render conversations in ActionPanel**

Add load effect:

```tsx
const {
  active,
  actions,
  conversations,
  refreshActions,
  performAction,
  listConversations,
  selectConversation,
  status,
  errorMessage,
} = useSessions();

useEffect(() => {
  void listConversations();
}, [active?.sessionId, listConversations]);
```

Add a section below actions:

```tsx
<div className="p-3 border-t border-border">
  <h3 className="text-xs uppercase tracking-wide text-fg-2 mb-1">Conversations</h3>
  {conversations.length === 0 ? (
    <p className="text-xs text-fg-2">No conversations found.</p>
  ) : (
    <ul className="space-y-1">
      {conversations.map((c) => (
        <li key={c.conversationId}>
          <button
            type="button"
            onClick={() => void selectConversation(c.conversationId)}
            className="w-full text-left text-xs rounded px-2 py-1 border border-border bg-bg-2 hover:border-accent"
            data-testid={`conversation-${c.conversationId}`}
          >
            <span className="block truncate">{c.title}</span>
            <span className="block font-mono text-[10px] text-fg-2 truncate">
              {c.conversationId}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 11.6: Make mirror title provider-neutral**

```tsx
title={active?.providerId === "agy" ? "agy mirror" : "Antigravity mirror"}
```

- [ ] **Step 11.7: Merge provider slash commands**

In `SlashCommandPalette`, read providers and active session:

```tsx
const { providers } = useProviders();
const activeProvider = providers.find((p) => p.id === active?.providerId);
const providerCommands: PaletteCmd[] = (activeProvider?.slashCommands ?? []).map((cmd) => ({
  id: cmd.id,
  label: cmd.label,
  hint: "Provider command",
  enabled: !!active && cmd.enabled,
  run: () => { void sendPrompt(cmd.command); close(); },
}));
const baseCommands: PaletteCmd[] = [
  { id: "new", label: "/new", hint: "Start a new conversation", enabled: !!active, run: () => { void newConversation(); close(); } },
  { id: "stop", label: "/stop", hint: "Stop current generation", enabled: !!active, run: () => { void stop(); close(); } },
  { id: "project", label: "/project", hint: "Switch project", enabled: true, run: () => { navigate("/"); close(); } },
  { id: "files", label: "/files", hint: "Open file explorer", enabled: !!onOpenFiles, run: () => { onOpenFiles?.(); close(); } },
  { id: "terminal", label: "/terminal", hint: "Open terminal panel", enabled: !!onOpenTerminal, run: () => { onOpenTerminal?.(); close(); } },
  { id: "settings", label: "/settings", hint: "Open settings", enabled: true, run: () => { navigate("/settings"); close(); } },
];
const cmds = [...providerCommands, ...baseCommands];
```

- [ ] **Step 11.8: Verify**

Run: `pnpm test ProviderSelector ActionPanel SessionDiscoveryList SlashCommandPalette store-sessions && pnpm build:web`
Expected: PASS.

- [ ] **Step 11.9: Commit**

```bash
git add src/web/stores/sessions.ts src/web/stores/providers.ts src/web/components/ProviderSelector.tsx src/web/components/SessionDiscoveryList.tsx src/web/components/ActionPanel.tsx src/web/components/MirrorTimeline.tsx src/web/components/SlashCommandPalette.tsx src/web/components/Workspace.tsx tests/web/ProviderSelector.test.tsx tests/web/ActionPanel.test.tsx tests/web/SessionDiscoveryList.test.tsx tests/web/SlashCommandPalette.test.tsx tests/web/store-sessions.test.ts
git commit -m "feat(web): expose agy provider controls"
```

---

## Task 12 — Contract Audits and Error Codes

Make security invariants fail closed for the new provider.

**Files:**
- Modify: `tests/contract-audit.test.ts`
- Modify: `tests/errors.test.ts`
- Modify: `src/server/core/errors.ts` only if the project has a central code list by execution time

- [ ] **Step 12.1: Extend static action audit**

Add `keystrokes` to forbidden request body fields:

```ts
const forbidden = [
  "selector",
  "xpath",
  "occurrenceIndex",
  "buttonText",
  "rawCommand",
  "expression",
  "keystrokes",
];
```

Add a frontend audit:

```ts
it("frontend never sends raw provider command fields", async () => {
  const webRoot = join(__dirname, "..", "src", "web");
  const files = await walk(webRoot);
  for (const f of files) {
    const src = await readFile(f, "utf8");
    expect(src.includes("rawCommand"), f).toBe(false);
    expect(src.includes("selector"), f).toBe(false);
  }
});
```

- [ ] **Step 12.2: Add error code regression test**

```ts
// tests/errors.test.ts
it("agy errors use normalized AppError bodies", () => {
  const err = new AppError({
    code: "agy_action_unknown",
    operation: "agy.performAction",
    message: "Unknown agy action agy.nope.",
    recoveryAction: "Refresh actions and retry.",
  });
  expect(errEnvelope(err)).toEqual({
    ok: false,
    data: null,
    error: {
      code: "agy_action_unknown",
      operation: "agy.performAction",
      message: "Unknown agy action agy.nope.",
      recoveryAction: "Refresh actions and retry.",
    },
  });
});
```

- [ ] **Step 12.3: Verify**

Run: `pnpm test contract-audit errors && pnpm build`
Expected: PASS.

- [ ] **Step 12.4: Commit**

```bash
git add tests/contract-audit.test.ts tests/errors.test.ts src/server/core/errors.ts
git commit -m "test(agy): audit provider action contracts"
```

---

## Task 13 — E2E Stub Binary and Test Server Hooks

Create a deterministic `agy` shim and let e2e tests put it on PATH.

**Files:**
- Create: `e2e/fixtures/agy-stub.ts`
- Modify: `e2e/fixtures/server.ts`
- Create: `e2e/agy-provider.spec.ts`

- [ ] **Step 13.1: Add stub binary**

```ts
#!/usr/bin/env node
const { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");

const log = process.env.AGY_STUB_LOG;
const modeFile = process.env.AGY_STUB_MODE;
if (!log || !modeFile) {
  process.stderr.write("AGY_STUB_LOG and AGY_STUB_MODE are required\n");
  process.exit(2);
}
mkdirSync(dirname(log), { recursive: true });

if (process.argv.includes("--version")) {
  process.stdout.write("agy 0.0.0-stub\n");
  process.exit(0);
}
if (process.argv.includes("--help")) {
  process.stdout.write("/help Show help\n/resume Resume\n/clear Clear\n");
  process.exit(0);
}

function mode(): string {
  return existsSync(modeFile) ? readFileSync(modeFile, "utf8").trim() : "normal";
}

process.stdout.write("agy stub ready\n");
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  appendFileSync(log, chunk);
  if (chunk.includes("/resume")) {
    process.stdout.write(`\nresumed ${chunk.trim().split(/\s+/).at(-1)}\n`);
    return;
  }
  if (chunk.includes("/help")) {
    process.stdout.write("\nhelp body\n");
    return;
  }
  if (chunk.includes("approval")) {
    process.stdout.write(mode() === "deny" ? "\n(a)pprove (d)eny\n" : "\n[Y/n]\n");
    return;
  }
  if (chunk.includes("y")) {
    process.stdout.write("\napproved\n");
    writeFileSync(modeFile, "normal");
    return;
  }
  if (chunk.includes("n")) {
    process.stdout.write("\ndenied\n");
    writeFileSync(modeFile, "normal");
    return;
  }
  process.stdout.write(`\necho: ${chunk.trim()}\n`);
});
```

The source file is intentionally JavaScript-compatible CommonJS even though it lives at the `.ts` path required by the spec. In tests, copy it to a temp PATH entry named `agy` with no extension so Node executes it through the shebang:

```bash
chmod +x e2e/fixtures/agy-stub.ts
```

- [ ] **Step 13.2: Extend test server options**

Change `startTestServer()` to accept:

```ts
import type { AppConfig } from "../../src/server/core/config.js";

export interface StartTestServerOpts {
  configure?: (cfg: AppConfig) => void;
  env?: Record<string, string>;
}

export async function startTestServer(opts: StartTestServerOpts = {}): Promise<RunningServer> {
  execSync("pnpm build", { cwd: root, stdio: "inherit" });

  const configDir = await mkdtemp(join(tmpdir(), "arc-e2e-config-"));
  const appCfgDir = join(configDir, "agent-remote-control");
  await mkdir(appCfgDir, { recursive: true });

  const projectDir = await mkdtemp(join(tmpdir(), "arc-e2e-project-"));
  await writeFile(join(projectDir, "hello.txt"), "e2e file body\n");

  const { hashPassword } = await import(
    pathToFileURL(join(root, "dist/server/core/auth.js")).href
  );
  const { defaultConfig } = await import(
    pathToFileURL(join(root, "dist/server/core/config.js")).href
  );
  const { hash, algorithm } = await hashPassword(PASSWORD);
  const cfg = defaultConfig() as AppConfig;
  cfg.server.host = "127.0.0.1";
  cfg.server.port = await freePort();
  cfg.server.passwordHash = hash;
  cfg.security.passwordHashAlgorithm = algorithm;
  cfg.projects.roots = [projectDir];
  cfg.terminal.enabled = true;
  opts.configure?.(cfg);

  await writeFile(
    join(appCfgDir, "config.json"),
    JSON.stringify({ version: 1, data: cfg }, null, 2),
    { mode: 0o600 },
  );

  const env = { ...process.env, ...opts.env, XDG_CONFIG_HOME: configDir, NODE_ENV: "production" };
  const proc = spawn(process.execPath, [join(root, "dist/server/index.js")], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderr: string[] = [];
  proc.stderr?.on("data", (chunk) => stderr.push(chunk.toString("utf8")));

  const baseURL = `http://127.0.0.1:${cfg.server.port}`;
  await waitForHealth(baseURL, () => stderr.join(""));

  return {
    baseURL,
    password: PASSWORD,
    projectDir,
    configDir,
    stop: async () => {
      proc.kill("SIGTERM");
      await waitForExit(proc).catch(() => proc.kill("SIGKILL"));
      await rm(configDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
    },
  };
}
```

Keep existing callers working with no args.

- [ ] **Step 13.3: Verify stub and server hooks**

Run:

```bash
pnpm test:e2e e2e/projects.spec.ts
```

Expected: existing e2e tests still pass with default `startTestServer()` arguments.

---

## Task 14 — E2E Scenarios

Ship every required scenario against the stub.

**Files:**
- Complete: `e2e/agy-provider.spec.ts`

- [ ] **Step 14.1: Implement all scenarios**

Create the spec with concrete helpers and all 11 flows:

```ts
// e2e/agy-provider.spec.ts
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startTestServer, type RunningServer } from "./fixtures/server.js";
import { signIn } from "./fixtures/test.js";

interface AgyFx {
  srv: RunningServer;
  binDir: string;
  conversationsDir: string;
  logFile: string;
  modeFile: string;
  stop: () => Promise<void>;
}

async function startAgyServer(testInfo: TestInfo): Promise<AgyFx> {
  const binDir = await mkdtemp(join(tmpdir(), "arc-agy-bin-"));
  const agyBin = join(binDir, "agy");
  await copyFile(resolve("e2e/fixtures/agy-stub.ts"), agyBin);
  await chmod(agyBin, 0o755);

  const conversationsDir = join(testInfo.outputDir, "conversations");
  await mkdir(conversationsDir, { recursive: true });
  const logFile = join(testInfo.outputDir, "agy.log");
  const modeFile = join(testInfo.outputDir, "agy.mode");
  await writeFile(modeFile, "normal");

  const srv = await startTestServer({
    configure: (cfg) => {
      cfg.providers.agy.command = "agy";
      cfg.providers.agy.conversationsDir = conversationsDir;
    },
    env: {
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      AGY_STUB_LOG: logFile,
      AGY_STUB_MODE: modeFile,
    },
  });

  return {
    srv,
    binDir,
    conversationsDir,
    logFile,
    modeFile,
    stop: async () => {
      await srv.stop();
      await rm(binDir, { recursive: true, force: true });
    },
  };
}

async function openAgyWorkspace(page: Page, fx: AgyFx): Promise<void> {
  await signIn(page, fx.srv);
  await page.getByPlaceholder(/manual path/i).fill(fx.srv.projectDir);
  await page.getByRole("button", { name: /^add$/i }).click();
  const confirmBtn = page.getByRole("button", { name: /confirm add/i });
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
  await page.waitForURL(/\/workspace\//);
  await page.getByTestId("provider-agy").click();
}

async function launchAgy(page: Page): Promise<void> {
  await page.getByRole("button", { name: /launch new/i }).click();
  await expect(page.getByTestId("action-agy.send")).toBeVisible({ timeout: 10_000 });
}

async function mirrorText(page: Page): Promise<string> {
  return page.frameLocator("[data-testid='mirror-iframe']").locator("body").innerText();
}

async function expectLog(fx: AgyFx, pattern: RegExp): Promise<void> {
  await expect
    .poll(async () => readFile(fx.logFile, "utf8").catch(() => ""))
    .toMatch(pattern);
}

function protoField(tag: number, value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([tag << 3 | 2, body.length]), body]);
}

async function seedConversations(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const [id, title] of [["one", "First"], ["two", "Second"], ["three", "Third"]]) {
    await writeFile(join(dir, `${id}.pb`), Buffer.concat([
      protoField(1, id),
      protoField(2, title),
      protoField(4, "/project"),
    ]));
  }
}

test("agy cold launch from picker mirrors initial TUI and actions", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  try {
    await openAgyWorkspace(page, fx);
    await launchAgy(page);
    await expect.poll(() => mirrorText(page)).toContain("agy stub ready");
    await expect(page.getByTestId("action-agy.cancel")).toBeVisible();
  } finally {
    await fx.stop();
  }
});

test("agy prompt updates mirror within 5s", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  try {
    await openAgyWorkspace(page, fx);
    await launchAgy(page);
    await page.getByPlaceholder(/send a message/i).fill("hello");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect.poll(() => mirrorText(page), { timeout: 5_000 }).toContain("echo: hello");
  } finally {
    await fx.stop();
  }
});

test("agy approval prompt approve path writes y", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  try {
    await openAgyWorkspace(page, fx);
    await launchAgy(page);
    await page.getByPlaceholder(/send a message/i).fill("approval");
    await page.getByRole("button", { name: /^send$/i }).click();
    await page.getByTestId("action-agy.approve").click();
    await expectLog(fx, /y\n/);
    await expect.poll(() => mirrorText(page)).toContain("approved");
  } finally {
    await fx.stop();
  }
});

test("agy approval prompt deny path writes n", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  try {
    await writeFile(fx.modeFile, "deny");
    await openAgyWorkspace(page, fx);
    await launchAgy(page);
    await page.getByPlaceholder(/send a message/i).fill("approval");
    await page.getByRole("button", { name: /^send$/i }).click();
    await page.getByTestId("action-agy.deny").click();
    await expectLog(fx, /n\n/);
    await expect.poll(() => mirrorText(page)).toContain("denied");
  } finally {
    await fx.stop();
  }
});

test("agy slash palette writes help command", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  try {
    await openAgyWorkspace(page, fx);
    await launchAgy(page);
    await page.getByRole("button", { name: "/" }).click();
    await page.getByTestId("palette-cmd-agy.help").click();
    await expectLog(fx, /\/help\n/);
  } finally {
    await fx.stop();
  }
});

test("agy conversations list reads three pb files", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  try {
    await seedConversations(fx.conversationsDir);
    await openAgyWorkspace(page, fx);
    await launchAgy(page);
    await expect(page.getByTestId("conversation-one")).toBeVisible();
    await expect(page.getByTestId("conversation-two")).toBeVisible();
    await expect(page.getByTestId("conversation-three")).toBeVisible();
  } finally {
    await fx.stop();
  }
});

test("agy resume conversation writes resume command", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  try {
    await seedConversations(fx.conversationsDir);
    await openAgyWorkspace(page, fx);
    await launchAgy(page);
    await page.getByTestId("conversation-two").click();
    await expectLog(fx, /\/resume two\n/);
    await expect.poll(() => mirrorText(page)).toContain("resumed two");
  } finally {
    await fx.stop();
  }
});

test("wrap-agy IPC registration appears as agy-wrapper and attaches", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  let wrapper: ChildProcess | null = null;
  try {
    wrapper = spawn(process.execPath, ["dist/cli/index.js", "wrap-agy", fx.srv.projectDir], {
      env: {
        ...process.env,
        PATH: `${fx.binDir}:${process.env.PATH ?? ""}`,
        XDG_CONFIG_HOME: fx.srv.configDir,
        AGY_STUB_LOG: fx.logFile,
        AGY_STUB_MODE: fx.modeFile,
      },
      stdio: "ignore",
    });
    await openAgyWorkspace(page, fx);
    await page.getByRole("button", { name: /refresh/i }).click();
    await expect(page.getByTestId("discovered-agy-wrapper")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("discovered-agy-wrapper").getByRole("button", { name: /resume|attach/i }).click();
    await expect(page.getByTestId("action-agy.send")).toBeVisible();
  } finally {
    wrapper?.kill("SIGTERM");
    await fx.stop();
  }
});

test("unmanaged agy detection is visible and not attachable", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  let unmanaged: ChildProcess | null = null;
  try {
    unmanaged = spawn(join(fx.binDir, "agy"), [], {
      cwd: fx.srv.projectDir,
      env: {
        ...process.env,
        AGY_STUB_LOG: fx.logFile,
        AGY_STUB_MODE: fx.modeFile,
      },
      stdio: "ignore",
    });
    await openAgyWorkspace(page, fx);
    await page.getByRole("button", { name: /refresh/i }).click();
    const row = page.getByTestId("discovered-agy-unmanaged");
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByRole("button", { name: /not controllable/i })).toBeDisabled();
    await expect(row).toContainText("agent-remote-control agy");
  } finally {
    unmanaged?.kill("SIGTERM");
    await fx.stop();
  }
});

test("stopping owned agy-pty marks lifecycle stopped", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  try {
    await openAgyWorkspace(page, fx);
    await launchAgy(page);
    await page.getByPlaceholder(/send a message/i).fill("long running");
    await page.getByRole("button", { name: /^send$/i }).click();
    await page.getByRole("button", { name: /^stop$/i }).click();
    await expect(page.getByText(/owned-stopped|stopped/i)).toBeVisible({ timeout: 10_000 });
  } finally {
    await fx.stop();
  }
});

test("server shutdown does not signal agy-wrapper or agy-unmanaged", async ({ page }, testInfo) => {
  const fx = await startAgyServer(testInfo);
  let wrapper: ChildProcess | null = null;
  let unmanaged: ChildProcess | null = null;
  try {
    wrapper = spawn(process.execPath, ["dist/cli/index.js", "wrap-agy", fx.srv.projectDir], {
      env: {
        ...process.env,
        PATH: `${fx.binDir}:${process.env.PATH ?? ""}`,
        XDG_CONFIG_HOME: fx.srv.configDir,
        AGY_STUB_LOG: fx.logFile,
        AGY_STUB_MODE: fx.modeFile,
      },
      stdio: "ignore",
    });
    unmanaged = spawn(join(fx.binDir, "agy"), [], {
      cwd: fx.srv.projectDir,
      env: {
        ...process.env,
        AGY_STUB_LOG: fx.logFile,
        AGY_STUB_MODE: fx.modeFile,
      },
      stdio: "ignore",
    });
    await openAgyWorkspace(page, fx);
    await fx.srv.stop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(wrapper.exitCode).toBeNull();
    expect(unmanaged.exitCode).toBeNull();
  } finally {
    wrapper?.kill("SIGTERM");
    unmanaged?.kill("SIGTERM");
    await rm(fx.binDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 14.2: Verify e2e**

Run: `pnpm test:e2e e2e/agy-provider.spec.ts`
Expected: all 11 pass.

- [ ] **Step 14.3: Commit**

```bash
git add e2e/fixtures/agy-stub.ts e2e/fixtures/server.ts e2e/agy-provider.spec.ts
git commit -m "test(e2e): cover agy provider workflows"
```

---

## Task 15 — Full Regression and Antigravity Byte-Equivalence Check

Prove the new provider did not break the existing Antigravity IDE surface.

**Files:**
- Modify: `docs/api-contract.md` if it already documents provider IDs or source types.
- Modify: `README.md` only if it documents wrapper command names.

- [ ] **Step 15.1: Run full unit/integration suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 15.2: Run full e2e suite**

Run:

```bash
pnpm test:e2e
```

Expected: PASS, including the 11 agy scenarios.

- [ ] **Step 15.3: Run full build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 15.4: Static grep audit**

Run:

```bash
grep -RIn "dangerouslySetInnerHTML\\|rawCommand\\|selector\\|buttonText\\|occurrenceIndex" src tests
```

Expected: no new violations outside existing sanctioned server-side action registry fields. If `occurrenceIndex` appears in `src/server/adapters/antigravity/targeting.ts`, that is expected; no frontend or HTTP route may accept it from a request body.

- [ ] **Step 15.5: Verify Antigravity route compatibility**

Run:

```bash
pnpm test cdp-adapter cdp-route-h9 cdp-snapshot cdp-targeting sessions-api wrapper-adapter unmanaged tmux-screen realtime-ws
```

Expected: PASS. Existing Antigravity provider uses the same envelopes and route paths as before.

- [ ] **Step 15.6: Update docs only if needed**

If `docs/api-contract.md` lists provider/source enums, update it with:

```md
- Provider IDs: `antigravity`, `agy`, `claude`, `codex`, `opencode`
- `agy` source types: `agy-pty`, `agy-wrapper`, `agy-unmanaged`
```

If `README.md` lists wrapper commands, update it with:

```md
- `agent-remote-control wrap-antigravity <project>` launches Antigravity IDE.
- `agent-remote-control antigravity <project>` is an alias for `wrap-antigravity`.
- `agent-remote-control wrap-agy <project>` launches the Antigravity CLI.
- `agent-remote-control agy <project>` is an alias for `wrap-agy`.
```

- [ ] **Step 15.7: Final commit**

```bash
git add docs/api-contract.md README.md
git commit -m "docs: document agy provider commands"
```

Skip this commit if neither file needed changes.

---

## Acceptance Evidence

Before reporting this provider done, capture:

- `pnpm test` output showing all Vitest layers pass.
- `pnpm test:e2e` output showing all Playwright scenarios pass.
- `pnpm build` output.
- Screenshot or Playwright trace evidence for:
  - provider selector showing `agy`,
  - cold launch mirror,
  - approval button appears and disappears after approve,
  - conversations list and resume.
- Static audit evidence:
  - frontend never sends raw keystrokes except the explicit `/input` body,
  - frontend never sends selectors, CDP paths, DOM text occurrences, or provider raw commands,
  - all HTTP responses remain `{ ok, data, error }`,
  - all WS events remain `{ type, projectId?, sessionId?, version, payload }`.

---

## Self-Review

**Spec coverage:**
- §1 Provider/source types: Task 1.
- §1 file layout: Tasks 2-9.
- §1 wrapper subcommand split: Task 7.
- §1 recommendation marker: Task 1.
- §2 sources/lifecycles/capabilities: Tasks 6-10.
- §3 conversations: Task 5 and Task 11.
- §3 snapshot: Task 4 and Task 6.
- §3 actions: Task 3 and Task 11.
- §4 UI/wire/config: Tasks 1, 10, 11.
- §5 errors/testing: Tasks 2-14.
- §6 hard rules: Tasks 7, 10, 12, 15.
- §7 out-of-scope: no cross-machine discovery, no token auth, no streaming token mirror.
- §8 migration: Task 7.
- §9 acceptance: Tasks 14 and 15.

**Placeholder scan:** no `TBD`, `TODO`, "implement later", or unspecified "add tests" steps remain. Task 14 lists exact required test names and evidence; its body is intentionally the implementation task for Playwright flows, not a placeholder for unspecified behaviour.

**Type consistency:** Provider ID is `agy`; source types are `agy-pty`, `agy-wrapper`, `agy-unmanaged`; action IDs are `agy.*`; route aliases use `/api/sessions/:id/input` and `/api/sessions/:id/action` while preserving the existing `/actions/:actionId` route.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-agy-provider.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
