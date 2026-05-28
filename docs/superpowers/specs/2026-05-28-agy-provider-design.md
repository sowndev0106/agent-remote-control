# `agy` Provider — Design Spec

> **Status:** approved (brainstorm phases 1-5)
> **Audience:** the engineer who will write the implementation plan and ship it.
> **Date:** 2026-05-28
> **Related plan (downstream):** `docs/superpowers/plans/2026-05-28-agy-provider.md` (to be written from this spec).

## 0. Why this exists

The user runs **two** different programs day-to-day:

| Binary | What it is | How we already control it |
|---|---|---|
| `antigravity` | Google's Antigravity IDE — Electron + Chromium 146 | CDP via `--remote-debugging-port`, plus tmux/screen/wrapper discovery |
| `agy` | The Antigravity Go CLI — Bubble Tea TUI, files in `~/.gemini/antigravity-cli/` | **nothing yet — this spec adds it** |

`agy` is a TUI; CDP doesn't apply. We need a separate provider with its own adapter, snapshot mechanism (xterm-headless on a captured PTY stream), and action set (keybinding shortcuts). This spec lets the phone UI launch, mirror, and approve actions in `agy` the same way it does for `antigravity` today, without breaking any of the existing Antigravity surface.

## 1. Architecture overview

### 1.1 New ProviderId + sources

Extend `src/server/domains/types.ts`:

```ts
export type ProviderId = "antigravity" | "agy" | "claude" | "codex" | "opencode";

export type SourceType =
  | "cdp"
  | "managed-pty"
  | "wrapper"
  | "tmux"
  | "screen"
  | "unmanaged"
  | "agy-pty"        // app-launched node-pty child
  | "agy-wrapper"    // CLI wrapper registered via IPC (pid + cwd, no port)
  | "agy-unmanaged"; // /proc-discovered, not controllable
```

Lifecycle constants reuse what we have today (`owned-running`, `external-attached`, `external-unmanaged`).

### 1.2 File layout

```
src/server/adapters/agy/
  index.ts          — composition: AgyAdapter implements IProviderAdapter
  pty.ts            — AgyPtyAdapter: spawn `agy` in node-pty, capture stream
  wrapper.ts        — AgyWrapperAdapter: register PIDs the wrap-agy CLI started
  unmanaged.ts      — AgyUnmanagedDetector: scan /proc for `agy` not owned/wrapped
  conversations.ts  — read ~/.gemini/antigravity-cli/conversations/*.pb (best effort)
  snapshot.ts       — feed PTY chunks into xterm-headless, hash + serialize
  actions.ts        — fixed shortcut catalog + heuristic approval prompt detection
  detect.ts         — `agy --version` / which lookup
```

Existing `src/server/adapters/antigravity/*` is **untouched** structurally — it keeps owning Antigravity (the IDE). New files live next to it.

### 1.3 Wrapper CLI subcommand split

Today's `agy` and `antigravity` subcommands both invoke the wrapper for the **Antigravity IDE**. To disambiguate after this spec:

| Subcommand | Spawns | Notes |
|---|---|---|
| `agent-remote-control wrap-antigravity <project>` | `antigravity` (Electron) | renamed from current `agy`/`antigravity` |
| `agent-remote-control wrap-agy <project>` | `agy` (Go CLI) | new |
| `agent-remote-control agy <project>` | **alias → `wrap-agy`** | preferred for daily use |
| `agent-remote-control antigravity <project>` | **alias → `wrap-antigravity`** | preserved for muscle memory |

Both wrappers register via IPC (`register-session` already exists; we add `provider` to its payload).

### 1.4 Recommendation marker

Project marker: `.antigravitycli/` directory (created by `agy` on first run inside a project). Add to `RecommendationMarker.marker` union.

## 2. Sources, lifecycles, capabilities

Three sources for the `agy` provider:

| Source | Owned? | Controllable? | Capabilities supported |
|---|---|---|---|
| `agy-pty` | yes | full | `launch, attach, stop, sendPrompt, sendInput, listConversations, selectConversation, getSnapshot, getStatus, getActions, performAction, dispose` |
| `agy-wrapper` | no | full minus `stop`/`dispose` (we never SIGTERM unowned) | `attach, sendPrompt, sendInput, listConversations, selectConversation, getSnapshot, getStatus, getActions, performAction` |
| `agy-unmanaged` | no | none | all `unsupported`; carries a `guidance.recommendedCommand` like the existing antigravity-unmanaged path |

Detection (`detect()`): `which agy` + `agy --version` parsed loosely. If neither resolves, capabilities are all `unsupported`, `available: false`.

## 3. Conversations, snapshot, actions

### 3.1 Conversations

`agy` persists per-project conversations as protobuf files at `~/.gemini/antigravity-cli/conversations/<id>.pb`.

- `listConversations(session)` → reads `~/.gemini/antigravity-cli/conversations/`, parses each file with a **minimal hand-rolled proto reader** for the fields we need (id, title, startedAt, projectPath). Fall back to filename + mtime if parsing fails.
- `selectConversation(session, id)` → for `agy-pty` we drive the TUI: `sendInput` "/resume <id>\n". For `agy-wrapper` it's the same — both share an active PTY stream.
- Best-effort: returns `[]` rather than throwing if the directory is missing.

