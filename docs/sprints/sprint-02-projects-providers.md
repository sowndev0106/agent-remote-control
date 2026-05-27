# Sprint 02 — Project & Provider Registry

**Milestone:** M2
**Effort:** 3-4 days
**Dependencies:** Sprint 01

## Goal

Add the data model and HTTP APIs for project selection, recent projects,
provider availability, and the normalized session shape. No provider adapter
work yet — only the registry and stub interfaces.

## In-Scope Requirements

- REQ-015 through REQ-021 (project picker, recent, recommendation markers,
  remove from list)
- REQ-022 through REQ-026C (provider selector, adapter interface, normalized
  shapes, capability flags)

## Out of Scope

- Antigravity behavior (sprint 03)
- PTY / wrapper / tmux (sprint 05, 07)
- File and terminal APIs (sprint 06)

## Acceptance Criteria

- AC-004: User adds a folder, it appears in recent projects.
- AC-005: Project picker marks `.git`, `AGENTS.md`, `GEMINI.md`, `.agents/`,
  `.opencode/`, `.claude/`, `.codex/` folders as recommended.
- AC-006: Provider selector shows Antigravity enabled and Claude/Codex/opencode
  as disabled or future.

## Deliverables

- `src/server/domains/projects.ts` — registry + folder browse + recommendation
  detection.
- `src/server/domains/providers.ts` — provider registry, capability shapes.
- `src/server/domains/sessions.ts` — normalized session model (no adapter yet).
- `src/server/adapters/IProviderAdapter.ts` — interface from REQ-026.
- `src/server/adapters/stub/{claude,codex,opencode}.ts` — disabled stubs.
- HTTP endpoints under `/api/projects`, `/api/providers`, `/api/sessions`.

## Tasks

- **S02-T01** Define TypeScript types matching REQ-026B/C shapes:
  - `Session`, `Capability`, `ProviderInfo`, `ProjectInfo`, normalized error.
- **S02-T02** Project registry persistence: `projects.json` with saved +
  recent lists. Atomic writes. Honor `projects.recentLimit`.
- **S02-T03** Folder browse API: `GET /api/projects/browse?path=...`.
  - Restrict to `projects.roots` by default.
  - Validate path with realpath, reject symlink escapes.
  - Return entries with `{name, path, isDir, recommendations: []}`.
- **S02-T04** Recommendation detection: stat each subdir for the 7 marker
  files/dirs (REQ-017). Return as part of browse response.
- **S02-T05** Project lifecycle endpoints:
  - `POST /api/projects` — register or select a project. Body shape:
    `{path: string, confirmManual?: boolean}`. The server validates the path
    against `projects.roots`; paths outside roots require `confirmManual:
    true` (REQ-016). Returns the persisted project record with `id`.
  - `GET /api/projects/recent` — list.
  - `DELETE /api/projects/:id` — remove from saved list (do not touch files).
  - `GET /api/projects/:id` — detail incl. last provider, last session ID.
- **S02-T06** Per-project preference persistence:
  - `PUT /api/projects/:id/last-provider` — set last selected provider
    (REQ-019). Called when user changes provider in UI.
  - `PUT /api/projects/:id/last-session` — set last selected session ID
    (REQ-020). Called when user attaches/launches a session in sprint 03+.
  - Both fields stored on the project record; read by `GET /api/projects/:id`.
- **S02-T07** Provider registry: in-memory list with Antigravity enabled, three
  stubs disabled. `GET /api/providers` returns availability + capability flags.
- **S02-T08** `IProviderAdapter` interface with the 14 methods from REQ-026.
  Stub adapters return `unsupported` for every capability.
- **S02-T09** Session model: server-generated `sessionId`, provider, source,
  project, status, lifecycle, capabilities. Persist when safe (REQ-090).
- **S02-T10** Tests:
  - Manual path outside roots requires confirmation flag.
  - Path traversal (`../`) and symlink escape rejected.
  - Recommendation markers detected correctly.
  - Recent list capped at config limit.
  - Stub adapter capabilities show as `unsupported` in API response.

## Risks

- **Path normalization edge cases:** `~`, relative paths, symlinks. Use
  `path.resolve` + `fs.realpathSync.native` consistently.
- **Configured root expansion:** `~` in config must expand to `os.homedir()`.

## Done Definition

- A user can browse from `~`, see recommended folders marked, pick one, and the
  selection persists across server restart.
- `GET /api/providers` returns Antigravity enabled and three future providers
  visible-but-unavailable.
- Sessions API returns properly shaped responses (no adapter calls yet).
