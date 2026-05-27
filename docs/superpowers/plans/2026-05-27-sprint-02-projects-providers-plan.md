# Sprint 02 — Project & Provider Registry — Implementation Plan

**Source spec:** [docs/sprints/sprint-02-projects-providers.md](../../sprints/sprint-02-projects-providers.md)

**Goal:** Add data model + REST endpoints for projects, providers, and the normalized session shape. No adapter behavior yet — adapters are stub classes.

**Architecture:** Domain modules under `src/server/domains/`. HTTP routes under `src/server/http/` keyed by domain. JSON persistence via `writePersisted` from sprint 01. Stable IDs via `randomBytes(12).toString("hex")` for project IDs and (later) session IDs.

## File Layout

```
src/server/
  domains/
    types.ts                — Session, ProviderInfo, ProjectInfo, Capability, …
    projects.ts             — registry + browse + recommendation detection
    providers.ts            — provider registry + capability shapes
    sessions.ts             — session model (no adapter calls)
  adapters/
    IProviderAdapter.ts     — 14-method interface (REQ-026)
    stub/
      claude.ts | codex.ts | opencode.ts  — disabled stubs
  http/
    projects.ts | providers.ts | sessions.ts
tests/
  projects.test.ts | providers.test.ts | path-safety.test.ts
  recommendation.test.ts | sessions-api.test.ts
```

## Tasks (each finishes with `pnpm test && pnpm build` green + commit)

### T1 — types.ts (S02-T01, T08, T09 shapes)

`Capability = "supported" | "unsupported" | "unknown"`,
`CapabilityMap`, `ProviderId`, `ProviderInfo`, `ProjectInfo`, `Session`,
`SessionStatus`, `Lifecycle`. No behavior.

### T2 — `IProviderAdapter` (S02-T08)

14-method interface from REQ-026; all methods return Promises of normalized
shapes. Stubs return `unsupported` for capabilities and throw `AppError` for
calls that would imply state change.

### T3 — Stub adapters (S02-T08)

`claude.ts`, `codex.ts`, `opencode.ts` — each is one class implementing
`IProviderAdapter` with `detect() → { available: false, capabilities: all
unsupported }`. No imports beyond types.

### T4 — Provider registry (S02-T07)

In-memory map keyed by provider id. `getAll()` returns the list with
Antigravity marked `enabled: true` (capabilities still `unknown` since the CDP
adapter ships in sprint 03) and the three stubs `enabled: false`.

### T5 — Recommendation detection (S02-T04)

`detectRecommendations(dir): Promise<RecommendationMarker[]>` — `fs.stat` each
of the 7 marker paths. Tests cover present/absent/symlink/permission-denied.

### T6 — Path safety helper

Shared `resolveSafe(input, allowedRoots): Promise<string>` returns the canonical
absolute realpath if it stays under any allowed root; throws
`AppError(path_outside_project)` otherwise. Used by browse and project select.

### T7 — Project registry (S02-T02, T03, T05, T06)

`ProjectStore` (mirrors `SessionStore` from sprint 01): saved + recent lists
in `projects.json` (versioned envelope). Methods: `select`, `getRecent`,
`getById`, `remove`, `setLastProvider`, `setLastSession`. Recent list capped at
`config.projects.recentLimit`.

### T8 — Browse endpoint (S02-T03 + T04)

`GET /api/projects/browse?path=` returns
`{ path, parent, entries: [{name, path, isDir, recommendations}] }`. Resolves
`~` to homedir, expands roots, applies `resolveSafe` allowing all roots.
Hidden entries hidden unless `?showHidden=true`.

### T9 — HTTP routes

- `projects.ts` — browse, register/select, list recent, get by id, delete,
  setLastProvider, setLastSession.
- `providers.ts` — GET `/api/providers`.
- `sessions.ts` — placeholder `GET /api/sessions` (returns empty array until
  sprint 03+) and `POST /api/sessions/discover` (also empty for now).

All wired in `buildApp` via a new `registerDomainRoutes` exported alongside
`registerLoginRoutes`.

### T10 — Tests (S02-T10)

- `path-safety.test.ts` — `../` traversal blocked, symlink escape blocked,
  paths inside roots allowed.
- `recommendation.test.ts` — markers detected via mktemp.
- `projects.test.ts` — register, recent cap, delete, lastProvider/lastSession,
  manual-confirm gate.
- `providers.test.ts` — Antigravity enabled, 3 stubs disabled with
  capabilities visible.
- `sessions-api.test.ts` — empty lists for now, shape stable for sprint 03.

### T11 — Verify + commit + merge

All tests pass; commit; merge into main.

## Self-Review

- REQ-015 (browse): T8.
- REQ-016 (outside-roots requires confirm): T7 + T10.
- REQ-017 (7 markers): T5.
- REQ-018 (persist recent): T7.
- REQ-019 (lastProvider per project): T7.
- REQ-020 (lastSession when available): T7.
- REQ-021 (remove from list, files untouched): T7 + T9.
- REQ-022–025 (provider selector + adapter isolation): T2 + T3 + T4.
- REQ-026 + 026A/B/C (14-method interface, normalized, server-issued IDs,
  capabilities): T1 + T2 + T9.