### 3.2 Snapshot

PTY stream feeds `xterm-headless` (already a dependency). `getSnapshot` returns:

```ts
{
  hash: string;              // sha256 of serialized cells
  capturedAt: number;
  text: string;              // full visible buffer + scrollback up to N lines
  html?: string;             // styled buffer for the iframe; sandbox=""
}
```

Re-render is throttled to `snapshotPollMs` (default 500ms for `agy`, faster than Antigravity's 1s because TUIs change quickly).

### 3.3 Actions

Two action sources, merged:

**Fixed shortcuts** (always available when session is `running`):

| actionId | Label | Sends |
|---|---|---|
| `agy.send` | Send | `\r` (Enter) |
| `agy.cancel` | Cancel / Esc | `\x1b` |
| `agy.up` / `agy.down` / `agy.left` / `agy.right` | Arrow keys | `\x1b[A`/`B`/`C`/`D` |
| `agy.tab` | Tab | `\t` |
| `agy.ctrl_c` | Ctrl-C | `\x03` |
| `agy.slash` | Open slash command palette | `/` |

**Heuristic approval detection** — scan the last 30 lines of the rendered buffer for any of:

- `^\s*\[Y/n\]\s*$` or `\[y\/N\]`
- `^\s*Approve\??\s*\(y/n\)\s*$`
- `Press y to approve`
- `\(a\)pprove\s*\(d\)eny` (capture both options)

Emit `{ actionId: "agy.approve", kind: "approval" }` and (when the deny variant is present) `{ actionId: "agy.deny", kind: "approval" }`. `performAction` writes `y\n` / `n\n` accordingly.

Action IDs are server-issued (strict CSP rule: frontend never sends keystrokes raw).

## 4. UI, wire protocol, config

### 4.1 Phone-view UI

Three zones, top-to-bottom:

1. **Mirror** (sandboxed iframe, `srcDoc` only) — same component as today's MirrorTimeline, fed by `getSnapshot`.
2. **Action panel** — buttons for the fixed shortcut set + any heuristic approvals; vertical-stack on phone, two-column on tablet.
3. **Composer + slash command palette** — same component as `antigravity`. Slash menu entries from `agy --help` parsed once at adapter `detect()`.

Provider switcher already exists; `agy` becomes a new entry there.

### 4.2 Wire protocol

No new endpoint shapes. Reuse existing routes:

- `GET /api/sessions/discover?projectPath=...` — aggregator already merges by `Discoverable[]`; we add three new entries (pty, wrapper, unmanaged) at assembly. No envelope change.
- `POST /api/sessions/launch` — body `{ providerId: "agy", projectPath }`. Adapter routes by `providerId`.
- `POST /api/sessions/:id/prompt` — `sendPrompt` writes to PTY.
- `POST /api/sessions/:id/input` — `sendInput`.
- `POST /api/sessions/:id/action` — server-issued action IDs only.
- `GET /api/sessions/:id/snapshot` — `getSnapshot`.
- `GET /api/sessions/:id/conversations` and `POST /api/sessions/:id/conversation` — list / select.
- WS: `provider.snapshot.changed`, `provider.actions.changed`, `terminal.output` events fire on the existing channel.

### 4.3 Config defaults

Add to `defaultConfig().providers`:

```jsonc
"agy": {
  "enabled": true,
  "command": "agy",
  "wrapperCommands": ["agy"],
  "controlSurfaces": ["agy-pty", "agy-wrapper"],
  "snapshotPollMs": 500,
  "scrollback": 4000,
  "conversationsDir": "~/.gemini/antigravity-cli/conversations"
}
```

`mergeWithDefaults` extended accordingly.

## 5. Errors and testing

### 5.1 New AppError codes

| Code | When |
|---|---|
| `agy_not_installed` | `which agy` returns nothing on `detect()` |
| `agy_pty_spawn_failed` | node-pty couldn't spawn `agy` |
| `agy_pty_exited` | child exited before reaching `running` |
| `agy_conversation_dir_missing` | listConversations called and dir is missing (returned, not thrown — we fall back to `[]`; logged at warn) |
| `agy_conversation_parse_failed` | per-file parse failure (best-effort, logged) |
| `agy_action_unknown` | actionId not in catalog and not a current heuristic match |
| `agy_action_disabled` | session not running |
| `agy_resume_failed` | `/resume <id>\n` produced no buffer change in 5s |

### 5.2 Test layers

**Unit (vitest):**
- `tests/agy-detect.test.ts` — version parsing, missing-binary path.
- `tests/agy-pty-adapter.test.ts` — spawn, sendInput, sendPrompt (with newline), exit handling, snapshot before+after.
- `tests/agy-wrapper-adapter.test.ts` — register, dedupe by PID, unregister on IPC.
- `tests/agy-unmanaged.test.ts` — /proc fixture, exclude owned/wrapper PIDs.
- `tests/agy-snapshot.test.ts` — feed xterm-headless with chunked input; hash stable; html scrubbed.
- `tests/agy-actions.test.ts` — fixed shortcuts, approval-regex matrix (8 cases incl. negatives), action ID server-issued check.
- `tests/agy-conversations.test.ts` — proto fixture, missing-dir, parse-fail per file → `[]` fallback.
- `tests/agy-discovery-integration.test.ts` — aggregator returns merged sessions when `agy` adapters are registered.

**HTTP integration (vitest, against built Fastify):**
- launch / snapshot / prompt / input / action / list-conv / select-conv / stop, all targeting `providerId: "agy"`.
- Discovery endpoint returns `agy-pty` + `agy-wrapper` + `agy-unmanaged` entries.
- Capability map served at `/api/providers` matches the spec table in §2.

**Web component (vitest + jsdom):**
- ProviderSelector shows `agy`.
- ActionPanel renders `agy.send` / `agy.cancel` / approvals.
- Composer slash palette enumerates `/help`, `/resume`, `/clear` from a mocked detect response.

**E2E (Playwright, against a real server + a stub `agy` shim binary on PATH):**

11 scenarios — all required:

1. Cold launch from picker → mirror shows initial TUI, action buttons render.
2. Send prompt → mirror updates, response text appears in snapshot within 5s.
3. Approval prompt detected (stub prints `[Y/n]`) → "Approve" button appears, click → stub records `y\n`, button disappears.
4. Deny path: stub prints `(a)pprove (d)eny` → click Deny → `n\n`.
5. Slash palette open → arrow-down → enter → `/help` written to stub.
6. Conversations list: pre-seed 3 fake `.pb` files → list returns 3 with titles.
7. Resume conversation: select → adapter writes `/resume <id>\n` → stub echoes "resumed".
8. Wrapper register: spawn stub via `wrap-agy` IPC → discovery returns `agy-wrapper` entry; phone can attach.
9. Unmanaged detection: pre-spawn stub outside the app, no IPC → discovery returns `agy-unmanaged` with `attachable:false` and a `recommendedCommand` containing the project path.
10. Stop owned `agy-pty` → SIGTERM child, lifecycle goes `owned-stopped`.
11. Server shutdown does NOT signal `agy-wrapper` or `agy-unmanaged` PIDs (assert via stub side-channel).

Stub `agy` binary lives at `e2e/fixtures/agy-stub.ts` (Node script with shebang) and is symlinked onto a temp PATH per test.

## 6. Hard rules retained from existing providers

- **Server-issued action IDs only.** Static-source test in `tests/contract-audit.test.ts` extended to ban `agy.*` selectors / raw keystrokes from frontend code paths.
- **Owned vs unowned.** `agy-pty` is owned (SIGTERM on shutdown). `agy-wrapper` and `agy-unmanaged` are never SIGTERMed.
- **`ELECTRON_RUN_AS_NODE` override.** The `agy` Go binary doesn't care, but `electronChildEnv()` already strips it. We use `mergeEnv` directly without the helper for `agy` since it's not Electron — but keep `env: process.env` clean.
- **CSP/iframe.** Snapshot HTML is served only inside the existing `sandbox=""` iframe with `srcDoc`. No new CSP exemption.
- **File-read scoping.** `~/.gemini/antigravity-cli/conversations/` is read directly by the adapter (server-side only) — never proxied through the file-explorer route.

## 7. Out of scope

- Multi-conversation cross-talk (one PTY = one active conversation; switching writes `/resume`).
- Cross-machine `agy` discovery (Phase 1 is local-only).
- A unified "Controllable" / "Launchable" / "Introspectable" seam beyond the existing `Discoverable`. (See `docs/superpowers/plans/2026-05-28-discoverable-seam.md` §Out-of-scope.)
- Streaming token-level mirror (we ship snapshot polling; stream comes when the WS event volume budget allows it).
- Authentication of `agy` sessions to Google — the binary handles its own auth; we never see the credentials.

## 8. Migration notes

- Existing `agy` and `antigravity` CLI subcommands become aliases for `wrap-agy` / `wrap-antigravity` respectively. No user-facing breakage; help text adds the new aliases.
- IPC protocol bumps `register-session` payload to include `provider: "antigravity" | "agy"`. Old wrapper builds (which omit it) default to `"antigravity"` server-side.
- Config: existing `providers.antigravity` block is unchanged. New `providers.agy` block is added with defaults; missing-block users get defaults via `mergeWithDefaults`.

## 9. Acceptance

The spec is satisfied when:

- `pnpm test` passes including all new vitest layers from §5.2.
- `pnpm test:e2e` passes all 11 scenarios from §5.2.
- The phone UI can launch `agy` for a project, send a prompt, approve a heuristic prompt, list & resume conversations, and stop the session — with the existing CSP / sandbox / action-ID rules still enforced.
- Antigravity (the IDE) provider behaviour is byte-identical at the HTTP / WS envelope.
