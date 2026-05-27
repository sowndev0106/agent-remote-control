# Phase 1 Scope And Sprint Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the planning docs consistent by splitting Phase 1 into a CDP MVP layer and an extended Antigravity layer, while moving security/API contracts earlier.

**Architecture:** This is a documentation-only change. Requirements remain the source of truth; architecture, frontend design, and sprint plans are updated to match the new Phase 1A/1B language and corrected technical assumptions.

**Tech Stack:** Markdown documentation in `docs/`, no source code.

---

### Task 1: Update Product Requirements Scope

**Files:**
- Modify: `docs/REQUIEMENT.md`

- [ ] **Step 1: Split Phase 1 scope language**

Add explicit `Phase 1A - CDP MVP` and `Phase 1B - Extended Antigravity` subsections under `## Phase 1 Scope: Antigravity Complete`.

- [ ] **Step 2: Update completion language**

Replace wording that says Phase 1 is complete only after all control surfaces with wording that says Phase 1A is the first shippable checkpoint and full Phase 1 requires 1A plus 1B.

- [ ] **Step 3: Update milestones and trace**

Adjust delivery milestones and requirement trace to show 1A critical path and 1B continuation.

- [ ] **Step 4: Verify no full-Phase-1 MUST requirement is described as cuttable**

Run: `rg -n "cut|drop|defer|Phase 1A|Phase 1B|complete" docs/REQUIEMENT.md`

Expected: Phase 1B items may be deferred from 1A, but not removed from full Phase 1.

### Task 2: Update Architecture Assumptions

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Add Phase 1A/1B delivery model**

Update status, scope, and process sections to distinguish 1A and 1B.

- [ ] **Step 2: Correct IPC security**

Replace claims that Node.js `net` exposes `SO_PEERCRED` with a safer design:
`0700` config directory, `0600` socket path where possible, registration nonce,
and native helper/addon only if stronger peer credentials are needed.

- [ ] **Step 3: Fix auth and REST surface drift**

Remove `/logout` from unauthenticated exceptions and collapse stop endpoints to a single canonical endpoint.

- [ ] **Step 4: Clarify discovery API**

Document optional project context for `listDiscoveredSessions(project?)`.

- [ ] **Step 5: Verify architecture no longer includes known wrong assumptions**

Run: `rg -n "SO_PEERCRED|/logout|stop-generation|listDiscoveredSessions" docs/architecture.md`

Expected: `SO_PEERCRED` only appears as native-helper optional work; `/logout` is authenticated; `stop-generation` is absent.

### Task 3: Update Sprint Plan Index

**Files:**
- Modify: `docs/sprints/README.md`

- [ ] **Step 1: Mark 1A and 1B in overview**

Add a phase column or notes that place Sprint 01-04 on the 1A path and Sprint 05-08 on the 1B/final hardening path.

- [ ] **Step 2: Rewrite execution order**

Make 1A release order explicit: Sprint 01 -> 02 -> 03 -> 04. Make Sprint 05-08 full Phase 1 continuation.

- [ ] **Step 3: Rewrite cutting scope**

State that Sprint 07 and wrapper can be cut only from Phase 1A, not from full Phase 1.

- [ ] **Step 4: Verify no contradictory cutting language remains**

Run: `rg -n "cut|drop|defer|Phase 1A|Phase 1B|cannot" docs/sprints/README.md`

Expected: full Phase 1 still requires all 1B requirements.

### Task 4: Move Cross-Cutting Contract Work Earlier

**Files:**
- Modify: `docs/sprints/sprint-01-runtime-auth.md`
- Modify: `docs/sprints/sprint-03-antigravity-cdp.md`
- Modify: `docs/sprints/sprint-04-workspace-ui.md`
- Modify: `docs/sprints/sprint-08-realtime-persistence-hardening.md`

- [ ] **Step 1: Sprint 01**

Add normalized envelope helper, route auth allowlist test, and atomic persistence as baseline deliverables/tasks.

- [ ] **Step 2: Sprint 03**

Add CDP preflight task, realtime event catalog before WS emissions, and action ID audit in the CDP sprint.

- [ ] **Step 3: Sprint 04**

Require frontend API/WS clients to consume the canonical envelope and server-issued action IDs only.

- [ ] **Step 4: Sprint 08**

Reframe Sprint 08 as final re-audit, not first implementation of contracts.

- [ ] **Step 5: Verify contract tasks are present before Sprint 08**

Run: `rg -n "envelope|allowlist|atomic|event catalog|preflight|action ID audit|first implementation|re-audit" docs/sprints`

Expected: baseline tasks appear in Sprint 01/03/04; Sprint 08 is final audit.

### Task 5: Fix Extended Surface Details

**Files:**
- Modify: `docs/sprints/sprint-05-pty-wrapper.md`
- Modify: `docs/sprints/sprint-06-terminal-files.md`
- Modify: `docs/design-frontend.md`

- [ ] **Step 1: Sprint 05 IPC**

Update IPC security to use socket permissions plus registration nonce, with peer UID as optional native helper work.

- [ ] **Step 2: Sprint 06 terminal boundary**

Clarify generic browser terminal sessions do not auto-register Antigravity sessions unless Sprint 05 explicitly adds that launch path.

- [ ] **Step 3: Frontend design**

Add Phase 1A/1B language so UI placeholders for extended surfaces do not block the CDP MVP.

- [ ] **Step 4: Verify wording**

Run: `rg -n "Phase 1A|Phase 1B|SO_PEERCRED|auto-register|generic terminal|managed PTY" docs/sprints/sprint-05-pty-wrapper.md docs/sprints/sprint-06-terminal-files.md docs/design-frontend.md`

Expected: extended surfaces are clear, and Node peer credential assumptions are removed.

### Task 6: Final Consistency Review

**Files:**
- Review: `docs/REQUIEMENT.md`
- Review: `docs/architecture.md`
- Review: `docs/design-frontend.md`
- Review: `docs/sprints/*.md`

- [ ] **Step 1: Search for contradictions**

Run: `rg -n "Phase 1 MUST|Phase 1A|Phase 1B|cut|drop|defer|/logout|SO_PEERCRED|stop-generation|stop\\b" docs/REQUIEMENT.md docs/architecture.md docs/design-frontend.md docs/sprints`

Expected: no full Phase 1 requirement is described as cuttable; no bad auth/IPC/API assumptions remain.

- [ ] **Step 2: Check git diff**

Run: `git diff -- docs/REQUIEMENT.md docs/architecture.md docs/design-frontend.md docs/sprints docs/superpowers/plans/2026-05-27-phase-1-scope-and-sprint-fix.md`

Expected: only documentation changes aligned with the approved design.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/REQUIEMENT.md docs/architecture.md docs/design-frontend.md docs/sprints docs/superpowers/plans/2026-05-27-phase-1-scope-and-sprint-fix.md
git commit -m "docs: align phase scope and sprint plan"
```

Expected: one documentation commit.
