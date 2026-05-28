# Agent Remote Control — Technical Architecture

## Status

Architecture draft for the **Phase 1A CDP MVP** and full
**Phase 1 Antigravity Complete** release.

This document explains *how* the system is built. The *what* is in
[REQUIEMENT.md](REQUIEMENT.md) (REQ-* / NFR-* / AC-*). The *UX shape* is in
[design-frontend.md](design-frontend.md). The *execution order* is in
[sprints/](sprints/). The *invariants* the implementation must protect are
encoded as **H1–H17 Hard Rules** in [../AGENTS.md](../AGENTS.md). If anything
here conflicts with those documents, those documents win — patch this file.

---

## 1. Scope & Goals

`agent-remote-control` is a single-user, single-host Ubuntu app that turns a
local AI coding agent (Antigravity in Phase 1) into a browser-controlled
workspace on `http://127.0.0.1:4096`.

### In-scope (Phase 1A — CDP MVP)

- One self-contained Node.js process started by `systemd --user`.
- Web UI (React SPA) served by the same process.
- App-level password auth, server-issued sessions, CSRF.
- Project picker + recent project registry.
- Antigravity provider through the CDP control surface.
- CDP discovery, launch, attach, mirror, prompt, stop/new/history when
  detectable, and server-issued remote action IDs.
- Core opencode-style workspace UI for the CDP flow.
- Normalized HTTP and realtime envelopes.
- Local JSON persistence foundation and baseline hardening.

### In-scope (Phase 1B — Extended Antigravity)

- Antigravity provider across the remaining control surfaces:
  managed PTY, wrapper-launched (CLI registration), tmux/screen.
- Best-effort detection of **unmanaged** external Antigravity processes (no
  control — guidance only).
- Browser terminal (multi-tab, real PTY).
- Read-only file explorer (project-scoped).
- Final local JSON persistence coverage and hardening audit.

### Non-goals (Phase 1)

- Multi-user / RBAC. One installer = one user.
- Cloud relay. Everything is localhost (or LAN if user explicitly binds `0.0.0.0`).
- Calling `opencode serve` underneath. The shape is borrowed; the runtime is
  ours (see [README.md](../README.md)).
- Full Claude / Codex / opencode adapters. Stubs only; visible-and-disabled.
- File editing (REQ-085, H16).
- OAuth / API key extraction from desktop apps (NFR-005, H3).

---

## 2. Architectural Principles

1. **Normalize at the adapter boundary.** Provider-specific details (CDP
   selectors, tmux pane IDs, PTY fds) stay inside the adapter. The HTTP/WS
   surface and frontend see only normalized `Session`, `Capability`,
   `Snapshot`, `Action`, `Error` shapes (REQ-026A / REQ-026B / REQ-026C, H17).
2. **Server owns identity.** Frontend never invents action IDs, CDP selectors,
   or filesystem paths. Every mutation references a server-issued ID (REQ-114,
   H9).
3. **Capabilities are explicit.** Three states only: `supported`,
   `unsupported`, `unknown`. UI shows unsupported controls disabled, never
   silently missing (REQ-026C, NFR-020, H17).
4. **One envelope per channel.** HTTP commands use one result envelope
   (REQ-109, H7). Realtime traffic uses one event envelope (REQ-111, H8).
5. **Ownership-aware lifecycle.** The app may only stop processes it spawned.
   Unmanaged processes are observed, never terminated (NFR-013A, H15).
6. **Security defaults beat ergonomics.** `127.0.0.1` only; `0.0.0.0`
   requires explicit config plus non-default password (REQ-014, H6). Never
   trust LAN (NFR-007, H2). Never auto-kill a port holder (REQ-008, H1).
7. **Adapter > Source.** A single provider (Antigravity) speaks through
   multiple control-surface adapters that share the `IProviderAdapter`
   interface. CDP is preferred when multiple surfaces address the same
   process (REQ-045E).
8. **Two-channel UI.** State changes flow through HTTP commands and arrive
   back via realtime events. The frontend reconciles optimistic updates
   against authoritative server snapshots (see §10).

---

## 3. System Context

```text
                ┌─────────────────────────────────────────────────┐
                │                Ubuntu user session              │
                │                                                 │
   Browser ───► │  Node.js server  (agent-remote-control)         │
   (desktop /   │  ├── HTTP + WS + static SPA  (127.0.0.1:4096)   │
    phone)      │  ├── Auth + session + CSRF                      │
                │  ├── Provider adapters                          │
                │  │     ├── Antigravity / CDP   ──► localhost:9000–9003 (Antigravity Electron)
                │  │     ├── Antigravity / managed-PTY ──► node-pty ──► agy
                │  │     ├── Antigravity / wrapper ◄── IPC socket ◄── `agent-remote-control agy`
                │  │     ├── Antigravity / tmux  ──► `tmux send-keys` + `capture-pane`
                │  │     ├── Antigravity / screen──► `screen -X` + hardcopy
                │  │     └── Antigravity / unmanaged (read-only via /proc)
                │  ├── Browser terminal (node-pty pool)           │
                │  ├── File explorer (project-scoped fs)          │
                │  └── Persistence (~/.config/agent-remote-control)│
                │                                                 │
                │  systemd --user unit                            │
                └─────────────────────────────────────────────────┘
```

Trust boundary: the entire app is one OS user account. The web origin is
authenticated. CDP targets are discovered only on configured local ports and
validated by target metadata. IPC is protected by user-owned filesystem
permissions and a server-issued registration nonce; a native peer-credential
helper can be added later if stronger UID verification is required.

---

## 4. Process & Deployment Model

- **Process:** one Node.js 20+ process. Long-lived.
- **Manager:** `systemd --user` unit at
  `~/.config/systemd/user/agent-remote-control.service`. Autostart on user
  login. For headless installs the `install` command offers
  `loginctl enable-linger` so the service survives logout (see sprint 01
  risks).
- **Default bind:** `127.0.0.1:4096`. Switching to `0.0.0.0` requires
  explicit config **and** a non-default password (REQ-014, H6). The server
  prints a red banner on stdout and the web UI shows an in-product banner
  whenever bound to `0.0.0.0`.
- **Port collision:** if `4096` is held by another process, the server
  fails with a normalized error envelope. It **must not** kill the holder
  (REQ-008, H1). The POC's `killPortProcess` is explicitly rejected.
