# Agent Remote Control Requirements

## Status

Product requirement draft for the Phase 1 Antigravity Complete release.

This file intentionally uses the requested path `docs/REQUIEMENT.md`.
This is the general requirement document. UI layout and frontend behavior
details live in `docs/design-frontend.md`.

## Goal

Build an Ubuntu-installed app named `agent-remote-control` that starts
automatically, opens a protected local web UI, lets the user choose a project,
and remotely controls local AI coding agents from the browser.

The product should clone the useful product shape of `opencode serve --port
4096`, but it must not run `opencode serve` internally. The app owns its server,
web UI, auth, project registry, terminal service, file explorer, realtime sync,
and provider adapters.

Phase 1 fully targets Antigravity before any other provider is implemented.
Claude, Codex, and opencode remain future providers behind the same provider
adapter interface, but they must not slow down or weaken the Antigravity
implementation.

## Source References

- `docs/design-frontend.md`
- `ref-source/remote-control.md`
- `ref-source/opencode`
- `ref-source/opencode/packages/opencode/src/cli/cmd/serve.ts`
- `ref-source/opencode/packages/app/src`
- `ref-source/opencode/packages/sdk/openapi.json`
- `ref-source/antigravity_phone_chat`
- https://antigravity.google/docs/cli-overview
- https://antigravity.google/docs/cli-features
- https://antigravity.google/docs/gcli-migration

## Phase 1 Scope: Antigravity Complete

Phase 1 is delivered in two layers:

- **Phase 1A — CDP MVP:** the first shippable local app. It proves install,
  auth, project selection, Antigravity CDP launch/attach, live mirror, prompt
  control, common actions, and the core web workspace.
- **Phase 1B — Extended Antigravity:** completes the remaining supported
  control surfaces and workspace tools: managed PTY, wrapper, tmux/screen,
  unmanaged guidance, browser terminal, file explorer, and final hardening.

Full Phase 1 is complete only when both 1A and 1B are done. Items marked 1B
MAY be deferred from the first shippable 1A checkpoint, but they are not cut
from Phase 1.

Phase 1A MUST include:

- Ubuntu local install.
- `systemd --user` service that starts on login.
- Local web server on port `4096` by default.
- Default bind host `127.0.0.1`.
- Optional configured bind host `0.0.0.0` with explicit non-default password
  and warnings.
- One app-level password.
- Project picker and recent project registry.
- Provider selector with Antigravity enabled.
- Claude, Codex, and opencode visible as future or disabled providers.
- Antigravity remote control through the CDP adapter as the primary path.
- CDP discovery and attach for existing Antigravity debug targets.
- Explicit Antigravity launch for the selected project via CDP debug port.
- Opencode-style web workspace.
- Live Antigravity mirror or timeline.
- Prompt sending, stop, new conversation, conversation selection where possible.
- Remote action relay for common Antigravity approval/action buttons.
- Local JSON persistence foundation.
- Normalized HTTP result envelopes and realtime event envelopes.
- Baseline route auth, CSRF, CSP, DOM sanitization, and action-ID hardening.

Phase 1B MUST include:

- Antigravity app-managed PTY sessions.
- Antigravity wrapper-launched sessions.
- Discovery, attach, and resume for existing Antigravity sessions, including
  active sessions, when a supported non-CDP control surface is available.
- tmux/screen attach support for Antigravity terminal sessions when the
  configured control surface is available.
- Browser terminal with multiple tabs.
- Read-only project file explorer.
- Clear unmanaged-session guidance when an existing Antigravity process cannot
  be controlled safely.
- Final local JSON persistence coverage and hardening.
- End-to-end acceptance walk for every AC item in this document.

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
- Claims of full interactive control for unmanaged external Antigravity
  processes that expose no CDP, tmux/screen, or app-managed PTY surface.

Phase 1A is complete when Antigravity can be launched or attached through CDP,
observed through the browser mirror, prompted from the web UI, and controlled
through server-issued action IDs. Full Phase 1 is complete when Antigravity can
also be launched, attached, resumed, controlled, observed, and recovered through
every supported 1B control surface listed above. Other providers start after
full Phase 1 is stable.

