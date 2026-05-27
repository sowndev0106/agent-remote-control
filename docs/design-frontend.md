# Agent Remote Control Frontend Design

## Status

Frontend behavior design draft for the Phase 1 Antigravity Complete release.

This document focuses on frontend state, interactions, UI features, realtime
data flow, and component responsibilities. General product requirements live in
`docs/REQUIEMENT.md`.

## Frontend Goal

The frontend should turn a local provider adapter into a browser-controlled
workspace. It should hide provider details behind capabilities and expose one
consistent user experience for project selection, Antigravity control, files,
terminal, slash commands, and status.

Phase 1 fully enables Antigravity before any other provider is implemented.
Claude, Codex, and opencode are represented as future providers so the UI shape
is ready for them, but their disabled states must not add complexity to the
Antigravity workflow.

## Antigravity Complete Scope

The frontend must treat Antigravity as a complete provider, not only as a CDP
mirror. It must expose UI paths for:

- CDP discovery, launch, attach, mirror, prompt, stop, and action relay
- app-managed PTY Antigravity sessions
- wrapper-launched Antigravity sessions
- configured tmux/screen attach for Antigravity terminal sessions
- unmanaged external Antigravity processes with clear guidance instead of false
  full-control claims

CDP remains the preferred control surface when both CDP and terminal control are
available for the same session.

## UI Layout Goal

The web app should feel like a practical remote coding workspace, not a landing
page. The first useful screen after login should help the user select a project,
attach or launch Antigravity, view the active AI session, browse files, and open
project terminals.

The main visual reference is the opencode web workspace: dense sidebars,
central conversation area, persistent composer, explicit status/action areas,
and utility panels for terminal and files.

## App Shell Layout

Desktop shell:

```text
+--------------------------------------------------------------------------------+
| Top Bar: project, provider, session status, quick actions, settings             |
+------+----------------------+-----------------------------------+--------------+
| Rail | Secondary Panel      | Main Work Area                    | Right Panel  |
|      | sessions or files    | Antigravity mirror/timeline       | actions      |
|      |                      |                                   | status       |
|      |                      |                                   | metadata     |
+------+----------------------+-----------------------------------+--------------+
| Composer: prompt input, slash commands, attach context, send/stop               |
+--------------------------------------------------------------------------------+
| Terminal Panel: tabs, active PTY, plus tab, close tab, resize handle             |
+--------------------------------------------------------------------------------+
```

Default desktop regions:

- Top bar height: compact and persistent.
- Project rail: narrow icon rail for projects, files, terminal, settings.
- Secondary panel: sessions by default; switches to file explorer when selected.
- Main work area: live Antigravity mirror or normalized session timeline.
- Right panel: provider status, pending actions, selected file metadata, logs.
- Composer: always near the main work area, above terminal when terminal is open.
- Terminal panel: bottom dock, resizable, hidden by default or remembered per
  project.

## Top Bar Layout

The top bar shows current workspace context and global controls:

- selected project name and path hint
- provider selector
- active provider status
- Antigravity attach or launch state
- connection indicator
- quick command button
- settings button

The top bar should not become a large navigation header. It is a workspace
control strip.

## Project Rail Layout

The rail is the stable left-most navigation:

- recent projects
- open project
- sessions
- files
- terminal
- actions
- settings

The rail uses icons with tooltips. Labels may appear only when the rail is
expanded or on mobile drawers.

Rail behavior:

- Selecting a project changes the active workspace.
- Selecting files opens the file explorer in the secondary panel.
- Selecting terminal opens or focuses the bottom terminal panel.
- Selecting actions focuses the right action panel.

## Home And Project Picker Layout

When no project is selected, the app shows a project-first home screen:

- recent project list
- running or discovered AI sessions
- open folder action
- browse folder dialog
- recommended folder markers
- provider availability summary
- app service status