- **Filesystem layout (user-owned, mode `0700` directory, `0600` files):**

  ```text
  ~/.config/agent-remote-control/
    ├── config.json            # server, security, providers, etc.
    ├── projects.json          # saved + recent projects
    ├── sessions.json          # registered provider sessions (PID, port, project, owned)
    ├── settings.json          # UI / explorer prefs
    ├── auth-sessions.json     # signed cookie sessions
    ├── adapter-logs/          # ring-buffered text logs per session
    ├── ipc.sock               # Unix socket for wrapper CLI ↔ server (sprint 05)
    └── audit/                 # optional, future
  ```

- **No shared infrastructure.** No SQLite, no message broker, no external
  worker pool in Phase 1. JSON + in-process queues only (REQ-088).

---

## 5. High-Level Module Map

```text
agent-remote-control/
├── bin/
│   └── agent-remote-control          # thin CLI dispatcher
├── src/
│   ├── cli/                          # subcommands: install, start, stop, status, open, config, agy (alias: antigravity)
│   ├── server/
│   │   ├── core/                     # bootstrap, auth, session, csrf, config, persistence, logger
│   │   ├── http/                     # Fastify routes grouped by domain
│   │   ├── ws/                       # WebSocket router + envelope dispatch
│   │   ├── domains/                  # projects, providers, sessions, terminal, files, settings
│   │   ├── adapters/
│   │   │   ├── IProviderAdapter.ts   # the 14-method interface (REQ-026)
│   │   │   ├── antigravity/
│   │   │   │   ├── index.ts          # multi-source dispatcher (cdp > managed-pty > wrapper > tmux > screen)
│   │   │   │   ├── cdp.ts            # ported from POC
│   │   │   │   ├── pty.ts            # managed-PTY adapter
│   │   │   │   ├── wrapper.ts        # wrapper-registered sessions
│   │   │   │   ├── tmux.ts           # tmux send-keys + capture-pane
│   │   │   │   ├── screen.ts         # screen -X stuff + hardcopy
│   │   │   │   ├── unmanaged.ts      # /proc scan, attachable: false
│   │   │   │   ├── sanitize.ts       # DOMPurify config + escapes
│   │   │   │   ├── targeting.ts      # leaf-node + occurrence index
│   │   │   │   └── launch.ts         # spawn Antigravity with --remote-debugging-port
│   │   │   └── stub/                 # claude.ts, codex.ts, opencode.ts (disabled)
│   │   └── ipc/                      # Unix socket server for wrapper CLI
│   └── web/                          # React + Vite SPA
│       ├── app/                      # router, layout shell
│       ├── stores/                   # Zustand slices
│       ├── components/               # ~20 components (see §8)
│       ├── lib/                      # api client, ws client, sanitizer-frontend
│       └── styles/                   # Tailwind config
└── docs/
```

The boundary between `domains/` and `adapters/` is the most important one in
the backend: domains hold normalized records and call adapters through
`IProviderAdapter`; adapters know about CDP / PTY / tmux / screen / fs and
expose nothing else.

---

## 6. Backend Architecture

### 6.1 Layers

```text
┌──────────────────────────────────────────────────────────┐
│ HTTP routes (Fastify)         WS router                  │
│ /api/<domain>/...             domain.event broadcast     │
├──────────────────────────────────────────────────────────┤
│ Domain services                                          │
│ projects · providers · sessions · terminal · files       │
├──────────────────────────────────────────────────────────┤
│ Adapters (IProviderAdapter)                              │
│ antigravity/{cdp,pty,wrapper,tmux,screen,unmanaged}      │
│ stub/{claude,codex,opencode}                             │
├──────────────────────────────────────────────────────────┤
│ Core                                                     │
│ auth · session · csrf · config · persistence · logger    │
│ ipc (wrapper socket)                                     │
└──────────────────────────────────────────────────────────┘
```

- **HTTP** is stateless per-request, validates session + CSRF, calls a
  domain service, returns the envelope.
- **WS router** authenticates the upgrade with the session cookie (NFR-001,
  H5), then routes envelope events from domain services to subscribed clients
  (filterable by `projectId` and `sessionId`).
- **Domain services** own the normalized model. They never touch CDP / PTY /
  fs directly — only through adapters and `domains/files` / `domains/terminal`
  helpers.
- **Core** is the only place that touches disk for config / sessions / auth.

### 6.2 Request lifecycle (example: send prompt)

```text
Browser
  │   POST /api/sessions/:id/prompt   (cookie + CSRF header)
  ▼
http route
  │   auth.assertSession()
  │   csrf.assertToken()
  │   sessions.sendPrompt(id, text, ctx)
  ▼
domain: sessions
  │   resolve adapter by session.source
  │   adapter.sendPrompt(...)
  ▼
adapter: antigravity/cdp
  │   CDP Runtime.evaluate → focus input, type, submit
  │   schedule next snapshot capture
  │   on hash change → broadcast provider.snapshot.changed
  ▼
http route
  │   return { ok: true, data: { messageQueued: true } }
  ▼
Browser
  │   reconcile optimistic state on next snapshot event
```

### 6.3 Domain responsibilities

| Domain      | Owns                                                              | Adapter-touched? |
|---           |---                                                                |---|
| `projects`  | `projects.json`, browse paths, recommendation detection           | no |
| `providers` | provider registry, capability resolution                          | yes (probe) |
| `sessions`  | normalized `Session` records, lifecycle, dispatch to adapter      | yes |
| `terminal`  | PTY pool, WS streams, ring buffers                                | no (generic node-pty) |
| `files`     | tree walk, preview, fuzzy search, path safety                     | no |
| `settings`  | UI-facing config slice; risky toggles gated                       | no |

---

## 7. Provider Adapter Architecture

### 7.1 The interface

The 14-method `IProviderAdapter` interface (REQ-026) is the only contract a
provider implementation has with the rest of the system:

```text
detect()
listDiscoveredSessions(project?)
start(project, options)
attach(session)
stop(session)
sendPrompt(session, text, context)
sendInput(session, input)
listConversations(project)
selectConversation(session, conversationId)
getSnapshot(session)
getStatus(session)
getActions(session)
performAction(session, actionId)
dispose(session)
```

