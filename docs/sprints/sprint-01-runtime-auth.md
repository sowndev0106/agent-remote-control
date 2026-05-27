# Sprint 01 — Runtime, CLI, Auth Base

**Milestone:** M1
**Effort:** 3-5 days
**Dependencies:** none — start here

## Goal

Bootstrap the app: install command, systemd user service, HTTP server on
`127.0.0.1:4096`, password setup, secure session cookies, and the CLI surface
that every later sprint depends on.

## In-Scope Requirements

- REQ-001 through REQ-014D (install, runtime, CLI, auth, password hashing,
  sessions, rate-limit, CSRF)
- NFR-001 (auth on every endpoint except login)
- NFR-006 (0.0.0.0 warnings)
- NFR-008A (HTTPS vs password clarity)

## Out of Scope

- Project picker, provider selector (sprint 02)
- Any provider adapter (sprint 03+)
- File or terminal APIs (sprint 06)

## Acceptance Criteria

- AC-001: Ubuntu install creates a running `systemd --user` service.
- AC-002: Web UI reachable at `http://127.0.0.1:4096`.
- AC-003: Login required before any non-login endpoint.
- AC-026: `0.0.0.0` requires explicit config + non-default password.
- AC-027: Busy port fails clearly without killing the existing process.
- AC-036: First-run password setup produces non-plaintext hash; sessions use
  server-issued IDs.

## Deliverables

- `package.json`, `tsconfig.json`, `src/` skeleton (TypeScript + Node.js 20).
- `bin/agent-remote-control` (CLI entry).
- `src/cli/{install,start,stop,status,open,config}.ts`.
- `src/server/core/{app,auth,config,persistence}.ts`.
- systemd unit template: `~/.config/systemd/user/agent-remote-control.service`.
- Default config at `~/.config/agent-remote-control/config.json` matching the
  schema in REQUIEMENT.md "Default Configuration".
- Login page at `/login` (vanilla HTML is fine for this sprint).

## Tasks

- **S01-T01** Scaffold TypeScript project, Fastify server, `pnpm` workspaces if
  splitting client/server, ESLint + Prettier.
- **S01-T02** Implement `config.ts`: load+validate `config.json`; atomic write
  helper with `proper-lockfile` and 0600 file mode.
- **S01-T03** Implement password setup flow: first-run prompts, `argon2id` hash,
  store in config. Fallback to bcrypt if argon2 unavailable.
- **S01-T04** Implement session middleware: random 32-byte session IDs, signed
  HttpOnly cookie, `SameSite=Lax`, idle timeout from config, `Secure` flag when
  HTTPS enabled. Store sessions in JSON file with atomic writes.
- **S01-T05** Implement login endpoint: rate-limit (10 fails / 5 min per IP),
  generic error messages, CSRF token issuance.
- **S01-T06** Implement CSRF middleware: double-submit cookie pattern for all
  state-changing endpoints.
- **S01-T07** Implement port-busy check: try-bind, fail with normalized error
  envelope on EADDRINUSE. Never call `killPortProcess` (POC does this — do NOT
  port that behavior).
- **S01-T08** `0.0.0.0` config gate: refuse to start if bind host is 0.0.0.0
  and password is empty or default. Print red startup banner with risks.
- **S01-T09** CLI commands:
  - `install` — write systemd unit, `systemctl --user enable --now`.
  - `start` / `stop` — proxy to systemctl.
  - `status` — print bind addr, PID, uptime.
  - `open` — `xdg-open http://<host>:<port>`.
  - `config` — print or edit config path.
- **S01-T10** Minimal `/login` HTML page (no SPA yet) + `/logout` POST.
- **S01-T11** Smoke tests:
  - install → service starts → curl returns 401 → login → curl returns 200.
  - Bind 0.0.0.0 with default password → server refuses to start.
  - Port busy → clear error.

## Risks

- **systemd unit working-dir + PATH:** Need `Environment=PATH=...` so the node
  binary is found under `systemd --user`. Test on a clean Ubuntu install.
- **Argon2 native build on user machines:** Provide bcrypt fallback (REQ-014A
  allows it).

## Done Definition

- All AC items above pass manual test.
- `agent-remote-control install` on a fresh user shell produces a running
  service responding 200 on the login page and 401 elsewhere.
- Config file permissions are 0600.
- No `kill` commands ship in the install path.
