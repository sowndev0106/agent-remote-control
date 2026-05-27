# Agent Remote Control Frontend Design

## Status

Frontend behavior design draft for Phase 1 MVP.

This document focuses on frontend state, interactions, UI features, realtime
data flow, and component responsibilities. General product requirements live in
`docs/REQUIEMENT.md`. Layout structure lives in `docs/design.md`.

## Frontend Goal

The frontend should turn a local provider adapter into a browser-controlled
workspace. It should hide provider details behind capabilities and expose one
consistent user experience for project selection, Antigravity control, files,
terminal, slash commands, and status.

Phase 1 enables Antigravity only. Claude, Codex, and opencode are represented
as future providers so the UI shape is ready for them.

## Routes

MVP routes:

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
- `mirror`: snapshot HTML, hash, scroll state, loading state
- `actions`: pending approvals and detected remote action buttons
- `terminal`: tabs, active tab, connection state, resize state
- `files`: tree nodes, expanded folders, selected file, search state
- `settings`: config values visible to the UI
- `ui`: panel visibility, mobile drawer state, command palette state

Provider-specific raw data must stay behind adapter-facing API responses. The
frontend should render provider capabilities, status, actions, and snapshots
through a normalized shape.

## Realtime Channels

The frontend uses normal HTTP for commands and WebSocket or SSE for realtime
updates.

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
- allow any readable folder
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
- best-effort detect unmanaged external terminal processes
- show discovered sessions before launch
- show attach option when target exists
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
- include app-managed terminal provider sessions when available
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
- `External unmanaged`

Attach behavior:

- attaching to a CDP session loads its current snapshot
- attaching to an app-managed PTY session reconnects terminal output and input
- attaching to a wrapper-launched session resumes the registered provider bridge
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
- provider commands started from app-managed terminal tabs are eligible for
  future managed-session sync
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

MVP frontend tests should cover:

- login required before workspace access
- project picker and recent project selection
- provider selector disabled future providers
- attach/launch state transitions
- discovered session list and attach flow
- unmanaged external terminal guidance
- mirror snapshot render and refresh
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
- Antigravity CDP state is understandable from the UI
- mobile users can complete the main remote-control workflow
- no frontend feature bypasses server auth or project-root checks
