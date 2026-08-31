---
id: TASK-004
title: "PROPOSAL-017 batch 4/4 — mirror EJ-025 through EJ-033 to DD-061..069"
collection: tasks
status: done
date: 2026-04-13
description: "Final batch of 4 in the EJ→DD docs batch rewrite. Created DD-061..DD-069 as mirrors of EJ-025..EJ-033. DD-066 (EJ-030's mirror) explicitly references DD-034 and DD-035, documents the superseded test clause, and surfaces the DISC-013 tension on workflow-engine primitives. DD-061 sharpens EJ-025 against current reality (three templates: minimal/structured/workflow). FEATURE-001 shipped via `docdog run ship-feature-017 <sha>` post-commit (DB-first — the ship state is a pure-DB mutation, not a file change)."
branch: task/task-004-ej-dd-batch-4
commit_hash: 4ae4e35
artifacts_path: tasks/TASK-004/
relationships:
  - part_of: FEATURE-001
  - implements: PROPOSAL-017
  - follows_workflow: WF-003
  - references: EJ-033
    context: named batch highlight — features DB-first plus templates-user-owned
  - references: EJ-030
    context: named batch highlight — its mirror must acknowledge the DD-034/DD-035 reframe lineage explicitly
  - references: DD-034
    context: DD-066's mandated lineage reference — documents how it superseded the delete-every-skill test
  - references: DD-035
    context: DD-066's mandated lineage reference
  - references: TASK-001
    context: prerequisite and checklist template
  - references: DD-066
    context: the batch's most consequential deliverable — EJ-030's mirror with explicit lineage
  - references: DISC-013
    context: DD-066 required to note the workflow-primitives tension tracked there
  - references: EJ-016
    context: the deferred superseded_by cleanup this batch left open — resolved 2026-04-13
  - references: WF-004
    context: the deferred cleanup landed via the WF-004 code-loop (commit 97798d0)
  - references: DD-052
    context: historical chain endpoint after the top-level field retirement
  - references: DD-058
    context: historical chain endpoint after the top-level field retirement
  - references: TASK-002
    context: prerequisite batch — TASK-004 requires TASK-001/002/003 shipped and verified before its EJ→DD range is rewritten
  - references: TASK-003
    context: prerequisite batch — TASK-004 requires TASK-001/002/003 shipped and verified before its EJ→DD range is rewritten
---

# TASK-004: Batch 4/4 — EJ-025..EJ-033

## Goal

Final batch — 9 records including EJ-030 (ejection resilience) and
EJ-033 (features DB-first + templates are user-owned). EJ-030 has
already been effectively reframed by DD-034/DD-035; its DD mirror
should acknowledge that lineage explicitly rather than re-state the
reframe. Prerequisites: TASK-001/002/003 shipped and verified.

## Target records (this batch)

- specs/decisions/ej-025.md through ej-033.md (9 records)

## Acceptance criteria

Same shape as TASK-001. Additionally:

- [x] DD mirror of EJ-030 (DD-066) explicitly references DD-034 and
      DD-035 in its body and `relationships:`, documents how DD-034
      superseded the original "delete every skill" test, and notes
      the DISC-013 tension on workflow-engine primitives.
- [x] FEATURE-001 flipped to `shipped` with `commit_hash` stamped
      via `docdog run ship-feature-017 <sha>` (DB-first state
      change — no file delta, the ship commit is batch 4's own).
- [x] Final `docdog collections check` returns zero net-new
      warnings from PROPOSAL-017. The one pre-existing warning
      this batch left open (`superseded_by` top-level field on
      the pre-superseded EJ-016) was the deferred follow-up
      below; it has since been resolved — the field was removed
      from EJ-016 on 2026-04-13 and the zero-warning corpus was
      achieved in commit `97798d0` (WF-004 code-loop). The
      historical chain now routes through the `supersedes` edges
      on DD-052 and DD-058 instead of the retired top-level field.

## Context

Last batch. After this ships, PROPOSAL-017 should be flipped to
`accepted`/`shipped` and the feature closed. If any reconciliation
records were produced along the way, triage them and decide whether
to address them in a follow-up or leave them open for a later pass.
