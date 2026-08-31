---
id: OBS-007
title: "First run of the workflow template on the self-hosted repo — Phases 0, 1, 2"
collection: observations
status: current
date: 2026-04-13
commit_hash: 3a372e053a7bf0e6c7c190d19e7f55171e0ebcf7
description: "End-to-end experience transitioning the self-hosted repo from `template: structured` to `template: workflow`, capturing three established flows as workflow artifacts, and seeding FEATURE-001 + TASK-001..004 for PROPOSAL-017. Three findings, two are friction, one is a validation."
relationships:
  - references: DD-036
  - references: WF-001
  - references: WF-002
  - references: WF-003
  - references: FRICTION-011
  - references: PROPOSAL-017
  - references: DISC-012
    context: WF-003's rename from corpus-batch-refactor traces to this discussion
  - references: FEATURE-001
    context: seeded in Phase 2 and traverse-verified — the 4-task contains fan-out surfaced immediately
  - references: TASK-001
    context: TASK-001..004 seeded as the first WF-003 instantiation
  - references: DD-034
    context: in the verified traverse chain and in the frontmatter-to-edges gap this run exposed
  - references: OBS-001
    context: traverse-chain verification hit from WF-001
  - references: DISC-011
    context: traverse-chain verification hit from WF-001
  - references: PROPOSAL-012
    context: the v1 scaffold-a-discussion idea resurfaced as a related search hit during the run
  - references: EJ-033
    context: the DB-first features rule WF-003 step 1 collided with — two gaps hit immediately
  - references: DD-035
    context: example-workflow-seed predates DD-035's location rule — drift recorded as minor friction
---

# OBS-007: Workflow template first run

## Context

The 2026-04-13 session transitioned this repo onto the workflow
template end-to-end across three phases:

- **Phase 0** (`ee89ada`): flip `template: structured` → `workflow`
  in `.docdog/config.yaml`, re-run `docdog init --template
  workflow`, let `setupCollections` create the 5 new Arango
  collections (features, tasks, workflows, reconciliations,
  conversations), pick up 9 workflow skills + 2 scripts.
- **Phase 1** (`3a372e0`): capture three established flows as
  first-class workflow artifacts (WF-001 discussion capture,
  WF-002 dual-track dogfooding, WF-003 docs batch rewrite — originally captured as "corpus batch refactor", renamed per DISC-012);
  shrink `.claude/CLAUDE.md` to pointers; DD-036 captures the
  model.
- **Phase 2** (this commit): seed FEATURE-001 (EJ→DD refactor)
  and TASK-001..004 (4 batches) as the first instantiation of
  WF-003. Stop before actually running batch 1, so Phase 3 can
  focus on the code-loop skills against a pre-seeded plan.

## Findings

### 1. Validation — the workflow artifacts survive retrieval

Immediately after Phase 1 landed, `docdog search "discussion
capture workflow"` returned `WF-001` at vector=0.651 as the top
hit. `docdog search "batch refactor corpus"` → `WF-003` at 0.645.
`docdog search "dual track dogfooding"` → `WF-002` at 0.646.
Each workflow also materialized 3-4 outbound edges from its
`relationships:` block, so `docdog traverse WF-001` follows
cleanly through to DD-036, DD-034, OBS-001, DISC-011.

This is the thing DD-036 promised: a process doc is retrievable
by keyword, by vector search, and by graph traversal in ways a
CLAUDE.md prose section is not. The PROPOSAL-012 "scaffold a
discussion record" idea from v1 surfaced as a related hit under
WF-001 without any explicit linking — a result grep could not
have produced. That's the first retrieval win I can point at
that was impossible before Phase 1.

### 2. Friction — no CLI surface for DB-first vertices (→ FRICTION-011)

WF-003 step 1 says *"create a FEATURE-NNN in the features
collection."* EJ-033 says features are DB-first, created via
`docdog_create`. Two gaps hit immediately:

