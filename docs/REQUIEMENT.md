# Agent Remote Control Requirements

## Status

Product requirement draft for Phase 1 MVP.

This file intentionally uses the requested path `docs/REQUIEMENT.md`.
The design source is `docs/design.md`.

## Goal

Build an Ubuntu-installed app named `agent-remote-control` that starts
automatically, opens a protected local web UI, lets the user choose a project,
and remotely controls local AI coding agents from the browser.

The product should clone the useful product shape of `opencode serve --port
4096`, but it must not run `opencode serve` internally. The app owns its server,
web UI, auth, project registry, terminal service, file explorer, realtime sync,
and provider adapters.

Phase 1 targets Antigravity only. Claude, Codex, and opencode are future
providers behind the same provider adapter interface.

## Source References

- `docs/design.md`
- `ref-source/remote-control.md`
- `ref-source/opencode`
- `ref-source/opencode/packages/opencode/src/cli/cmd/serve.ts`
- `ref-source/opencode/packages/app/src`
- `ref-source/opencode/packages/sdk/openapi.json`
- `ref-source/antigravity_phone_chat`
- https://antigravity.google/docs/cli-overview
- https://antigravity.google/docs/cli-features
- https://antigravity.google/docs/gcli-migration

## Phase 1 Scope

Phase 1 MUST include:

- Ubuntu local install.
- `systemd --user` service that starts on login.
- Local web server on port `4096` by default.
- Default bind host `127.0.0.1`.
- Optional configured bind host `0.0.0.0`.
- One app-level password.
- Project picker and recent project registry.
- Provider selector with Antigravity enabled.
- Claude, Codex, and opencode visible as future or disabled providers.
- Antigravity remote control through the CDP adapter first.
- Reserved PTY adapter path for Antigravity CLI and terminal-first providers.
- Opencode-style web workspace.
- Live Antigravity mirror or timeline.
- Prompt sending, stop, new conversation, conversation selection where possible.
- Remote action relay for common Antigravity approval/action buttons.
- Browser terminal with multiple tabs.
- Read-only project file explorer.
- Local JSON persistence.

Phase 1 MUST NOT include:

- Full Claude provider implementation.
- Full Codex provider implementation.
- Full opencode provider implementation.
- Full opencode API compatibility.
- Multi-user auth or RBAC.
- Cloud relay service.
- Provider token extraction from desktop apps.
- File editing in the app file explorer.
- Automatic killing of unrelated processes on busy ports.

## Users And Jobs

Primary user:

- A developer using Ubuntu who runs AI coding agents locally and wants to
  control them from another browser, laptop, or phone.

User jobs:

- Install one app once and let it start automatically.
- Open a secure local URL without manually running `opencode serve`.
- Select a project and provider.
- Watch the provider session live.
- Send prompts and approvals remotely.
- Browse project files without leaving the UI.
- Run terminal commands inside the selected project from the browser.

## Functional Requirements

### Install And Runtime

REQ-001: The app MUST provide an install command:

```text
agent-remote-control install
```

REQ-002: The install command MUST create a user-level service using
`systemd --user`.

REQ-003: The app MUST start automatically when the user logs in.

REQ-004: The app MUST provide these CLI commands:

```text
agent-remote-control install
agent-remote-control start
agent-remote-control stop
agent-remote-control status
agent-remote-control open
agent-remote-control config
```

REQ-005: The default server port MUST be `4096`.

REQ-006: The default bind host MUST be `127.0.0.1`.

REQ-007: The app MUST support explicit config to bind `0.0.0.0`.

REQ-008: If the configured port is busy, the app MUST fail with a clear error
and MUST NOT kill the existing process.

REQ-009: The `open` command SHOULD open the configured web URL in the default
browser.

### Authentication

REQ-010: The app MUST require one app-level password before any workspace,
project, provider, terminal, file, WebSocket, or SSE endpoint is usable.

REQ-011: The stored password MUST be hashed, not stored as plaintext.

REQ-012: After login, the browser MUST use a secure server-issued session.

REQ-013: The app MUST support password setup during first run or install.

REQ-014: Binding `0.0.0.0` MUST require an explicit non-default password.

### Project Management

REQ-015: The UI MUST let the user browse folders from home or configured roots.

REQ-016: The UI MUST allow any readable folder to be selected as a project.

REQ-017: The project picker MUST mark folders as recommended when they contain
one or more project signals:

- `.git`
- `AGENTS.md`
- `GEMINI.md`
- `.agents/`
- `.opencode/`
- `.claude/`
- `.codex/`

