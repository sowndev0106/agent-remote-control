# Agent Remote Control Design

## Status

Design draft for user review.

This document defines the Phase 1 MVP for an Ubuntu-installed web app that remotely controls local AI coding agents. Phase 1 targets Antigravity first. Claude, Codex, and opencode are future providers behind the same provider adapter boundary.

## Problem

`opencode serve --port 4096` is useful because it exposes a web/API surface for controlling an AI coding session, but it requires the user to manually run the serve command. The desired product is an installed Ubuntu app that starts automatically, opens a local web port, requires an app password, lets the user choose a project, then remotely views and controls AI provider sessions from a browser.

For Phase 1, the app must control Antigravity. It should use the opencode web experience as the main UI reference and use `ref-source/antigravity_phone_chat` as the practical Antigravity control reference.

## Sources Reviewed

- Local opencode reference: `ref-source/opencode`
- opencode serve entrypoint: `ref-source/opencode/packages/opencode/src/cli/cmd/serve.ts`
- opencode web app UI: `ref-source/opencode/packages/app/src`
- opencode HTTP API list: `ref-source/opencode/packages/sdk/openapi.json`
- Local Antigravity phone/chat reference: `ref-source/antigravity_phone_chat`
- Antigravity CLI docs: https://antigravity.google/docs/cli-overview
- Antigravity CLI features: https://antigravity.google/docs/cli-features
- Antigravity migration docs for skills/MCP conventions: https://antigravity.google/docs/gcli-migration

## Decisions

1. Scope is Phase 1 MVP for Antigravity only.
2. Provider architecture must leave room for Claude, Codex, and opencode later.
3. Server binds to `127.0.0.1` by default and may be configured to bind `0.0.0.0`.
4. Authentication is one app-level password with a web session token after login.
5. UI direction is opencode-style workspace:
   - project rail
   - session list
   - central live mirror/timeline
   - action/status side panel
   - responsive phone layout
6. Project picker can browse any readable folder, but marks Git repos and AI-context folders as recommended.
7. Antigravity adapter strategy is hybrid:
   - Phase 1 priority: Antigravity desktop via Chrome DevTools Protocol (CDP), based on `antigravity_phone_chat`.
   - Secondary adapter: PTY/TUI bridge for `agy` or other terminal CLIs.
   - Future adapter: official SDK/API if stable enough.
8. MVP sync level is mirror plus basic parsed actions:
   - show live mirrored Antigravity state
   - send prompt
   - stop generation
   - new/select conversation
   - mode/model state
   - remote click for approval/action buttons
   - parse basic action states where possible
9. Ubuntu install default is `systemd --user`; system-level service is roadmap.
10. Product and binary name are `agent-remote-control` until renamed.
11. Default port is `4096` for opencode familiarity. If that port is busy, the app must fail clearly and ask for a configured alternate port; it must not kill unrelated processes.
12. MVP launch behavior is attach-first. If Antigravity is not already available on a debug port, the UI offers an explicit "Launch Antigravity" action for the selected project.
13. HTTPS certificates are generated on demand, not during default install.
14. MVP persistence uses local JSON files. SQLite is reserved for later if session/event history becomes too large for simple files.
15. Phase 1 includes a browser terminal panel. It runs real local shell sessions through a server-managed PTY and is protected by the same app authentication.

## opencode Serve Analysis

`opencode serve` starts a headless server. It does not require a project instance at startup because requests route project context through the directory header/query. It resolves network settings from CLI flags and config, then starts the server and blocks forever.

Important behavior to clone:

- Default local HTTP API/server model.
- Configurable hostname, port, CORS, and optional mDNS.
- Password protection via server password.
- Directory-scoped requests using a directory header/query.
- Web UI served from embedded assets or proxied upstream.
- Server-sent events for realtime sync.
- Session, project, file, provider/model, MCP, permission, question, PTY, VCS, and event APIs.

The new app should not literally run `opencode serve --port 4096`; it should implement the same product shape: installed local daemon, local web UI, realtime session control, and provider-backed project sessions.

## opencode UI Features To Expect

The target UI should preserve these concepts from opencode:

- Home screen with saved projects and recent sessions.
- Add/open project dialog with folder search.
- Sidebar project rail and session/workspace list.
- New session flow.
- Chat composer with prompt history.
- Slash command popover.
- `@` mentions for agents and files.
- File attachments and selected file/line context.
- Model selector and model variant selector.
- Agent selector/cycle.
- MCP server toggle/list.
- Permission dock with allow once, allow always, and deny.
- Todo/progress dock.
- Follow-up and question docks.
- Revert, undo, redo, compact, fork, share/unshare where provider supports them.
- File tree and review/diff panel.
- Built-in terminal panel.
- Session timeline with tool/action blocks.
- Context usage/status indicators.
- Settings for providers, models, general preferences, and keybindings.

