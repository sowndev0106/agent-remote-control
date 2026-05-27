# Phase 1 Scope And Sprint Fix Design

## Context

The current planning docs describe a strong product direction, but the Phase 1
definition mixes an MVP with the full Antigravity control-surface matrix. That
creates avoidable delivery risk:

- `REQUIEMENT.md` says Phase 1 MUST include CDP, managed PTY, wrapper,
  tmux/screen, browser terminal, and file explorer.
- `docs/sprints/README.md` says some of those items can be cut.
- Security, API envelope, persistence, and realtime contracts are mostly
  audited in Sprint 08, after several sprints can already drift.
- A few technical assumptions need correction before implementation starts,
  especially Unix socket peer UID verification from Node.js.

The fix is a documentation refactor only. No product code exists yet.

## Recommended Approach

Split Phase 1 into two explicit delivery layers:

- **Phase 1A - CDP MVP:** the first shippable local app. It includes runtime,
  auth, project/provider registry, Antigravity CDP launch/attach/mirror,
  prompt, stop/new/history where detectable, server-issued action IDs, core
  workspace UI, and baseline hardening/contracts.
- **Phase 1B - Extended Antigravity Surfaces:** managed PTY, wrapper-launched
  sessions, tmux/screen attach, unmanaged detection, browser terminal, file
  explorer, and final hardening.

This keeps the final product ambition intact while making the first integration
checkpoint small enough to verify.

## Requirements Changes

`docs/REQUIEMENT.md` must distinguish:

- **Phase 1A MUST:** install/runtime/auth, project picker, provider selector,
  CDP adapter, attach/launch, live mirror, prompt, common remote actions,
  normalized HTTP/WS contracts, local JSON persistence foundation, and no
  opencode serve delegation.
- **Phase 1B MUST:** managed PTY, wrapper command, tmux/screen attach, unmanaged
  external guidance, browser terminal, read-only file explorer, and full AC walk.
- **Phase 1 complete:** both 1A and 1B done.

The requirements must stop saying that Sprint 07 or wrapper can be cut from
Phase 1 if the same document still marks them as Phase 1 MUST. Instead, those
items should be cuttable only from **Phase 1A**, not from full Phase 1.

## Sprint Plan Changes

`docs/sprints/README.md` must become:

- **1A critical path:** Sprint 01, Sprint 02, Sprint 03, Sprint 04, plus an
  early contract/security slice moved out of Sprint 08.
- **1B continuation:** Sprint 05, Sprint 06, Sprint 07, Sprint 08.
- **Cutting scope:** only allowed for Phase 1A. Full Phase 1 still requires all
  requirements marked 1B.

Sprint 08 must no longer be the first place that enforces cross-cutting
contracts. It remains a final audit, but the following must move earlier:

- normalized HTTP result envelope helper and tests in Sprint 01
- route auth allowlist test in Sprint 01
- atomic JSON persistence helper in Sprint 01
- realtime event envelope/type catalog in Sprint 03 before WS emitters spread
- action ID API audit in Sprint 03/04, then final re-audit in Sprint 08

## Technical Corrections

Fix these planning assumptions across `architecture.md`, sprint files, and
requirements:

- `/logout` must not be a public unauthenticated exception. It must require an
  authenticated session and CSRF, or be documented as an idempotent authenticated
  command.
- Node.js `net` must not be assumed to expose `SO_PEERCRED` directly. The IPC
  wrapper design must use a `0700` config directory, `0600` socket path where
  possible, and a server-issued local registration nonce. If stronger peer UID
  verification is required, document it as a native helper/addon decision.
- CDP support must have a Sprint 03 preflight task that validates the installed
  Antigravity build accepts the debug flag and exposes the expected workbench
  target shape. If this fails, the sprint must stop and update requirements.
- `POST /api/sessions/:id/stop` and
  `POST /api/sessions/:id/stop-generation` must collapse to one canonical
  endpoint.
- `listDiscoveredSessions(project)` must accept optional project context so
  home-screen discovery before project selection is explicit.
- Generic browser terminal sessions and managed Antigravity PTY sessions need a
  clear boundary. Auto-registering `antigravity` commands typed into a generic
  terminal must be deferred unless explicitly designed in Sprint 05/06.

## Source Docs To Update

The implementation pass must edit:

- `docs/REQUIEMENT.md`
- `docs/architecture.md`
- `docs/design-frontend.md`
- `docs/sprints/README.md`
- `docs/sprints/sprint-01-runtime-auth.md`
- `docs/sprints/sprint-03-antigravity-cdp.md`
- `docs/sprints/sprint-04-workspace-ui.md`
- `docs/sprints/sprint-05-pty-wrapper.md`
- `docs/sprints/sprint-06-terminal-files.md`
- `docs/sprints/sprint-08-realtime-persistence-hardening.md`

Sprint 02 and Sprint 07 likely need only small wording updates unless the trace
table changes.

## Acceptance For The Doc Fix

The doc fix is done when:

- A reader can tell what is required for Phase 1A versus full Phase 1.
- No document says a full-Phase-1 MUST requirement is cuttable.
- Cross-cutting security/contract invariants are introduced before dependent
  routes and WS events are implemented.
- `/logout` is no longer listed as an unauthenticated exception.
- IPC security no longer relies on a Node.js API that is not documented as
  available.
- The REST surface has one canonical stop endpoint.
- Sprint dependencies still form a coherent execution order.

## Non-Goals

- Do not rename `docs/REQUIEMENT.md`.
- Do not add source code.
- Do not remove the long-term Antigravity-complete ambition.
- Do not weaken hard rules H1-H17.