If a running Antigravity session is discovered before project selection, the
home screen should offer Attach when the session is controllable. When the
session exposes its project path, attaching should select that project
automatically.

The home screen should not be marketing content. It should be a functional
launcher.

Project picker layout:

```text
+--------------------------------------------------------------+
| Open Project                                                  |
+-----------------------------+--------------------------------+
| Folder browser              | Folder details                  |
| home/configured roots        | path                           |
| expandable folder list       | recommendation signals         |
| search                       | provider preference            |
|                              | open button                    |
+-----------------------------+--------------------------------+
```

Recommended folders are visually marked when they contain `.git`, `AGENTS.md`,
`GEMINI.md`, `.agents/`, `.opencode/`, `.claude/`, or `.codex/`.

## Workspace Main Area Layout

The main area has three possible display modes:

1. Antigravity mirror mode.
2. Normalized timeline mode.
3. Empty or recovery state.

Phase 1 defaults to Antigravity mirror mode because the CDP adapter can mirror
desktop UI state quickly.

Mirror mode requirements:

- show sanitized Antigravity conversation content
- preserve visible action buttons
- allow remote click relay on supported actions
- show loading or reconnect overlay without replacing the whole workspace
- provide scroll to bottom
- provide manual refresh
- keep composer and action panel visible

Timeline mode is reserved for future provider adapters that expose structured
events.

## Session Sidebar Layout

The default secondary panel is the session or conversation sidebar:

- new session action
- discovered sessions
- active session badge
- session source badge: CDP, managed PTY, wrapper, tmux, screen, or unmanaged
- attachability badge: controllable, needs configuration, or guidance only
- current conversation
- recent conversations when scrapeable
- generation status per active session
- provider capability markers

When Antigravity conversation history cannot be detected, the sidebar should
show a clear unavailable state while keeping the active session usable.

## Existing Sessions Layout

The workspace must prefer attach before launch when existing sessions are
available.

Discovered session list:

```text
+------------------------------------------------+
| Sessions                                       |
+------------------------------------------------+
| Active  Antigravity  CDP  :9000  /project-a    |
| Idle    Antigravity  CDP  :9001  /project-b    |
| Busy    Antigravity  PTY  managed /project-c   |
| Active  Antigravity  tmux dev-agent /project-d |
| Seen    Antigravity  external unmanaged        |
+------------------------------------------------+
| Attach | Launch New                            |
+------------------------------------------------+
```

Session rows should show:

- provider
- project path when detectable
- source type
- control surface details such as CDP port, PTY ID, wrapper ID, or tmux/screen
  target when available
- active or busy state
- pending action count when detectable
- attach action when controllable
- resume action for app-managed PTY or wrapper-launched sessions
- guidance action when unmanaged

If the user has Antigravity open in an external terminal, the UI can show it as
an unmanaged process when detectable. Full interaction is available only if that
session exposes CDP, was launched by the app, or runs inside a supported
terminal control surface such as tmux/screen.

## File Explorer Layout

The file explorer occupies the secondary panel or a dedicated split view.

Layout:

```text
+------------------------------+
| Files: search, refresh, show  |
| hidden toggle                 |
+------------------------------+
| Project tree                  |
| - folders                     |
| - files                       |
+------------------------------+
| Selected file metadata        |
+------------------------------+
```

File viewer placement:

- Desktop: opens in main work area as a read-only viewer tab or side-by-side
  preview.
- Compact desktop: opens over the main work area in a dismissible panel.
- Mobile: opens as a full-screen file view with back navigation.

The file explorer is read-only in Phase 1. Destructive controls are not shown.

## Right Action Panel Layout

The right panel is for information that affects current work:

- provider status
- active project path
- attach target or launch command
- CDP port
- active mode and model when detectable
- pending approvals
- remote action buttons
- last error
- adapter logs
- terminal session count
- selected file metadata

The right panel should stay compact. Large logs or long file metadata should
expand into a detail view instead of stretching the panel.