Phase 1 does not need full parity, but the information architecture should not block these features.

## Antigravity Reference Analysis

`ref-source/antigravity_phone_chat` controls an already-running Antigravity desktop session through CDP:

- Launch Antigravity with `antigravity . --remote-debugging-port=9000`.
- Discover CDP targets on ports `9000-9003`.
- Connect to the workbench target via WebSocket.
- Capture the chat DOM from `#conversation`, `#chat`, or `#cascade`.
- Remove desktop-only input overlays while preserving actionable buttons.
- Convert local images to base64 for browser rendering.
- Poll every second and broadcast only when snapshot hash changes.
- Send prompts by injecting text into the contenteditable input.
- Stop generation by clicking cancel/stop controls.
- Change mode/model through heuristic UI selection.
- Relay mobile/browser clicks back to desktop using text matching and occurrence index.
- Support action buttons such as Allow, Deny, Run, Review Changes, Apply, and Save.
- Sync scroll from remote browser to desktop.
- Expose health, snapshot, app-state, send, stop, new-chat, chat-history, select-chat, remote-click, and remote-scroll endpoints.

The app should adopt the robust ideas from this source, not its exact mobile-only UX:

- CDP adapter with centralized call tracking and timeout.
- Snapshot diffing by hash.
- Deterministic remote click targeting.
- Leaf-most filtering for nested DOM.
- Optimistic prompt submission.
- Local-first security model.
- No extraction of Google or provider OAuth tokens.

## Product Architecture

```text
Browser UI
  |
  | HTTPS/HTTP + WebSocket/SSE
  v
Agent Remote Control Server
  |
  +-- Auth/session middleware
  +-- Project registry
  +-- Provider registry
  +-- Session/event store
  +-- File/project service
  +-- Terminal PTY service
  +-- Realtime event bus
  |
  +-- Antigravity CDP Adapter       Phase 1 priority
  +-- Antigravity PTY Adapter       Phase 1/2 fallback
  +-- Claude Adapter                Future
  +-- Codex Adapter                 Future
  +-- opencode Adapter              Future
```

The UI talks only to the app server. Provider-specific details stay inside adapters. A provider adapter exposes a common interface:

- `detect()`
- `start(project, options)`
- `attach(session)`
- `stop(session)`
- `sendPrompt(session, text, context)`
- `sendInput(session, input)`
- `listConversations(project)`
- `selectConversation(session, conversationID)`
- `getSnapshot(session)`
- `getStatus(session)`
- `getActions(session)`
- `performAction(session, actionID)`
- `dispose(session)`

## Core User Flow

1. User installs the app on Ubuntu.
2. Installer creates config and a `systemd --user` service.
3. App starts automatically and listens on `127.0.0.1:<port>`.
4. User opens the web UI.
5. User enters the app password.
6. User selects or adds a project folder.
7. App records the project in the recent project registry.
8. User chooses provider: Antigravity is enabled; Claude, Codex, and opencode show as disabled/future.
9. User starts or attaches an Antigravity session.
10. App launches or detects Antigravity debug mode and connects CDP.
11. UI shows project/session sidebar plus central Antigravity mirror/timeline.
12. User sends prompts, clicks action buttons, approves/denies requests, stops generation, switches conversations, and watches status from the browser.
13. User opens one or more terminal tabs for the selected project and runs local commands without leaving the web UI.

## Project Picker Requirements

The project picker must:

- Browse the local filesystem from home or configured roots.
- Allow any readable folder.
- Mark a folder as recommended if it contains one or more:
  - `.git`
  - `AGENTS.md`
  - `GEMINI.md`
  - `.agents/`
  - `.opencode/`
  - `.claude/`
  - `.codex/`
- Persist recent projects.
- Persist last provider per project.
- Persist last selected conversation/session per project when possible.
- Support removing projects from the saved list without deleting files.

## Antigravity CDP MVP

The Antigravity CDP adapter must:

- Detect an existing Antigravity debug instance on configured ports.
- Optionally launch Antigravity with:
  - selected project directory
  - `--remote-debugging-port=<port>`
- Attach to the correct CDP target.
- Wait gracefully if Antigravity is not yet available.
- Capture and sanitize conversation DOM snapshots.
- Preserve action bars needed for remote control.
- Send snapshot updates to browsers only when content changes.
- Expose app state:
  - connected/disconnected
  - active project
  - active conversation
  - mode
  - model
  - busy/generating
  - pending approval/action count when detected
- Send prompt text.
- Stop current generation.
- Start a new conversation.
- List/select recent conversations where DOM scraping can detect them.
- Relay clicks for:
  - thought/status expansion
  - edited files blocks
  - Review Changes
  - Allow/Deny
  - Run/Reject
  - Apply/Save/Confirm
