# AGENTS.md

This file provides guidance to coding agents (Claude Code, Codex, Cursor, Gemini, etc.) when working in this repository.

## Scope

`agent-remote-control` is a planned Ubuntu local app that controls AI coding agents (Antigravity in Phase 1) from a protected browser UI on `127.0.0.1:4096`. The repo is currently in the spec-and-plan stage — no source code yet. Implementation begins by executing the sprints in [docs/sprints/](docs/sprints/).

The app must own its server, web UI, auth, project registry, terminal service, file explorer, realtime sync, and provider adapters. It must **not** delegate to `opencode serve`.

## Authoritative Documents

Source of truth, in priority order. When in conflict, the higher entry wins:

| Document | Purpose | When to read |
|---|---|---|
| [docs/REQUIEMENT.md](docs/REQUIEMENT.md) | Product requirements (REQ-* and NFR-* IDs, AC-* acceptance criteria) | Before any task — quote REQ IDs in PRs |
| [docs/design-frontend.md](docs/design-frontend.md) | Frontend state model, components, routes, security rules | Before any UI task |
| [docs/sprints/README.md](docs/sprints/README.md) | Sprint plan, dependency graph, execution order | Before starting work |
| [docs/sprints/sprint-NN-*.md](docs/sprints/) | Per-sprint goal, tasks (`S<NN>-T<n>`), acceptance, done definition | When picking up a sprint |

The filename `docs/REQUIEMENT.md` is a typo kept intentionally — do not rename.

## Workflow Pipeline

Every sprint follows the same pipeline. Each arrow is a hand-off; do not skip.

```
pick sprint → write plan → branch → execute plan → verify → review → finish
              writing-plans         executing-plans  verif-   request-/
                                    + TDD per task   before-  receive-code-
                                    + brainstorm     comple-  review
                                      when ambiguous tion
                                    + debug
                                      when stuck

Gates can fail. When they do, loop back — never skip. See "Gate Failures" below.
```

### Step 1 — Pick the next sprint

1. Open [docs/sprints/README.md](docs/sprints/README.md). Confirm all listed **Dependencies** for your target sprint are completed.
2. Read the sprint file end to end. Note every `S<NN>-T<n>` task ID and every AC-* it claims to satisfy.
3. Re-read every REQ-* and NFR-* listed under "In-Scope Requirements" in `docs/REQUIEMENT.md`. **Do not infer from the sprint summary** — the requirement text is the contract.

### Step 2 — Write an implementation plan

Invoke the **`superpowers:writing-plans`** skill. The sprint file is the spec input; the output is a step-by-step plan that another session can execute. Save the plan to `docs/superpowers/specs/YYYY-MM-DD-sprint-NN-<topic>-plan.md` per the skill's convention.

The plan must:
- Reference the sprint file and its task IDs.
- Decompose each sprint task into ≤ 1-hour units.
- Identify the test that proves each unit done.
- Call out dependencies on prior sprint deliverables (e.g. sprint 06 depends on `Composer` from sprint 04).

### Step 3 — Branch + isolated workspace

- Branch name: `sprint-NN-<short-topic>` (e.g. `sprint-03-antigravity-cdp`).
- For long sprints (sprint 03, 04), use **`superpowers:using-git-worktrees`** to isolate the workspace from other in-flight work.

### Step 4 — Execute the plan

Invoke **`superpowers:executing-plans`** to drive the plan with built-in review checkpoints (default: every 3-5 tasks). At each checkpoint, re-read the next 3-5 task IDs against current code state — if reality has drifted from the plan, update the plan before continuing.

For each task inside the loop:

