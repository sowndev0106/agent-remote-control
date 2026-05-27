# Sprint 01 — Verification Evidence

Captured 2026-05-27 against `sprint-01-runtime-auth` branch.

## Test suite

```
pnpm test
Test Files  14 passed (14)
     Tests  55 passed (55)
```

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-001 | designed (manual on Ubuntu) | `src/cli/install.ts` writes systemd unit and runs `systemctl --user enable --now`. `tests/systemd-template.test.ts` verifies unit render. |
| AC-002 | ✅ live | `curl http://127.0.0.1:14096/login` → `200 <!doctype html>`. |
| AC-003 | ✅ live | `curl /api/projects/recent` → `401 auth_required`; `/login` POST returns 200 with `arc_sid` (HttpOnly, SameSite=Lax) + `arc_csrf` cookies. |
| AC-026 | ✅ live | Empty hash + `host: 0.0.0.0` → server refuses with `Refusing to bind 0.0.0.0 without a password set.` |
| AC-027 | ✅ live | Second `start --foreground` on busy port → `Port 14096 on 127.0.0.1 is already in use.`; first server's PID still alive (H1). |
| AC-036 | ✅ test | `tests/smoke.test.ts` "hashed password never equals plaintext, session IDs are 32-byte random". `pbkdf2` test path verified end-to-end live. |

## Hard rules

| Rule | Check | Result |
|----|----|----|
| H1 (no killPort) | `git grep -nE "killPort\|kill-port\|process\.kill" src/ tests/ bin/` | no matches |
| H4 (no plaintext, Argon2id/bcrypt/pbkdf2 only) | `tests/auth.test.ts` round-trips through each | pass |
| H5 (auth on every non-login route) | `src/server/core/app.ts` onRequest hook + PUBLIC_EXACT set; smoke test asserts 401 | pass |
| H6 (0.0.0.0 needs non-default password + warning banner) | `src/server/core/bind-guard.ts` + `bindBanner()`; tests + live | pass |
| H13 (0600 files, 0700 dirs) | `tests/persistence.test.ts` "writes file at 0600 and parent dir at 0700" | pass |

## Live transcript

Excerpts from /tmp/arc-it integration run:

```
$ ./bin/agent-remote-control config --path
/tmp/arc-it/config/agent-remote-control/config.json

$ XDG_CONFIG_HOME=/tmp/arc-it/config ./bin/agent-remote-control start --foreground &
{"level":30,"...","msg":"Server listening at http://127.0.0.1:14096"}

$ curl /api/projects/recent           → 401 auth_required
$ curl /login                         → 200 text/html
$ curl /healthz                       → 200 ok
$ curl POST /api/auth/login {wrong}   → 401 invalid_credentials
$ curl POST /api/auth/login {correct} → 200 + Set-Cookie arc_sid (HttpOnly,SameSite=Lax)
                                            + Set-Cookie arc_csrf (SameSite=Lax, not HttpOnly)

$ start --foreground on busy port     → "Port 14096 on 127.0.0.1 is already in use."
$ start --foreground host=0.0.0.0     → "Refusing to bind 0.0.0.0 without a password set."
```

## Open follow-ups (not in scope)

- Live systemd `install` flow on Ubuntu desktop requires interactive `@inquirer/prompts` —
  not driven from this verification but covered by unit/template tests.
- Logout endpoint is wired and CSRF-gated; UI never calls it yet (no SPA in this sprint).
