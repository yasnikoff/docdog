---
id: FEATURE-002
title: "Corpus staleness sweep — delete v1 docs/, fix guidance surfaces, close v3-pivot-obsoleted records"
collection: features
status: shipped
date: 2026-07-11
shipped_at: 2026-07-11
commit_hash: b79cb0e
description: "Second instantiation of WF-003, shipped same day in three batches (b19a96b, 5277056, b79cb0e). Removed the v1-era docs/ folder and stale v1 slash commands from tracking (git history is the archive), untracked .idea/, fixed the dead CLI commands still instructed by WF-002/WF-003, and corrected the status of 24 records the v3 pivot left claiming currency — 8 flips for shipped/executed work, 16 closures where the premise died with Arango/v2 (OQ-27/28 added by scope amendment at batch-3 verification — see OBS-012). Every closure carries a dated body note naming what replaced it."
relationships:
  - sourced_from: DISC-024
    context: the sweep discussion that froze this scope — user-ratified verdicts, one per record
  - follows_workflow: WF-003
  - references: DD-070
    context: the pivot that defines "dead" — anything only meaningful against the Arango/v2 architecture or the deleted command trees
  - references: DD-071
    context: the publication boundary served by batch 1 — tracked v1 docs and IDE config must not reach the fresh public cut
  - references: TASK-005
    context: batch 1/3 — guidance surfaces + repo hygiene
  - references: TASK-006
    context: batch 2/3 — stale status flips with supersession edges
  - references: TASK-007
    context: batch 3/3 — v3-pivot closures
  - references: FEATURE-001
    context: the first WF-003 instantiation, contrasted here — a rename propagated across a uniform cohort, where this sweep is per-record judgment frozen at planning time
  - references: WF-002
    context: batch 1 target — its step 2 still instructed commands that died at v3 step 6; rewritten to `docdog_get` + concepts-record lookups
  - references: PROPOSAL-003
    context: batch 2 flip — proposed → shipped, it is the shipped v3 relationships mechanism
  - references: PROPOSAL-019
    context: batch 2 flip — proposed → shipped, `docdog skill install` exists (DD-070 §4)
  - references: PROPOSAL-010
    context: batch 2 flip — proposed → superseded, because PROPOSAL-024 re-implements it
  - references: PROPOSAL-024
    context: successor acted on in batch 2 — the sweep upgraded its edge to PROPOSAL-010 to `supersedes` since it re-implements the suggest-edges proposal
  - references: PROPOSAL-017
    context: batch 2 flip — planned → implemented, executed via FEATURE-001 and its four tasks
  - references: STATUS-ORCH-MIGRATION-2026-04-13
    context: batch 2 flip — parked → obsolete, the v2 migration steps are dead and superseded by the orchestrator-repo adoption plan
  - references: OQ-18
    context: batch 2 flip — open → resolved, kernel 8 is the answer; also one of the spot-checks verifying flipped status is retrievable
  - references: OQ-19
    context: batch 2 flip — open → resolved, the v3 SQLite vertex schema is the answer
  - references: OQ-21
    context: batch 2 flip — open → resolved, `docdog gc` is the answer
  - references: PROPOSAL-002
    context: "batch 3 closure — superseded: command trees are dead, the v3 move is edit frontmatter + reindex"
  - references: PROPOSAL-005
    context: "batch 3 closure — superseded: dd_code_refs died with v2, its nearest living relative is suggest-edges"
  - references: PROPOSAL-006
    context: "batch 3 closure — superseded: concepts records replaced the meta collections, with the supersession edges added on PROPOSAL-025/026"
  - references: PROPOSAL-025
    context: successor acted on in batch 3 — the sweep added its `supersedes` edge onto PROPOSAL-006 when concepts records replaced the meta collections
  - references: PROPOSAL-008
    context: "batch 3 closure — superseded: the traverse CLI died, `docdog_traverse` MCP is the surface"
  - references: PROPOSAL-009
    context: "batch 3 closure — superseded: the recent CLI died at v3 step 6"
  - references: PROPOSAL-012
    context: "batch 3 closure — superseded: the discuss command tree is dead, WF-001 + `docdog_create` cover capture"
  - references: PROPOSAL-020
    context: "batch 3 flip — marked shipped: navigate-specs + specs shipped in v3, only `/backport` died"
  - references: API-IMPROVEMENT-001
    context: "batch 3 closure — superseded: v3 rebuilds the disposable cache from disk, so the reconcile problem dissolved"
  - references: OQ-25
    context: "batch 3 closure — obsolete: the Arango UI is gone"
  - references: OQ-26
    context: "batch 3 closure — obsolete: dd_patches never returned, the config vestige was noted instead"
  - references: OQ-33
    context: "batch 3 closure — obsolete: the db-first write path died, storage is disk-canonical by design"
  - references: OQ-45
    context: "batch 3 closure — obsolete: v3 retirement of a record is deleting the file"
  - references: DISC-014
    context: batch 3 closure — resolved, superseded by the v3 adoption plan (PLAN-DOCDOG-001, D1–D6)
  - references: DISC-015
    context: "batch 3 closure — resolved-against: workflows stayed documents"
  - references: OQ-27
    context: "batch 3 closure added by scope amendment — obsolete: dd_conversations/docdog_capture died, the value shipped as WF-001 DISC capture"
  - references: OQ-28
    context: "batch 3 closure added by scope amendment — obsolete: dd_discussions died with its dd_conversations companion"
  - references: PROPOSAL-026
    context: the collection-vocabulary half of the seeding pair whose supersession of PROPOSAL-006 this sweep routed (PROPOSAL-025/026 → PROPOSAL-006); the roster names both, and PROPOSAL-025 is already declared
