# Agent Remote Control UI Layout Design

## Status

UI layout design draft for Phase 1 MVP.

This document focuses only on screen structure, layout rules, panel placement,
and responsive behavior. General product requirements live in
`docs/REQUIEMENT.md`. Frontend interaction and state behavior live in
`docs/design-frontend.md`.

## Layout Goal

The web app should feel like a practical remote coding workspace, not a landing
page. The first useful screen after login should help the user select a project,
attach or launch Antigravity, view the active AI session, browse files, and open
project terminals.

The main visual reference is the opencode web workspace: dense sidebars,
central conversation area, persistent composer, explicit status/action areas,
and utility panels for terminal and files.

## App Shell

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

## Top Bar

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

## Project Rail

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

## Home And Project Picker

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

## Workspace Main Area

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

## Session Sidebar

The default secondary panel is the session or conversation sidebar:

- new session action
- discovered sessions
- active session badge
- session source badge: CDP, managed PTY, wrapper, or unmanaged
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
| Seen    Antigravity  external unmanaged        |
+------------------------------------------------+
| Attach | Launch New                            |
+------------------------------------------------+
```

Session rows should show:

- provider
- project path when detectable
- source type
- active or busy state
- pending action count when detectable
- attach action when controllable
- guidance action when unmanaged

If the user has Antigravity open in an external terminal, the UI can show it as
an unmanaged process when detectable. Full interaction is available only if that
session exposes CDP, was launched by the app, or runs inside a supported
terminal control surface such as tmux/screen.

## File Explorer Panel

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

The file explorer is read-only in MVP. Destructive controls are not shown.

## Right Action Panel

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

## Composer

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

## Terminal Panel

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
- unmanaged external process guidance when detected
- detected CDP port list when available
- clear troubleshooting status

Future providers appear as disabled cards with a short unavailable label.

## Responsive Rules

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

## Empty And Error States

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

## Visual Density

The UI should be dense but readable:

- no hero sections
- no marketing panels
- no decorative cards inside cards
- compact panels with clear labels
- icons for repeated actions
- consistent panel widths
- stable terminal and tree dimensions
- responsive text that does not overflow controls

## Layout Acceptance

The UI layout is acceptable when:

- A desktop user can keep mirror, composer, actions, files, and terminal in one
  workspace without page navigation.
- A mobile user can read the mirror, send a prompt, approve an action, browse a
  file, and open terminal through drawers or tabs.
- No Phase 1 feature requires a hidden route or developer-only page.
- The file explorer and terminal are first-class workspace panels.
- Disabled future providers are visible without blocking Antigravity work.