## Phase 1 Delivery Milestones

Implementation SHOULD proceed in these internal milestones:

1. **1A:** Runtime, config, install, service, authentication base, normalized
   HTTP envelopes, route-auth tests, and atomic JSON persistence foundation.
2. **1A:** Project registry, provider registry, and normalized session model.
3. **1A:** Antigravity CDP discovery, launch, attach, mirroring, prompt, stop,
   action relay, realtime event catalog, and CDP preflight validation.
4. **1A:** Web workspace UI, slash commands, CDP mirror UI, and mobile-ready
   core workflow.
5. **1B:** Antigravity app-managed PTY and wrapper-launched session
   registration, resume, and browser control.
6. **1B:** Browser terminal and read-only file explorer.
7. **1B:** Antigravity tmux/screen attach where configured, plus
   unmanaged-process detection and guidance.
8. **1B:** Final realtime, persistence, security, performance, and usability
   hardening audit.

## Users And Jobs

Primary user:

- A developer using Ubuntu who runs AI coding agents locally and wants to
  control them from another browser, laptop, or phone.

User jobs:

- Install one app once and let it start automatically.
- Open a protected local URL without manually running `opencode serve`.
- Select a project and provider.
- Watch the provider session live.
- Send prompts and approvals remotely.
- See existing local AI sessions and attach to an active one without restarting
  it when possible.
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

REQ-014A: Password hashes MUST use Argon2id when available. If the chosen
runtime cannot support Argon2id, it MUST use bcrypt or PBKDF2 with documented
cost settings.

REQ-014B: Browser sessions MUST use random server-issued session IDs with an
idle timeout. Session cookies MUST be `HttpOnly` and `SameSite=Lax`, and MUST
also be `Secure` when HTTPS is enabled.

REQ-014C: The login endpoint MUST rate-limit repeated failures and MUST NOT
reveal sensitive setup details in error responses.

REQ-014D: State-changing HTTP endpoints MUST be protected against cross-site
request abuse through same-origin checks, CSRF tokens, or an equivalent
server-side session mechanism.

### Project Management

REQ-015: The UI MUST let the user browse folders from home or configured roots.
It MAY also allow manual path entry when the server validates the path.

REQ-016: The UI MUST allow any readable folder inside configured roots to be
selected as a project. A readable folder outside configured roots MAY be
selected only through explicit manual path confirmation, after which it becomes
the selected project root.

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

REQ-026: The common provider adapter interface MUST support:

