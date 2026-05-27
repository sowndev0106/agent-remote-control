# Sprint Plan — Phase 1 Antigravity Complete

This directory breaks the Phase 1 scope (`docs/REQUIEMENT.md` + `docs/design-frontend.md`)
into executable sprints. Each sprint is a self-contained unit a developer can pick up,
execute, and verify against named acceptance criteria.

## Overview

| # | Sprint | Milestone | REQ range | Effort | Critical path |
|---|---|---|---|---|---|
| [01](sprint-01-runtime-auth.md) | Runtime, CLI, Auth Base | M1 | REQ-001..014D | 3-5 d | ✅ blocks all |
| [02](sprint-02-projects-providers.md) | Project & Provider Registry | M2 | REQ-015..026C | 3-4 d | ✅ blocks 03..08 |
| [03](sprint-03-antigravity-cdp.md) | Antigravity CDP Adapter | M3 | REQ-027..044, REQ-092..099 | 5-7 d | ✅ core demo |
| [04](sprint-04-workspace-ui.md) | Web Workspace UI Shell + Slash | M6 (UI) | REQ-046..055 | 10-14 d | ✅ user-facing |
| [05](sprint-05-pty-wrapper.md) | Managed PTY + Wrapper Adapter | M4 | REQ-045..045E, REQ-094..103 | 5-7 d | ⏸ defer-able |
| [06](sprint-06-terminal-files.md) | Browser Terminal + File Explorer | M6 (tools) | REQ-056..087A | 6-9 d | parallel to 05 |
| [07](sprint-07-tmux-screen.md) | tmux/screen Attach + Unmanaged Detection | M5 | REQ-045D, REQ-100..107 | 4-6 d | ⏸ defer-able |
| [08](sprint-08-realtime-persistence-hardening.md) | Realtime Contracts + Persistence + Hardening | M6 (cross-cutting) | REQ-088..091, REQ-108..115, all NFR | 4-6 d | ✅ final polish |

**Total estimate:** ~45-65 working days (≈ 2-3 calendar months solo).

## Dependency Graph

```
[01 Runtime/Auth] → [02 Registry] → [03 CDP] ──┐
                            ↓                    ├→ [04 UI Shell] → [06 Terminal/Files]
                            ↓                    ↓
                          [05 PTY/Wrapper] → [07 tmux/screen]
                                                 ↓
                                     [08 Realtime/Persist/Harden]
```

## Execution Order (recommended)

1. **Sprint 01 → 02 → 03** sequentially. Land a working CDP mirror by end of sprint 3.
2. **Sprint 04** starts after 03 has a stable adapter HTTP surface. Initially renders a single CDP session, polishes through 05 and 06.
3. **Sprint 05 + 06** run in parallel (different subsystems, different files).
4. **Sprint 07** only after 05 lands (it shares the PTY/session model).
5. **Sprint 08** is the closing hardening pass — touches every domain.

## Cutting Scope

If timeline tightens, drop in this order:
1. Sprint 07 (tmux/screen) — REQ-094B says "when user configures", deferrable.
2. Sprint 05 wrapper command — keep PTY adapter, drop the `agy` wrapper.
3. Slash command palette in sprint 04 — keep core commands only.

What you **cannot** cut from Phase 1: auth, CDP adapter, project picker, mirror UI,
browser terminal (REQ-056 explicit), file explorer (REQ-071 explicit).

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
