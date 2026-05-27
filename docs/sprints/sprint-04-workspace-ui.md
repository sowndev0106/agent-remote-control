# Sprint 04 — Web Workspace UI Shell + Slash Commands

**Milestone:** M6 (UI subset)
**Effort:** 10-14 days
**Dependencies:** Sprint 01, 02, 03

## Goal

Build the Phase 1A React SPA: opencode-style workspace layout, login page, project
picker, provider selector, mirror renderer, action panel, composer with slash
commands, and responsive states for desktop + mobile.

This sprint excludes the terminal and file explorer (sprint 06).

## In-Scope Requirements

- REQ-046 through REQ-051A (workspace layout, top bar, rails, session sidebar,
  mirror, action panel, mobile)
- REQ-052 through REQ-055 (slash command palette + Phase 1 commands)
- All `Client State Model` domains except `terminal` and `files`
- Frontend rules in `docs/design-frontend.md` (routes, state, components,
  realtime, security, performance)

## Out of Scope

- Browser terminal UI (sprint 06)
- File explorer UI (sprint 06)
- PTY / wrapper resume UI states (sprint 05 surfaces these via backend; this
  sprint can render them as basic placeholders if needed)

## Sprint Dependencies — Stubs vs Real

This sprint depends on sprint 03 for the CDP adapter HTTP surface but is
itself depended on by sprints 05 and 06 for the workspace shell. To break the
cycle:

- **Slash commands `/files` and `/terminal`:** Implemented as palette entries
  in S04-T14, but they open empty/disabled panels until sprint 06 wires the
  panel content. After sprint 06 lands, the same command activates the real
  panel.
- **Workspace shell reserves panel slots:** `AppShell` allocates layout
  regions for the terminal dock (bottom) and file explorer secondary panel
  even though the panel components are empty in this sprint. Sprint 06 fills
  them in without touching layout code.
- **Composer file context chips:** Stubbed in S04-T13; sprint 06 (S06-T16)
  replaces the stub with real chips emitted from the file explorer.

## Acceptance Criteria

- AC-003: Login required before any workspace data shown.
- AC-006: Provider selector visibly distinguishes enabled vs disabled.
- AC-007 (UI): Launch/attach actions wired and produce visible state.
- AC-008 (UI): Live conversation renders from snapshot stream.
- AC-013 (UI): Action buttons in mirror are clickable and update on success.
- All REQ-047 states must be representable in UI (logged out, no project,
  connecting, connected, generation running, approval pending, error).
- Mobile layout works on viewport ≤ 480px.

## Deliverables

- React + Vite + TypeScript SPA in `src/web/`.
- Routes per REQ-design-frontend: `/login`, `/`, `/workspace/:projectId`,
  `/settings`.
- Components per `Component Map` minus `FileExplorer/Viewer/TerminalDock`.
- Mirror renderer in **sandboxed iframe** (`<iframe sandbox="allow-same-origin"
  srcdoc>`) to isolate scraped CSS/HTML from app shell — this is the audited
  mirror surface required by frontend security rules.
- Slash command palette with the 12 Phase 1 commands (REQ-053).
- WebSocket client with reconnect + envelope dispatch.
- Tailwind theme matching the dense, no-marketing visual rules (REQ-051A).

## Tasks

- **S04-T01** Vite + React 18 + TS scaffold. Tailwind. Route setup.
- **S04-T02** API client with CSRF token handling and canonical command
  envelope parsing for both success and failure:
  `{ok: true, data, error: null}` and `{ok: false, data: null, error}`.
  Reject any response that does not match the envelope so backend drift is
  caught during UI tests.
- **S04-T03** WS client: connect with session cookie, dispatch envelope
  events to Zustand stores by `type` prefix (`provider.*`, `session.*`,
  `auth.*`, etc.). Event names come from the server event catalog introduced
  in sprint 03.
- **S04-T04** Zustand stores: `auth`, `projects`, `providers`, `sessions`,
  `capabilities`, `mirror`, `actions`, `settings`, `ui`. Each store
  ≤ 200 LOC; pure selectors.
