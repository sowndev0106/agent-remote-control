# Sprint 08 — Final Hardening Verification

Closing-pass audit for Phase 1. Date 2026-05-27.

## Test suite

```
pnpm test → Test Files 36 passed, Tests 163 passed
pnpm build (server + web) → 0 errors
```

## Acceptance Criteria — final pass

| AC | Evidence |
|----|----------|
| AC-027 | `tests/port-check.test.ts` + `tests/smoke.test.ts` assert `port_busy` with recovery hint and holder stays alive; live run in sprint 01 verification. `git grep killPort` → none. |
| AC-034 | `tests/cdp-route-h9.test.ts`, `tests/web-action-id.test.ts`, `tests/contract-audit.test.ts` prove only `:actionId` is accepted. |
| AC-035 | All routes use `okEnvelope`/`errEnvelope` (`contract-audit.test.ts`); `AppError` always carries `code`+`operation`+`message`(+`recoveryAction`). |
| AC-036 | `tests/auth.test.ts` (argon2id/bcrypt/pbkdf2, hash≠plaintext), `tests/session.test.ts` (32-byte IDs), `tests/login-route.test.ts` (HttpOnly+SameSite=Lax cookies). |

## Security checklist (S08-T10..T15)

- **T10 CSP**: `app.ts` onSend sets strict CSP on shell, omits on `/api/*`
  JSON; verified by `tools-api.test.ts`. Documented `style-src 'unsafe-inline'`
  exception for xterm.js in SECURITY.md.
- **T11 sanitization**: DOMPurify mirror + escape util; no
  `dangerouslySetInnerHTML` (grep + `contract-audit.test.ts`).
- **T12 auth-everywhere**: `/api/*` gated except `/api/auth/login`; static check
  in `contract-audit.test.ts`.
- **T13 LAN bypass**: grep confirms no LAN auto-trust (NFR-007/H2).
- **T14 0.0.0.0 banner**: `bind-guard.test.ts` asserts LAN/password/terminal/
  HTTPS wording.
- **T15 token extraction**: no code reads provider credentials (design + grep);
  recorded in SECURITY.md.

## Persistence (S08-T06..T09)

- All schema data writes go through `writePersisted` (atomic temp→rename, 0600);
  audited via grep. `nonce.ts`/`secret-key.ts` write key material directly at
  0600 (not schema data — by design).
- Startup `auditPermissions` enforces 0700 dir + 0600 files
  (`perms-audit.test.ts`).
- Versioned envelope `{version, data}`; loader refuses unversioned files
  (`persistence.test.ts`).
- REQ-091 exclusions: terminal output is a RAM ring only; no tokens, file
  contents, scrollback, or DOM history persisted (grep + design).

## Reliability (S08-T16..T20)

- CDP `pendingCalls` 30s timeout (`cdp.ts`); per-session poll loops (no global
  loop); ownership-aware shutdown SIGTERMs only owned PTYs/launches
  (`wrapper-adapter.test.ts` ownership, `index.ts` shutdown ordering).

## Contract docs

- `docs/api-contract.md` — full endpoint + event table.
- `SECURITY.md` — security model + hard-rule mapping.

## Known gaps (documented, not blocking Phase 1A CDP flow)

- Live Antigravity CDP/PTY/tmux/screen flows require a real Antigravity build +
  tmux/screen binaries; adapters are exercised against mocks/fakes in CI. The
  S03-T00 CDP preflight must be run on a machine with Antigravity installed
  before declaring the live AC-007..014 path green.
- `loginctl enable-linger` + systemd `--user` autostart need a clean Ubuntu
  host to verify AC-001 end-to-end (install code + unit template tested).