```text
detect()
listDiscoveredSessions(project)
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

REQ-026A: Provider adapter responses MUST be normalized before reaching the
frontend. Provider-specific raw CDP, PTY, tmux, or screen details MAY be kept in
server logs or adapter internals, but frontend state MUST use normalized
provider, session, capability, snapshot, action, status, and error shapes.

REQ-026B: Every provider session MUST have a stable server-generated
`sessionId`, provider ID, source type, project path when known, capabilities,
status, and lifecycle state.

REQ-026C: Every provider capability MUST be represented explicitly as
supported, unsupported, or unknown. Unsupported and unknown capabilities MUST be
visible to the UI so the user understands why a control is disabled.

### Existing Session Discovery And Sync

REQ-092: The app MUST discover all existing Antigravity sessions that expose a
supported control surface.

REQ-093: Supported Phase 1 control surfaces MUST include Antigravity CDP debug
targets.

REQ-094: Supported Phase 1 control surfaces MUST include app-managed PTY
sessions started from the browser terminal or app wrapper command.

REQ-094A: Supported Phase 1 control surfaces MUST include wrapper-launched
Antigravity sessions registered through the app.

REQ-094B: Phase 1 MUST support tmux/screen attach for Antigravity terminal
sessions when the user explicitly configures or selects that control surface.

REQ-095: The UI MUST show discovered sessions before asking the user to launch a
new one.

REQ-096: The UI MUST identify which discovered session appears active when the
adapter can detect active generation, focus, pending actions, or recent
activity.

REQ-097: The user MUST be able to attach to a discovered active session without
restarting it.

REQ-098: After attach, the app MUST sync the current visible session state,
including mirror snapshot, busy state, pending actions, and conversation
metadata when detectable.

REQ-099: The app MUST keep syncing attached sessions until the provider
disconnects, the user detaches, or the app shuts down.

REQ-100: If Antigravity is running in an external terminal but does not expose
CDP, tmux/screen control, or an app-managed PTY, the app MUST NOT claim full
interactive attach support.

REQ-101: For unmanaged external terminal processes, the app SHOULD detect the
process when possible and show it as read-only or unmanaged with clear attach
instructions.

REQ-102: The app MUST provide wrapper commands for reliable Antigravity session
registration and browser resume, for example:

```text
agent-remote-control antigravity <project>
agent-remote-control agy <project>
```

REQ-103: Wrapper-launched Antigravity sessions MUST be registered with the app
so they can be resumed and controlled from the browser.

REQ-104: The app MUST distinguish session source in the UI:

- CDP session
- app-managed PTY session
- wrapper-launched session
- tmux session
- screen session
- external unmanaged process

REQ-105: Existing session discovery MUST run from the home screen before a
project is selected.

REQ-106: When a discovered session exposes its project path, attaching to that
session MUST select or register that project automatically.

REQ-107: When a discovered session does not expose its project path, the UI MUST
allow attach only if the adapter can still control it safely; otherwise it MUST
ask the user to choose the matching project or relaunch through a managed path.

### Antigravity Provider

REQ-027: Phase 1 MUST implement the Antigravity provider.

REQ-028: The primary Antigravity adapter MUST use CDP for live desktop
mirroring and remote action control.

REQ-029: The adapter MUST detect existing Antigravity debug targets on
configured ports.

REQ-029A: The adapter MUST list all matching Antigravity CDP targets, not only
the first target.

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

REQ-041A: The adapter SHOULD mark the currently active Antigravity conversation
when it is detectable through the UI or CDP target metadata.

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

REQ-045: The app MUST implement an Antigravity PTY adapter for app-managed
terminal sessions.

REQ-045A: The Antigravity wrapper command MUST launch Antigravity in the
selected project, register the session with the app, and expose enough session
metadata for browser resume.

REQ-045B: The app MUST support sending text input and control signals to
app-managed Antigravity PTY sessions from the browser.

REQ-045C: The app MUST support resuming app-managed Antigravity PTY sessions
after browser reload while the PTY process is still running.

REQ-045D: The app MUST support tmux/screen attach for Antigravity sessions when
the user provides the target session and the backend can safely connect to it.

REQ-045E: CDP remains the preferred Antigravity control surface when both CDP
and terminal control are available for the same session.

### Web Workspace UI

REQ-046: The desktop UI MUST follow an opencode-style workspace layout:

- project rail
- session or conversation sidebar
- central live mirror or timeline
- right action/status panel
- bottom composer
- terminal panel
- file explorer panel

REQ-046A: The top bar MUST show selected project, provider selector, provider
status, attach or launch state, connection indicator, quick command entry, and
settings.

REQ-046B: The left rail MUST provide access to recent projects, open project,
sessions, files, terminal, actions, and settings.

REQ-046C: The home screen MUST be a functional launcher with recent projects,
running or discovered AI sessions, open folder, folder browser, recommendation
markers, provider availability, and app service status.

REQ-046D: The session sidebar MUST show discovered sessions, active session
state, source badge, current conversation, recent conversations when scrapeable,
generation status, and provider capability markers.

REQ-046E: The attach screen MUST show discovered existing sessions before
Launch New and MUST provide unmanaged external process guidance when detected.

REQ-047: The UI MUST support these states:

- logged out
- no project selected
- project selected with no provider session
- existing sessions discovered
- unmanaged external terminal session detected
- connecting to provider
- provider connected
- provider disconnected or retrying
- generation running
- approval or action pending
- terminal disabled
- file explorer disabled
- file blocked by size or binary detection
- path blocked by project root protection
- error with recovery action

REQ-048: The central mirror/timeline MUST support refresh, scroll to bottom,
remote click relay, prompt input, quick actions, stop, new conversation, and
conversation selector where available.

REQ-049: The right panel MUST show provider status, project path, launch or
attach target, CDP port, active model or mode, pending actions, last error,
adapter logs, terminal count, and selected file metadata when relevant.

REQ-049A: The right panel MUST stay compact and move long logs or long metadata
into a detail view instead of expanding the whole workspace layout.

REQ-050: The mobile UI MUST use a single-column layout with drawers or tabs for
project, session, actions, files, and terminal.

REQ-051: Mobile action buttons MUST remain tappable and not depend on hover.

REQ-051A: The UI MUST avoid landing-page or marketing layouts inside the
authenticated product workspace.

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

REQ-085: The Phase 1 file explorer MUST NOT edit, rename, delete, move, or
create files.

REQ-086: The file explorer MUST reject path traversal outside the selected
project root.

REQ-087: The file explorer MUST resolve symlinks and reject reads outside
allowed roots.

REQ-087A: For file reads, the allowed root MUST be the selected project root.
Configured browse roots are only for project selection and MUST NOT widen file
read access for an active project.

### Backend API And Realtime Contracts

REQ-108: Backend HTTP APIs MUST be grouped by domain:

- auth
- config
- projects
- providers
- sessions
- Antigravity actions
- terminal
- files

REQ-109: Command APIs MUST return a normalized result envelope:

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

Failed commands MUST return `ok: false` with a normalized error object.

REQ-110: Normalized errors MUST include:

- stable error code
- failed operation
- short user-facing message
- optional technical detail for logs
- recovery action when available

REQ-111: Realtime events MUST use one normalized envelope across WebSocket or
SSE:

```json
{
  "type": "provider.status.changed",
  "projectId": "project_123",
  "sessionId": "session_123",
  "version": 1,
  "payload": {}
}
```

REQ-112: Realtime event types MUST cover auth expiration, project registry
changes, provider status, session discovery, snapshot updates, pending actions,
adapter logs, terminal output, terminal lifecycle, and file refresh notices.

REQ-113: Provider snapshots MUST include a content hash. The server MUST NOT
broadcast duplicate snapshot payloads when the hash has not changed.

REQ-114: Remote action identities MUST be generated by the server from stable
target metadata. The frontend MUST submit only the server-issued action ID and
MUST NOT invent CDP selectors.

REQ-115: Terminal APIs MUST separate terminal metadata from terminal output.
Only metadata MAY be persisted by default.

### Persistence

REQ-088: Phase 1 persistence MUST use local JSON files.

REQ-089: The default config path MUST be:

```text
~/.config/agent-remote-control/config.json
```

REQ-090: The app MUST persist:

- saved projects
- recent projects
- provider preferences per project
- selected session metadata when available
- discovered session metadata when safe to persist
- file explorer expanded folder state
- recently opened file paths
- terminal tab metadata for reconnect
- app settings
- adapter logs
- auth session metadata

REQ-090A: JSON persistence MUST use atomic writes and file permissions that
limit access to the current user.

REQ-091: The app MUST NOT persist by default:

- provider OAuth tokens copied from desktop apps
- raw provider API keys
- full mirrored DOM history
- file contents
- terminal scrollback or output
- unmanaged external terminal output

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

NFR-008A: The default `http://127.0.0.1:4096` URL is acceptable for local-only
use. When binding `0.0.0.0`, the UI and startup logs MUST clearly distinguish
password protection from transport encryption and recommend HTTPS for LAN use.

