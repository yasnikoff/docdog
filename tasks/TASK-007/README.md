---
id: TASK-007
title: "FEATURE-002 batch 3/3 — close 14 records whose premise died at the v3 pivot"
collection: tasks
status: done
date: 2026-07-11
commit_hash: b79cb0e
description: "Closures for the v2-era cohort left open/proposed/planned after DD-070: six dead command-tree/Arango proposals plus API-IMPROVEMENT-001 to superseded, PROPOSAL-020 to shipped (its navigate-specs + specs factoring survived; only /backport died), OQ-25/26/33/45 to obsolete plus OQ-27/28 caught by the between-batch census (scope amendment — the original grep missed status: planned), DISC-014/015 to resolved. PROPOSAL-025 and PROPOSAL-026 gain supersedes edges to PROPOSAL-006. Each record gets a dated closure note naming what replaced or mooted it."
artifacts_path: tasks/TASK-007/
relationships:
  - part_of: FEATURE-002
  - follows_workflow: WF-003
  - references: DD-070
    context: the pivot that defines the closure test — meaningful only against Arango/v2 architecture or the deleted command trees
  - references: PROPOSAL-025
    context: gains supersedes edge to PROPOSAL-006 — the relations half of the concepts replacement
  - references: PROPOSAL-026
    context: gains supersedes edge to PROPOSAL-006 — the collections half
  - references: PROPOSAL-006
    context: the dead meta-collections proposal this batch closed — PROPOSAL-025 and PROPOSAL-026 gained the `supersedes` edges pointing at it
---

# TASK-007: Batch 3/3 — v3-pivot closures

## Goal

No record left claiming `open`/`proposed` when its premise
(Arango, db-first writes, deleted command trees, the v2
orchestrator-sidecar plan) no longer exists. See FEATURE-002 for
the per-record table and transform.

## Acceptance criteria

- [x] All 16 records (14 frozen + OQ-27/28 by scope amendment)
      carry the verdict status, a dated closure note under the H1
      naming the replacement (with ids), and a description that
      leads with the verdict.
- [x] PROPOSAL-025 and PROPOSAL-026 each carry
      `supersedes: PROPOSAL-006` with context.
- [x] `docdog index` zero net-new warnings.
- [ ] FEATURE-002 flipped to `shipped` in the finalize commit once
      this batch verifies clean.
