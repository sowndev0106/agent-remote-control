# Sprint Plan — Phase 1 Antigravity Complete

This directory breaks the Phase 1 scope (`docs/REQUIEMENT.md` + `docs/design-frontend.md`)
into executable sprints. Each sprint is a self-contained unit a developer can pick up,
execute, and verify against named acceptance criteria.

## Overview

| # | Phase | Sprint | Milestone | REQ range | Effort | Critical path |
|---|---|---|---|---|---|---|
| [01](sprint-01-runtime-auth.md) | 1A | Runtime, CLI, Auth Base | M1 | REQ-001..014D, baseline REQ-108..110, REQ-090A | 3-5 d | ✅ blocks all |
| [02](sprint-02-projects-providers.md) | 1A | Project & Provider Registry | M2 | REQ-015..026C | 3-4 d | ✅ blocks 03..08 |
| [03](sprint-03-antigravity-cdp.md) | 1A | Antigravity CDP Adapter | M3 | REQ-027..044, REQ-092..099, REQ-111..114 | 5-7 d | ✅ CDP demo |
| [04](sprint-04-workspace-ui.md) | 1A | Web Workspace UI Shell + Slash | M6 (UI) | REQ-046..055 | 10-14 d | ✅ 1A release |
| [05](sprint-05-pty-wrapper.md) | 1B | Managed PTY + Wrapper Adapter | M4 | REQ-045..045E, REQ-094..103 | 5-7 d | full Phase 1 |
| [06](sprint-06-terminal-files.md) | 1B | Browser Terminal + File Explorer | M6 (tools) | REQ-056..087A | 6-9 d | full Phase 1 |
| [07](sprint-07-tmux-screen.md) | 1B | tmux/screen Attach + Unmanaged Detection | M5 | REQ-045D, REQ-100..107 | 4-6 d | full Phase 1 |
| [08](sprint-08-realtime-persistence-hardening.md) | 1B | Realtime Contracts + Persistence + Hardening | M6 (cross-cutting) | REQ-088..091, REQ-108..115, all NFR | 4-6 d | ✅ final audit |

**Phase 1A estimate:** ~21-30 working days.  
**Full Phase 1 estimate:** ~45-65 working days (≈ 2-3 calendar months solo).

## Dependency Graph

```
[01 Runtime/Auth] → [02 Registry] → [03 CDP] → [04 UI Shell]  = Phase 1A
                            ↓                         ↓
                          [05 PTY/Wrapper] → [07 tmux/screen]
                            ↓                         ↓
                          [06 Terminal/Files] ────────┘
                                      ↓
                         [08 Realtime/Persist/Harden] = full Phase 1
```

## Execution Order (recommended)

1. **Phase 1A: Sprint 01 → 02 → 03 → 04** sequentially. Land a working
   CDP-controlled browser workspace by end of sprint 4.
2. **Sprint 01** must introduce the normalized HTTP envelope, route-auth
   allowlist test, and atomic JSON helper so later sprints cannot drift.
3. **Sprint 03** must introduce the realtime event catalog before adding WS
   emitters.
4. **Phase 1B: Sprint 05 + 06** can run in parallel after 04 (different
   subsystems, shared shell).
5. **Sprint 07** only after 05 lands (it shares the extended session model).
6. **Sprint 08** is the closing re-audit and hardening pass — it verifies
   contracts already introduced earlier instead of inventing them late.

## Cutting Scope

If timeline tightens, cut scope only from the **Phase 1A checkpoint**:

1. Defer Sprint 07 (tmux/screen) to Phase 1B.
2. Defer Sprint 05 wrapper command to Phase 1B.
3. Defer browser terminal and file explorer to Phase 1B.
4. Reduce slash command polish in sprint 04, but keep core commands wired.

What you **cannot** cut from Phase 1A: auth, CDP adapter, project picker,
provider selector, mirror UI, prompt send, server-issued action IDs,
normalized HTTP/realtime envelopes, route auth, CSRF, DOM sanitization, and
port-safety behavior.

What you **cannot** cut from full Phase 1: managed PTY, wrapper, tmux/screen
when configured, unmanaged guidance, browser terminal (REQ-056 explicit), file
explorer (REQ-071 explicit), persistence exclusions, and final hardening.

## Conventions

- Each sprint file has: Goal, In-scope REQs, Acceptance, Deliverables, Tasks, Risks, Done definition.
- Task IDs use `S<sprint>-T<n>` (e.g. `S03-T04`).
- REQ IDs reference `docs/REQUIEMENT.md`.
- AC IDs reference `docs/REQUIEMENT.md` Acceptance Criteria section.

## Source-of-truth links

- Product requirements: [docs/REQUIEMENT.md](../REQUIEMENT.md)
- Frontend design: [docs/design-frontend.md](../design-frontend.md)
- POC reference (CDP layer to port): `ref-source/antigravity_phone_chat/server.js`
- Workspace shape reference: `ref-source/opencode`