Each method returns either normalized data or a normalized error. The
adapter is also a (server-side) event emitter for `snapshot.changed`,
`status.changed`, `actions.changed`, `lifecycle.changed`, and
`adapter.log.appended`.

`listDiscoveredSessions(project?)` accepts optional project context so the
home screen can discover attachable CDP sessions before the user selects a
project (REQ-105). When a controllable session lacks project metadata, attach
flows return a normalized `project_required` error or ask the user to choose a
matching project (REQ-107).

### 7.2 Antigravity = one provider, five control surfaces (+1 read-only)

Phase 1A ships the CDP surface first. Phase 1B adds managed PTY, wrapper,
tmux/screen, and unmanaged-process guidance behind the same dispatcher.

```text
┌─────────────────────── Antigravity (provider) ────────────────────────┐
│                                                                       │
│   src/server/adapters/antigravity/index.ts (dispatcher)               │
│                                                                       │
│   ┌────────┐  ┌───────────────┐  ┌──────────┐  ┌────────┐  ┌────────┐ │
│   │  CDP   │  │  managed-PTY  │  │ wrapper  │  │  tmux  │  │ screen │ │
│   │ (S03)  │  │    (S05)      │  │  (S05)   │  │ (S07)  │  │  (S07) │ │
│   └────┬───┘  └──────┬────────┘  └────┬─────┘  └───┬────┘  └────┬───┘ │
│        │             │                │            │            │     │
│        │ shares      │ shares CDP     │ shares CDP │ tmux send  │ ...│
│        │ DOM scrape  │ inside PTY     │            │ + capture  │     │
│                                                                       │
│   ┌──────────────────────────────────────────────────────────────┐    │
│   │  unmanaged (S07) — read-only, attachable: false              │    │
│   └──────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

- **CDP** is the preferred surface when both CDP and a terminal surface
  reach the same process (REQ-045E). The dispatcher dedupes by PID and
  merges sources into a single `Session` record with composite capabilities.
- **managed-PTY** wraps `node-pty.spawn('agy', ...,
  --remote-debugging-port=<port>)`. The same session exposes both terminal
  I/O *and* CDP, because the spawn provides both.
- **wrapper** is the user-side CLI (`agent-remote-control agy`,
  `agent-remote-control antigravity`). It runs in the user's existing terminal —
  not a server-managed PTY — but registers the resulting Antigravity process
  via the IPC socket so the server can attach via CDP afterwards.
- **tmux / screen** are explicit, user-configured targets. Capabilities are
  reduced: `actions = unsupported` (no DOM), `mirror` is plain-text capture.
- **unmanaged** is scanned from `/proc/<pid>/comm` + `cmdline`, cross-referenced
  against owned + wrapper-registered + CDP-discovered PIDs. The leftovers
  are surfaced with `attachable: false` and a guidance recommendation,
  never controlled (NFR-013A, H15, REQ-100, REQ-101).

### 7.3 Capability negotiation

Capabilities start `unknown` and are resolved during `detect()` or first
attach. Resolved values are cached on the `Session` and broadcast via
`provider.status.changed`. The frontend renders unsupported capabilities
as visible-and-disabled (H17).

Example per surface:

| Surface       | mirror      | prompt     | stop       | actions     | terminalInput | conversation |
|---            |---          |---         |---         |---          |---            |---           |
| CDP           | supported   | supported  | supported* | supported   | unsupported   | supported*   |
| managed-PTY   | supported   | supported  | supported  | supported   | supported     | supported*   |
| wrapper       | supported   | supported  | supported* | supported   | unsupported   | supported*   |
| tmux          | supported (text) | supported | supported | unsupported | unsupported | unsupported |
| screen        | supported (text) | supported | supported | unsupported | unsupported | unsupported |
| unmanaged     | unsupported | unsupported| unsupported| unsupported | unsupported   | unsupported  |

`supported*` = supported when probed and the underlying Antigravity build
exposes the corresponding UI control.

### 7.4 Session model (normalized)

```ts
type SessionSource =
  | "cdp" | "managed-pty" | "wrapper" | "tmux" | "screen" | "external";

interface Session {
  sessionId: string;            // server-generated
  providerId: "antigravity";    // Phase 1
  source: SessionSource;
  projectId?: string;
  projectPath?: string;
  pid?: number;                 // when known
  debugPort?: number;           // CDP
  status: "connecting" | "connected" | "disconnected" | "closed";
  lifecycle: "active" | "idle" | "busy" | "ended";
  owned: boolean;               // see §11.5
  capabilities: Record<string, "supported" | "unsupported" | "unknown">;
  createdAt: number;            // ms epoch
  lastSeen: number;
}
```

Persistence: `sessions.json` carries only safe-to-restore fields
(`sessionId`, `source`, `pid`, `port`, `projectId`, `owned`, timestamps).
Live state (snapshot HTML, scrollback, pending actions) lives in RAM only
(REQ-091, H14).

---

## 8. Antigravity CDP Subsystem — Deep Dive

Ported from `ref-source/antigravity_phone_chat/server.js` and refactored
into the adapter interface. The POC reference is **never imported or
linked**; only patterns are reused.

### 8.1 Discovery

- `cdp.discover()` scans `providers.antigravity.debugPortRange` (default
  `9000–9003`) via `GET http://127.0.0.1:<port>/json`.
- Each port may host multiple targets. The adapter returns **all** workbench
  targets (REQ-029A) — not the first.
- The dispatcher dedupes by PID against managed-PTY / wrapper / tmux / screen
  records and merges into a single `Session` (see §7.2).

### 8.2 Snapshot capture

Per session, an interval (default 1000 ms, NFR-014, REQ-NFR-014) does:

1. `Runtime.evaluate` clones the Antigravity chat DOM.
2. `vscode-file://` resources are base64-inlined up to a size cap (large
   images fall back to a placeholder, see sprint 03 risks).
3. The clone passes through `sanitize.ts` (DOMPurify w/ allowlist that
   preserves action buttons but strips scripts/inline handlers — H11).
4. `contentHash` is computed (SHA-256 over the sanitized HTML).
5. If the hash changed, the snapshot is broadcast via the WS envelope as
   `provider.snapshot.changed`. Otherwise the loop is silent (REQ-113,
   NFR-015, H10).

