---
id: TASK-006
title: "FEATURE-002 batch 2/3 — flip 8 stale record statuses to their real state"
collection: tasks
status: done
date: 2026-07-11
commit_hash: "5277056"
description: "Status flips for work that finished without its record being closed: PROPOSAL-003 and PROPOSAL-019 to shipped, PROPOSAL-017 to implemented, PROPOSAL-010 to superseded (with PROPOSAL-024's references edge upgraded to supersedes), STATUS-ORCH-MIGRATION-2026-04-13 to obsolete, and OQ-18/OQ-19/OQ-21 to resolved with references edges to DD-070. Each record gets a dated status note and a description prefix carrying the verdict into search previews."
artifacts_path: tasks/TASK-006/
relationships:
  - part_of: FEATURE-002
  - follows_workflow: WF-003
  - references: OBS-011
    context: two of the eight flips (STATUS-ORCH, PROPOSAL-017) were flagged there as out-of-scope hygiene candidates — this batch is the follow-through
  - references: DD-070
    context: the resolution target for the three OQs — kernel 8 answers OQ-18, the v3 schema answers OQ-19, §4's gc answers OQ-21
  - references: PROPOSAL-024
    context: the superseder whose `references` edge to PROPOSAL-010 this batch upgraded to `supersedes` as part of the status flip
  - references: PROPOSAL-010
    context: flipped to `superseded` in this batch and spot-checked — its dated status note leads the search preview post-index
  - references: OQ-18
    context: "flipped to `resolved` with a `references: DD-070` edge and spot-checked — its status note leads the search preview post-index"
  - references: OQ-19
    context: "one of the open questions this task closes: its acceptance criteria give OQ-18/19/21 a `references: DD-070` edge with context, the kernel having answered them"
  - references: OQ-21
    context: "one of the open questions this task closes: its acceptance criteria give OQ-18/19/21 a `references: DD-070` edge with context, the kernel having answered them"
---

# TASK-006: Batch 2/3 — stale status flips

## Goal

Records whose subject shipped, was executed, or was replaced stop
claiming `proposed`/`planned`/`open`/`parked` status. See
FEATURE-002 for the per-record table and transform.

## Acceptance criteria

- [x] All 8 records carry the verdict status, a dated status note
      under the H1, and a description that leads with the verdict.
- [x] PROPOSAL-024 carries `supersedes: PROPOSAL-010`.
- [x] OQ-18/19/21 carry `references: DD-070` with context.
- [x] `docdog index` zero net-new warnings (10 reindexed, 60
      edges); spot-checks confirmed the status notes lead the
      search previews for PROPOSAL-010 and OQ-18.
