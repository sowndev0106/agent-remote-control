# Sprint 03 — Antigravity CDP Adapter

**Milestone:** M3
**Effort:** 5-7 days
**Dependencies:** Sprint 01, 02

## Goal

Land the core Antigravity remote-control loop: CDP discovery, attach, snapshot
capture, sanitized mirror render, prompt send, stop, new conversation, and
remote action click. Most of this code is ported from
`ref-source/antigravity_phone_chat/server.js` and refactored into the
`IProviderAdapter` shape.

## In-Scope Requirements

- REQ-027 through REQ-044 (CDP discovery, launch, attach, mirror, prompt,
  actions)
- REQ-092 through REQ-099 (existing session discovery, attach without restart,
  sync after attach)
- REQ-113, REQ-114 (snapshot hash, server-issued action IDs)
- NFR-003, NFR-004 (DOM sanitization)

## Out of Scope

- PTY / wrapper adapter (sprint 05)
- tmux/screen (sprint 07)
- UI rendering (sprint 04) — this sprint only exposes HTTP + WS, no React yet.

## Acceptance Criteria

- AC-007: User can launch or attach to Antigravity for the selected project.
- AC-008: Live conversation state visible from the browser via the HTTP API.
- AC-009: Prompt sent from API reaches Antigravity.
- AC-010: Stop generation works when Antigravity exposes the control.
- AC-011: New conversation works when exposed.
- AC-012: Conversation history listed and selectable when scrapeable.
- AC-013: Common action buttons clickable from API.
- AC-014: Adapter status and errors visible in API response.
- AC-028: Multiple CDP sessions all discovered.
- AC-029: Attach to existing active session without restart.
- AC-034: Remote click uses server-issued action IDs (frontend cannot supply
  raw CDP selectors).

## Deliverables

- `src/server/adapters/antigravity/index.ts` — adapter dispatch.
- `src/server/adapters/antigravity/cdp.ts` — CDP client (port from POC).
- `src/server/adapters/antigravity/sanitize.ts` — DOMPurify rules.
- `src/server/adapters/antigravity/targeting.ts` — leaf-node + occurrence
  index logic (port from POC).
- `src/server/adapters/antigravity/launch.ts` — spawn Antigravity with
  `--remote-debugging-port`.
- HTTP routes:
  - `POST /api/sessions/discover?provider=antigravity`
  - `POST /api/sessions/launch` (project + provider)
  - `POST /api/sessions/:id/attach`
  - `POST /api/sessions/:id/prompt`
  - `POST /api/sessions/:id/stop`
  - `POST /api/sessions/:id/new-conversation`
  - `GET /api/sessions/:id/snapshot`
  - `GET /api/sessions/:id/actions`
  - `POST /api/sessions/:id/actions/:actionId`
  - `GET /api/sessions/:id/conversations`
  - `POST /api/sessions/:id/conversations/:cid/select`
- WebSocket channel for snapshot + status + action updates.

## Tasks

- **S03-T01** Port `discoverCDP` from POC, generalize to scan
  `providers.antigravity.debugPortRange`. Return all targets (REQ-029A), not
  the first.
- **S03-T02** Port `connectCDP` — single WS per target, `pendingCalls` Map with
  timeout (NFR-010). Centralized message dispatch.
- **S03-T03** Identify the correct workbench target among multiple CDP
  targets (REQ-034). Filter by URL/title patterns from POC.
- **S03-T04** Port `captureSnapshot`: DOM clone, base64 inline of
  `vscode-file://` resources, CSS extraction. Compute content hash (REQ-113).
  Run sanitize pass before returning.
- **S03-T05** Sanitize layer: DOMPurify config that preserves action buttons
  (`Allow`, `Deny`, `Review Changes`, etc.) but strips scripts/inline handlers.
  This is the audited mirror renderer — every consumer must use it.
- **S03-T06** Snapshot polling loop: interval `snapshotPollMs` (default 1000),
  per-session. Broadcast only on hash change.
- **S03-T07** Launch command: `spawn('antigravity', [projectPath,
  '--remote-debugging-port=<port>'])`. Allocate next free port from configured
  range. Register the process so app shutdown can stop owned launches
  (NFR-013) — never kill unowned processes (NFR-013A).
- **S03-T08** Action discovery + server-issued IDs (REQ-114):
  - Scan sanitized snapshot for action button candidates.
  - Generate stable action IDs from `{tag, text, occurrenceIndex}`.
  - Store mapping server-side; client only submits action ID.
- **S03-T09** Port targeting layer for click relay:
  - Leaf-node filter (POC's "Leaf-Most" logic).
  - Resolve action ID → CDP selector → dispatch click.
  - Sanitize input via `JSON.stringify` per POC pattern.
- **S03-T10** Port `injectMessage` / `sendPrompt`: locate input, simulate type
  + submit. Map to `sendPrompt` adapter method.
- **S03-T11** Port `stopGeneration` and `startNewChat`.
- **S03-T12** Port `getChatHistory` (scoped DOM scrape) and `selectChat`.
  Mark active conversation when detectable (REQ-041A).
- **S03-T13** Status + capability reporting: return normalized capabilities
  per session (REQ-026C). Unknown stays `unknown` until probed.
- **S03-T14** Error normalization (REQ-109, REQ-110): every adapter failure
  returns `{code, operation, message, recoveryAction}`.
- **S03-T15** WebSocket realtime envelope (REQ-111): emit
  `provider.snapshot.changed`, `provider.status.changed`,
  `provider.actions.changed` events with `{type, sessionId, version, payload}`.
- **S03-T16** Multi-session support: each discovered CDP target gets its own
  session record + polling loop. No global singleton.
- **S03-T17** Integration tests using a fake Antigravity CDP target (mock
  Chromium with a controllable DOM) for: discovery, attach, prompt, click,
  hash dedupe.

## Risks

- **Antigravity DOM updates breaking selectors:** POC has already solved most
  of this with leaf-node + occurrence index. Treat selectors as a thin
  capability layer — fail soft to `unsupported` if not found.
- **`vscode-file://` base64 inlining:** Large images can balloon snapshot
  payloads. Cap at a reasonable size; fallback to placeholder.
- **CDP WS disconnect:** Need reconnect with backoff. Mark session
  `disconnected` and broadcast status without dropping it from the registry.

## Done Definition

- With Antigravity launched manually (`antigravity . --remote-debugging-port=9000`),
  `POST /api/sessions/discover` returns the target.
- After attach, `GET /api/sessions/:id/snapshot` returns sanitized HTML.
- `POST /api/sessions/:id/prompt` causes a new user message to appear in the
  desktop Antigravity window.
- Clicking an action via `POST /api/sessions/:id/actions/:actionId` triggers
  the corresponding desktop button.
- Two Antigravity instances on different ports both appear in discovery and
  can be attached independently.
- Re-attaching to an active session does not restart it (NFR-012A).