```text
   raw DOM ─► clone ─► resource inlining ─► sanitize ─► hash ─► broadcast if Δ
                                                       │
                                                       └─► cache (RAM)
```

### 8.3 Server-issued action IDs (H9)

Mid-pipeline, the sanitizer / scanner extracts candidate action elements
(`button`, `[role=button]`, recognized labels: Allow, Deny, Run, Reject,
Review Changes, Apply, Save, Confirm — REQ-042). For each candidate the
server computes a stable identity:

```text
actionId = hash({ tag, normalizedText, occurrenceIndex, parentSignature })
```

The mapping `{actionId → targeting selector}` is stored **server-side**.
The frontend only ever submits `actionId`. There is no API path that
accepts a raw CDP selector or DOM path (AC-034, REQ-114, H9).

Click relay (`POST /api/sessions/:id/actions/:actionId`):

1. Look up the stored targeting tuple.
2. Re-validate against the current snapshot — if the element disappeared
   or moved out of leaf-node position, fail with a normalized error.
3. `Runtime.evaluate` a JS click with leaf-most + occurrence-index logic
   (POC pattern, `JSON.stringify` for input sanitization).
4. Broadcast `provider.actions.changed` after success.

### 8.4 Prompt send / stop / new conversation

`sendPrompt` locates the input element by class/role allowlist, dispatches
synthesized input + Enter via CDP. `stopGeneration` and `startNewChat`
follow the same targeting scheme as actions. `selectChat` /
`listConversations` walk the conversation history DOM section (best-effort —
capability flips to `unsupported` if scraping fails).

### 8.5 Scroll relay (REQ-044)

Scroll is one-way: web → desktop, only on explicit user action. The
desktop's own scroll position is never auto-mirrored back.

### 8.6 Disconnect & retry

CDP WebSocket disconnects trigger:

1. Session `status` → `disconnected`, broadcast.
2. Exponential backoff reconnect (cap ~30 s).
3. Each pending CDP call has a 30 s timeout via the `pendingCalls` Map
   pattern (NFR-010).
4. The session record stays in the registry — the UI shows a retry
   action.

---

## 9. PTY, Wrapper & IPC Subsystem

### 9.1 node-pty pool (shared with browser terminal — sprint 06)

A single `PtyPool` module spawns `node-pty` children with controlled cwd
and env. The Antigravity managed-PTY adapter uses it to spawn Antigravity
inside a PTY (so PTY output and CDP are both reachable). The terminal
domain (sprint 06) uses it for generic shell tabs.

Pool guarantees:

- cwd is always validated against the project root or the user's home.
- Per-PTY ring buffer (`scrollback` lines, default 10 000) lives in RAM
  only (REQ-065, H14).
- `exit` event is surfaced to subscribers; PTY record stays briefly
  visible so the UI can show the final lines.

### 9.2 Wrapper CLI + Unix-socket IPC (sprint 05)

```text
User shell:                    ~/.config/agent-remote-control/ipc.sock
  $ agent-remote-control agy ./project           ──► IPC server (local nonce)
        │                                              │
        │                                              ├─ reserve-port (9000–9003)
        │                                              ├─ register-session({pid, port, projectPath})
        │  ◄────  port assignment + sessionId  ─────────
        │
        spawn agy ./project \
              --remote-debugging-port=<port>
```

- Parent config directory is mode `0700`; persisted files are mode `0600`.
  The Unix socket path is created inside that directory and uses the narrowest
  file mode supported by the platform.
- The wrapper authenticates to the IPC server with a server-issued local
  registration nonce stored in the user-owned config directory. The nonce is
  rotated on install/reset and is never exposed over HTTP.
- Node.js `net` is not assumed to expose Linux peer credentials directly. If
  stronger peer UID checks become necessary, add a tiny native helper/addon
  around `SO_PEERCRED`; do not block Phase 1B on an undocumented Node API.
- The wrapper does **not** own a server-side PTY. If the user Ctrl+C's
  the wrapper but Antigravity (an Electron app) stays alive, the CDP
  session keeps working (sprint 05 risks).
- `owned` is `false` for wrapper-registered sessions: shutdown will NOT
  SIGTERM them (NFR-013A, H15).

### 9.3 Resume after reload

The Session registry is restored from `sessions.json` on server start.
Each record is re-validated:

1. PID still alive? (`kill -0 <pid>`)
2. CDP port still reachable? (`GET /json/version`)
3. PTY fd still attached?

Failures flip `status` to `disconnected` but keep the record. A
`POST /api/sessions/:id/resume` reconnects each available surface.

---

## 10. Frontend Architecture

React 18 + Vite + TypeScript + Tailwind. State via Zustand.

### 10.1 Routes

```text
/login                    AuthScreen
/                         Home / picker / discovery
/workspace/:projectId     AppShell with provider workspace
/settings                 SettingsView
```

Unauthenticated requests redirect to `/login`. Unknown `projectId` shows a
recoverable not-found state.

### 10.2 Component map (Phase 1)

| Component                | Owns                                                       |
|---                       |---                                                         |
| `AuthScreen`             | password form + CSRF bootstrap                             |
| `AppShell`               | top bar, rail, panels, composer slot, terminal dock slot   |
| `TopBar`                 | project name, provider selector, status, settings          |
| `ProjectRail`            | recent projects, files/terminal/actions navigation         |
| `ProjectPicker`          | folder browser, recommendations, manual-path confirm       |
| `ProviderSelector`       | enabled / future cards, capability summary                 |
| `SessionDiscoveryList`   | discovered sessions, source badges, attach actions         |
| `MirrorTimeline`         | sanitized snapshot inside sandboxed iframe                 |
| `ActionPanel`            | status, port, mode, pending actions, last error, logs      |
| `Composer`               | multiline input, send/stop, file context chips             |
| `SlashCommandPalette`    | `cmdk`-driven palette, 12 Phase-1 commands                 |
| `TerminalDock` + `Tab`   | xterm.js, WS stream, resize, scrollback                    |
| `FileExplorer` + `Viewer`| lazy tree, search, hidden toggle, read-only preview        |
| `SettingsView`           | config edit, risky-toggle confirm                          |
| `StatusToast` / `ErrorRecovery` | per REQ-047 state catalogue                         |

### 10.3 Store map (Zustand)