## Composer Layout

The composer is the main control for AI input:

- multiline prompt input
- send button
- stop button while generation runs
- slash command palette
- file context chips
- provider capability hints

Layout behavior:

- Desktop: composer sits below the main work area and above terminal.
- Terminal open: composer remains visible unless user switches to full terminal
  mode.
- Mobile: composer is fixed near the bottom and safe for phone keyboards.

## Terminal Layout

The terminal appears as a bottom dock similar to an IDE terminal:

```text
+------------------------------------------------------------------+
| Terminal 1 x | +                                                 |
+------------------------------------------------------------------+
| shell output and input                                            |
|                                                                  |
+------------------------------------------------------------------+
```

Terminal controls:

- tab list
- active tab indicator
- close tab
- plus tab
- optional split/full-screen toggle
- resize handle on desktop

Terminal defaults:

- starts in selected project directory
- hidden until opened
- remembered per project when practical
- full-screen drawer on mobile

## Provider Attach Layout

When a project is selected but no provider session is active, the main area
shows an attach screen:

- selected project path
- Antigravity provider card enabled
- discovered existing sessions first
- Attach to running Antigravity action
- Launch Antigravity action
- Launch through managed PTY action
- wrapper command copy/open action
- tmux/screen attach action when configured
- unmanaged external process guidance when detected
- detected CDP port list when available
- clear troubleshooting status

Future providers appear as disabled cards with a short unavailable label.

## Responsive Layout Rules

Desktop wide:

- rail, secondary panel, main area, right panel, composer, and terminal can all
  be visible.

Desktop narrow:

- right panel can collapse into an action drawer.
- terminal can switch to full-width bottom dock.
- file viewer can replace the main area.

Tablet:

- rail remains visible.
- secondary panel and right panel become drawers.
- main area and composer remain primary.

Phone:

- single-column layout.
- mirror/timeline is first.
- project, sessions, files, actions, terminal, and settings are bottom tabs or
  drawers.
- terminal and file viewer use full-screen modes.
- composer stays reachable above the keyboard.

## Empty And Error State Layout

Required states:

- logged out
- no project selected
- project selected with no provider session
- existing sessions discovered
- unmanaged external terminal session detected
- connecting to provider
- provider connected
- provider disconnected
- generation running
- approval pending
- terminal disabled
- file explorer disabled
- file blocked by size or binary detection
- path blocked by project root protection
- busy port during service startup

Every error state should provide one obvious recovery action.

## Visual Density Rules

The UI should be dense but readable:

- no hero sections
- no marketing panels
- no decorative cards inside cards
- compact panels with clear labels
- icons for repeated actions
- consistent panel widths
- stable terminal and tree dimensions
- responsive text that does not overflow controls

## Routes

Phase 1 routes:

- `/login`
- `/`
- `/workspace/:projectId`
- `/settings`

Route rules:

- Unauthenticated users are redirected to `/login`.
- The root route shows recent projects and discovered sessions, or redirects to
  the last active project when configured.
- Workspace route requires a valid project ID.
- Unknown projects show a recoverable project-not-found state.

## Client State Model

Frontend state should be split by domain:

- `auth`: login state, session status, logout state
- `projects`: recent projects, selected project, picker state
- `providers`: provider list, selected provider, capabilities
- `sessions`: discovered sessions, active provider session, conversations,
  selected conversation
- `capabilities`: normalized provider and session capability flags
- `mirror`: snapshot HTML, hash, scroll state, loading state
- `actions`: pending approvals and detected remote action buttons
- `terminal`: tabs, active tab, connection state, resize state
- `files`: tree nodes, expanded folders, selected file, search state
- `settings`: config values visible to the UI
- `ui`: panel visibility, mobile drawer state, command palette state

Provider-specific raw data must stay behind adapter-facing API responses. The
frontend should render provider capabilities, status, actions, and snapshots
through a normalized shape.

## Frontend Data Contracts

