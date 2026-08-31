---
id: TASK-002
title: "PROPOSAL-017 batch 2/4 — mirror EJ-009 through EJ-016 to DD-045..052"
collection: tasks
status: done
date: 2026-04-13
description: "Second batch of 4 in the EJ→DD docs batch rewrite. Created DD-045..DD-052 as mirrors of EJ-009..EJ-016, flipped EJ-009..EJ-015 to `status: superseded` (EJ-016 was already superseded by EJ-022 and left as-is — DD-052 mirrors it as historical), updated live inbound references across `src/`, `.docdog/skills/`, and `templates/skills/`. Zero net-new warnings from `docdog collections check`."
branch: task/task-002-ej-dd-batch-2
commit_hash: 066ea95
artifacts_path: tasks/TASK-002/
relationships:
  - part_of: FEATURE-001
  - implements: PROPOSAL-017
  - follows_workflow: WF-003
  - references: EJ-016
    context: the batch anomaly — left unflipped because already superseded by EJ-022
  - references: TASK-001
    context: predecessor batch and checklist template — same transform applied
  - references: DD-045
    context: mirror-batch verification — search spot-check hit at 0.657
  - references: DD-052
    context: EJ-016's historical mirror, flagged to gain the chain link once batch 3 shipped
  - references: EJ-022
    context: the pre-existing superseder of EJ-016 whose DD form batch 3 would deliver
  - references: DD-050
    context: mirror-batch verification — search spot-check hit at 0.580
  - references: DISC-013
    context: the unchecked-checklist gap captured as input to the task-lifecycle discussion
---

# TASK-002: Batch 2/4 — EJ-009..EJ-016

## Goal

Second batch of 8 EJ records. Same transform as TASK-001, applied to
EJ-009..EJ-016. Must not start until TASK-001 is `done` and the
inter-batch sanity check (WF-003 step 6) has passed.

## Target records (this batch)

- specs/decisions/ej-009.md through ej-016.md (8 records)

## Acceptance criteria

Same shape as TASK-001. See that record for the detailed checklist
— do not duplicate here.

- [x] 8 DD mirrors created (DD-045..DD-052) with `supersedes: EJ-NNN`.
- [x] EJ-009..EJ-015 flipped to `status: superseded` with a prose
      pointer at the DD mirror. EJ-016 left as-is because it was
      already superseded by EJ-022; DD-052 mirrors it as a historical
      record and will gain a `superseded_by` link to the DD form of
      EJ-022 once batch 3 ships that mirror.
- [x] Live inbound references migrated in `src/engine/indexer.ts`,
      `src/engine/embedder.ts`, `src/arango/gc.ts`,
      `src/arango/collections.ts`, `src/mcp/server.ts`,
      `.docdog/skills/architect.md`, `templates/skills/workflow/architect.md`.
- [x] `npm run build` clean; `docdog index` green;
      `docdog collections check` reports the same 1 pre-existing
      warning (EJ-016's `superseded_by` field predates this session) —
      zero net-new.
- [x] `docdog search "glossary terms graph vertices"` returns DD-045
      at 0.657 as top hit; `docdog search "git optional three tier
      ladder"` returns DD-050 at 0.580.

## Context

Prerequisites: TASK-001 shipped and verified. If TASK-001 surfaced
any plan revisions, apply them before starting this batch.

## Post-batch note on AC discipline

TASK-001 and (initially) TASK-002 were both marked `status: done`
without ticking the AC checkboxes — the batch had satisfied the
criteria but the artifact itself didn't record that fact.
Captured as an input to DISC-013 on task-lifecycle workflow
mechanics (where the checkoff step belongs).