REQ-018: The app MUST persist recent projects.

REQ-019: The app MUST persist last selected provider per project.

REQ-020: The app SHOULD persist last selected provider session or conversation
per project when the provider adapter can identify it.

REQ-021: The UI MUST let the user remove a project from the saved list without
deleting project files.

### Provider Selection

REQ-022: The provider selector MUST show these providers:

- Antigravity
- Claude
- Codex
- opencode

REQ-023: Phase 1 MUST enable only Antigravity.

REQ-024: Disabled future providers MUST be visible but clearly unavailable.

REQ-025: Provider-specific behavior MUST be isolated behind a provider adapter
interface.

REQ-026: The common provider adapter interface SHOULD support:

```text
detect()
start(project, options)
attach(session)
stop(session)
sendPrompt(session, text, context)
sendInput(session, input)
listConversations(project)
selectConversation(session, conversationID)
getSnapshot(session)
getStatus(session)
getActions(session)
performAction(session, actionID)
dispose(session)
```

### Antigravity Provider

REQ-027: Phase 1 MUST implement the Antigravity provider.

REQ-028: The primary Antigravity adapter MUST use CDP for live desktop
mirroring and remote action control.

REQ-029: The adapter MUST detect existing Antigravity debug targets on
configured ports.

REQ-030: The default Antigravity debug port MUST be `9000`.

REQ-031: The default Antigravity debug discovery range SHOULD include
`9000-9003`.

REQ-032: If no debug target exists, the UI MUST offer an explicit Launch
Antigravity action for the selected project.

REQ-033: Launch behavior MUST use the selected project directory.

REQ-034: The adapter MUST attach to the correct Antigravity workbench CDP
target.

REQ-035: The adapter MUST expose connection status, project path, debug port,
mode, model, busy state, and last error when detectable.

REQ-036: The adapter MUST capture conversation snapshots from Antigravity and
send updates only when content changes.

REQ-037: The adapter MUST sanitize captured DOM before rendering it in the app
UI.

REQ-038: The adapter MUST send prompt text from the web UI to Antigravity.

REQ-039: The adapter MUST support stop generation when Antigravity exposes a
stop or cancel control.

REQ-040: The adapter MUST support new conversation when Antigravity exposes the
control.

REQ-041: The adapter SHOULD list and select conversation history when it is
detectable through the UI.

REQ-042: The adapter MUST relay common remote action clicks, including:

- Allow
- Deny
- Run
- Reject
- Review Changes
- Apply
- Save
- Confirm

REQ-043: The adapter MUST use deterministic click targeting, such as text plus
occurrence index, to reduce wrong-target clicks.

REQ-044: The adapter MUST support remote scroll sync only when the user
explicitly scrolls the web mirror.

REQ-045: The app SHOULD reserve a PTY adapter path for Antigravity CLI, but the
CDP adapter is the Phase 1 priority.

### Web Workspace UI

REQ-046: The desktop UI MUST follow an opencode-style workspace layout:

- project rail
- session or conversation sidebar
- central live mirror or timeline
- right action/status panel
- bottom composer
- terminal panel
- file explorer panel

REQ-047: The UI MUST support these states:

- logged out
- no project selected
- project selected with no provider session
- connecting to provider
- provider connected
- provider disconnected or retrying
- generation running
- approval or action pending
- error with recovery action

REQ-048: The central mirror/timeline MUST support refresh, scroll to bottom,
remote click relay, prompt input, quick actions, stop, new conversation, and
conversation selector where available.

REQ-049: The right panel MUST show provider status, project path, launch or
attach target, CDP port, active model or mode, pending actions, last error,
adapter logs, terminal count, and selected file metadata when relevant.

REQ-050: The mobile UI MUST use a single-column layout with drawers or tabs for
project, session, actions, files, and terminal.

REQ-051: Mobile action buttons MUST remain tappable and not depend on hover.

### Slash Commands

REQ-052: The composer MUST support a slash command palette.

REQ-053: Phase 1 MUST include these slash commands:

- `/new`
- `/stop`
- `/project`
- `/files`
- `/open`
- `/provider`
- `/model`
- `/mode`
- `/history`
- `/actions`
- `/terminal`
- `/settings`

REQ-054: Commands unsupported by the active provider MUST be shown as disabled
or return a clear unsupported message.

REQ-055: The command architecture SHOULD allow future opencode-style commands:

