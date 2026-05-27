# Sprint 08 — Realtime Contracts + Persistence + Hardening

**Milestone:** M6 (cross-cutting hardening pass)
**Effort:** 4-6 days
**Dependencies:** Sprint 01..07 (this is the closing pass)

## Goal

Re-audit the API + realtime contracts introduced in sprints 01 and 03, verify
JSON persistence uses the sprint 01 atomic helper everywhere, and run the final
security hardening pass to satisfy every NFR before calling full Phase 1 done.
This sprint verifies and tightens cross-cutting primitives; it must not be the
first implementation of envelopes, route auth, event catalogs, or atomic writes.

## In-Scope Requirements

- REQ-088 through REQ-091, REQ-090A (persistence)
- REQ-108 through REQ-115 (API + realtime contracts)
- NFR-001 through NFR-022 (security, reliability, performance, usability)
- AC-027, AC-034, AC-035, AC-036 (final acceptance criteria not covered by
  earlier sprints)

## Out of Scope

- New features. This sprint hardens what exists.

## Acceptance Criteria — final pass

- AC-027: Busy port produces a clear error and does not kill the existing
  process (verify the failure path end-to-end with a held port).
- AC-034: Every remote action submitted by the frontend uses a server-issued
  action ID. There is no API path where the frontend supplies a CDP selector.
- AC-035: Every failed command returns the normalized error envelope with
  `code`, `operation`, `message`, `recoveryAction`.
- AC-036: First-run password hash uses Argon2id (or documented fallback),
  sessions use server-issued IDs, cookies are HttpOnly + SameSite=Lax + Secure
  (when HTTPS).

## Deliverables

- Re-audited API surface: every command endpoint returns
  `{ok: true, data} | {ok: false, error: {...}}` per REQ-109/110.
- Re-audited realtime envelope: every WS message conforms to
  `{type, projectId?, sessionId?, version, payload}` per REQ-111.
- `src/server/core/persistence.ts` verified everywhere: atomic writes
  (`proper-lockfile` or write-temp-then-rename), 0600 file modes, parent-dir
  creation, schema versioning.
- Security audit checklist filled out (see Tasks).
- Performance smoke check (snapshot poll, file tree, terminal interactivity).

## Tasks

### API + Realtime Contract Audit
- **S08-T01** Walk every HTTP endpoint added across sprints 01..07. Verify
  each route uses the sprint 01 envelope helper and response shape matches
  REQ-109. Fix drift.
- **S08-T02** Walk every WS message emission. Verify envelope and the event
  type taxonomy (REQ-111) against the sprint 03
  `src/server/core/realtime/events.ts` catalog. Add missing types to the
  catalog only after confirming they are required by REQ-112.
- **S08-T03** Verify REQ-112 coverage — at least one event for each:
  auth expiration, project registry changes, provider status, session
  discovery, snapshot updates, pending actions, adapter logs, terminal
  output, terminal lifecycle, file refresh notices. Add any missing emitters.
- **S08-T04** Snapshot dedup audit (REQ-113): confirm no path emits snapshot
  payload when content hash is unchanged.
- **S08-T05** Action ID audit (REQ-114): grep for any API path that accepts
  selectors from the client. Reject and refactor.

### Persistence
- **S08-T06** Verify the sprint 01 atomic write helper is used by every
  persistence call: write to `<file>.tmp.<pid>.<ts>`, fsync, rename. Wrap in
  `proper-lockfile` for multi-writer safety.