`auth`, `projects`, `providers`, `sessions`, `capabilities`, `mirror`,
`actions`, `terminal`, `files`, `settings`, `ui` (REQ-design `Client State
Model`).

Each store ≤ ~200 LOC. Selectors pure. WS events arrive at a central
dispatcher that routes by envelope `type` prefix (`provider.*`,
`session.*`, `terminal.*`, `auth.*`, `file.*`).

### 10.4 Mirror as a sandboxed iframe (H11)

The audited mirror surface is an `<iframe sandbox="allow-same-origin"
srcdoc=...>` — note the **absence** of `allow-scripts`. Scraped JS cannot
execute. The parent app shell never uses `dangerouslySetInnerHTML` outside
this component.

To overlay clickable action targets above the iframe:

1. Parent queries `iframe.contentDocument` for each known action element
   (resolved by `data-action-id` injected during sanitization).
2. For each, parent calls `getBoundingClientRect()` and adds the iframe's
   own offset.
3. Parent renders invisible buttons at those rects; clicks submit
   `actionId` to `POST /api/sessions/:id/actions/:actionId`.
4. Re-run on every `provider.snapshot.changed` and on iframe scroll.

The iframe `srcdoc` may use its own relaxed CSP; the app shell CSP
remains strict (S08-T10).

### 10.5 Optimistic command pattern

```text
1. UI dispatch (e.g. send prompt) → optimistic state
2. POST /api/sessions/:id/prompt  → returns server ack { ok: true }
3. server-side: adapter operation, eventually a new snapshot
4. WS: provider.snapshot.changed → store reconciles
```

Optimistic-only updates that the server hasn't echoed back stay marked as
`pending` in the store and surface as such in the UI.

### 10.6 Slash commands

`cmdk`-driven palette. Phase 1: `/new`, `/stop`, `/project`, `/files`,
`/open`, `/provider`, `/model`, `/mode`, `/history`, `/actions`,
`/terminal`, `/settings` (REQ-053). Unsupported commands by the active
provider show as disabled (REQ-054). The architecture allows future
opencode-style commands (`/skills`, `/mcp`, `/permissions`, `/agents`,
`/tasks`, `/fork`, `/compact`, `/undo`, `/redo`) without changing the
palette itself.

---

## 11. API Contract

### 11.1 HTTP envelope (REQ-109, REQ-110, H7)

```json
{ "ok": true, "data": { ... }, "error": null }
{ "ok": false, "data": null,
  "error": {
    "code": "cdp_attach_failed",
    "operation": "Attach Antigravity CDP session",
    "message": "Could not connect to the selected debug target.",
    "detail": "WebSocket handshake failed: ECONNREFUSED",
    "recoveryAction": "Refresh discovered sessions"
  }
}
```

### 11.2 REST surface (by domain — REQ-108)

```text
POST   /api/auth/login                        body {password}        → cookie + CSRF
POST   /api/auth/logout                       authenticated + CSRF
GET    /api/auth/whoami

GET    /api/config
PUT    /api/config                            (gated by risky-toggle)

GET    /api/projects/browse?path=
POST   /api/projects                          register/select
GET    /api/projects/recent
GET    /api/projects/:id
PUT    /api/projects/:id/last-provider
PUT    /api/projects/:id/last-session
DELETE /api/projects/:id

GET    /api/providers                         list + capabilities

POST   /api/sessions/discover                 aggregates cdp/pty/wrapper/tmux/screen/unmanaged
POST   /api/sessions/launch                   project + provider + options
POST   /api/sessions/pty/launch               managed-PTY
POST   /api/sessions/:id/attach
POST   /api/sessions/:id/resume
POST   /api/sessions/:id/stop
POST   /api/sessions/:id/dispose
POST   /api/sessions/:id/prompt
POST   /api/sessions/:id/new-conversation
GET    /api/sessions/:id/snapshot
GET    /api/sessions/:id/actions
POST   /api/sessions/:id/actions/:actionId    ← server-issued ID only (H9)
GET    /api/sessions/:id/conversations
POST   /api/sessions/:id/conversations/:cid/select
POST   /api/sessions/:id/scroll
POST   /api/sessions/:id/pty/input
POST   /api/sessions/:id/pty/signal

POST   /api/terminal/tabs
DELETE /api/terminal/tabs/:id
GET    /api/terminal/tabs
WS     /api/terminal/tabs/:id/stream
POST   /api/terminal/tabs/:id/resize

GET    /api/files/tree?path=
GET    /api/files/preview?path=
GET    /api/files/search?q=
```

All routes except `/login` and login static assets require a valid session
cookie. State-changing routes, including `/api/auth/logout`, additionally
require a CSRF token (REQ-014D).

### 11.3 Error codes (non-exhaustive)

`auth_required`, `csrf_missing`, `rate_limited`, `port_busy`,
`project_required`, `path_outside_project`, `binary_file`, `oversized_file`,
`cdp_attach_failed`, `cdp_target_not_found`, `snapshot_stale`,
`action_not_found`, `action_target_missing`, `managed_pty_resume_failed`,
`wrapper_register_failed`, `tmux_target_missing`, `screen_target_missing`,
`unmanaged_external` (informational).

Every error includes `operation` and (when possible) `recoveryAction`
(REQ-110, AC-035).

---

## 12. Realtime Contract

### 12.1 Envelope (REQ-111, H8)

```json
{
  "type": "provider.status.changed",
  "projectId": "project_123",
  "sessionId": "session_123",
  "version": 1,
  "payload": { "status": "connected", "debugPort": 9000 }
}
```

- `version` is the envelope schema version. Currently `1`.
- `projectId` and `sessionId` are optional and used for client-side
  filtering.

### 12.2 Event taxonomy (REQ-112)

```text
auth.session.expired
auth.session.refreshed

project.registry.changed
project.removed

provider.status.changed
provider.snapshot.changed       ← emitted only on hash delta (REQ-113, H10)
provider.actions.changed
provider.adapter.log.appended

session.discovered
session.lifecycle.changed       ← attached / detached / closed

terminal.output                 ← chunked PTY stdout (not persisted)
terminal.exit
terminal.resize.ack

file.refresh.recommended        ← best-effort hint, no inotify in Phase 1
```

A single `src/server/core/realtime/events.ts` catalogue lists every legal
`type` value (S08-T02) so types cannot drift between modules.