- Sync remote scroll to desktop only when the user explicitly scrolls in the web mirror.

## PTY Adapter Requirement

The provider PTY adapter is separate from the user-facing browser terminal. It is not the primary Antigravity MVP path, but the design must reserve it. It should support terminal-first providers such as `agy`, Claude Code, Codex, and opencode TUI.

The PTY adapter should eventually:

- Spawn provider CLI inside a pseudo-terminal.
- Stream terminal output to the browser.
- Send keystrokes/prompt text from browser to PTY.
- Resize terminal from browser viewport.
- Parse basic states from output when possible.
- Provide fallback manual terminal mode when structured state is unavailable.

## Browser Terminal Requirements

Phase 1 must include a terminal experience similar to the screenshot reference:

- Terminal panel can be opened from the main workspace UI.
- Terminal panel supports multiple tabs.
- Each tab has:
  - stable title such as `Terminal 1`
  - close action
  - active-state indicator
  - optional rename later
- A plus action creates a new terminal tab.
- New terminal sessions start in the selected project directory.
- Terminal backend creates a real pseudo-terminal attached to the user's default shell from `$SHELL`, falling back to `/bin/bash`.
- Terminal frontend uses a browser terminal renderer such as xterm.js.
- Browser and backend communicate through authenticated WebSocket.
- Terminal supports:
  - keyboard input
  - copy and paste
  - scrollback
  - terminal resize
  - process exit detection
  - reconnect display for still-running sessions when the browser reloads
- Terminal sessions are scoped to the current logged-in app user.
- Terminal output is not persisted by default; only tab metadata may be persisted for reconnect.
- Closing a terminal tab terminates its PTY process after confirmation if a foreground process is still running.
- Terminal can be disabled in config for users who only want AI-provider remote control.
- Mobile UI exposes terminal as a full-screen drawer or tab because split panes are too cramped on phones.

## Web UI Requirements

Desktop layout:

- Left project rail.
- Session/conversation sidebar.
- Main live mirror/timeline.
- Right action/status panel.
- Bottom composer.
- Resizable terminal panel with tabs, located below the mirror/timeline or available as a full terminal view.

Main screen states:

- Logged out.
- No project selected.
- Project selected, no provider session.
- Connecting to provider.
- Provider connected.
- Provider disconnected/retrying.
- Generation running.
- Approval/action pending.
- Error state with recovery action.

The main mirror should support:

- live snapshot rendering
- refresh
- scroll to bottom
- remote click relay
- prompt input
- quick actions
- stop button
- new conversation
- conversation history selector

The side panel should show:

- provider status
- project path
- launch command or attach target
- CDP port
- active model/mode
- pending actions
- last error
- adapter logs
- terminal session count

Mobile layout:

- Single-column live mirror first.
- Project/session/history in drawers.
- Bottom composer optimized for phone keyboard.
- Action buttons remain tappable.

## Slash Commands

The app should expose a slash command palette inspired by opencode and Antigravity CLI. Phase 1 commands:

- `/new` starts a new provider conversation.
- `/stop` stops current generation.
- `/project` opens project picker.
- `/provider` opens provider selector.
- `/model` opens model selector if adapter supports it.
- `/mode` opens Antigravity mode selector if adapter supports it.
- `/history` opens conversation selector.
- `/actions` focuses pending action panel.
- `/terminal` opens or focuses the browser terminal panel.
- `/settings` opens app settings.

Future commands:

- `/skills`
- `/mcp`
- `/permissions`
- `/agents`
- `/tasks`
- `/fork`
- `/compact`
- `/undo`
- `/redo`

## Security Requirements

- Require app-level password on first access.
- Use a secure session cookie or bearer token after login.
- Never store provider OAuth/API secrets in browser local storage.
- Bind to `127.0.0.1` by default.
- When binding `0.0.0.0`, show a startup warning and require a configured non-default password.
- Provide optional HTTPS/self-signed certificate support.
- Set strict CSP for the web UI.
- Sanitize any DOM snapshot before rendering.
- Escape any scraped title/text inserted into app-owned DOM.
- Protect WebSocket/SSE endpoints with the same auth session.
- Protect terminal WebSocket endpoints with the same auth session.
- Treat terminal access as full local shell access; when binding `0.0.0.0`, startup warnings must explicitly mention terminal risk.
- Allow terminal to be disabled by config.
- Do not persist terminal output by default.
- Do not auto-exempt LAN clients in MVP; all clients authenticate.
- Log security-relevant startup warnings.

## Configuration

Default config location:

```text
~/.config/agent-remote-control/config.json
```

