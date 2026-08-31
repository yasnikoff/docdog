---
collection: features
commit_hash: 4ae4e35
id: FEATURE-001
description: "First instantiation of WF-003 (corpus batch refactor). Creates DD-NNN mirrors for the existing 33 EJ-NNN decision records, preserving supersedes/references edges and migrating all inbound references in 4 reviewable batches. Stress-tests PROPOSAL-015 vertex lifecycle, PROPOSAL-016's retired status, and the workflow template's feature+task loop on this repo."
relationships:
  - implements: PROPOSAL-017
  - follows_workflow: WF-003
  - references: DD-034
    context: the first DD-prefixed decision — the rename this feature propagates corpus-wide
  - references: DD-036
  - references: DD-035
    context: reframe criterion — mirror only where DD-034/DD-035 changed the applicable model
  - references: PROPOSAL-015
    context: stress-test target — exercises its vertex lifecycle at scale
  - references: PROPOSAL-016
    context: stress-test target — its retired status value on 33 real flips
  - references: TASK-001
    context: batch 1/4 of the decomposition
  - references: TASK-002
    context: batch 2/4 of the decomposition
  - references: TASK-003
    context: batch 3/4 of the decomposition
  - references: TASK-004
    context: batch 4/4 of the decomposition
shipped_at: 2026-04-13T00:09:02.699Z
status: done
title: EJ→DD refactor — mirror the 33 EJ-NNN decisions to DD-NNN
---

# EJ→DD refactor — mirror the 33 EJ-NNN decisions to DD-NNN

This feature instantiates WF-003 (corpus batch refactor) for the
PROPOSAL-017 EJ→DD rename. The source set is the 33 decision records
under `specs/decisions/ej-*.md`; the target state is a parallel set of
DD-NNN records that supersede them and a corpus with all inbound
references updated.

## Why

- **DD is the new prefix** (DD-034 is the first, DD-035/DD-036 follow).
  The EJ prefix is historical ("ejection judgment" from the
  docs-internal → orchestrator era) and should not remain the face of
  the decision corpus when docdog ships publicly.
- **Docdog needs a stress-test at scale.** Refactoring 33 records
  exercises PROPOSAL-015's vertex lifecycle, PROPOSAL-016's `retired`
  status, and the workflow template's feature+task loop on a real
  corpus rather than synthetic fixtures.
- **Discovers upstream drift.** Many EJ records are referenced from
  specs/notes and other decisions. The refactor will surface any
  stale references that slipped through earlier sessions.

## Acceptance criteria

- [ ] Every EJ-NNN has a corresponding DD-NNN mirror under
      `specs/decisions/dd-NNN-<slug>.md`, carrying the same id
      semantics and updated framing.
- [ ] Each DD-NNN carries a `supersedes: EJ-NNN` relationship edge.
- [ ] Each EJ-NNN's status is flipped to `retired` (introduced in
      PROPOSAL-016) with a `superseded_by: DD-NNN` edge.
- [ ] Inbound references across `specs/` and `.docdog/` are updated
      from EJ-NNN to DD-NNN wherever doing so does not change the
      historical meaning of a record.
- [ ] `docdog collections check` returns zero warnings after the
      final batch.
- [ ] One `reconciliations` record per upstream-drift finding, if
      any surface during execution.

## Target set (frozen)

33 records: `specs/decisions/ej-001.md` through `specs/decisions/ej-033.md`.

## Transform

For each EJ-NNN record:

1. Read the existing file into memory.
2. Draft a DD-NNN mirror with a refined title and updated framing.
   Preserve the semantic substance; reframe only where DD-034/DD-035
   changed the applicable model (e.g. ejection resilience).
3. Set frontmatter: `id: DD-NNN`, `supersedes: EJ-NNN`, `status: current`,
   plus a `supersedes` relationship in the `relationships:` block.
4. Write to `specs/decisions/dd-NNN-<slug>.md`.
5. On the EJ-NNN file: set `status: retired`, add
   `superseded_by: DD-NNN` and a `relationships:` entry pointing at
   the new record.
6. Update inbound references across the corpus from EJ-NNN to DD-NNN
   where doing so does not change historical meaning. Older discussion
   records describing "EJ-NN was the decision at the time" keep their
   original EJ-NN text.

## Batch partition

- **TASK-001** — batch 1/4: EJ-001 through EJ-008 (8 records)
- **TASK-002** — batch 2/4: EJ-009 through EJ-016 (8 records)
- **TASK-003** — batch 3/4: EJ-017 through EJ-024 (8 records)
- **TASK-004** — batch 4/4: EJ-025 through EJ-033 (9 records)

Each task is its own commit. Verify between batches per WF-003 step 6.

## Status

Planned. Blocked on no human blocker — ready to execute when the
Phase 2 seeding lands.