### Reliability

NFR-009: The app MUST handle provider disconnects with visible status and retry
actions.

NFR-010: CDP calls MUST have timeouts.

NFR-011: Snapshot polling MUST not block the whole server.

NFR-012: Browser reload MUST reconnect to existing provider and terminal
sessions when possible.

NFR-012A: Attaching to an existing active session MUST not restart that session
unless the user explicitly chooses a launch or restart action.

NFR-013: App shutdown MUST close owned provider launches and PTY sessions
cleanly when possible.

NFR-013A: App shutdown MUST NOT terminate unmanaged external Antigravity
processes unless they were explicitly launched and owned by the app.

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
    "https": false,
    "sessionIdleTimeoutMs": 86400000
  },
  "security": {
    "passwordHashAlgorithm": "argon2id",
    "loginRateLimit": {
      "maxFailures": 10,
      "windowMs": 300000
    }
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
      "wrapperCommands": ["antigravity", "agy"],
      "controlSurfaces": ["cdp", "managed-pty", "wrapper", "tmux", "screen"],
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

AC-028: If multiple Antigravity CDP sessions are running, the UI lists all
discovered sessions.

AC-029: A user can attach to an already active Antigravity CDP session and see
its current state without restarting it.

AC-030: If Antigravity is running in an unmanaged external terminal, the UI does
not claim full control and shows the required wrapper, CDP, or tmux/screen
attach path.

AC-031: A user can launch Antigravity through the app wrapper command and see
the registered session in the browser.

AC-032: A user can resume an app-managed Antigravity PTY session after browser
reload while the process is still running.

AC-033: A configured tmux/screen Antigravity session can be attached when the
target control surface is available.

AC-034: Remote action clicks use server-issued action IDs and do not require
the frontend to construct CDP selectors.

AC-035: Failed commands return normalized errors that include the operation,
reason, and recovery action.

AC-036: First-run password setup creates a non-plaintext password hash and
authenticated sessions use secure server-issued session IDs.

## Requirement Trace

Phase 1A implementation must start with these slices:

1. Install/runtime/auth base: REQ-001 through REQ-014D.
2. Project registry and provider selector: REQ-015 through REQ-026C.
3. Antigravity CDP control: REQ-027 through REQ-044.
4. CDP existing-session discovery and sync: REQ-092 through REQ-099.
5. Web workspace and slash commands: REQ-046 through REQ-055.
6. Backend API and realtime contracts: REQ-108 through REQ-115.
7. JSON persistence foundation and baseline hardening: REQ-088 through
   REQ-090A plus the NFRs needed by 1A endpoints.

Phase 1B completes the remaining Phase 1 slices:

1. Managed PTY, wrapper, and tmux/screen control: REQ-045 through REQ-045E.
2. Extended existing-session discovery: REQ-100 through REQ-107 plus
   REQ-094 through REQ-094B.
3. Browser terminal: REQ-056 through REQ-070.
4. File explorer: REQ-071 through REQ-087A.
5. Final persistence exclusions and full hardening audit: REQ-091 plus all NFRs.

## Roadmap After Phase 1

Phase 2:

- Claude provider adapter.
- Codex provider adapter.
- opencode provider adapter or bridge.
- Provider-specific polish after Antigravity patterns are proven.
- File watching for explorer refresh if it is not needed for Phase 1.
- SQLite if JSON persistence becomes limiting.

Phase 3:

- MCP, skills, permissions, agents, tasks.
- Cross-provider task history and conversation migration where possible.
- Shared provider capability marketplace or plugin model.

Phase 4:

- System-wide service mode.
- `.deb` package.
- Optional HTTPS-first setup.
- Optional tunnel helper.
- Desktop tray or launcher.

## Locked Assumptions

- Phase 1A is the first shippable checkpoint; full Phase 1 remains
  Antigravity-complete before other providers are implemented.
- CDP is the primary Antigravity Phase 1A adapter and the preferred full Phase
  1 adapter whenever multiple control surfaces reach the same process.
- App-managed PTY, wrapper-launched sessions, and configured tmux/screen attach
  are part of full Phase 1 Antigravity support, not optional removals from full
  Phase 1.
- App password auth is enough for Phase 1.
- Default bind host is `127.0.0.1`.
- Binding `0.0.0.0` is allowed only by explicit config.
- Browser terminal is part of Phase 1B.
- Project file explorer is part of Phase 1B.
- File explorer is read-only in Phase 1.
- Existing Antigravity CDP sessions can be attached and synced in Phase 1.
- Existing unmanaged terminal processes cannot be fully controlled unless they
  expose CDP, tmux/screen, or an app-managed PTY/wrapper surface.
- Claude, Codex, and opencode remain disabled until Antigravity support is
  fully implemented and verified.
- Persistence is JSON in Phase 1.
- The app implements its own server and does not shell out to `opencode serve`.