- **S04-T05** `AuthScreen` — password form, redirect to last route on success.
- **S04-T06** `AppShell` — top bar + rail + secondary panel + main + right
  panel + composer slot. Responsive breakpoints per REQ-design.
- **S04-T07** `ProjectPicker` + home screen: recent list, folder browser,
  recommendation badges, manual path entry with confirm.
- **S04-T08** `ProviderSelector` + capability badges. Disabled future cards.
- **S04-T09** `SessionDiscoveryList` — discovered sessions before launch
  (REQ-046E). Source badges (CDP / Managed PTY / Wrapper / tmux / screen /
  External). Attach + Launch New actions.
- **S04-T10** `MirrorTimeline` (mirror mode) — sandboxed iframe rendering
  sanitized snapshot. Scroll preservation when not near bottom. Refresh +
  scroll-to-bottom controls. Overlay states (connecting, retrying, stale).
- **S04-T11** Remote action wiring — read `actions` store, render clickable
  overlays on mirror buttons by stable server-issued action ID. Optimistic
  pending state. The frontend never submits selectors, DOM paths, raw button
  text, occurrence indexes, or provider commands.
- **S04-T12** `ActionPanel` — provider status, port, mode/model, pending
  approvals, last error, adapter logs (compact, with detail expand).
- **S04-T13** `Composer` — multiline input, send + stop, file context chips
  placeholder (real chips arrive in sprint 06), provider capability hints.
- **S04-T14** `SlashCommandPalette` — opens on `/`, fuzzy filter, disabled
  state for unsupported commands. Phase 1 commands:
  - `/new`, `/stop`, `/project`, `/files`, `/open`, `/provider`, `/model`,
    `/mode`, `/history`, `/actions`, `/terminal`, `/settings`.
  - Each command maps to a UI action (REQ-053 + REQ-054).
- **S04-T15** `SettingsView` — server host/port, password change, project
  roots, Antigravity debug ports, wrapper commands. Risky toggles
  (0.0.0.0) show confirm + warning.
- **S04-T16** Error states: `StatusToast` + `ErrorRecovery` panels. Every
  REQ-047 state has a representation. Recovery actions wire to real APIs.
- **S04-T17** Mobile layout: bottom tabs/drawers per REQ-050 + design rules.
  Composer stays reachable above mobile keyboard.
- **S04-T18** Frontend tests (Vitest + React Testing Library):
  - login required redirects
  - project picker selects and persists
  - disabled providers cannot be clicked
  - attach state machine transitions
  - slash palette filtering
  - sandboxed mirror does not execute injected scripts
  - server-issued action ID is submitted, not raw selector
  - mobile drawer navigation

## Risks

- **Sandboxed iframe + remote click overlay:** Action targets live inside the
  iframe but the action ID is generated server-side, so the parent must know
  each button's screen position to position an invisible overlay above it.
  Approach: iframe uses `sandbox="allow-same-origin"` (no `allow-scripts` —
  scraped JS cannot execute), parent queries `iframe.contentDocument` for
  each action element, gets its `getBoundingClientRect()`, and translates to
  parent viewport by adding `iframe.getBoundingClientRect()` offsets. Re-run
  on snapshot change and on scroll.
- **CSP for mirror iframe:** the iframe `srcdoc` content can use its own
  relaxed CSP without weakening the app shell CSP. Document this.
- **UI volume:** This is the biggest sprint. Keep each component small
  (≤ 300 LOC). Pull common patterns into `lib/ui` early.

## Done Definition

- A user can log in, pick a project, see discovered Antigravity sessions,
  attach, see live mirror, send a prompt, click an action button, stop
  generation, and switch conversations — all from the browser, desktop or
  mobile.
- Phase 1B surfaces (managed PTY, wrapper, tmux/screen, terminal, files) are
  represented as disabled or placeholder states where needed, but they do not
  block the Phase 1A CDP workflow.
- No marketing or hero sections appear anywhere in the authenticated app.
- Sandboxed mirror cannot break out into the app shell (verified via XSS
  smoke test using a crafted snapshot).