- `/skills`
- `/mcp`
- `/permissions`
- `/agents`
- `/tasks`
- `/fork`
- `/compact`
- `/undo`
- `/redo`

### Browser Terminal

REQ-056: Phase 1 MUST include a browser terminal panel.

REQ-057: The terminal panel MUST support multiple tabs.

REQ-058: Each terminal tab MUST have a stable title such as `Terminal 1`, a
close action, and an active-state indicator.

REQ-059: A plus action MUST create a new terminal tab.

REQ-060: New terminal sessions MUST start in the selected project directory.

REQ-061: The backend MUST create a real pseudo-terminal attached to `$SHELL`,
falling back to `/bin/bash`.

REQ-062: The frontend SHOULD use a browser terminal renderer such as xterm.js.

REQ-063: Browser terminal traffic MUST use authenticated WebSocket.

REQ-064: The terminal MUST support keyboard input, copy, paste, scrollback,
resize, process exit detection, and reconnect display after browser reload.

REQ-065: Terminal output MUST NOT be persisted by default.

REQ-066: Terminal tab metadata MAY be persisted for reconnect.

REQ-067: Closing a terminal tab MUST terminate its PTY process.

REQ-068: If a foreground process is still running, closing a terminal tab MUST
ask for confirmation.

REQ-069: Terminal access MUST be disableable in config.

REQ-070: The mobile UI MUST expose terminal as a full-screen drawer or tab.

### File Explorer

REQ-071: Phase 1 MUST include a project file explorer.

REQ-072: The file explorer MUST be rooted at the selected project directory.

REQ-073: The file explorer MUST support expanding and collapsing folders.

REQ-074: The file explorer MUST show file and folder type indicators.

REQ-075: The file explorer MUST hide common heavy folders by default:

- `.git`
- `node_modules`
- `dist`
- `build`
- `.next`
- `.cache`

REQ-076: The UI MUST provide a toggle to reveal hidden folders.

REQ-077: The file explorer MUST support refresh for a folder or the whole tree.

REQ-078: The file explorer MUST support basic fuzzy search within the project.

REQ-079: The file explorer MUST open text files in a read-only viewer.

REQ-080: Binary files MUST show metadata instead of raw content.

REQ-081: Oversized files MUST not render raw content by default.

REQ-082: The file viewer MUST show relative path, file size, modified time, and
binary or text state.

REQ-083: The file explorer MUST support copying relative and absolute paths.

REQ-084: The file explorer SHOULD support adding an opened file path as prompt
context when the active provider supports prompt context.

REQ-085: The MVP file explorer MUST NOT edit, rename, delete, move, or create
files.

REQ-086: The file explorer MUST reject path traversal outside the selected
project root.

REQ-087: The file explorer MUST resolve symlinks and reject reads outside
allowed roots.

### Persistence

REQ-088: MVP persistence MUST use local JSON files.

REQ-089: The default config path MUST be:

```text
~/.config/agent-remote-control/config.json
```

REQ-090: The app MUST persist:

- saved projects
- recent projects
- provider preferences per project
- selected session metadata when available
- file explorer expanded folder state
- recently opened file paths
- terminal tab metadata for reconnect
- app settings
- adapter logs
- auth session metadata

REQ-091: The app MUST NOT persist by default:

- provider OAuth tokens copied from desktop apps
- raw provider API keys
- full mirrored DOM history
- file contents
- terminal scrollback or output

## Non-Functional Requirements

### Security

NFR-001: Every HTTP, WebSocket, and SSE endpoint MUST require auth, except
static login assets and the login endpoint.

NFR-002: The app MUST set a strict Content Security Policy for the web UI.

NFR-003: Scraped provider DOM MUST be sanitized before rendering.

NFR-004: Scraped text inserted into app-owned DOM MUST be escaped.

NFR-005: The app MUST never read or extract Google, Antigravity, Claude, Codex,
or opencode auth tokens from desktop apps.

NFR-006: When binding `0.0.0.0`, startup warnings MUST mention password risk,
LAN exposure, and terminal access risk.

NFR-007: LAN clients MUST NOT bypass authentication.

NFR-008: HTTPS with self-signed certificate support SHOULD be available on
demand, not required during default install.

### Reliability

NFR-009: The app MUST handle provider disconnects with visible status and retry
actions.

NFR-010: CDP calls MUST have timeouts.

NFR-011: Snapshot polling MUST not block the whole server.

NFR-012: Browser reload MUST reconnect to existing provider and terminal
sessions when possible.