MVP config fields:

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 4096,
    "passwordHash": "",
    "https": false
  },
  "projects": {
    "roots": ["~"],
    "recentLimit": 50
  },
  "terminal": {
    "enabled": true,
    "shell": "",
    "maxTabs": 8,
    "scrollback": 10000,
    "idleTimeoutMs": 3600000
  },
  "providers": {
    "antigravity": {
      "enabled": true,
      "adapter": "cdp",
      "command": "antigravity",
      "debugPort": 9000,
      "debugPortRange": [9000, 9001, 9002, 9003],
      "launchTimeoutMs": 30000,
      "snapshotPollMs": 1000
    }
  }
}
```

## Local Data

The app should store:

- saved projects
- recent projects
- provider preferences per project
- active sessions/conversations metadata
- terminal tab metadata for reconnect
- app settings
- adapter logs
- auth session metadata

It should not store:

- provider OAuth tokens copied from desktop apps
- raw provider API keys unless explicitly added later with secure storage
- full mirrored DOM history by default
- terminal scrollback/output by default

## Install And Runtime

MVP install target:

- Ubuntu
- `systemd --user` service
- starts on user login
- no sudo required for normal install
- CLI commands:
  - `agent-remote-control install`
  - `agent-remote-control start`
  - `agent-remote-control stop`
  - `agent-remote-control status`
  - `agent-remote-control open`
  - `agent-remote-control config`

Roadmap:

- system-wide `systemd` service
- packaged `.deb`
- optional tunnel helper
- tray/desktop launcher

## Non-Goals For Phase 1

- Full Claude/Codex/opencode provider implementation.
- Full opencode API compatibility.
- Full structured Antigravity internal event stream.
- Multi-user auth/RBAC.
- Cloud-hosted relay service.
- Provider token management.
- App-specific file editing outside provider actions or explicit terminal commands.
- Replacing Antigravity desktop or CLI.

## Acceptance Criteria

Phase 1 is complete when:

- App installs and starts as a user service on Ubuntu.
- Web UI is reachable on configured localhost port.
- Login requires app password.
- User can add/select project folders and see recent projects.
- Provider selector shows Antigravity enabled and other providers disabled/future.
- App can launch or attach to Antigravity debug mode for selected project.
- Web UI displays live Antigravity conversation mirror.
- Prompt sent from web reaches Antigravity.
- Stop action works during generation.
- New conversation action works when Antigravity exposes it.
- Conversation history can be listed/selected when scrapeable.
- Remote approval/action buttons work for common Allow/Deny/Run/Review cases.
- User can open a terminal panel for the selected project.
- User can create, switch, and close terminal tabs.
- Terminal starts in the selected project directory.
- Terminal can run common commands such as `pwd`, `ls`, and project test commands.
- Terminal resizes correctly when the browser panel changes size.
- Terminal WebSocket requires authenticated session.
- Adapter status and errors are visible.
- Binding defaults to `127.0.0.1`.
- Binding `0.0.0.0` requires explicit config and non-default password.

## Risks

- Antigravity desktop DOM may change and break CDP selectors.
- Remote click targeting is heuristic.
- CDP requires launching Antigravity with remote debugging enabled.
- Browser rendering of cloned DOM can be heavy.
- Browser terminal grants remote shell access if auth or network exposure is misconfigured.
- PTY parsing may not produce reliable structured state.
- Official Antigravity SDK/API may evolve, requiring adapter changes.

Mitigations:

- Keep CDP selector logic isolated in the adapter.
- Provide manual refresh and reconnect controls.
- Keep a raw mirror fallback even when structured parsing fails.
- Store adapter logs for troubleshooting.
- Keep terminal disabled-by-config and clearly warn when the server binds beyond loopback.
- Build adapter contract before adding more providers.

## Roadmap

Phase 1:

- Ubuntu user service
- password auth
- project picker
- opencode-style web UI
- browser terminal panel with tabs
- Antigravity CDP adapter
- live mirror, prompt, stop, remote actions

Phase 2:

- PTY adapter for `agy`
- better parsed timeline/actions
- slash command expansion
- skills/MCP screens for Antigravity where supported

Phase 3:

- Claude adapter
- Codex adapter
- opencode adapter
- provider-specific permissions/settings
- `.deb` packaging and optional system service

Phase 4:

- optional tunnel setup
- HTTPS certificate helper
- richer session persistence
- multi-device polish

## Locked Assumptions

- App name and binary name: `agent-remote-control`.
- Default port: `4096`.
- Port conflict behavior: fail with instructions; do not auto-kill processes.
- Antigravity startup behavior: attach first, launch only after explicit user action.
- HTTPS behavior: on-demand certificate generation.
- Persistence backend: JSON files for MVP.
- Browser terminal: enabled by default, starts in the selected project directory, uses `$SHELL` or `/bin/bash`, and does not persist terminal output.