The frontend depends on normalized server contracts rather than raw provider
details.

Session shape:

```json
{
  "sessionId": "session_123",
  "providerId": "antigravity",
  "source": "cdp",
  "projectId": "project_123",
  "projectPath": "/home/user/project",
  "status": "connected",
  "lifecycle": "active",
  "capabilities": {
    "mirror": "supported",
    "prompt": "supported",
    "stop": "unknown",
    "actions": "supported",
    "terminalInput": "unsupported"
  }
}
```

Action shape:

```json
{
  "actionId": "action_123",
  "label": "Allow",
  "kind": "approval",
  "state": "available"
}
```

Error shape:

```json
{
  "code": "cdp_attach_failed",
  "operation": "Attach Antigravity CDP session",
  "message": "Could not connect to the selected debug target.",
  "recoveryAction": "Refresh discovered sessions"
}
```

The frontend must submit server-issued IDs for sessions and actions. It must not
construct CDP selectors, filesystem paths outside project APIs, or provider raw
commands from UI state.

## Realtime Channels

The frontend uses normal HTTP for commands and WebSocket or SSE for realtime
updates.

Realtime messages use one envelope:

```json
{
  "type": "provider.status.changed",
  "projectId": "project_123",
  "sessionId": "session_123",
  "version": 1,
  "payload": {}
}
```

Realtime event groups:

- auth/session expiration
- project registry changes
- provider status changes
- discovered session changes
- Antigravity snapshot updates
- pending action updates
- adapter log updates
- terminal output
- terminal exit
- terminal resize acknowledgement
- external provider process discovery changes
- file refresh notifications when available

Snapshot updates should be applied only when the server reports a new hash.

## API Interaction Pattern

Frontend command flow:

1. User action starts optimistic UI state when safe.
2. Frontend sends an authenticated HTTP command.
3. Server performs provider/file/terminal operation.
4. Server emits realtime event with final state.
5. Frontend reconciles optimistic state with server event.

This pattern applies to prompt sending, stop, new conversation, action click,
terminal tab lifecycle, and file tree refresh.

## Component Map

Core components:

- `AuthScreen`
- `AppShell`
- `TopBar`
- `ProjectRail`
- `ProjectPicker`
- `ProviderSelector`
- `Workspace`
- `ConversationSidebar`
- `SessionDiscoveryList`
- `MirrorTimeline`
- `ActionPanel`
- `Composer`
- `SlashCommandPalette`
- `FileExplorer`
- `FileViewer`
- `TerminalDock`
- `TerminalTab`
- `SettingsView`
- `StatusToast`
- `ErrorRecovery`

Component boundaries:

- `AppShell` owns layout and panel visibility.
- `ProjectPicker` owns folder browsing and project selection UI.
- `ProviderSelector` renders provider availability and capability state.
- `SessionDiscoveryList` owns discovered session rows and attach actions.
- `MirrorTimeline` renders sanitized snapshots and remote action click targets.
- `Composer` owns prompt input, slash commands, and send/stop controls.
- `ActionPanel` owns pending actions and provider status details.
- `TerminalDock` owns terminal tabs and terminal WebSocket lifecycle.
- `FileExplorer` owns tree/search state.
- `FileViewer` owns read-only preview and file metadata display.

## Auth Flow

Login behavior:

- show password form
- submit password to login endpoint
- store only server-issued session state
- redirect to last route or root after login
- show clear error for invalid password
- support logout from settings or account menu

The frontend must not store provider tokens or raw API keys in browser local
storage.

## Project Flow

Project picker behavior:

- load configured roots and recent projects
- browse folders lazily
- search visible folder names
- show project recommendation markers
- allow any readable folder inside configured roots, plus explicit manual path
  confirmation for validated folders outside configured roots
- save selected folder through server API
- switch workspace to selected project

Recent project behavior:

- show project name, path, last provider, last opened time
- support remove from recent list without deleting files
- support reopen last project quickly

