---
id: TASK-003
title: "PROPOSAL-017 batch 3/4 — mirror EJ-017 through EJ-024 to DD-053..060"
collection: tasks
status: done
date: 2026-04-13
description: "Third batch of 4 in the EJ→DD docs batch rewrite. Created DD-053..DD-060 as mirrors of EJ-017..EJ-024. Closed the historical chain DD-052 → DD-058 (EJ-022's DD mirror) that was left pending in batch 2. EJ-022's pre-existing top-level `supersedes: EJ-016` field was promoted into `relationships:` so the edge routes to the registered temporal collection. Live inbound references in `src/types/`, `src/arango/`, `src/engine/`, and `CONTRIBUTING.md` migrated. Zero net-new warnings."
branch: task/task-003-ej-dd-batch-3
commit_hash: 7d3e8b2
artifacts_path: tasks/TASK-003/
relationships:
  - part_of: FEATURE-001
  - implements: PROPOSAL-017
  - follows_workflow: WF-003
  - references: TASK-001
    context: prerequisite and checklist template
  - references: TASK-002
    context: prerequisite batch
  - references: DD-053
    context: mirror-batch verification — search spot-check hit at 0.640
  - references: EJ-022
    context: its top-level supersedes field normalized into the relationships block
  - references: EJ-016
    context: the historical chain EJ-016→EJ-022→DD-058 closed and mirrored as DD-052→DD-058
  - references: DD-052
    context: edited to reference DD-058, closing the mirrored historical chain
  - references: DD-058
    context: chain target; verification spot-check hit at 0.721
---

# TASK-003: Batch 3/4 — EJ-017..EJ-024

## Goal

Third batch of 8 EJ records. Prerequisites: TASK-001 and TASK-002
shipped and verified.

## Target records (this batch)

- specs/decisions/ej-017.md through ej-024.md (8 records)

## Acceptance criteria

Same shape as TASK-001. See that record for the detailed checklist.

- [x] 8 DD mirrors created (DD-053..DD-060) with `supersedes: EJ-NNN`.
- [x] EJ-017..EJ-024 flipped to `status: superseded` with prose
      pointers at their DD mirrors. EJ-022's top-level `supersedes:
      EJ-016` was moved into its `relationships:` block.
- [x] DD-052 updated to reference DD-058 (closes the historical
      link chain EJ-016 → EJ-022 → DD-058, mirrored as DD-052 → DD-058).
- [x] Live inbound references migrated in `CONTRIBUTING.md`,
      `src/types/graph.ts`, `src/types/config.ts`, `src/arango/setup.ts`,
      `src/arango/queries.ts`, `src/arango/client.ts`,
      `src/engine/indexer.ts`, `src/engine/ingest.ts`,
      `src/engine/parsers/default.ts`.
- [x] `npm run build` clean; `docdog index` green;
      `docdog collections check` reports the same 1 pre-existing
      warning — zero net-new.
- [x] `docdog search "single database scope per-document"` returns
      DD-058 at 0.721 top; `docdog search "section per file flat
      layout"` returns DD-053 at 0.640 top.

## Context

This batch is where the first reconciliations records are most
likely to surface: the mid-teens EJs (020-025 range) are the
collections + indexer era and have the densest inbound reference
graph. Budget extra time for reference updates.
