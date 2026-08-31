---
id: FRICTION-012
title: "TASK-001's acceptance criteria used a status value and a relation edge that are not in the corpus's registered vocabularies"
collection: issues
status: resolved
severity: inconvenient
fixed_date: 2026-07-11
resolution_approach: patch
fix_commit: 3c1bb8d3c34093f3b95ea1ea3919d5d3db05358b
description: "RESOLVED 2026-07-11 — two of its three gaps were closed by later shipped work (PROPOSAL-025/026 seed the full vocabulary at init, removing the root cause; PROPOSAL-017's amendment settled retired→superseded and dropped the separate retirement pass), and the last — documenting the inverse-edge convention — shipped in 3c1bb8d: relate skill rule 4 + task-frontmatter callout, write the forward type, never store superseded_by-style inverses. Original: TASK-001's seeded AC asked for `status: retired` and a `superseded_by: DD-NNN` edge, neither in the registered vocabularies; meeting it verbatim would have produced the very warnings its own zero-warnings clause forbade."
relationships:
  - references: TASK-001
    context: the seeded task whose acceptance criteria collided with the shipped vocabulary
  - references: PROPOSAL-017
    context: its §1 retired status was specified but never shipped as a seed — the staging collapse at the heart of this friction
  - references: EJ-016
    context: the one pre-existing warning distinguished from new ones during AC verification
  - references: PROPOSAL-016
    context: the status_vocabulary seed mechanism a pre-batch fix would use
  - references: DD-040
    context: inverse-edge traversal is why superseded_by needs no stored edge — no entry beats a wrong entry
  - references: OBS-008
    context: the surrounding Phase-3 workflow-skill-mismatch observation
  - references: FRICTION-011
    context: sibling friction — same workflow-prescribes-what-tooling-lacks class
  - references: WF-006
    context: the friction-resolve session that closed the last open gap (documenting the inverse-edge convention) and the record
  - references: PROPOSAL-025
    context: removed the root cause — the full relation vocabulary now ships as seeded concept records at init, so seeded content cannot reference a vocabulary the corpus never registered; it cites this friction as the failure class it closes
  - references: DD-071
    context: the publication boundary that dropped the EJ file-deletion pass — the files stay, so gap 3's separate retirement pass has nothing left to sequence
  - references: DD-070
    context: the v3 pivot dissolved the AC clause that made the wording collision a contradiction — `docdog collections check` died at step 6 (§3)
  - references: WF-003
    context: carries the replacement for the dead zero-warnings gate — step 5 now checks for net-new `docdog index` warnings instead of `docdog collections check`
  - references: DP-001
    context: the principle that ruled out both rejected fixes — a seed-time vocabulary lint and inverse-form matching each push judgment into code
  - references: DISC-023
    context: the ratified advisory-registry stance (vocabulary warns, never blocks) that a blocking seed-time lint would have contradicted
  - references: PROPOSAL-026
    context: "with PROPOSAL-025, the seeding pair that removed this friction's root cause: the full collection and relation vocabulary now ships as concept records at init, so seeded content can no longer target a vocabulary that isn't there"
---

# FRICTION-012: TASK seed's AC wording collided with registered vocabularies

## Trigger

Phase 3 of the workflow-template dogfood. Executing TASK-001 —
mirror EJ-001..EJ-008 as DD-037..DD-044 — per its seeded README.

TASK-001's acceptance criteria included:

> - [ ] 8 source EJs updated: `status: retired`, `superseded_by:
>       DD-NNN` edge added.
> - [ ] `docdog index` succeeds; `docdog collections check`
>       returns zero new warnings.

Both bullets cannot be simultaneously satisfied against the
current corpus state.

## What went wrong

### 1. `retired` is not in the `decisions` status_vocabulary

```
$ docdog collections describe decisions
...
Status vocabulary:
  current     — Active commitment driving current work.
  superseded  — Replaced by a newer decision with a supersedes edge.
  deprecated  — No longer active but still referenced; kept for history.
```

Setting `status: retired` on any decision triggers a
`status_not_in_vocabulary` warning from
`docdog collections check`. That violates the second AC bullet.

PROPOSAL-017 §1 *does* introduce `retired` as a new status value
for decisions, but that introduction was listed as part of
PROPOSAL-017's own specification and has not been shipped as a
config / seed update. TASK-001 was seeded without first landing
the vocabulary extension — the AC was written against a state of
the world that doesn't exist yet.

### 2. `superseded_by` is not a registered relation type

```
$ docdog relations list | grep super
  supersedes    ← revised by
                A replaces B as the active commitment.
```

`supersedes` is registered in `dd_edges_temporal`. Its inverse
label is `revised by` (conceptual), not `superseded_by` (literal).
Docdog does not store a separate `superseded_by` edge; inverse
traversal on a `supersedes` edge is automatic.

Adding `superseded_by: DD-NNN` to an EJ's `relationships:` block
routes to `dd_edges_unspecified` with a
`relation_type_without_meta` warning. Again violates the second
AC bullet.

### 3. The PROPOSAL-017 staging was collapsed in TASK-001

PROPOSAL-017 §2 says: *"Do not touch the EJ file yet. The EJ file
stays as-is until the retirement pass."* §4 describes retirement
as a *separate* pass, run only *after* all mirror and
reference-migration passes complete, because retirement requires
zero inbound references from non-retired artifacts — a condition
that can only hold for EJ-001..EJ-008 once batches 2, 3, and 4
have also migrated their inbound references.

TASK-001 collapsed mirror + retire + inbound-migration into a
single batch, and in doing so forced the use of a status
("retired") whose semantic precondition (zero inbound refs from
non-retired artifacts) does not hold until the whole refactor
ships.

## Workaround used in this batch