## Provider Flow

Provider selector behavior:

- show Antigravity enabled
- show Claude, Codex, and opencode as future providers
- show provider capabilities for active provider
- show unsupported controls disabled, not hidden

Antigravity session behavior:

- detect all running debug targets
- detect app-managed PTY or wrapper-launched sessions
- detect configured tmux/screen Antigravity sessions
- best-effort detect unmanaged external terminal processes
- show discovered sessions before launch
- show attach option when target exists
- show resume option for app-managed PTY and wrapper-launched sessions
- show launch option when target does not exist
- show active badge when generation, focus, pending action, or recent activity
  can be detected
- show connecting state after attach or launch
- transition to connected mirror when snapshot starts
- show recoverable disconnected state on CDP failure

## Existing Session Sync Behavior

The frontend must support attach-first workflows.

Discovered session behavior:

- run discovery from the home screen before project selection
- request discovered sessions for the selected project and provider
- list every controllable Antigravity CDP target, not only the first target
- include app-managed terminal provider sessions
- include wrapper-launched Antigravity sessions
- include configured tmux/screen Antigravity sessions
- show external unmanaged terminal processes separately when detectable
- mark likely active sessions
- let the user attach to a controllable session without restarting it
- auto-select or register the project when a discovered session exposes its
  project path
- make Launch New secondary when attachable sessions exist

Session source labels:

- `CDP`
- `Managed PTY`
- `Wrapper`
- `tmux`
- `screen`
- `External unmanaged`

Attach behavior:

- attaching to a CDP session loads its current snapshot
- attaching to an app-managed PTY session reconnects terminal output and input
- attaching to a wrapper-launched session resumes the registered provider bridge
- attaching to a tmux/screen session connects to the configured terminal control
  surface
- unmanaged external terminal sessions show guidance instead of an Attach
  control

External terminal rule:

- A provider process already running inside a normal desktop terminal cannot be
  fully controlled through the browser unless it exposes CDP, was launched by
  the app, or is inside a supported control surface such as tmux/screen.
- The UI must say this plainly and offer the correct launch or wrapper command.

## Antigravity Mirror Behavior

Mirror rendering:

- render sanitized snapshot HTML inside the main work area
- keep scroll position unless user is near bottom
- provide scroll-to-bottom action
- show refresh action
- overlay connecting, retrying, or stale status without clearing content

Remote action behavior:

- supported buttons in the snapshot are clickable
- click sends stable action identity to the server
- UI marks action pending until server confirms or rejects
- failed action click shows an error with retry

Prompt behavior:

- sending prompt adds a pending local message or busy state when safe
- final visible state comes from the next provider snapshot
- stop button is visible only while generation is active or stop is supported

## Composer And Slash Commands

Composer behavior:

- multiline input
- send on explicit send action
- newline support
- stop while generating
- prompt history when practical
- file context chips from file explorer

Slash command behavior:

- command palette opens when input starts with `/`
- filter commands as user types
- show unsupported commands disabled
- execute command without submitting raw command text when command maps to a UI
  action

Phase 1 commands:

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

## File Explorer Behavior

Tree behavior:

- root is selected project directory
- folders load lazily on expand
- common heavy folders are hidden by default
- hidden folders can be revealed
- refresh can target one folder or the whole tree
- fuzzy search finds files inside project scope

File viewer behavior:

- text files open read-only
- binary files show metadata only
- oversized files show metadata and an explicit open-anyway action if allowed
- viewer shows relative path, absolute path copy action, size, modified time,
  and text/binary state
- opened file path can be added as prompt context when provider supports it

Security behavior:

- frontend never constructs arbitrary filesystem reads directly
- all file reads use project-scoped server APIs
- blocked reads show path-protection errors

## Terminal Behavior

Terminal dock behavior:

- create tab with plus action
- switch tabs
- close tabs
- show active tab state
- show terminal connection state
- support resize
- support full-screen mode on mobile