- **S08-T07** Enforce 0600 on every persisted file. Enforce 0700 on the
  config directory. Run audit on startup; fix permissions if wrong (warn,
  don't crash).
- **S08-T08** Persistence schema versioning: every JSON file has a top-level
  `version` integer. Add a tiny migration runner; document the current
  version.
- **S08-T09** Verify REQ-091 exclusions: no provider OAuth tokens, no raw
  API keys, no full DOM history, no file contents, no terminal scrollback
  on disk. Grep + manual test.

### Security Hardening
- **S08-T10** Strict CSP for app shell (NFR-002):
  - `default-src 'self'`, `script-src 'self'`, `style-src 'self'`,
    `connect-src 'self' ws: wss:`, `frame-src 'self'`, `object-src 'none'`,
    `base-uri 'self'`.
  - Tailwind compiles to class-based CSS at build time, so `'unsafe-inline'`
    should NOT be needed for `style-src`. Audit any third-party component
    that injects inline styles; replace or add a nonce instead of relaxing
    the policy.
  - The mirror iframe is `srcdoc` with its own relaxed CSP — never relax the
    shell CSP.
- **S08-T11** Sanitization audit (NFR-003, NFR-004): every scraped provider
  text passing into app DOM is escaped through a single utility. Grep for
  `dangerouslySetInnerHTML` — only the mirror iframe component may use it
  (and even there, prefer `srcdoc`).
- **S08-T12** Auth-everywhere audit (NFR-001): walk the route table. Every
  HTTP, WS, and SSE route except `/login` and login static assets requires
  session. Add a test that fails the build if a new unauthenticated route
  is added without explicit allowlist.
- **S08-T13** LAN bypass review: the POC has LAN-IP auto-trust. **Do not
  port that behavior** (NFR-007 forbids it). Confirm no such bypass exists.
- **S08-T14** `0.0.0.0` startup banner (NFR-006, NFR-008A) — verify text
  mentions password vs transport encryption, LAN exposure, terminal access
  risk. Print in both stdout and the web UI banner.
- **S08-T15** Token-extraction audit (NFR-005): verify no code path reads
  Google / Antigravity / Claude / Codex / opencode credentials or local
  storage. Grep + design review note in `SECURITY.md`.

### Reliability
- **S08-T16** Provider disconnect handling (NFR-009): every adapter shows
  status `disconnected`, exposes a retry action, and reconnects with
  exponential backoff.
- **S08-T17** CDP timeouts (NFR-010): verify `pendingCalls` map has the 30s
  timeout from POC pattern.
- **S08-T18** Snapshot polling isolation (NFR-011): use per-session async
  loops, not a single global loop that can block on one slow target.
- **S08-T19** Reload reconnect (NFR-012): both terminal and provider session
  reconnect cleanly. Manual test required.
- **S08-T20** Shutdown cleanup (NFR-013, NFR-013A): app-owned launches and
  PTYs are SIGTERM'd; unmanaged externals are untouched. Add a final
  shutdown integration test.

### Performance
- **S08-T21** Confirm snapshot poll default 1000ms (NFR-014).
- **S08-T22** Confirm file tree lazy (NFR-016) and preview cap 524288 bytes
  (NFR-017) match config defaults.
- **S08-T23** Terminal interactivity (NFR-018) — manual check.

### Usability
- **S08-T24** Post-login next-action check (NFR-019): when no project,
  picker is immediately visible. When project exists, last project is the
  obvious option.
- **S08-T25** Unsupported provider features visible (NFR-020): scan UI for
  any hidden-when-unsupported control. Convert to visible-and-disabled.
- **S08-T26** Error message audit (NFR-021): every error UI shows operation
  + recovery action.

### Acceptance Walk
- **S08-T27** Walk all 36 AC items end-to-end against a fresh install on a
  clean Ubuntu VM. Document any gap.

## Risks

- **Late-breaking schema drift:** events and response shapes tend to drift
  during earlier sprints. Budget time in this sprint to refactor, not just
  audit.
- **CSP breakage:** turning on strict CSP often surfaces inline-style or
  inline-script issues. Land it on a feature branch and fix incrementally.

## Done Definition

- All 36 AC items pass on a clean Ubuntu install.
- API contract audit produces a single doc page listing every endpoint and
  every event type, conforming to REQ-109/110/111.
- Security checklist (S08-T10..T15) fully checked off.
- Phase 1 can be tagged `v0.1.0` and shipped.