Flipped each EJ to `status: superseded` (vocabulary-valid, and
semantically correct right now — each EJ is in fact superseded
by its DD mirror). Removed the `superseded_by:` edge entirely
from the EJ frontmatter — the DD mirror's `supersedes: EJ-NNN`
edge is the canonical representation, and docdog's inverse
traversal finds the relationship from either direction.

Added a prose header to each retired EJ:
*"**Superseded 2026-04-13** — see DD-NNN for the current framing.
Body preserved below for history."*

Result: `docdog collections check` reports the same 1 pre-existing
warning (from EJ-016's top-level `superseded_by` field, which
predates this session) and zero new warnings. AC semantically
satisfied; literal wording diverged.

## What should change

Three distinct gaps, each independently fixable:

### 1. TASK seeding must target current vocabulary, not proposed vocabulary

When a proposal introduces a new vocabulary value *and* tasks that
use it, the proposal's implementation plan must sequence the
vocabulary change first. Either:

- A pre-batch task that updates the `decisions` status_vocabulary
  to include `retired` (via PROPOSAL-016's seed mechanism), OR
- Acceptance criteria that explicitly reference the current
  vocabulary (`superseded` in this case) and defer `retired` to
  the separate retirement pass PROPOSAL-017 §4 describes.

Phase 2's seeding of TASK-001..004 skipped this sequencing check.
A lint at seed time — "does every status/relation referenced in
this task's AC exist in the current vocabulary?" — would have
caught it.

### 2. The inverse-label distinction needs a documented convention

Agents writing `relationships:` blocks naturally reach for the
"obvious" direction. Docdog's current model is: **store
`supersedes` on the new side, never store the inverse as a
separate edge**. That's the right call — it avoids two-source
drift — but it isn't documented anywhere an agent picking up a
task would find it.

Either add a line to `task-frontmatter.md`:

> **Inverse edges are automatic.** Do not write
> `superseded_by`, `depended_on_by`, `referenced_by` in
> `relationships:`. Write the forward direction on whichever
> side makes semantic sense; traversal finds the inverse.

…or surface a more helpful warning when
`dd_edges_unspecified` receives a name that happens to be the
inverse form of a registered forward type.

### 3. PROPOSAL-017's retirement pass needs its own task

Since retirement cannot happen per-batch, the feature's task
sequence should be: `TASK-001..004` (mirror + reference migration)
+ `TASK-005` (retirement pass). TASK-005 would be the only place
`status: retired` is set, and only after the vocabulary has been
extended. Right now TASK-005 doesn't exist, and the retirement
step is implicitly tangled into each batch's AC.

## Why this matters

The point of Phase 3 is friction discovery on workflow-template
mechanics. This is exactly the class of friction the exercise is
designed to surface: a seeded plan that reads plausibly but
contradicts the corpus's own consistency rules. Caught here, it's
cheap to fix. Caught during the orchestrator bootstrap it would
have been the user's first impression of the workflow template.

## Related

- TASK-001 — where the collision lives.
- PROPOSAL-017 §1, §4 — the `retired` status proposal and the
  separate retirement pass.
- PROPOSAL-016 — status_vocabulary infrastructure.
- DD-040 — inverse-edge traversal is the reason `superseded_by`
  isn't needed as a stored edge (mirrors the "no entry beats a
  wrong entry" principle at the relation layer).
- OBS-008 — workflow-skill mismatch observation that surrounds
  this friction.
- FRICTION-011 — sibling friction from Phase 2 on CLI surface
  for DB-first vertices. Same class: workflow skill prescribes
  something the current implementation can't deliver.

## Resolution (2026-07-11)

**Approach: patch — two of the three gaps were resolved by work
that shipped after filing; this WF-006 session closed the last one
(documentation) and the record.**

By gap:

1. **Seed-time vocabulary targeting** — the root cause was removed
   by PROPOSAL-025/026 (`2d8e9f0`, `2e62ed3`): the full relation and
   collection vocabulary now ships as seeded concept records at
   `docdog init`, so seeded content can no longer reference a
   vocabulary the corpus never registered (both proposals cite this
   friction as the failure class they close). The concrete instance
   was settled by PROPOSAL-017's amendment, recorded there citing
   this friction: the EJ cohort went `superseded`, and `retired`
   never entered the shipped decisions vocabulary
   (current / superseded / deprecated).
2. **The inverse-edge convention is now documented** — `3c1bb8d`:
   rule 4 of the relate skill plus a callout in the task-frontmatter
   cheat sheet (template and installed copies). Write the forward
   type on the side that makes semantic sense; never store
   `superseded_by` / `referenced_by` / `depended_on_by` as edges; a
   concept record's `inverse_label` is a display label, not an edge
   type.
3. **A separate retirement pass** — mooted by the same PROPOSAL-017
   amendment: with the cohort settled at `superseded`, there is no
   retirement pass to sequence (and the EJ file-deletion pass was
   dropped per DD-071; the files stay).

The AC clause that turned the wording collision into a
contradiction also dissolved at the v3 pivot: `docdog collections
check` died at v3 step 6 (DD-070 §3), and WF-003 step 5 now checks
for net-new `docdog index` warnings instead (FEATURE-002 batch 1).

*Rejected alternatives:* a hard seed-time lint ("does every
status/relation in this AC exist in the current vocabulary?") and a
code-side warning recognizing inverse forms of registered types.
Both push judgment into code against DP-001 — inverse-form matching
is string inference — and a blocking lint would contradict the
ratified advisory-registry stance (DISC-023: vocabulary warns,
never blocks).

*Knock-on effects:* FRICTION-011 (the sibling named above) was
already resolved. With this record and FRICTION-010 closed, the
open friction backlog is empty.