- **No CLI verb.** `docdog_create` lives only in the MCP server.
  A shell session — or an agent session that doesn't have docdog
  configured as an MCP server — has no path to call it.
  Workaround: write a one-off `.docdog/scripts/seed-feature-017.js`
  that uses `ctx.db` directly.
- **Script-path edge materialization is absent.** The seed
  script's vertex carries `frontmatter.relationships` with
  `implements: PROPOSAL-017`, `follows_workflow: WF-003`,
  `references: DD-034`, `references: DD-036`. None of those
  became graph edges because the frontmatter→edges pipeline only
  runs over disk-sourced sections during `docdog index`.
  `docdog traverse FEATURE-001` shows only the *inbound*
  `contains` edges from the task READMEs — which were
  disk-indexed normally and therefore got the full edge
  treatment.

Detail and proposed fix in FRICTION-011. The workaround was
fine for a dogfooding run but the gap is real: the shipped
workflow skills (start-task, finalize-task) call `docdog_create`
as if it were universally available, and it isn't.

### 3. Friction (minor) — `example-workflow-seed.md` predates DD-035

`.docdog/skills/example-workflow-seed.md` (shipped by the
workflow template) instructs users to copy workflow docs to
`specs/workflows/`. Under DD-035, docdog-native workflows belong
in `.docdog/workflows/` per the split rule. The seed is stale by
exactly one decision. Not a blocker — users who hit it during
the orchestrator bootstrap will either ignore it (the instruction
still works mechanically) or catch the drift via DD-035 search.
Worth a small update in a later shipped-seed cleanup pass.

### 4. Finding — `conversations` vs `discussions` semantic overlap

The workflow template ships `conversations` as a shipped
collection with the description *"raw or lightly-structured chat
transcripts worth keeping as working context."* This repo has
`discussions` as a user extension with description *"Captured
design conversations (DISC-NNN)."* Both cover chat-derived
content; the line between them is fuzzy. Not blocking Phase 2,
but when PROPOSAL-017 or a later session needs to pick where a
new DISC record lives, the answer is non-obvious. Worth a
DISC-NNN discussion before the orchestrator bootstrap, since
orchestrator will inherit the same ambiguity on day one.

## Retrieval quality during Phases 0-2

Dual-track dogfooding (WF-002) was applied throughout:

- Multiple `docdog search` calls to verify post-index state
  before and after each phase. All returned expected results.
- `docdog traverse FEATURE-001` immediately surfaced the 4-task
  contains fan-out, confirming the task README `part_of` edges
  materialized correctly.
- `docdog collections describe workflows` gave the status
  vocabulary I needed to choose `status: current` for each
  WF-NNN without guessing.
- `docdog collections check` ran after every phase; zero
  warnings across all three.

The one thing grep would have done better: nothing. The workflow
template's shipped metadata (status vocabularies, relation type
inverses, collection descriptions) is only reachable via the
`docdog collections` / `docdog relations` surface, not via
filesystem scan. The dual-track exercise in this session felt
more like "grep for file paths, docdog for semantic metadata"
than "grep AND docdog for the same thing."

## What didn't happen

Phase 3 (actually running batch 1 through the workflow skills)
did not happen in this session. The feature + tasks are seeded
and ready for the next session to pick up. Expect Phase 3 to
surface a fourth finding: the shipped code-loop skills
(architect, coder, reviewer) are written for software work, but
PROPOSAL-017 is a spec refactor. The mismatch is deliberate —
Phase 3's job is to find out how much friction the skills
generate when applied to non-code work.

## Token / cost commentary

No estimate. The session ran in one continuous conversation so
any "how much context did docdog save" number would be guessed.
A better experiment: run Phase 3 in a fresh session, give the
agent only the task ID, and see how long it takes to pick up
the full context via docdog retrieval alone. That's the real
benchmark and it should wait for Phase 3.