---

# FEATURE-002: Corpus staleness sweep

Instantiates WF-003 for the DISC-024 staleness sweep. Unlike
FEATURE-001 (a rename propagated across a uniform cohort), this
transform is per-record judgment frozen at planning time: each
target below carries its verdict, and execution is applying the
verdict plus a one-line closure note.

## Acceptance criteria

- [x] `git ls-files docs/` is empty; `docs/discussion.md` still on
      disk, untracked (DD-071 amendment intact).
- [x] `.claude/commands/design.md` and `discuss.md` deleted;
      `.claude/CLAUDE.md` no longer describes docs/ as on-disk
      reference material.
- [x] `.idea/` untracked and gitignored.
- [x] WF-002/WF-003 instruct only commands and tools that exist in
      v3 (DD-070 §4 CLI + kernel 8 MCP).
- [x] All 24 target records (22 frozen — the original description
      miscounted them as 21 — plus OQ-27/28 by scope amendment)
      carry their verdict status, a dated closure/status note, and
      updated descriptions;
      supersession routed via `supersedes` edges on successors
      (PROPOSAL-024 → PROPOSAL-010, PROPOSAL-025/026 →
      PROPOSAL-006).
- [x] `docdog index` reports zero net-new warnings after each batch;
      spot-check searches retrieve flipped records with their new
      status visible (verified on PROPOSAL-010, OQ-18).

## Target set (frozen)

### Batch 1 — TASK-005: guidance surfaces + repo hygiene

| Target | Action |
|---|---|
| `docs/` (21 tracked v1 files) | `git rm -r` — history is the archive |
| `.claude/commands/design.md`, `discuss.md` | `git rm` — v1 process writing into docs/ |
| `.claude/CLAUDE.md` | rewrite the "Historical" docs-layout block |
| `.idea/` | `git rm -r --cached` + gitignore entry |
| WF-002 step 2 | drop `docdog_concepts_search`, `docdog relations list`, `docdog collections describe`; add `docdog_get` + concepts-record lookups |
| WF-003 step 5 | `docdog collections check` → `docdog index` zero-net-new-warnings gate |