Terminal session behavior:

- new tab starts in selected project directory
- Antigravity commands started from app-managed terminal tabs are registered as
  managed sessions when they match configured provider launch patterns
- frontend connects to authenticated terminal WebSocket
- keyboard input streams to backend PTY
- backend output streams to terminal renderer
- browser resize sends terminal dimensions
- reload reconnects to still-running terminal sessions when possible
- close tab asks confirmation if foreground process is active

Terminal output is not stored in browser persistence.

## Settings Behavior

Settings sections:

- server host and port
- password change
- HTTPS toggle or certificate setup
- project roots
- file explorer options
- terminal enabled/disabled and shell override
- Antigravity command and debug ports
- Antigravity wrapper commands
- tmux/screen attach targets
- provider list

Risky settings, such as binding `0.0.0.0`, must show explicit warnings before
saving.

## Error Handling

Frontend error categories:

- auth expired
- project not found
- folder not readable
- provider unavailable
- Antigravity debug target not found
- no controllable existing session found
- unmanaged external terminal session detected
- CDP attach failed
- managed PTY resume failed
- wrapper session registration failed
- tmux/screen attach failed
- snapshot stale
- remote action failed
- terminal WebSocket failed
- terminal process exited
- file blocked by path protection
- file too large
- binary file

Each error should include:

- operation that failed
- short reason from server
- recovery action when available

## Frontend Security Rules

- Do not render unsanitized provider DOM.
- Do not use `dangerouslySetInnerHTML` except inside the audited mirror renderer.
- Do not store provider credentials in browser storage.
- Do not expose terminal WebSocket without auth.
- Do not allow frontend path strings to bypass server project-root checks.
- Treat terminal as full local shell access in UI warnings.

## Frontend Performance Rules

- Lazy-load large panels when practical.
- Virtualize large file trees if needed.
- Avoid re-rendering the whole workspace for every terminal output chunk.
- Apply mirror snapshot updates only on hash changes.
- Keep terminal rendering isolated from React state churn when using xterm.js.
- Debounce file search and terminal resize events.

## Frontend Test Coverage

Phase 1 frontend tests should cover:

- login required before workspace access
- project picker and recent project selection
- provider selector disabled future providers
- attach/launch state transitions
- discovered session list and attach flow
- unmanaged external terminal guidance
- managed PTY session resume flow
- wrapper-launched session registration and resume flow
- configured tmux/screen attach flow
- mirror snapshot render and refresh
- server-issued action ID submission
- slash command palette filtering
- terminal tab create/switch/close
- terminal WebSocket auth failure display
- file tree expand/collapse/search
- read-only file viewer
- blocked path traversal error
- mobile drawer navigation for files, actions, and terminal

## Frontend Acceptance

Frontend design is complete when:

- every Phase 1 requirement has a visible UI path
- unsupported future providers are visible but cannot be used
- terminal and file explorer behave as first-class workspace tools
- Antigravity CDP, managed PTY, wrapper, and configured tmux/screen states are
  understandable from the UI
- mobile users can complete the main remote-control workflow
- no frontend feature bypasses server auth or project-root checks

## Requirement Coverage Map

- Auth and route protection: REQ-010 through REQ-014D, NFR-001.
- Project selection and recent projects: REQ-015 through REQ-021.
- Provider selection and capability display: REQ-022 through REQ-026C.
- Existing Antigravity session discovery and sync: REQ-092 through REQ-107.
- Antigravity CDP, PTY, wrapper, and tmux/screen control: REQ-027 through
  REQ-045E.
- Workspace layout and responsive states: REQ-046 through REQ-051A.
- Slash commands: REQ-052 through REQ-055.
- Terminal UI: REQ-056 through REQ-070.
- File explorer UI: REQ-071 through REQ-087A.
- Backend API and realtime client contracts: REQ-108 through REQ-115.
