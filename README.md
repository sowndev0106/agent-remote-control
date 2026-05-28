# agent-remote-control

Ubuntu local app that controls Antigravity (and, in later phases, Claude /
Codex / opencode) from a password-protected browser UI on
`http://127.0.0.1:4096`.

The app owns its server, web UI, auth, project registry, terminal service,
file explorer, realtime sync, and provider adapters. It does **not** delegate
to `opencode serve`.

**Status:** Phase 1 (Antigravity) implemented and tagged
[`v0.1.0`](https://github.com/sowndev0106/agent-remote-control/releases/tag/v0.1.0).
296 tests, server + React SPA, CDP + managed-PTY + wrapper + tmux/screen +
unmanaged detection. See [docs/sprints/](docs/sprints/) for sprint scope and
[CONTEXT.md](CONTEXT.md) for the domain glossary.

---

## Requirements

- **Ubuntu** (or any Linux with `systemd --user`)
- **Node.js ≥ 20** (tested on 22)
- **pnpm** (`npm i -g pnpm`)
- A C/C++ toolchain for native modules (`build-essential`, `python3`) so
  `argon2`, `bcrypt`, and `node-pty` can compile
- Optional: `tmux`, `screen` if you want those control surfaces

---

## Quick start (5 minutes)

```bash
# 1. Clone and install
git clone git@github.com:sowndev0106/agent-remote-control.git
cd agent-remote-control
pnpm install            # builds argon2 / bcrypt / node-pty natively

# 2. Build the server + the SPA
pnpm build              # → dist/ (server) + dist-web/ (SPA assets)

# 3. Set the password, create the config, install the systemd --user unit
./bin/agent-remote-control install
#   - prompts for password (min 12 chars, confirm twice)
#   - hashes with Argon2id (auto-falls back to bcrypt if native build failed)
#   - writes ~/.config/agent-remote-control/{config.json,secret.key,ipc.nonce}
#   - writes ~/.config/systemd/user/agent-remote-control.service
#   - systemctl --user daemon-reload && enable --now
#   - on headless sessions, offers to run `loginctl enable-linger`

# 4. Open the UI
./bin/agent-remote-control open    # → xdg-open http://127.0.0.1:4096
```

Sign in with the password you set, and you're in.

---

## CLI reference

```text
agent-remote-control install                  Set password + install systemd unit + start service
agent-remote-control start [--foreground]     Start the user service (or run inline)
agent-remote-control stop                     Stop the user service
agent-remote-control status                   Print bind addr + systemctl status
agent-remote-control open                     xdg-open the web UI
agent-remote-control config [--path|--edit]   Print or edit config.json
agent-remote-control antigravity <project>    Wrapper launch: spawns Antigravity for <project>
agent-remote-control agy <project>            Alias for `antigravity`
```

The `antigravity`/`agy` wrapper commands run in your current terminal (stdio
inherited) and register the session with the server over a Unix socket so the
browser can attach. The launched process is *unowned* — closing the wrapper
or stopping the service does **not** kill it (NFR-013A).

---

## Daily workflow

| Want to… | Command |
|---|---|
| Start it | `agent-remote-control start` |
| Open the UI | `agent-remote-control open` |
| Check it's running | `agent-remote-control status` |
| Stop it | `agent-remote-control stop` |
| Tail server logs | `journalctl --user -u agent-remote-control.service -f` |
| Change config | `agent-remote-control config --edit` then `stop` + `start` |
| Reset password | `agent-remote-control install` (answer "overwrite") |
| Wipe everything | `rm -rf ~/.config/agent-remote-control` then `install` again |

---

## Configuration

All config lives in `~/.config/agent-remote-control/config.json`. Defaults are
applied for any missing fields. Key knobs:

```jsonc
{
  "server": {
    "host": "127.0.0.1",          // bind address
    "port": 4096,                  // bind port
    "https": false,                // set true once you wire TLS
    "sessionIdleTimeoutMs": 86400000
  },
  "security": {
    "passwordHashAlgorithm": "argon2id",  // or "bcrypt" / "pbkdf2"
    "loginRateLimit": { "maxFailures": 10, "windowMs": 300000 }
  },
  "projects": { "roots": ["~"], "recentLimit": 50 },
  "terminal":  { "enabled": true, "shell": "", "maxTabs": 8, "scrollback": 10000 },
  "fileExplorer": {
    "enabled": true, "showHidden": false, "maxPreviewBytes": 524288,
    "ignore": [".git", "node_modules", "dist", "build", ".next", ".cache"]
  },
  "providers": {
    "antigravity": {
      "command": "antigravity",
      "debugPortRange": [9000, 9001, 9002, 9003],
      "tmuxTargets":  [{ "name": "my-tmux-session", "project": "/path/to/proj" }],
      "screenTargets": []
    }
  }
}
```

Sensitive fields the server keeps but never returns over the API:
`server.passwordHash`, `secret.key`. `GET /api/config` returns `passwordSet:
true|false` instead.

### Binding to `0.0.0.0` (LAN exposure)

Refused unless you also set a non-default password. The startup banner warns
about LAN exposure, the difference between password and transport encryption,
and terminal-as-shell risk. Use HTTPS for any non-`127.0.0.1` deployment.
See [SECURITY.md](SECURITY.md).

### Force a specific password hash

```bash
AGENT_REMOTE_CONTROL_HASH=pbkdf2 ./bin/agent-remote-control install
# valid values: argon2id (default if native build works), bcrypt, pbkdf2
```

---

## Development

```bash
# Server (TypeScript watch)
pnpm dev:server
# In another shell, run the server inline (no systemd):
./bin/agent-remote-control start --foreground

# Frontend (Vite dev server on :5173, proxies /api → 127.0.0.1:4096)
pnpm dev:web

# Run the full test suite (Vitest, 296 tests)
pnpm test
pnpm test:watch          # watch mode

# End-to-end (Playwright, spins a real server against a tmp config)
pnpm test:e2e
pnpm test:e2e:ui         # interactive runner

# Type-check only (no emit)
pnpm typecheck

# Lint / format
pnpm lint
pnpm format
```

Build outputs:

- `dist/` — compiled server (entered by `bin/agent-remote-control`)
- `dist-web/` — the React SPA, served by Fastify at `/` + `/assets/*`

Both are gitignored; `pnpm build` produces them.

---

## Architecture at a glance

```
bin/agent-remote-control            shim → dist/cli/index.js (commander)
src/
  cli/                              install / start / stop / status / open / config / antigravity
  server/
    assembly.ts                     composition root — the only place the dep graph is wired
    index.ts                        startServer = bind-guard → tryBind → assembleServer → listen
    core/
      app.ts                        Fastify build + auth hook + CSP/headers
      auth-session.ts               browser/cookie sessions (was SessionStore)
      session.ts → auth-session.ts  (renamed; see CONTEXT.md)
      realtime/
        upgrade-auth.ts             single WS-upgrade auth seam (consumed by both mounts)
        ws.ts                       /api/realtime
        terminal-ws.ts              /api/terminal/tabs/:id/stream
      perms-audit.ts                startup 0700 dir / 0600 file enforcer
    domains/
      agent-sessions.ts             agent/provider sessions registry (was SessionStoreLite)
      projects.ts                   project store + browse + recommendation markers
      providers.ts                  provider registry (Antigravity enabled, others future)
      files.ts                      project-scoped tree + preview + fuzzy search
      terminal.ts                   PTY pool + ring buffer + foreground-job detection
      discovery.ts                  aggregates CDP + tmux + screen + unmanaged
    adapters/
      IProviderAdapter.ts           14-method interface (port; only CDP fully implements it)
      antigravity/{index,pty,wrapper,tmux,screen,unmanaged}.ts
      antigravity/{cdp,snapshot,sanitize,targeting,launch,discover}.ts
      stub/{claude,codex,opencode}.ts
    http/
      route-helpers.ts              rejectIfMissing / rejectIfMissingFrom / requireBodyString
      domain.ts                     wires every route registrar
      login.ts                      /login, /api/auth/*
      projects.ts                   /api/projects/*
      providers.ts                  /api/providers
      adapter-routes.ts             /api/sessions/* (launch/attach/prompt/stop/snapshot/actions/...)
      pty-routes.ts                 /api/sessions/pty/*
      terminal-routes.ts            /api/terminal/tabs/*
      files-routes.ts               /api/files/{tree,preview,search}
      config-routes.ts              /api/config (sanitized)
    ipc/                            Unix-socket RPC for the wrapper CLI (nonce-authed)
    pty/                            shared node-pty helper
  web/
    app/main.tsx                    React Router + RealtimeBridge
    components/                     AuthScreen, AppShell, ProjectPicker, ProviderSelector,
                                    SessionDiscoveryList, MirrorTimeline (sandboxed iframe),
                                    ActionPanel, Composer, SlashCommandPalette, FileExplorer,
                                    FileViewer, TerminalDock, SettingsView, Workspace
    stores/                         Zustand: auth, projects, providers, sessions, files
    lib/                            api (CSRF + envelope), ws (reconnect)
    styles/tailwind.css
systemd/agent-remote-control.service.tmpl
tests/                              Vitest — 296 tests across 72 files (server + web stores)
e2e/                                Playwright — smoke against a real server
docs/
  architecture.md                   module map, adapter model, API/realtime/persistence/security
  api-contract.md                   every endpoint + WS + event + error code
  REQUIEMENT.md                     product requirements (filename intentional)
  design-frontend.md                state model, components, routes, security rules
  sprints/                          sprint plans (01..08)
  superpowers/plans/                implementation plans
SECURITY.md                         security model + NFR mapping + hard rules
CONTEXT.md                          domain glossary (start here)
```

See [docs/architecture.md](docs/architecture.md) and
[docs/api-contract.md](docs/api-contract.md) for the full module map and
contract.

---

## Sprint history

Implementation is sprint-driven; the plans live in
[docs/sprints/](docs/sprints/) and the executed plans in
[docs/superpowers/plans/](docs/superpowers/plans/).

| Sprint | Topic |
|---|---|
| 01 | Runtime, CLI, auth (Argon2id, cookies, CSRF, port-busy, 0.0.0.0 gate, systemd unit) |
| 02 | Project + provider registry, normalized session shape |
| 03 | Antigravity CDP adapter (discover, attach, snapshot, action IDs, WS) |
| 04 | React + Vite SPA workspace (project picker, mirror, action panel, composer, slash palette) |
| 05 | Managed PTY + wrapper adapter + IPC socket |
| 06 | Browser terminal (xterm.js) + read-only file explorer |
| 07 | tmux/screen attach + unmanaged process detector |
| 08 | Strict CSP + audited persistence + contract docs |
| *follow-up* | Architecture deepening (composition root, route helpers, WS auth seam, session-type rename) |

---

## Security

- One app-level password, hashed (Argon2id / bcrypt / PBKDF2). Never plaintext.
- Sessions are server-issued 32-byte random IDs in HttpOnly + SameSite=Lax
  cookies (+ Secure under HTTPS).
- CSRF on every state-changing endpoint (double-submit cookie).
- Login rate-limited (10 fails / 5 min / IP), generic error messages.
- Action IDs are **server-issued**; the frontend can never submit a CDP
  selector, button text, occurrence index, or raw command (verified by
  static-source tests).
- Strict app-shell CSP. The mirror iframe is `sandbox=""` + `srcDoc` only.
- File reads are scoped to the single active project root with realpath +
  symlink-escape rejection.
- App shutdown SIGTERMs **only** owned PTYs/launches. Wrapper-launched and
  unmanaged externals are left alone.

Full model: [SECURITY.md](SECURITY.md).

---

## Reference material (not part of the runtime)

The `ref-source/` directory is gitignored and holds material that informed
the design without being imported:

- `ref-source/remote-control.md`
- `ref-source/antigravity_phone_chat/` — original CDP POC; patterns ported,
  `killPortProcess` and LAN-trust deliberately **not** ported
- `ref-source/opencode/` — UX shape reference

---

## Authoritative docs

In priority order — when in conflict, the higher entry wins:

| Doc | Purpose |
|---|---|
| [docs/REQUIEMENT.md](docs/REQUIEMENT.md) | Product requirements (REQ-* / NFR-* / AC-*) |
| [docs/design-frontend.md](docs/design-frontend.md) | Frontend state, components, routes, security |
| [docs/architecture.md](docs/architecture.md) | Backend module map, adapter model, contracts, pre-flight decisions |
| [docs/api-contract.md](docs/api-contract.md) | Endpoint + WS event tables |
| [docs/sprints/README.md](docs/sprints/README.md) | Sprint plan + dependency graph |
| [SECURITY.md](SECURITY.md) | Security model + hard-rule mapping |
| [CONTEXT.md](CONTEXT.md) | Domain glossary |
| [AGENTS.md](AGENTS.md) | Guidance for coding agents (Claude Code, Codex, Gemini, …) |

---

## License

Not set yet. Treat as proprietary until a license file lands.
