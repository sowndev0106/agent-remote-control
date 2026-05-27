# Sprint 05 — Managed PTY + Wrapper Adapter

**Milestone:** M4
**Effort:** 5-7 days
**Dependencies:** Sprint 01, 02, 03 (adapter interface and session model)

## Goal

Add the second Antigravity control surface: app-managed PTY sessions and the
`antigravity` / `agy` wrapper command. After this sprint, users who launch
Antigravity through the app can resume the session from the browser even
after reloads.

CDP remains the preferred surface when both are available (REQ-045E).

## In-Scope Requirements

- REQ-045, REQ-045A, REQ-045B, REQ-045C, REQ-045E (managed PTY adapter,
  wrapper command, input + resume, CDP-preferred dispatch)
- REQ-094, REQ-094A (managed PTY + wrapper-launched sessions as Phase 1
  control surfaces)
- REQ-102, REQ-103 (wrapper commands `antigravity` and `agy`)
- REQ-104 (session source labels — partial: `managed-pty`, `wrapper`; tmux,
  screen, external come in sprint 07)
- REQ-106 (auto-select project when discovered session exposes its path)
- NFR-012, NFR-013, NFR-013A (reload reconnect, shutdown owned sessions only)

REQ-045D (tmux/screen attach) is **out of scope** for this sprint — it lives
in sprint 07.

## Out of Scope

- tmux/screen attach (sprint 07)
- Unmanaged external process detection (sprint 07)
- Browser terminal UI (sprint 06) — though the PTY infrastructure built here
  is reused

## Acceptance Criteria

- AC-031: User launches Antigravity through the wrapper command and the
  session appears in the browser.
- AC-032: User resumes an app-managed Antigravity PTY session after browser
  reload while the process is still running.
- NFR-013A verified: app shutdown does not kill processes it does not own.

## Deliverables

- `src/server/adapters/antigravity/pty.ts` — managed PTY adapter.
- `src/server/adapters/antigravity/wrapper.ts` — wrapper registration.
- `src/cli/antigravity.ts` — implements `agent-remote-control antigravity`
  and `agent-remote-control agy` (alias).
- IPC channel for wrapper → server: Unix socket at
  `~/.config/agent-remote-control/ipc.sock` with 0600 permissions.
- HTTP endpoints:
  - `POST /api/sessions/pty/launch`
  - `POST /api/sessions/:id/pty/input`
  - `POST /api/sessions/:id/pty/signal`
  - `POST /api/sessions/:id/resume`

## Tasks

- **S05-T01** Implement core PTY helper using `node-pty`: spawn with cwd,
  `$SHELL` or `/bin/bash`, attach stdin/stdout, track exit. (Shared with
  sprint 06 browser terminal.)
- **S05-T02** Managed-PTY Antigravity adapter:
  - Spawn `antigravity <project> --remote-debugging-port=<port>` inside a PTY
    so we get both terminal output **and** a CDP debug port.
  - Register a session with `source: 'managed-pty'`.
  - Subscribe to CDP for snapshot/action relay (reuses sprint 03 code).
  - Stream PTY output via WS for diagnostics.
- **S05-T03** PTY input + signal endpoints:
  - Text input (REQ-045B).
  - Control signals (`SIGINT` → Ctrl+C, `SIGTERM`).
- **S05-T04** Wrapper CLI (`agent-remote-control antigravity <project>`):
  - Connect to local IPC socket.
  - Reserve a debug port from the server.
  - Spawn Antigravity in foreground, in the **user's existing terminal**
    (not a server-managed PTY), with `--remote-debugging-port=<port>`.
  - Register the session with the server after the CDP target appears on the
    reserved port (or send a register request and let the server poll).
  - On Antigravity exit, notify server to mark session closed.
  - **Note:** Because the wrapper does not own a server-side PTY, browser
    "resume" for a wrapper-launched session means re-attaching via CDP, not
    reconnecting to a PTY stream. If the wrapper CLI is killed but
    Antigravity (Electron, detached) keeps running, the CDP session stays
    valid.
- **S05-T05** IPC socket server: accept connections from same UID only,
  exposing a tiny RPC for `reserve-port`, `register-session`,
  `unregister-session`. Reject if peer UID differs.
- **S05-T06** Session resume (REQ-045C, NFR-012):
  - Session registry survives in JSON (PID, port, project, created).
  - On server restart, validate PID still alive, port still reachable; mark
    `disconnected` otherwise.
  - `POST /api/sessions/:id/resume` reconnects CDP + PTY if both available.
- **S05-T07** Ownership tracking: every session record carries an `owned`
  flag (true if app spawned, false if wrapper-registered). Shutdown sequence
  only sends SIGTERM to `owned` PTY children (NFR-013A).
- **S05-T08** Source labels (REQ-104): emit `cdp` | `managed-pty` | `wrapper`
  in session records this sprint. `tmux`, `screen`, `external` are added by
  sprint 07.
- **S05-T08B** Project auto-select on attach (REQ-106): when a managed-PTY or
  wrapper-launched session carries a project path, attaching to that session
  from the home screen selects or registers that project automatically.
- **S05-T09** UI placeholders (just enough for the existing
  `SessionDiscoveryList` to render new sources):
  - Source badge text for `Managed PTY` and `Wrapper`.
  - Resume action button when applicable.
- **S05-T10** Tests:
  - Wrapper command registers session; browser sees it; CDP attach works.
  - Reload server → resume returns the same session.
  - Kill server forcefully → owned PTY children terminated; non-owned
    Antigravity launched outside wrapper stays alive.

## Risks

- **PTY + CDP port conflict:** Two ways the same Antigravity might be
  reachable. The session registry must dedupe by PID, not by source. If a
  managed-PTY session and a CDP discovery both find the same PID, merge
  them into one session record with `source: managed-pty` and CDP
  capabilities present.
- **IPC socket security:** Always validate peer UID (`getsockopt SO_PEERCRED`
  on Linux). The Node.js `net` module exposes this; use it.
- **Wrapper exit semantics:** If the user Ctrl+C's the wrapper but
  Antigravity is still running (Electron app detached), document this — the
  session stays registered until Antigravity exits.

## Done Definition

- `agent-remote-control antigravity ~/some/project` launches Antigravity,
  registers it, and the browser immediately shows the session.
- Closing the browser and reopening shows the same session.
- Restarting the server keeps the session registered if Antigravity is
  still running.
- Stopping the server does not kill Antigravity instances launched without
  the wrapper.