---

## 13. Data Model & Persistence

### 13.1 Files (REQ-088, REQ-089, REQ-090, REQ-090A, H13)

| File                 | Contents                                                  |
|---                   |---                                                        |
| `config.json`        | server, security, projects, fileExplorer, terminal, providers (see REQUIEMENT.md §Default Configuration) |
| `projects.json`      | saved + recent + per-project preferences (last provider, last session) |
| `sessions.json`      | server-persistable session metadata (`sessionId`, `source`, `pid`, `port`, `projectId`, `owned`, timestamps) |
| `settings.json`      | UI-facing prefs (file explorer expanded folders, recently opened files, terminal tab metadata) |
| `auth-sessions.json` | signed cookie sessions (random IDs, expiry, csrf token) |
| `adapter-logs/<sessionId>.log` | bounded text log per session (no DOM, no scrollback) |

### 13.2 Atomic writes (S08-T06)

Helper:

```text
write(path, content):
  tmp = `${path}.tmp.${pid}.${ts}`
  fs.writeFileSync(tmp, content, { mode: 0o600 })
  fs.fsyncSync(fd)
  fs.renameSync(tmp, path)
```

Wrapped in `proper-lockfile` for multi-writer safety. Parent directory is
chmod'd to `0700` on startup; existing files are chmod'd to `0600` and a
warning is logged if mismatched (S08-T07).

### 13.3 Schema versioning

Every JSON file has a top-level `version: number`. A small migration
runner upgrades old files on load. Current versions are documented in
`src/server/core/persistence.ts`.

### 13.4 Exclusions (REQ-091, H14)

The following **must not** be persisted by default:

- Provider OAuth tokens / API keys (also forbidden by NFR-005 / H3).
- Full mirrored DOM history.
- File contents.
- Terminal scrollback or output.
- Unmanaged external terminal output.

`grep` audits run in sprint 08 (S08-T09) verify this.

---

## 14. Security Architecture

### 14.1 Authentication & sessions

- One app-level password. Hash: **Argon2id**. Fallback: bcrypt / PBKDF2
  with documented cost (REQ-014A, H4). Never plaintext (REQ-011).
- Session cookies: random 32-byte IDs, signed, `HttpOnly`, `SameSite=Lax`,
  plus `Secure` when HTTPS is enabled (REQ-014B). Idle timeout from
  `server.sessionIdleTimeoutMs`.
- Login endpoint rate-limited (10 fails / 5 min / IP) with generic error
  messages — no setup-leakage (REQ-014C).
- Logout is an authenticated state-changing command protected by CSRF. It is
  not a public unauthenticated route.
- CSRF: double-submit cookie pattern on all state-changing endpoints
  (REQ-014D).
- LAN bypass is explicitly forbidden (NFR-007, H2). Every connection,
  local or LAN, authenticates.
- `0.0.0.0` binding requires explicit config **and** a non-default
  password (REQ-014, H6). Startup prints a red banner; the web UI shows
  an in-product banner.

### 14.2 Content Security Policy (NFR-002, S08-T10)

App shell CSP:

```text
default-src 'self';
script-src  'self';
style-src   'self';          (Tailwind compiles to classes — no inline)
connect-src 'self' ws: wss:;
frame-src   'self';
object-src  'none';
base-uri    'self';
```

The mirror iframe uses `srcdoc` with its own relaxed CSP — the shell CSP
is never relaxed.

### 14.3 Sanitization (NFR-003, NFR-004, H11)

- All scraped DOM passes through `adapters/antigravity/sanitize.ts`
  (DOMPurify) before reaching the iframe.
- All scraped text inserted into app-owned DOM is escape-only via a
  single utility.
- `dangerouslySetInnerHTML` is allowed nowhere except the audited mirror
  iframe component — and even there, `srcdoc` is preferred.

### 14.4 Path safety (REQ-086, REQ-087, REQ-087A, H12)

Every file API:

1. `path.resolve(<project root>, <input>)`.
2. `fs.realpathSync.native(...)`.
3. Assert the resolved path starts with the project root.
4. Reject symlinks that escape.

Configured browse roots widen *project selection*, not *file read access*
for an already-active project. Once a project is selected, only that
project root is readable.

### 14.5 Ownership-aware shutdown (NFR-013, NFR-013A, H15)

Each session record carries `owned: boolean`. On shutdown:

- `owned = true` (app launched, managed-PTY) → SIGTERM and dispose.
- `owned = false` (wrapper-registered, external) → leave untouched.

The shutdown integration test (S08-T20) verifies no SIGTERM reaches an
unowned PID.

### 14.6 Things the system never does

- Read or extract Google / Antigravity / Claude / Codex / opencode auth
  tokens (NFR-005, H3).
- Kill a port holder (REQ-008, H1).
- Send raw CDP selectors from the client (H9).
- Persist file contents, scrollback, or full DOM history (H14).
- Edit, rename, delete, move, or create files via the explorer in Phase 1
  (H16).

---

## 15. Concurrency & Reliability

### 15.1 Per-session loops (NFR-011)

Each provider session has its own async snapshot loop and its own pending-call
map. A slow target cannot block other sessions.

```text
sessionLoop(session):
  while session.active:
    snapshot = adapter.captureSnapshot(session)
    if hash(snapshot) != session.lastHash:
      session.lastHash = hash(snapshot)
      ws.broadcast("provider.snapshot.changed", { sessionId, ... })
    await sleep(providers.antigravity.snapshotPollMs)  # default 1000 ms
```

### 15.2 Timeouts (NFR-010)

Every CDP call goes through a `pendingCalls` Map with a 30 s timeout
(POC pattern, sprint 03 S03-T02). Timed-out calls reject with a
normalized error.

### 15.3 Reconnect & retry (NFR-009, NFR-012)

- CDP WS disconnects: exponential backoff, status flips to `disconnected`,
  the session row stays in the UI with a retry control.
- Terminal WS disconnects: client reconnects on browser reload; the
  RAM-only ring buffer (~ scrollback lines) seeds the terminal so the
  user sees recent context.
- Browser reload: provider session resume goes through
  `POST /api/sessions/:id/resume`; terminal tabs reconnect by ID.

### 15.4 Graceful degradation

