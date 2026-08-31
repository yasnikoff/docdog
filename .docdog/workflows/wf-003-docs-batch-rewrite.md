---
id: WF-003
title: "Docs batch rewrite — apply a transform across a large set of docdog-managed records in reviewable batches"
collection: workflows
status: current
date: 2026-04-13
description: "The general process for renaming, reframing, or retiring a large cohort of docdog-managed records. Pick the set, define the transform, apply in batches of ~10, each batch a reviewable commit, verify between batches. PROPOSAL-017's EJ→DD rewrite is the first planned instantiation. Renamed from 'corpus batch refactor' per DISC-012 — 'refactor' read as code work, 'corpus' was docdog jargon."
relationships:
  - references: DD-036
    context: "DD-036 made this workflow a first-class artifact rather than ad-hoc per-rewrite prose"
  - references: PROPOSAL-017
    context: "first planned instantiation — EJ→DD rename of the decisions corpus"
  - references: DD-034
    context: "every record touched by this workflow must remain DD-034-compliant after the transform — frontmatter+body readable by a vanilla agent"
  - references: DISC-012
    context: "discussion that renamed this workflow and flagged the shipped code-loop skills as not applicable here"
  - references: OBS-008
    context: boundary evidence — running batch-rewrite work through the code-loop skills produces ceremony that doesn't fit
  - references: WF-002
    context: step 8 delegates surprising-finding capture to the dogfooding workflow
---

# WF-003: Docs batch rewrite

## Trigger

A decision lands that requires touching many docdog-managed
records in a consistent way. Examples:

- Renaming a collection or an id prefix across the whole set of
  records (PROPOSAL-017: EJ→DD).
- Adding a new required field to a collection's frontmatter and
  backfilling it on existing records.
- Retiring a status value and migrating records to a replacement.
- Rewriting references to a superseded record across every
  document that cites it.

## When not to use

- Single-record edits — use normal editing.
- Code changes — not this workflow. WF-004 captured the
  code-change loop in 2026-04, but it was deprecated on
  2026-08-27 along with the skill cluster it described; code
  changes here run through WF-002 + WF-006 and a commit.
- Cosmetic changes with no semantic effect — one commit, done.

## Skills note

**Historical (2026-04):** this section warned that the workflow
does not use the shipped code-loop skills in `.docdog/skills/`
(`architect`, `coder`, `reviewer`, `finalize-task`) — they
assumed git branches, `design.md → implementation.md →
review.md` artifacts, and code-level concepts that do not apply
to a docs rewrite, so walking a docs-rewrite task through them
produced no-ops or ceremonial empty artifacts. Those five skills
were deleted at v3 step 6 and the warning is moot; the reasoning
is kept because it is why WF-003 exists separately at all (see
OBS-008, DISC-012, and WF-004's deprecation note).

Follow the numbered steps below directly instead. A WF-003-
specific skill cluster (working name `batch-rewrite` or a peer
set) is a known follow-up — see DISC-012 §2.

## Steps

1. **Write the parent feature record.** Create a `FEATURE-NNN`
   in the `features` collection describing the end state of the
   transform. Fields: `implements` pointing at the driving
   decision or proposal, `follows_workflow: WF-003`, `status:
   planned`, acceptance criteria in the body.
2. **Enumerate the target set.** `docdog search` + `ls` +
   `grep` to produce a concrete list of records that will be
   touched. Write the list into the feature body so it is
   reviewable and the scope is frozen before work begins.
3. **Define the transform explicitly.** In the feature body or
   a linked `plan.md`, describe the exact per-record
   transformation: what fields change, what relationships are
   added or removed, what the new body shape is. A future agent
   should be able to replay the transform from this description
   alone.
4. **Split the target set into batches of ~10 records.** Ten is
   rough — size each batch so its diff fits on one screen of
   `git diff --stat` and so a human (or reviewer agent) can
   scan it in one pass. Create one `TASK-NNN` per batch in the
   `tasks` collection, each with a `part_of` edge to the
   feature and `follows_workflow: WF-003`.
5. **Execute each batch as its own task.** For each task:
   - Apply the transform to the batch's records.
   - Re-index (`docdog index`) — expect zero net-new warnings
     in its output. Drift means the transform is wrong or the
     plan missed a field.
   - Spot-check with one targeted `docdog search` to confirm
     the transformed records are retrievable under the new
     form.
   - Commit. Message:
     `rewrite: FEATURE-NNN batch <n/N> — <short description>`.
   - Flip task status to `done`, stamp `commit_hash` on the
     task record, re-index.
6. **Verify between batches.** Before starting the next batch,
   run a quick sanity query: search for any remaining reference
   to the old form; if the previous batch missed something, fix
   it before moving on. This is cheaper than discovering drift
   at the end of a 4-batch run.
7. **Finalize the feature** when all batches ship. Flip the
   feature's status to `shipped`, stamp the final commit hash.
   If the transform revealed an upstream spec is now wrong —
   e.g. a decision still references the old form — create a
   `reconciliations` record with a `reconciles` edge to the
   offending upstream artifact.
8. **Capture an observation** (per WF-002) if anything
   surprising came up: a query that surfaced a record the plan
   missed, friction with the loop, a pattern worth generalizing.

## Produces

- One `FEATURE-NNN` record with acceptance criteria and the
  frozen target set.
- N `TASK-NNN` records (one per batch), each linked to the
  feature.
- N git commits, one per batch, each referencing the batch's
  task.
- Zero or one `reconciliations` records if upstream drift
  surfaced.
- Zero or one `observations` records per WF-002 triggers.

## Terminal states

- **Shipped:** feature status `shipped`, all tasks `done`,
  target set fully transformed, consistency check green.
- **Abandoned mid-run:** some batches shipped, feature status
  `abandoned`. The partial transform stays in place because
  each batch was an independently valid commit. The feature
  record and remaining tasks explain why the rest didn't happen.
- **Blocked:** a batch surfaced a question the original plan
  didn't answer. Feature stays `blocked` until a new
  discussion or decision resolves the gap.

## Why this workflow matters

Bulk changes to docdog-managed records are the highest-risk
operation on a self-describing project. Done wrong, they
scramble references, break retrieval, and produce a set of
records no one can trust. The batch-with-verify-between pattern
contains the blast radius to one batch at a time, so a mistake
in batch 2 is caught before batch 3 multiplies it.

The feature-plus-tasks shape isn't ceremony — it's the mechanism
that makes the rewrite resumable across sessions, reviewable by
a second agent, and reconstructable from frontmatter if docdog
ever goes away.

## Notes

- Ten records per batch is a starting point, not a rule. If the
  transform is mechanical and low-risk, batches can be bigger.
  If it involves judgment calls, shrink to three or four.
- Don't try to write the entire feature body at the start — let
  the first batch teach you what's hard, then revise the plan
  before batch 2.
- The `follows_workflow` edges from both the feature and its
  tasks are load-bearing: they let a future reader discover the
  pattern behind the rewrite by traversing a single edge.