### Batch 2 — TASK-006: stale status flips

| Record | From → to | Why |
|---|---|---|
| PROPOSAL-003 | proposed → shipped | the shipped v3 relationships mechanism |
| PROPOSAL-019 | proposed → shipped | `docdog skill install` exists (DD-070 §4) |
| PROPOSAL-010 | proposed → superseded | PROPOSAL-024 re-implements it; upgrade P-024's edge to `supersedes` |
| PROPOSAL-017 | planned → implemented | executed via FEATURE-001 / TASK-001..004 |
| STATUS-ORCH-MIGRATION-2026-04-13 | parked → obsolete | v2 steps dead; superseded by PLAN-DOCDOG-001 (orchestrator repo) |
| OQ-18 | open → resolved | kernel 8 is the answer |
| OQ-19 | open → resolved | v3 SQLite vertex schema is the answer |
| OQ-21 | open → resolved | v3 `docdog gc` is the answer |

### Batch 3 — TASK-007: v3-pivot closures

| Record | To | Why |
|---|---|---|
| PROPOSAL-002 | superseded | command trees dead; v3 move = edit frontmatter + reindex |
| PROPOSAL-005 | superseded | dd_code_refs died with v2; nearest living relative is suggest-edges |
| PROPOSAL-006 | superseded | concepts records replaced meta collections; edges added on PROPOSAL-025/026 |
| PROPOSAL-008 | superseded | traverse CLI died; `docdog_traverse` MCP is the surface |
| PROPOSAL-009 | superseded | recent CLI died at v3 step 6 |
| PROPOSAL-012 | superseded | discuss command tree dead; WF-001 + `docdog_create` cover capture |
| PROPOSAL-020 | shipped | navigate-specs + specs shipped in v3; only `/backport` died (with PROPOSAL-021) |
| API-IMPROVEMENT-001 | superseded | v3 rebuilds the disposable cache from disk — the reconcile problem dissolved |
| OQ-25 | obsolete | Arango UI is gone |
| OQ-26 | obsolete | dd_patches never returned; config vestige noted |
| OQ-33 | obsolete | db-first write path (OQ-32) died; disk-canonical by design |
| OQ-45 | obsolete | PROPOSAL-018 superseded; v3 retirement = delete the file |
| DISC-014 | resolved | superseded by the v3 adoption plan (PLAN-DOCDOG-001, D1–D6) |
| DISC-015 | resolved | resolved-against; workflows stayed documents (DD-036), P-018 superseded |
| OQ-27 | obsolete | *scope amendment, WF-003 step 6* — dd_conversations/docdog_capture died; the value shipped as WF-001's DISC capture |
| OQ-28 | obsolete | *scope amendment, WF-003 step 6* — dd_discussions died with its dd_conversations companion |

**Scope amendment (batch 3 verification):** the original sweep grep
missed `status: planned` as a stale-status value; the between-batch
census (WF-003 step 6) caught OQ-27/OQ-28 and they were closed in
batch 3 rather than deferred.

## Transform (per record, batches 2–3)

1. Flip `status:` to the verdict value.
2. Prepend the verdict to `description:` (search preview must carry
   it) while keeping the original substance.
3. Add a dated **Status note (2026-07-11)** block right under the H1
   naming what shipped/superseded/mooted it, with ids.
4. Add supersession edges on successors where named above; add
   `references: DD-070` on the three resolved OQs.
5. Never rewrite historical body content.

## Batch partition

- **TASK-005** — batch 1/3: guidance surfaces + repo hygiene
- **TASK-006** — batch 2/3: 8 status flips + 1 edge upgrade
- **TASK-007** — batch 3/3: 16 closures (14 frozen + OQ-27/28 by
  scope amendment) + 2 supersession edges

Each batch is its own commit (`rewrite: FEATURE-002 batch <n/3> —
…`), verified per WF-003 steps 5–6.
