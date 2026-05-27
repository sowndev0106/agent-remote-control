# Sprint 07 — tmux/screen Attach + Unmanaged Detection

**Milestone:** M5
**Effort:** 4-6 days
**Dependencies:** Sprint 05

## Goal

Add the two remaining control surfaces for Antigravity sessions: explicit
attach to user-configured tmux/screen sessions, and best-effort detection of
unmanaged external Antigravity processes with proper "not fully controllable"
guidance.

## In-Scope Requirements

- REQ-045D (tmux/screen attach when user provides target)
- REQ-094B (tmux/screen as Phase 1 control surface when configured)
- REQ-100, REQ-101 (no false claims for unmanaged processes; detect when
  possible; mark read-only with guidance)
- REQ-104 (UI source distinction includes tmux, screen, external unmanaged —
  already wired in sprint 04)
- REQ-105 (discovery from home screen)
- REQ-107 (no project path on attach → ask user or block)
- AC-030, AC-033

## Out of Scope

- Generic tmux/screen for non-Antigravity processes (only Antigravity
  detection counts for Phase 1).
- Auto-discovering tmux sessions without user configuration (REQ-094B says
  "when user explicitly configures or selects").

## Acceptance Criteria

- AC-030: Antigravity running in an unmanaged external terminal does NOT
  claim full control; UI shows wrapper/CDP/tmux attach guidance.
- AC-033: A configured tmux/screen Antigravity session can be attached when
  the target control surface is available.

## Deliverables

- `src/server/adapters/antigravity/tmux.ts` — implements `IProviderAdapter`
  by issuing `tmux send-keys` for input and `tmux pipe-pane` for output
  capture.
- `src/server/adapters/antigravity/screen.ts` — analogous adapter using
  `screen -X` and `screen -X hardcopy` (or `screen -L` log file tailing).
- `src/server/adapters/antigravity/unmanaged.ts` — process scanner that
  detects running `antigravity` processes not owned by the app, not exposing
  CDP, not in a known tmux/screen target. Surfaces them as `source:
  'external'`, `attachable: false`, with guidance copy.
- Settings UI additions (within sprint 04 settings view) for configured
  tmux/screen targets per project.
- Discovery hook on home screen and project workspace.

## Tasks

- **S07-T01** Settings schema extension: `providers.antigravity.tmuxTargets`
  and `screenTargets` — each an array of `{name, project?, sessionId?,
  windowOrPane?}`. Saved in config.
- **S07-T02** tmux adapter:
  - `listConfiguredTargets()` returns user-configured targets.
  - `detect()` runs `tmux list-sessions -F '#{session_name}'` and validates
    each configured target exists.
  - `attach(target)` starts a `pipe-pane` capture into a temp file; tails
    that file and broadcasts as snapshot updates.
  - `sendPrompt(text)` uses `tmux send-keys -t <target> -l <text>` then
    `tmux send-keys -t <target> Enter`.
  - `sendInput(input)` for raw keys (Ctrl-C → `C-c` translation).
  - `getSnapshot()` returns the tmux pane buffer (capture-pane -p).
  - Capabilities: mirror=supported, prompt=supported, actions=unsupported
    (no DOM = no action buttons), stop=supported (Ctrl-C send), conversation
    listing=unsupported.
- **S07-T03** screen adapter analogous to tmux, using `screen -X stuff`
  for input and `screen -X hardcopy <file>` for snapshots, or `screen -L`
  with log file tail.
- **S07-T04** Unmanaged detector:
  - Scan `/proc/*/comm` and `/proc/*/cmdline` for `antigravity` binary
    (Linux specific is fine for Phase 1 — Ubuntu only).
  - Cross-reference with: app-owned PIDs, wrapper-registered PIDs, processes
    exposing CDP on configured port range.
  - Anything left is external unmanaged.
  - Report as session record with `source: 'external'`, `attachable: false`,
    `guidance: {message, recommendedCommand}` where the recommended command
    is the wrapper invocation for the detected project (if known via cwd).
- **S07-T05** Get external process cwd via `/proc/<pid>/cwd` symlink to
  populate `projectPath` when readable.
- **S07-T06** Discovery integration: `POST /api/sessions/discover` aggregates
  results from CDP, PTY/wrapper registry, tmux, screen, and unmanaged
  scanner. Each entry tagged with `source` per REQ-104.
- **S07-T07** Missing-project-path attach flow (REQ-107):
  - When a discovered session is controllable but exposes no `projectPath`,
    `POST /api/sessions/:id/attach` returns `{ok: false, error: {code:
    'project_required', ...}}`.
  - UI shows a project picker modal before completing attach.
  - When the adapter cannot control the session safely without a project
    path (e.g. file-context features), attach is blocked entirely with a
    guidance message recommending re-launch via the wrapper.
- **S07-T08** UI binding (small additions on top of sprint 04):
  - Session row variants for tmux/screen sources (label + target name).
  - `SessionDiscoveryList` shows "External unmanaged" row with disabled
    Attach button and a guidance card explaining what to run instead
    (REQ-101, AC-030).
  - Settings: configurable tmux/screen target list with add/remove UI.
- **S07-T09** Tests:
  - Configured tmux target detected; non-existent target returns clear error.
  - `send-keys` with shell-special characters does not break out of the
    pane (use `-l` literal mode).
  - Unmanaged scanner correctly excludes app-owned and wrapper-registered
    processes.
  - External row shows guidance, not Attach.
  - tmux capabilities correctly mark actions/conversation as unsupported in
    UI badges.

## Risks

- **tmux/screen environments where they are not installed:** Adapter must
  detect missing binaries and disable cleanly (capability = `unsupported`).
- **Snapshot fidelity:** tmux pane capture is plain text, no DOM. UI will
  render it in a monospace block; user expectations differ from CDP mirror —
  document this in adapter capability description.
- **/proc scanning permissions:** other users' processes won't be readable —
  expected; document it as "best-effort detection".

## Done Definition

- A tmux session running Antigravity, configured in settings, appears in
  the session list and supports prompt send + snapshot tail.
- A `screen` session works analogously.
- An external `antigravity` process started in a plain terminal (no CDP, no
  wrapper) appears in the discovery list as "External unmanaged" with
  disabled Attach and guidance to re-launch via wrapper or with
  `--remote-debugging-port`.
- The system never sends `kill` or destructive commands against unmanaged
  processes (NFR-013A).