When an Antigravity DOM update breaks a selector, the affected capability
flips to `unsupported` with a normalized error. The session stays
attached; only the affected control is disabled (REQ-026C, H17).

---

## 16. Tech Stack

Defaults from [../AGENTS.md](../AGENTS.md) §Proposed Tech Stack:

| Layer              | Choice                                              |
|---                 |---                                                  |
| Runtime            | Node.js 20+                                         |
| Language           | TypeScript                                          |
| HTTP               | Fastify                                             |
| WebSocket          | `ws`                                                |
| PTY                | `node-pty`                                          |
| CDP client         | raw WS or `chrome-remote-interface`                 |
| Password hashing   | `argon2` (fallback `bcrypt`)                        |
| DOM sanitization   | `DOMPurify` + `jsdom`                               |
| Atomic JSON        | `proper-lockfile` + write-temp-then-rename          |
| Frontend           | React 18 + Vite                                     |
| Frontend state     | Zustand                                             |
| Terminal renderer  | xterm.js + `xterm-addon-fit` + `xterm-addon-web-links` |
| Styling            | Tailwind CSS                                        |
| Slash palette      | `cmdk`                                              |
| Tests              | Vitest (frontend), Vitest or `node:test` (backend)  |

Finalized in sprint 01 — divergence requires a recorded reason.

---

## 17. Source Layout (target)

```text
agent-remote-control/
├── bin/agent-remote-control
├── package.json                  # pnpm workspaces (optional)
├── tsconfig.json
├── src/
│   ├── cli/
│   │   ├── install.ts            # systemd unit, password setup
│   │   ├── start.ts | stop.ts | status.ts | open.ts | config.ts
│   │   └── antigravity.ts        # wrapper CLI (commands: agy, antigravity-alias)
│   ├── server/
│   │   ├── core/
│   │   │   ├── app.ts            # Fastify bootstrap
│   │   │   ├── auth.ts | session.ts | csrf.ts
│   │   │   ├── config.ts
│   │   │   ├── persistence.ts    # atomic writes, schema versioning
│   │   │   ├── logger.ts
│   │   │   └── realtime/
│   │   │       ├── events.ts     # type catalogue
│   │   │       └── ws.ts
│   │   ├── http/                 # route modules per domain
│   │   ├── domains/
│   │   │   ├── projects.ts
│   │   │   ├── providers.ts
│   │   │   ├── sessions.ts
│   │   │   ├── terminal.ts
│   │   │   ├── files.ts
│   │   │   └── settings.ts
│   │   ├── adapters/
│   │   │   ├── IProviderAdapter.ts
│   │   │   ├── antigravity/
│   │   │   │   ├── index.ts cdp.ts pty.ts wrapper.ts
│   │   │   │   ├── tmux.ts screen.ts unmanaged.ts
│   │   │   │   ├── sanitize.ts targeting.ts launch.ts
│   │   │   └── stub/{claude,codex,opencode}.ts
│   │   └── ipc/                  # Unix socket server (wrapper CLI peer)
│   └── web/
│       ├── app/                  # router, AppShell, AuthScreen
│       ├── components/
│       ├── stores/
│       ├── lib/                  # api, ws, sanitizer, css
│       └── styles/
├── systemd/agent-remote-control.service.tmpl
├── tests/
└── docs/
```

LOC budget per file: ~300. Adapters split per surface; one source = one
class. Stores ≤ 200 LOC each.

---

## 18. Cross-cutting Concerns

### 18.1 Logging

- Server log: structured JSON to stdout (captured by `systemd --user`
  journal).
- Per-session adapter log: bounded ring on disk (`adapter-logs/<sessionId>.log`),
  text only. Never contains scraped DOM.

### 18.2 Configuration changes at runtime

Most config changes apply on next server start. A few risky changes
(`server.host`, `server.port`, `server.https`) require an explicit
restart and a confirmation in the UI.

### 18.3 Schema evolution

JSON schema versioning + a tiny migration runner per file (sprint 08
S08-T08). The runner is forward-only; users with newer schemas on older
binaries see a startup error.

### 18.4 Observability for the user

The right panel surfaces (REQ-049, REQ-049A): provider status, project
path, CDP port, model/mode, pending actions, last error, adapter log
tail, terminal count, selected file metadata. Long logs expand into a
detail view rather than growing the panel.

---

## 19. Reference: How the docs fit together

```text
README.md             ← elevator pitch + status
AGENTS.md             ← workflow + H1–H17 invariants
docs/
  REQUIEMENT.md       ← REQ-*, NFR-*, AC-*, Default Configuration
  design-frontend.md  ← Frontend UX + components + states
  architecture.md     ← (this file) how the system is built
  sprints/
    README.md         ← order, dependencies, cuttable scope
    sprint-NN-*.md    ← tasks, AC, done definition
ref-source/           ← gitignored POC + opencode references
```

When in doubt, REQ wins over design wins over architecture wins over
sprints. AGENTS.md hard rules win over all of those because they
encode invariants drawn from REQ + NFR.

---

## 20. Future Phases (informational)

### Phase 2 — additional providers

- Add `adapters/claude/`, `adapters/codex/`, `adapters/opencode/` behind
  the same `IProviderAdapter`. The provider registry flips them from
  disabled to enabled per-adapter.
- Optional SQLite if JSON persistence becomes a bottleneck.
- File watching (inotify) for explorer auto-refresh.

### Phase 3 — shared capabilities

- MCP, skills, permissions, agents, tasks — modeled as cross-provider
  capabilities discovered through the adapter interface.
- Conversation migration where APIs allow.

### Phase 4 — packaging & deployment

- System-wide service mode (`systemd` system unit).
- `.deb` package.
- HTTPS-first setup with self-signed certificate flow.
- Optional tunnel helper (no built-in cloud relay).

---

## 21. Open Questions & Decisions Pending

These are decisions the spec does not pin down. Each gets resolved in the
sprint that first needs it (link), captured in this doc afterwards.

