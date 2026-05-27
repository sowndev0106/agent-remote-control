# Security Model (Phase 1)

This document records the sprint 08 hardening audit (S08-T10..T15) and the
invariants the app must preserve.

## Authentication & sessions

- One app-level password. Hashed with **Argon2id** (auto-fallback **bcrypt**
  if the native build fails at install; **PBKDF2** via
  `AGENT_REMOTE_CONTROL_HASH=pbkdf2`). Never stored in plaintext (REQ-011,
  REQ-014A, H4). Algorithm recorded in `config.json`
  (`security.passwordHashAlgorithm`).
- Sessions use random 32-byte server-issued IDs (`crypto.randomBytes(32)`),
  signed with the key in `~/.config/agent-remote-control/secret.key`.
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` when HTTPS is enabled
  (REQ-014B). Idle timeout from `server.sessionIdleTimeoutMs`.
- Login rate-limited to 10 failures / 5 min / IP; generic error messages — no
  setup leakage (REQ-014C).
- CSRF: double-submit cookie (`arc_csrf` non-HttpOnly + `x-csrf-token` header)
  on every state-changing request, including logout (REQ-014D).

## Authorization

- **Every** HTTP route under `/api/*` requires a session except
  `POST /api/auth/login`. The SPA shell, static assets, and `/healthz` are
  public; the SPA enforces auth via its own API calls (NFR-001, H5).
- WebSocket upgrades (`/api/realtime`, `/api/terminal/tabs/:id/stream`)
  authenticate the `arc_sid` cookie before completing the handshake (AC-025).
- **No LAN-IP auto-trust.** The POC's behavior is explicitly NOT ported
  (NFR-007, H2). Every connection authenticates regardless of source IP.

## Network exposure

- Default bind is `127.0.0.1:4096`. Binding `0.0.0.0` requires explicit config
  **and** a non-default password, enforced at startup (REQ-014, H6). The
  startup banner warns about LAN exposure, password ≠ encryption, and terminal
  shell risk; recommends HTTPS (NFR-006, NFR-008A).
- A busy port fails with a clear error and **never** kills the holder
  (REQ-008, H1, AC-027). The POC's `killPortProcess` is not ported.

## Content security

- App-shell CSP (`src/server/core/app.ts` onSend): `default-src 'self'`,
  `script-src 'self'`, `connect-src 'self' ws: wss:`, `frame-src 'self'`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` (NFR-002).
  - **Known exception:** `style-src` includes `'unsafe-inline'` because
    xterm.js injects inline styles at runtime. This is scoped to the terminal
    renderer; no app code relies on inline scripts.
- Scraped Antigravity DOM is sanitized through `sanitizeMirrorHtml`
  (DOMPurify) before reaching the **sandboxed** mirror iframe
  (`sandbox=""`, `srcDoc`) — scripts cannot execute even if they leak through
  (NFR-003, H11). `dangerouslySetInnerHTML` is used nowhere
  (verified by `tests/contract-audit.test.ts`).
- Scraped text inserted into app DOM is escaped via `escapeForAppDom`
  (NFR-004).

## Remote action safety

- Action IDs are server-issued from `{tag, text, occurrenceIndex}`
  (REQ-114, H9, AC-034). The frontend submits **only** `:actionId`; it can
  never supply a CDP selector, DOM path, button text, occurrence index, or raw
  command. Enforced by `tests/cdp-route-h9.test.ts`,
  `tests/web-action-id.test.ts`, and `tests/contract-audit.test.ts`.

## File access

- Every file API resolves through `resolveSafe`: `path.resolve` →
  `fs.realpath` → assert the canonical path stays under the **single** active
  project root. `..` traversal and symlink escapes are rejected (REQ-086/087/
  087A, H12, AC-019). Configured browse roots do not widen file read access.
- Phase 1 file explorer is read-only — no edit/rename/delete/move/create
  endpoints exist (REQ-085, H16).

## Process ownership

- Each session carries `owned: boolean`. On shutdown only owned launches and
  managed PTYs receive SIGTERM; wrapper-registered and unmanaged externals are
  left untouched (NFR-013, NFR-013A, H15). Unmanaged detection never signals
  processes.

## What the system never does (NFR-005, H3)

- Never reads or extracts Google / Antigravity / Claude / Codex / opencode
  OAuth tokens, API keys, or desktop-app local storage. The app mirrors the
  Antigravity UI over CDP; it never proxies provider APIs.

## What is never persisted (REQ-091, H14)

- No OAuth tokens, no raw API keys, no full DOM history, no file contents, no
  terminal scrollback. Terminal output lives only in a RAM ring buffer.
  Persisted JSON files: `config.json`, `secret.key`, `sessions.json`,
  `projects.json` — all `0600` inside a `0700` config dir, written atomically
  (write-temp → rename), audited at startup.
