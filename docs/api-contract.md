# API & Realtime Contract (Phase 1)

Generated during sprint 08 audit (S08-T01/T02). Every command endpoint returns
the envelope `{ ok: true, data, error: null } | { ok: false, data: null,
error: { code, operation, message, detail?, recoveryAction? } }` (REQ-109/110,
H7). Every route except `/login`, the SPA shell, static assets, `/healthz`, and
`POST /api/auth/login` requires a valid session cookie (NFR-001, H5).

## HTTP endpoints

| Method | Path | Auth | CSRF | Notes |
|---|---|---|---|---|
| POST | /api/auth/login | public | – | password → session + csrf cookie |
| POST | /api/auth/logout | yes | yes | destroys session |
| GET | /api/auth/whoami | yes | – | session probe |
| GET | /api/config | yes | – | sanitized; never returns passwordHash |
| GET | /api/providers | yes | – | provider list + capabilities |
| GET | /api/projects/browse | yes | – | root-scoped folder listing |
| GET | /api/projects/recent | yes | – | recent project list |
| GET | /api/projects/:id | yes | – | project detail |
| POST | /api/projects | yes | yes | register/select (confirmManual gate) |
| DELETE | /api/projects/:id | yes | yes | remove from list (files untouched) |
| PUT | /api/projects/:id/last-provider | yes | yes | REQ-019 |
| PUT | /api/projects/:id/last-session | yes | yes | REQ-020 |
| GET | /api/sessions | yes | – | session registry list |
| POST | /api/sessions/discover | yes | yes | aggregates cdp/tmux/screen/unmanaged |
| POST | /api/sessions/launch | yes | yes | CDP launch |
| POST | /api/sessions/pty/launch | yes | yes | managed-PTY launch |
| POST | /api/sessions/:id/attach | yes | yes | NFR-012A no-restart attach |
| POST | /api/sessions/:id/resume | yes | yes | reconnect cdp/pty |
| POST | /api/sessions/:id/stop | yes | yes | stop generation |
| POST | /api/sessions/:id/prompt | yes | yes | send prompt |
| POST | /api/sessions/:id/new-conversation | yes | yes | clicks "new chat" action |
| GET | /api/sessions/:id/snapshot | yes | – | sanitized mirror snapshot |
| GET | /api/sessions/:id/actions | yes | – | server-issued action descriptors |
| POST | /api/sessions/:id/actions/:actionId | yes | yes | **only** :actionId accepted (H9, AC-034) |
| GET | /api/sessions/:id/conversations | yes | – | history list |
| POST | /api/sessions/:id/conversations/:cid/select | yes | yes | select conversation |
| POST | /api/sessions/:id/pty/input | yes | yes | managed-PTY stdin |
| POST | /api/sessions/:id/pty/signal | yes | yes | SIGINT/SIGTERM |
| POST | /api/sessions/:id/scroll | yes | yes | REQ-044 explicit-scroll only |
| GET | /api/terminal/tabs | yes | – | tab metadata |
| POST | /api/terminal/tabs | yes | yes | create tab (maxTabs) |
| DELETE | /api/terminal/tabs/:id | yes | yes | close (?force for fg job) |
| POST | /api/terminal/tabs/:id/resize | yes | yes | cols/rows |
| GET | /api/files/tree | yes | – | lazy, project-root-scoped |
| GET | /api/files/preview | yes | – | text/binary/oversized |
| GET | /api/files/search | yes | – | fuzzy path search |
| GET | /healthz | public | – | liveness |

## WebSocket endpoints

| Path | Auth | Notes |
|---|---|---|
| /api/realtime | cookie on upgrade | bus → client event fan-out |
| /api/terminal/tabs/:id/stream | cookie on upgrade | bidirectional PTY I/O (AC-025) |

## Realtime event envelope (REQ-111, H8)

`{ type, projectId?, sessionId?, version, payload }`. Legal `type` values
(catalog in `src/server/core/realtime/events.ts`):

- `provider.status.changed`
- `provider.snapshot.changed` (broadcast only on hash change — REQ-113)
- `provider.actions.changed`
- `session.lifecycle.changed`
- `terminal.output`
- `terminal.lifecycle.changed`

## Error codes (non-exhaustive)

`auth_required`, `csrf_missing`, `rate_limited`, `port_busy`,
`bind_refused_default_password`, `project_required`, `manual_confirm_required`,
`path_outside_project`, `path_outside_roots`, `not_a_directory`, `binary_file`,
`oversized_file`, `cdp_target_not_found`, `cdp_timeout`, `cdp_disconnected`,
`snapshot_stale`, `action_not_found`, `action_target_missing`,
`session_not_attached`, `managed_pty_resume_failed`, `tmux_target_missing`,
`screen_target_missing`, `terminal_disabled`, `max_tabs_reached`,
`foreground_job_running`, `provider_disabled`.
