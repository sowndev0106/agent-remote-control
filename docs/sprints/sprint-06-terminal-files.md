# Sprint 06 — Browser Terminal + File Explorer

**Milestone:** M6 (tools subset)
**Effort:** 6-9 days
**Dependencies:** Sprint 01, 02, 04

Can run in parallel with sprint 05 (different files, no shared state).
Generic browser terminal tabs are project shells only. They do **not**
auto-register Antigravity sessions when a user types `antigravity`; managed
Antigravity PTY launch and registration stay in sprint 05 unless a later design
explicitly adds terminal-command detection.

## Goal

Add two first-class workspace tools: a multi-tab browser terminal backed by
real PTYs, and a read-only project file explorer with preview.

## In-Scope Requirements

- REQ-056 through REQ-070 (browser terminal: tabs, PTY, WebSocket auth,
  resize, reconnect, project root cwd)
- REQ-071 through REQ-087A (file explorer: lazy tree, search, hidden toggle,
  text/binary/oversized viewer, path traversal protection, symlink resolution)

## Out of Scope

- Editing files (Phase 1 is read-only, REQ-085)
- File watching for real-time refresh (deferred to Phase 2)
- Antigravity-as-PTY registration (sprint 05 — different code path from generic
  terminal). A plain `antigravity` command typed into a generic terminal tab is
  just terminal output unless sprint 05 deliberately exposes a managed launch
  action.

## Acceptance Criteria

- AC-015..AC-019 (file explorer: open, expand, search, viewer, binary/oversized
  handling, path traversal blocked)
- AC-020..AC-025 (terminal: open, tabs, project cwd, common commands, resize,
  WS auth)

## Deliverables

### Backend
- `src/server/domains/terminal.ts` — PTY pool, WS bridge.
- `src/server/domains/files.ts` — tree walk, preview, fuzzy search.
- HTTP + WS routes:
  - `POST /api/terminal/tabs` — create new tab, returns terminal ID.
  - `DELETE /api/terminal/tabs/:id` — close.
  - `GET /api/terminal/tabs` — list active tabs (metadata only).
  - `WS /api/terminal/tabs/:id/stream` — bidirectional I/O.
  - `POST /api/terminal/tabs/:id/resize` — `{cols, rows}`.
  - `GET /api/files/tree?path=...` — lazy folder listing scoped to project root.
  - `GET /api/files/preview?path=...` — text up to `maxPreviewBytes`, else
    metadata.
  - `GET /api/files/search?q=...` — fuzzy file-path match within project.

### Frontend
- `TerminalDock` — bottom dock, tab list, plus button, resize handle.
- `TerminalTab` — xterm.js instance, WS connection, scrollback, copy/paste.
- `FileExplorer` — tree view in secondary panel, search input, hidden toggle.
- `FileViewer` — read-only text view, binary/oversized states, copy-path
  actions, "add to prompt context" button when provider supports it.
- File context chips in `Composer` (now real — sprint 04 stubbed them).

## Tasks

### Terminal
- **S06-T01** Backend PTY pool: per-tab `node-pty.spawn` with `$SHELL` (or
  `/bin/bash` fallback), cwd = selected project root. Honor
  `terminal.maxTabs`. These generic tabs do not auto-register provider
  sessions.
- **S06-T02** WS bridge with cookie auth. Reject unauthenticated upgrades
  (AC-025).
- **S06-T03** Output buffering: small ring buffer (~`scrollback` lines) so
  reconnects after reload show recent context. Buffer is RAM-only — never
  persisted (REQ-065).
- **S06-T04** Tab close: SIGHUP to PTY. If foreground job is running
  (`pty.pid` has running children), confirm via API + UI prompt (REQ-068).
- **S06-T05** Resize endpoint + debounce.
- **S06-T06** Frontend `TerminalDock` with xterm.js + `xterm-addon-fit` +
  `xterm-addon-web-links`. Multiple tabs share dock; only active tab renders.
- **S06-T07** Persist tab metadata (id, title, project) for reconnect display
  (REQ-066). Never persist output.
- **S06-T08** Mobile: full-screen drawer mode (REQ-070).
- **S06-T09** Settings: `terminal.enabled = false` hides the panel entirely
  and rejects PTY APIs (REQ-069).

### File Explorer
- **S06-T10** Tree walk: lazy listing per folder. Apply `fileExplorer.ignore`
  by default; show all when `showHidden` toggle is on (REQ-075, REQ-076).
- **S06-T11** Path safety: every file API resolves via `path.resolve` +
  `fs.realpathSync.native`, asserts resolved path starts with project root
  (REQ-086, REQ-087, REQ-087A). Configured browse roots do NOT widen file
  read access for an active project (REQ-087A explicit).
- **S06-T12** Preview endpoint:
  - Read up to `maxPreviewBytes`.
  - Detect binary via content sniff (null bytes / non-UTF8).
  - Return `{kind: 'text'|'binary'|'oversized', content?, metadata}`.
- **S06-T13** Fuzzy file search: walk project tree (respecting ignore list),
  match against `fzy`-like scoring algorithm. Cap result count.
- **S06-T14** Frontend `FileExplorer` — tree component with expand/collapse,
  refresh per node or whole tree (REQ-077), search input.
- **S06-T15** `FileViewer` — text view in main work area (desktop) or
  full-screen (mobile). Show relative path, absolute path, size, modified
  time, kind (REQ-082). Copy-path actions for both relative + absolute
  (REQ-083).
- **S06-T16** "Add to prompt context" — append `{path, relPath}` chip to
  composer when provider capability `promptContext` is `supported` (REQ-084).
- **S06-T17** Frontend persistence of expanded folders + recently opened
  files via API (REQ-090).
- **S06-T18** Tests:
  - Path traversal `../../etc/passwd` rejected.
  - Symlink to outside project rejected.
  - Binary file returns metadata, not raw content.
  - Oversized file gates render.
  - Terminal WS without cookie returns 401.
  - Foreground process confirmation prompt fires.
  - Tab cwd is selected project root.

## Risks

- **Symlink races:** check realpath right before read, not at open time.
- **Large project tree search:** debounce in UI, cap walk depth or count on
  server.
- **xterm.js + React re-render churn:** keep terminal instances out of React
  state; mount once per tab and use refs (frontend perf rule).
- **Foreground process detection (REQ-068):** A naive "any child process
  alive" check fires false positives because shells like zsh/bash leave
  background helpers. The correct check is `tcgetpgrp(fd)` on the PTY slave
  fd compared to the shell's PID — if they differ, a foreground job is
  running. Node has no direct `tcgetpgrp` binding; either link a tiny native
  add-on or parse `/proc/<shell-pid>/stat` for `tpgid`. Plan for an hour of
  experimentation here.
- **Process exit detection:** Listen for `node-pty` `exit` event, surface
  exit code to the UI, mark the tab closed but keep it visible briefly so
  the user can read final output (REQ-064).

## Done Definition

- Open `/workspace/:id`, click terminal icon, get a shell in the project
  directory. Create a second tab, switch, close. Reload browser; metadata
  reconnects, output buffer shows recent lines.
- Open file explorer, navigate, search, open a text file, see preview. Open
  a binary file, see metadata. Try `../` in API, get 400 with normalized
  error.
- Add file path to composer chip; verify the prompt request includes it.