NFR-013: App shutdown MUST close owned provider launches and PTY sessions
cleanly when possible.

### Performance

NFR-014: Antigravity snapshot polling SHOULD default to `1000ms`.

NFR-015: Snapshot updates SHOULD broadcast only when snapshot hash changes.

NFR-016: File tree loading SHOULD be lazy for large folders.

NFR-017: File preview SHOULD default to a maximum of `524288` bytes.

NFR-018: Terminal input and resize events SHOULD feel interactive on a local
network.

### Usability

NFR-019: The first screen after login MUST make the next action clear:
select project, resume project, or open settings.

NFR-020: Unsupported provider features MUST be visible as unavailable, not
silently missing.

NFR-021: Errors MUST include the failed operation and next recovery action.

NFR-022: UI text MUST fit in desktop and mobile layouts.

## Default Configuration

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
  "fileExplorer": {
    "enabled": true,
    "showHidden": false,
    "maxPreviewBytes": 524288,
    "ignore": [".git", "node_modules", "dist", "build", ".next", ".cache"]
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

## Acceptance Criteria

AC-001: A user can install the app on Ubuntu and see a running
`systemd --user` service.

AC-002: A user can open the web UI at `http://127.0.0.1:4096` by default.

AC-003: The web UI requires the configured app password before showing any
workspace data.

AC-004: A user can add a project folder and see it in recent projects.

AC-005: The project picker marks Git or AI-context folders as recommended.

AC-006: Provider selector shows Antigravity enabled and Claude, Codex, opencode
disabled or future.

AC-007: A user can launch or attach to Antigravity for the selected project.

AC-008: The UI shows live Antigravity conversation state from the browser.

AC-009: A prompt sent from the browser reaches Antigravity.

AC-010: Stop generation works when Antigravity exposes a stop control.

AC-011: New conversation works when Antigravity exposes the control.

AC-012: Conversation history can be listed and selected when scrapeable.

AC-013: Common approval/action buttons can be clicked from the browser.

AC-014: Adapter status and errors are visible in the UI.

AC-015: A user can open the file explorer for the selected project.

AC-016: A user can expand, collapse, refresh, and search project files.

AC-017: A user can open text files in a read-only viewer.

AC-018: Binary and oversized files are not rendered raw by default.

AC-019: File explorer path traversal outside the selected project is blocked.

AC-020: A user can open a terminal panel for the selected project.

AC-021: A user can create, switch, and close terminal tabs.

AC-022: Each terminal starts in the selected project directory.

AC-023: Terminal can run common commands such as `pwd`, `ls`, and project test
commands.

AC-024: Terminal resize works when the browser panel changes size.

AC-025: Terminal WebSocket rejects unauthenticated access.

AC-026: Binding `0.0.0.0` requires explicit config and a non-default password.

AC-027: If port `4096` is busy, the app shows a clear error and does not kill
the existing process.

## Requirement Trace

Phase 1 implementation must start with these slices:

1. Install/runtime/auth base: REQ-001 through REQ-014.
2. Project registry and provider selector: REQ-015 through REQ-026.
3. Antigravity CDP control: REQ-027 through REQ-045.
4. Web workspace and slash commands: REQ-046 through REQ-055.
5. Browser terminal: REQ-056 through REQ-070.
6. File explorer: REQ-071 through REQ-087.
7. Persistence and hardening: REQ-088 through REQ-091 plus all NFRs.

## Roadmap After Phase 1

Phase 2:

- Antigravity CLI PTY adapter.
- Better structured parsing of Antigravity events.
- File watching for explorer refresh.
- SQLite if JSON persistence becomes limiting.

Phase 3:

- Claude provider adapter.
- Codex provider adapter.
- opencode provider adapter or bridge.
- MCP, skills, permissions, agents, tasks.

Phase 4:

- System-wide service mode.
- `.deb` package.
- Optional HTTPS-first setup.
- Optional tunnel helper.
- Desktop tray or launcher.

## Locked Assumptions

- Phase 1 is Antigravity-first.
- CDP is the primary Antigravity MVP adapter.
- PTY is reserved for CLI fallback and future providers.
- App password auth is enough for MVP.
- Default bind host is `127.0.0.1`.
- Binding `0.0.0.0` is allowed only by explicit config.
- Browser terminal is part of Phase 1.
- Project file explorer is part of Phase 1.
- File explorer is read-only in MVP.
- Persistence is JSON in MVP.
- The app implements its own server and does not shell out to `opencode serve`.