1. **If the task scope is ambiguous** (the sprint file or plan doesn't pin down a decision — e.g. "how should `tmux send-keys` escape special characters?"), invoke **`superpowers:brainstorming`** *before* writing any test. Capture the decision in the plan.
2. Otherwise, invoke **`superpowers:test-driven-development`**:
   - Write the failing test first.
   - Implement the minimum to pass.
   - Refactor without changing behavior.
   - Commit per task or per coherent unit.
3. When stuck on a bug or unexpected behavior, invoke **`superpowers:systematic-debugging`** — do not patch symptoms.

### Step 5 — Verify the sprint

Before claiming the sprint done, invoke **`superpowers:verification-before-completion`**. Walk every entry in the sprint's **Done Definition** and **Acceptance Criteria** sections and produce evidence (command output, screenshot, test run) for each. No assertions without evidence.

### Step 6 — Review

Invoke **`superpowers:requesting-code-review`** before merge. For external review responses, follow **`superpowers:receiving-code-review`** — do not implement blindly; verify each suggestion.

### Step 7 — Finish the branch

Invoke **`superpowers:finishing-a-development-branch`** to pick the right integration path (merge / PR / cleanup).

## Gate Failures — loop-back behavior

Each pipeline step is a gate. When a gate fails, return to the nearest upstream step and re-run from there. Never lower the bar to make a gate pass.

| Failure at gate | Loop back to | Action |
|---|---|---|
| Plan reveals a missing or contradictory REQ | Step 1 + REQ doc | Update `docs/REQUIEMENT.md` via PR; do not silently work around |
| Brainstorming reveals scope creep | Step 2 | Re-decompose the plan with the new scope |
| TDD: cannot make a test pass without breaking another | Step 2 | Plan was wrong about decomposition; revise it |
| Debug: root cause lives in a sibling sprint | Step 1 + sprint file | Either expand sprint scope (PR to sprint file) or defer |
| Verify: AC fails on a clean environment | Step 4 | Implementation bug; do not weaken the AC |
| Verify: AC is unimplementable as written | Step 1 + REQ doc | Spec bug; update via PR before further code |
| Review: reviewer requests changes | Step 4 | Apply via `superpowers:receiving-code-review`; do not blindly accept |
| Review: reviewer challenges an AC interpretation | Step 1 + REQ doc | Resolve at spec level before touching code |

If an entire sprint's effort estimate overruns by 50%, stop and decompose the sprint — do not push through.

## Hard Rules — never violate without an explicit REQ override

These are invariants drawn from `docs/REQUIEMENT.md`. Most are NFRs — easy to miss in normal coding flow, expensive to fix late.

| # | Rule | Source | Why |
|---|---|---|---|
| H1 | If the configured port is busy, fail with a clear error. **Never kill the holding process.** | REQ-008, AC-027 | The POC has `killPortProcess`; do not port it. Could destroy user data. |
| H2 | LAN clients **must** authenticate. No "trust local network" auto-bypass. | NFR-007 | POC auto-trusts LAN IPs; that behavior is explicitly forbidden here. |
| H3 | Never read or extract OAuth tokens / API keys from Google, Antigravity, Claude, Codex, or opencode desktop apps. | NFR-005 | Account safety. The app mirrors UI, never proxies provider APIs. |
| H4 | Password hashes use Argon2id (or documented bcrypt / PBKDF2 fallback). Never plaintext. | REQ-011, REQ-014A | — |
| H5 | Every HTTP, WebSocket, and SSE endpoint requires session auth, except `/login` and login static assets. | NFR-001 | Add a build-time test for new routes (see sprint 08 S08-T12). |
| H6 | Binding `0.0.0.0` requires explicit config **and** non-default password. Startup must warn about LAN exposure, terminal-as-shell risk, and password ≠ encryption. | REQ-014, NFR-006, NFR-008A | — |
| H7 | All command APIs return `{ok: true, data} \| {ok: false, error: {code, operation, message, recoveryAction?}}`. | REQ-109, REQ-110 | One envelope, one parser. |
| H8 | All realtime events use one envelope: `{type, projectId?, sessionId?, version, payload}`. | REQ-111 | — |
| H9 | Remote action IDs are **server-issued** from stable target metadata. Frontend never invents CDP selectors, filesystem paths, or provider raw commands. | REQ-114, design-frontend.md §Data Contracts | Prevents wrong-target clicks and selector injection. |
| H10 | Provider snapshots carry a content hash; broadcast only when the hash changes. | REQ-113, NFR-015 | — |
| H11 | Scraped provider DOM is rendered only through the audited mirror renderer (sandboxed iframe). `dangerouslySetInnerHTML` is allowed nowhere else. | REQ-037, NFR-003, NFR-004, design-frontend.md §Security | — |
| H12 | File reads use project-root-scoped APIs. Resolve via `path.resolve` + `realpath`. Reject symlinks that escape the root. Browse roots do **not** widen file read access for an active project. | REQ-086, REQ-087, REQ-087A | — |
| H13 | Persisted JSON files are written atomically with `0600` permissions. The config directory is `0700`. | REQ-090A | — |
| H14 | Do not persist OAuth tokens, raw API keys, full DOM history, file contents, or terminal scrollback. | REQ-091 | — |
| H15 | App shutdown closes only **owned** provider launches and PTYs. Never SIGTERM unmanaged external Antigravity processes. | NFR-013, NFR-013A | — |
| H16 | Phase 1 file explorer is read-only. No edit/rename/delete/move/create endpoints. | REQ-085 | — |
| H17 | Provider capabilities are explicit: `supported` / `unsupported` / `unknown`. Unsupported controls are visible-and-disabled, never silently missing. | REQ-026C, NFR-020 | — |

## POC Reference Strategy

[ref-source/antigravity_phone_chat/](ref-source/antigravity_phone_chat/) is a single-file Node.js POC that proves CDP-based Antigravity control. It is **reference only** — never imported, never linked from production code. (The whole `ref-source/` directory is gitignored.)

**Port these patterns** (sprint 03):
- CDP discovery, attach, snapshot capture (`captureSnapshot`)
- Sanitization + content hashing
- Leaf-node + occurrence-index click targeting
- `injectMessage`, `stopGeneration`, `startNewChat`, `getChatHistory`, `selectChat`
- `pendingCalls` Map with 30s timeout

**Reject these patterns**:
- `killPortProcess()` — violates H1
- LAN-IP auto-trust auth bypass — violates H2
- Session-cookie design that does not use Argon2id — violates H4
- Single global session — Phase 1 is multi-project, multi-session
- Mobile-first single-screen UI — Phase 1 is opencode-style desktop + mobile

**Restructure these patterns**:
- POC packs everything into `server.js`. Split per the architecture in `docs/sprints/sprint-03` deliverables.
- POC emits ad-hoc WS messages. Wrap in the normalized envelope (H8).
- POC's `/remote-click` accepts text+occurrence from the client. Move ID generation server-side (H9).

## Proposed Tech Stack

Not yet committed in code; finalize during sprint 01. Use these defaults unless you have a concrete reason to diverge:

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| HTTP framework | Fastify |
| WebSocket | `ws` |
| PTY | `node-pty` |
| CDP client | raw WS or `chrome-remote-interface` |
| Password hashing | `argon2` (fallback `bcrypt`) |
| DOM sanitization | `DOMPurify` + `jsdom` |
| Atomic JSON | `proper-lockfile` + write-temp-then-rename |
| Frontend | React 18 + Vite |
| Frontend state | Zustand |
| Terminal renderer | xterm.js + `xterm-addon-fit` |
| Styling | Tailwind CSS |
| Slash palette | `cmdk` |
| Tests | Vitest (frontend), Node's built-in `node:test` or Vitest (backend) |

## Code Conventions

To be confirmed during sprint 01, but expect the following:

- One unit = one purpose. Files over ~300 LOC are a signal to split.
- Adapters implement `IProviderAdapter` (REQ-026). Each control surface (cdp / managed-pty / wrapper / tmux / screen) is its own class.
- Capability flags are emitted, not assumed. Unknown stays unknown until probed.
- HTTP routes follow `/api/<domain>/...` where domain is one of `auth | config | projects | providers | sessions | terminal | files` (REQ-108).
- WS event types follow `<domain>.<event>` (e.g. `provider.snapshot.changed`, `session.lifecycle.changed`).
- All times are server timestamps in milliseconds since epoch unless explicitly noted.

## Git Conventions

- Commit message style: matches recent log — lowercase prefix like `docs:`, `feat:`, `fix:`, `chore:`. Short imperative. Wrap body at ~72 cols.
- Branch naming: `sprint-NN-<short-topic>`.
- Never push to `main` without a successful sprint verification (Step 5 above).
- Never `--force` push to a shared branch.
- Never commit `--no-verify` unless the user explicitly asks.
- The `ref-source/` directory is gitignored — do not stage anything in it.

## Skills Quick Reference

The superpowers skills called out in the pipeline:

| Skill | Use when |
|---|---|
| `superpowers:brainstorming` | Spec is unclear, before changing scope, or before touching code on an ambiguous task — including ambiguity discovered mid-sprint |
| `superpowers:writing-plans` | Translating a sprint file into a concrete execution plan |
| `superpowers:executing-plans` | Driving a written plan task-by-task with review checkpoints |
| `superpowers:using-git-worktrees` | Long sprint that must not collide with other in-flight work |
| `superpowers:test-driven-development` | Every implementation task |
| `superpowers:systematic-debugging` | When a test fails for non-obvious reasons or behavior surprises you |
| `superpowers:verification-before-completion` | Before claiming any task or sprint done |
| `superpowers:requesting-code-review` | Before merging a sprint branch |
| `superpowers:receiving-code-review` | When reviewing feedback before applying it |
| `superpowers:finishing-a-development-branch` | After review passes, when picking merge / PR / cleanup |

## Reporting Done

A sprint is done only when:

1. Every `S<NN>-T<n>` task in the sprint file is implemented.
2. Every Acceptance Criterion in the sprint file is verified with evidence.
3. Every "Done Definition" bullet is verified with evidence.
4. Hard rules (H1-H17 above) are not violated.
5. Code review passes.
6. The sprint's exit branch merges cleanly into the integration branch.

Anything short of all six is **not** done. Report partial progress honestly and update the sprint file with what blocked you.
