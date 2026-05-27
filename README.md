# Agent Remote Control

`agent-remote-control` is a planned Ubuntu local app for controlling local AI
coding agents from a protected browser UI.

The app will own its server, web UI, authentication, project registry, terminal
service, file explorer, realtime sync, and provider adapters. It uses the useful
product shape of `opencode serve --port 4096`, but it must not run
`opencode serve` internally.

## Current Status

This repository is currently in the requirements and design stage. The product
contract is captured in docs; implementation source code is not present yet.

Canonical docs:

- [Product requirements](docs/REQUIEMENT.md)
- [Frontend design](docs/design-frontend.md)
- [Reference note](ref-source/remote-control.md)

The `docs/REQUIEMENT.md` filename is intentionally kept as-is to match the
requested path.

## Phase 1: Antigravity Complete

Phase 1 focuses on making Antigravity fully usable before implementing other
providers.

Phase 1 includes:

- Ubuntu local install with a `systemd --user` service.
- Local web server on `127.0.0.1:4096` by default.
- Optional explicit bind to `0.0.0.0` with stronger warnings and password
  requirements.
- One app-level password and authenticated HTTP/WebSocket/SSE endpoints.
- Project picker, recent project registry, and provider selector.
- Antigravity CDP discovery, launch, attach, mirroring, prompt, stop, and
  action relay.
- Antigravity app-managed PTY sessions.
- Antigravity wrapper-launched sessions.
- Configured tmux/screen attach for Antigravity terminal sessions.
- Existing-session discovery and attach/resume when a supported control surface
  is available.
- Opencode-style browser workspace with session sidebar, composer, action
  panel, browser terminal, and read-only file explorer.
- Local JSON persistence.

Phase 1 does not include full Claude, Codex, or opencode providers. Those stay
visible as future or disabled providers until Antigravity support is complete.

## Planned CLI Surface

The planned app command surface is:

```text
agent-remote-control install
agent-remote-control start
agent-remote-control stop
agent-remote-control status
agent-remote-control open
agent-remote-control config
agent-remote-control antigravity <project>
agent-remote-control agy <project>
```

The `antigravity` and `agy` commands are planned wrapper commands for launching
and registering Antigravity sessions so they can be resumed from the browser.

## Provider Strategy

Provider-specific behavior must stay behind adapters. The frontend should render
normalized provider sessions, capabilities, snapshots, actions, status, and
errors rather than raw CDP or terminal details.

Implementation order:

1. Complete Antigravity across CDP, managed PTY, wrapper, and configured
   tmux/screen control surfaces.
2. Add Claude, Codex, and opencode providers after the Antigravity model is
   proven.
3. Expand shared provider capabilities such as MCP, skills, permissions, agents,
   and tasks.

## Security Direction

Default local use is `http://127.0.0.1:4096` behind app password auth. Binding
to `0.0.0.0` must be explicit and must warn about LAN exposure, terminal access
risk, and the difference between password protection and transport encryption.

The app must not extract provider OAuth tokens or raw API keys from desktop
apps. Browser terminal access is treated as full local shell access. File reads
are scoped to the selected project root, and the file explorer is read-only in
Phase 1.

## Reference Sources

Reference material lives under `ref-source/` and is not part of the product
implementation:

- `ref-source/remote-control.md`
- `ref-source/antigravity_phone_chat`
- `ref-source/opencode`

These references inform design and behavior, but the app must own its runtime
and must not delegate to `opencode serve`.
