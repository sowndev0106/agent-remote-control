# CONTEXT.md — domain glossary

Authoritative terms for this codebase. Keep this short: only add a term when
the name carries non-obvious meaning, or when two concepts share a word.

## Session — two kinds

The word "session" is ambiguous in this domain; we resolve it with two
distinct module names:

- **AuthSessionStore** (`src/server/core/auth-session.ts`) — browser user
  login sessions. Backed by the `arc_sid` HttpOnly+SameSite=Lax cookie.
  Persisted to `~/.config/agent-remote-control/sessions.json` at 0600. Idle
  timeout from `server.sessionIdleTimeoutMs`.

- **AgentSessionRegistry** (`src/server/domains/agent-sessions.ts`) —
  provider agent sessions (Antigravity CDP target, managed PTY,
  wrapper-launched, tmux pane, screen window, or unmanaged external).
  In-memory only. Each record is keyed by a server-issued `sessionId` and
  carries `providerId`, `source`, `lifecycle`, `capabilities`, `owned`.

Never say "session" in code or prose without one of the two modifiers if the
distinction matters at the reading site.

## Composition root

**assembleServer** (`src/server/assembly.ts`) — the single place where the
dependency graph is built. Both `src/server/index.ts` (prod) and
`tests/_authed-app.ts` (tests) call `assembleServer({ config, paths?,
overrides? })`. The returned `{ app, deps, shutdown }` exposes every wired
dependency through `deps` so tests can poke them without re-wiring.

If you add a new adapter, register it inside `assembleServer` — that is the
only place.

## Route seams

- **rejectIfMissing / rejectIfMissingFrom** (`src/server/http/route-helpers.ts`)
  — single place that issues the 404 envelope for missing agent sessions or
  missing terminal tabs.
- **requireBodyString** — single place that issues the 400 envelope for a
  missing/wrong-type body field. Error code is always `<field>_required`
  (e.g. `projectId_required`, `text_required`, `input_required`).

## WebSocket auth seam

- **authenticateUpgrade** (`src/server/core/realtime/upgrade-auth.ts`) —
  every WS mount calls this to authenticate the upgrade. Returns
  `{ok: true, sessionId} | {ok: false, reason}`. Companion helpers
  `reject401(socket)` and `reject404(socket)` write the canonical socket
  responses.
