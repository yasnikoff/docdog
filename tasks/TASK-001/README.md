---
id: TASK-001
title: "PROPOSAL-017 batch 1/4 — mirror EJ-001 through EJ-008 to DD-037..044"
collection: tasks
status: done
date: 2026-04-13
description: "First batch of 4 in the EJ→DD corpus refactor. Created DD-037..DD-044 as mirrors of EJ-001..EJ-008, flipped sources to `superseded` (see FRICTION-012 for the `retired` vocabulary collision that forced the reinterpretation), updated live inbound references in src/, .docdog/skills/, templates/skills/, and CONTRIBUTING.md. Produced OBS-008 (workflow-skill mismatch) and FRICTION-012 (AC vs vocabulary) as Phase 3 findings."
branch: task/task-001-ej-dd-batch-1
commit_hash: 4aad396
artifacts_path: tasks/TASK-001/
relationships:
  - part_of: FEATURE-001
  - implements: PROPOSAL-017
  - follows_workflow: WF-003
  - references: DD-037
    context: mirror-batch verification — search spot-check hit at 0.717
  - references: FRICTION-012
    context: the status-value deviation (superseded instead of the specified retired) is recorded there
  - references: DD-043
    context: mirror-batch verification — search spot-check hit at 0.708
  - references: TASK-002
    context: successor batch gated on this task's inter-batch sanity check
---

# TASK-001: Batch 1/4 — EJ-001..EJ-008

## Goal

Mirror the first 8 EJ decision records as DD-NNN records, flip each
EJ to `retired` with a `superseded_by` edge, and update inbound
references across the corpus. Deliver a single commit that WF-003
step 5 considers a reviewable batch.

## Target records (this batch)

- specs/decisions/ej-001.md
- specs/decisions/ej-002.md
- specs/decisions/ej-003.md
- specs/decisions/ej-004.md
- specs/decisions/ej-005.md
- specs/decisions/ej-006.md
- specs/decisions/ej-007.md
- specs/decisions/ej-008.md

## Acceptance criteria

- [x] 8 new `specs/decisions/dd-NNN-<slug>.md` files (DD-037..DD-044),
      each with a `supersedes: EJ-NNN` edge and current-status framing.
- [x] 8 source EJs updated: `status: superseded` (vocabulary-valid
      alternative to the originally-specified `retired` — see
      FRICTION-012), prose header pointing at the DD mirror. No
      `superseded_by` edge on the EJ side; the DD's `supersedes` edge
      carries it canonically.
- [x] Inbound references to EJ-001..EJ-008 across `specs/` and
      `.docdog/` updated to DD-NNN wherever doing so preserves
      historical meaning.
- [x] `docdog index` succeeds; `docdog collections check` returns
      zero net-new warnings.
- [x] `docdog search` on new DD keywords returns the DD record as a
      top hit (DD-037 at 0.717, DD-043 at 0.708 post-index).

## Context

Parent feature: FEATURE-001 (see `docdog search FEATURE-001`).
Workflow: WF-003 (see `.docdog/workflows/wf-003-docs-batch-rewrite.md`).
Driving proposal: PROPOSAL-017 (`specs/notes/proposal-017-*.md`).

## Notes

First batch intentionally gets the oldest records, which tend to be
more self-contained and less referenced. Use what you learn here to
refine the plan before batch 2. If any transform detail is ambiguous,
note it here and resolve it in a discussion before picking up
TASK-002.