| # | Question | Status |
|---|---|---|
| Q1 | `pnpm` workspace vs single `package.json` | ✅ **Resolved** — single `package.json` initially (§22.6) |
| Q2 | bcrypt vs PBKDF2 as the Argon2 fallback default | ✅ **Resolved** — bcrypt auto-fallback, PBKDF2 opt-in (§22.3) |
| Q3 | `chrome-remote-interface` vs raw WS for CDP client | sprint 03 |
| Q4 | `node-pty` foreground-job detection: native add-on vs `/proc/<pid>/stat` parsing | sprint 06 (S06-T18 risks) |
| Q5 | Fuzzy file-search algorithm (`fzy` vs `fzf`-style scoring) | sprint 06 |
| Q6 | Session resume strategy when wrapper exits but Antigravity (Electron) keeps running | sprint 05 |
| Q7 | tmux `send-keys` shell-special-character escaping rule | sprint 07 |
| Q8 | CSP relaxation for any third-party component that injects inline styles | sprint 08 |

---

## 22. Sprint 01 Pre-flight Decisions

Locked before [sprint-01](sprints/sprint-01-runtime-auth.md) begins so the
implementation does not have to backtrack. Each decision lists the affected
sprint tasks and the reasoning.

### 22.1 First-run password UX → CLI prompt during `install`

- **Decision:** `agent-remote-control install` prompts for password
  (confirm-twice, hidden input). Service is enabled and started **only after**
  the password hash is written to `config.json`.
- **Affects:** S01-T03, S01-T09 (`install`).
- **Why:** Avoids any "unauth bootstrap window" where the service is up but
  unprotected. Single-user single-host app — installer already has shell
  privilege. REQ-014 (`0.0.0.0` requires non-default password) is enforceable
  before the service can listen.
- **Library:** `@inquirer/prompts` (small, hidden input, retry on mismatch).
- **Validation:** reject empty / under min-length (default 12 chars).

### 22.2 Hash algorithm primary + fallback

- **Decision:** Argon2id primary via `argon2`. If native build fails at
  install, **auto-fallback to bcrypt** (`bcrypt`) and record the algorithm in
  `config.json` (`security.passwordHashAlgorithm`). PBKDF2 only via explicit
  env override `AGENT_REMOTE_CONTROL_HASH=pbkdf2` (pure-JS, no native).
- **Affects:** S01-T03.
- **Why:** REQ-014A allows all three. Argon2id is the recommended baseline;
  bcrypt covers the common native-build-failure case on minimal images;
  PBKDF2 stays available for hermetic environments. Verifier uses
  `security.passwordHashAlgorithm` at login.

### 22.3 Cookie signing secret → separate file

- **Decision:** `~/.config/agent-remote-control/secret.key` — 32 random
  bytes generated during `install`, file mode `0600`. Loaded once at server
  start.
- **Affects:** S01-T04.
- **Why:** Keeps `config.json` `cat`-safe for debugging. Rotation is a single
  `rm secret.key && systemctl --user restart …` and invalidates every session
  atomically. Semantic separation: `config.json` = settings, `secret.key` =
  key material.

### 22.4 TypeScript module + target → ESM, NodeNext, ES2022, strict

- **Decision:** `tsconfig.json` baseline:

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "exactOptionalPropertyTypes": true,
      "isolatedModules": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "resolveJsonModule": true,
      "outDir": "dist"
    }
  }
  ```

- **Affects:** S01-T01 (scaffold), every later sprint.
- **Why:** Node 20 supports native ESM well; switching later is expensive.
  `NodeNext` handles the `.js` import-suffix rule cleanly. `isolatedModules`
  keeps Vite happy for the SPA. `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` catch a wide class of bugs early.
- **Risk:** `node-pty` native build under ESM — smoke import in S01-T01;
  if it breaks, file an upstream issue and pin a compatible release.

### 22.5 Schema versioning baseline → `version: 1` from day one

- **Decision:** Every persisted JSON file uses the envelope

  ```ts
  type PersistedFile<T> = { version: number; data: T };
  ```

  Persistence helper **refuses to load** files without a `version` field.
  Loaded `version < current` → run migration chain. `version > current` →
  fail with a clear "binary too old" error.
- **Affects:** S01-T02 (persistence helper), S08-T08 (migration runner).
- **Why:** Cheap to start with versioning; expensive to retrofit. Forces
  every persisted-shape change to land alongside a migration step.

### 22.6 Logger → Pino via Fastify default, `pino-pretty` only in dev

- **Decision:** Use Fastify's built-in Pino logger. JSON output in prod
  (captured by `journalctl --user`). `pino-pretty` transport only when
  `NODE_ENV=development`. Default level `info`, override via `LOG_LEVEL` env.
- **Redact list (always):** `password`, `passwordHash`, `secret`, `cookie`,
  `set-cookie`, `authorization`, `csrfToken`.
- **Affects:** S01-T01, S01-T05 (login endpoint must redact).
- **Why:** Zero extra dependency, fastest Node logger, structured JSON is
  trivial to grep through journald. Per-session adapter logs (sprint 03+)
  use a separate ring-buffer util, **not** Pino — so adapter log volume
  doesn't drown the server log.

### 22.7 Monorepo layout → single `package.json` (resolves Q1)

- **Decision:** Single root `package.json`. Frontend dependencies (`react`,
  `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, etc.) live in
  `devDependencies` since they are bundled into the SPA at build time and
  not loaded by the server runtime. Promote to a `pnpm` workspace **only**
  when concrete friction appears (e.g. conflicting transitive deps, separate
  publish artifacts).
- **Affects:** S01-T01.
- **Why:** Solo-dev velocity; one `pnpm install`, one lockfile. Workspaces
  add ceremony that does not pay off until a second runtime package exists.

---

## 23. Glossary

- **Adapter** — A class implementing `IProviderAdapter` for one
  control surface of one provider.
- **Control surface** — A way the app talks to a provider process:
  CDP, managed-PTY, wrapper, tmux, screen.
- **Owned session** — A session whose underlying process the app
  spawned (managed-PTY launches, CDP launches via `launch.ts`). Eligible
  for SIGTERM on shutdown.
- **Unmanaged session** — Antigravity process detected on `/proc` but
  neither owned nor exposing any supported control surface. Read-only;
  shown with guidance, never controlled.
- **Snapshot** — One sanitized, hashed, RAM-only capture of the
  Antigravity DOM (or text buffer for tmux/screen).
- **Action ID** — Server-issued stable identifier for a button / control
  inside a snapshot. Never derived client-side.
- **Capability** — A normalized flag (`supported` | `unsupported` |
  `unknown`) attached to a session, telling the UI which controls to
  enable.
