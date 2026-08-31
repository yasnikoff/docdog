---
id: PROPOSAL-017
title: "EJ→DD refactor as a planned stress-test for supersession, retirement, and reference-tracking"
collection: proposals
status: shipped
date: 2026-04-13
related:
  - DD-034
  - OBS-005
  - DISC-011
  - PROPOSAL-016
relationships:
  - sourced_from: DISC-011
  - references: DD-034
    context: "each refactored decision is reviewed through the artifact-resilience lens"
  - references: OBS-005
    context: "OBS-005 is the concrete trigger — the EJ→DD commitment existed only in conversation"
  - references: PROPOSAL-016
    context: "introduces status_vocabulary; this proposal adds the `retired` value"
  - references: EJ-015
    context: the unchanged-strategy example — orthogonal claims, copy body with a one-line check note
  - references: EJ-030
    context: the reframed-strategy example — the delete-every-skill clause conflicts with DD-034
  - references: FEATURE-001
    context: the feature that executed this proposal — four batches shipped the 33 DD mirrors, the supersedes chains, and the inbound-reference migration
  - references: FRICTION-012
    context: records the gap that amended §1 in execution — the proposed `retired` status became `superseded` because the value was never seeded into the vocabulary
  - references: DD-071
    context: why the retirement pass's file-deletion clause was dropped — EJ records remain on disk because the corpus ships whole
  - references: EJ-033
    context: the strengthened-strategy example for the mirror pass — DB-first reframed as the cache tier with disk frontmatter as the source of truth
description: "IMPLEMENTED via FEATURE-001 (TASK-001..004, final commit 4ae4e35): 33 DD mirrors created with supersedes edges and inbound references migrated. Two clauses amended in execution: EJs flipped to superseded rather than a new retired value (never seeded — FRICTION-012), and the EJ file-deletion pass was dropped (EJ records stay on disk; DD-071 ships the corpus whole). Original plan: create a DD mirror for each EJ-NNN decision, link via supersedes, reframe through DD-034 where applicable, retire the EJ."
---

# PROPOSAL-017: EJ→DD refactor as a planned stress-test

**Status note (2026-07-11, FEATURE-002):** implemented via
FEATURE-001 — four batches (TASK-001..004) shipped the 33 DD
mirrors, the supersedes chains, and the inbound-reference migration
(final commit 4ae4e35). Execution amended two clauses: the proposed
`retired` status became `superseded` because the value was never
seeded into the vocabulary (FRICTION-012 records the gap), and the
EJ soft-delete/file-deletion pass was dropped — EJ records remain
on disk as the historical corpus (DD-071 §2 ships the corpus whole).

## Motivation

Two things are true at once:

1. **The EJ prefix is historical.** Pre-v2 decisions were numbered
   `EJ-NNN` ("ejection judgment" from the docs-internal →
   orchestrator ejection era). V2 decisions use `DD-NNN`. DD-034
   is the first one. The switch was agreed in a prior session but
   never captured in a spec until OBS-005 — which is itself the
   artifact of the capture gap.
2. **Docdog needs a stress-test at scale.** Docdog has 33 EJ
   entries, all current, all still referenced from other specs.
   Refactoring them into DD mirrors exercises docdog's
   supersession edges, soft-delete flow, and reference-tracking
   against a realistic corpus. This is the kind of exercise that
   reveals the next crop of FRICTION-NNN entries.

Doing both at once is efficient: we get the naming consistency we
want *and* we validate a pile of docdog mechanics that haven't
been run at this scale before.

## Specification

### 1. Introduce `retired` status

PROPOSAL-016 ships a status_vocabulary infrastructure but doesn't
define a `retired` value. This proposal adds it to the `decisions`
vocabulary:

```yaml
decisions:
  current:    { description: "Active commitment driving current work." }
  superseded: { description: "Replaced by a newer decision with a supersedes edge." }
  deprecated: { description: "No longer active but still referenced; kept for history." }
  retired:    { description: "Soft-deleted — all references migrated, body preserved for audit." }
```

Distinction from `superseded`: superseded decisions are still
readable and may still be the authoritative source for historical
context. **Retired decisions are actively on the path to GC** —
their body is preserved but they are no longer the canonical
source for anything. A retired decision has zero inbound edges
from non-retired artifacts.

### 2. Mirror pass

For each existing `specs/decisions/ej-NNN.md`:

1. **Create `specs/decisions/dd-{NNN+33}.md`** — wait, no, simpler.
   The next available DD number after DD-034 is DD-035. Mirror
   EJ-001 as DD-035, EJ-002 as DD-036, ..., EJ-033 as DD-067.
   Continue the numeric sequence that DD-034 started. This is
   intentional — the mirror numbering is *not* a 1:1 renaming,
   it's a *new* decision that happens to be about the same topic,
   and the supersession edge is the link.
2. **Copy the body.** Start from the EJ body verbatim.
3. **Reframe through DD-034.** Review each decision's claims
   against DD-034's artifact-resilience test. Three outcomes:
   - **Unchanged** — the decision's claims are orthogonal to
     DD-034 (e.g. EJ-015 about embedding cache). Copy body,
     optionally add a one-line "DD-034 check: orthogonal" note
     at the bottom.
   - **Strengthened** — the decision's claims align with DD-034
     and can be sharpened (e.g. EJ-033 about features DB-first —
     the new framing is "DB-first is the cache tier; disk
     frontmatter is the source of truth"). Update body to
     reflect the sharper framing; cite DD-034.
   - **Reframed** — the decision's claims conflict with DD-034
     or were measuring the wrong thing (e.g. EJ-030's "delete
     every skill" clause). Rewrite body; cite DD-034 as the
     source of the reframe.
4. **Link supersedes edge.** Every new `dd-NNN.md` gets:
   ```yaml
   relationships:
     - supersedes: EJ-NNN
       context: "mirror under DD-034's artifact-resilience lens"
   ```
5. **Do not touch the EJ file yet.** The EJ file stays as-is
   until the retirement pass.

### 3. Reference migration pass

For each EJ-NNN:

1. **Enumerate inbound references** via `docdog_traverse` on the
   EJ vertex, direction `inbound`. Produces a list of artifacts
   that cite this EJ.
2. **For each citing artifact**, decide:
   - **Update the reference to the DD mirror** — safe default.
     Editor pass over each citing file, replace `EJ-NNN` with
     `DD-(NNN+34)` in frontmatter and body.
   - **Leave the EJ reference** — only if the reference is to a
     specific claim the DD mirror explicitly reframes away from.
     In that case the citing artifact itself needs its own
     review.
3. **Re-index** after each batch to refresh the edges.

This is the reference-tracking stress-test. If docdog's traversal
misses inbound edges — because some references are only in prose,
not in `relationships:` frontmatter — this is where we find out.
Those are FRICTION-NNN candidates for richer parsing.

### 4. Retirement pass

For each EJ-NNN where the inbound-reference count (from
non-retired artifacts) has reached zero:

1. Set `status: retired` on the EJ file.
2. Add a one-line header note: `**Retired 2026-NN-NN** — see
   DD-(NNN+34) for the current framing.`
3. Re-index. Consistency check should now not emit any warnings
   for this EJ.

The EJ file stays on disk and in the graph, but its status marks
it as on-path-to-GC. A future `docdog gc` pass may remove retired
decisions after a TTL (future proposal, out of scope here).

### 5. Stress-test deliverables

Alongside the refactor, capture:

1. **OBS-006 (to be written)** — did the supersession edge work
   cleanly at scale? Any routing issues? Any FRICTION-NNN
   candidates? Expected outputs: at least one observation about
   what worked, probably at least one friction note about what
   didn't.
2. **Reference-tracking coverage report** — a one-shot script
   that lists every EJ and its inbound reference count. Run
   before and after each migration pass. Stored as an artifact
   at `.docdog/scripts/ej-reference-audit.js` — a diagnostic
   tool that remains useful for future large refactors.
3. **Any new friction reports** surfaced during the exercise —
   filed as normal `specs/notes/friction-NNN-*.md`.

### 6. Execution plan

The refactor is **not all-at-once**. Batch:

- **Batch A (3 decisions):** EJ-001, EJ-002, EJ-003 — the oldest,
  likely the most in need of reframing. Validate the mirror +
  supersede + migrate flow works end-to-end. If friction
  surfaces, fix before continuing.
- **Batch B (10 decisions):** EJ-004 through EJ-013 — first real
  volume.
- **Batch C (10 decisions):** EJ-014 through EJ-023.
- **Batch D (10 decisions):** EJ-024 through EJ-033.
- **Retirement pass:** run only after all mirror/migrate passes
  complete, because inbound references are mostly EJ→EJ and have
  to be migrated first to decouple.

Each batch gets its own commit. The whole refactor is probably 4-5
sessions. Can be paused between batches.

### 7. Not in scope

- **Any core code changes.** This proposal is pure content work.
  The `retired` status value is introduced via seed data
  (PROPOSAL-016's mechanism), not via core code.
- **`docdog gc` enhancements for retired decisions.** If
  retirement needs a TTL-driven hard delete, that's a separate
  proposal.
- **Renumbering EJ files on disk.** They stay at their historical
  filenames; only their status and a header note change.
- **Reframing every decision.** Many will be "orthogonal" and get
  a one-line cite. Only the ones that DD-034 actually touches get
  a real rewrite.

### 8. Estimated effort

- Batch A: ~4 hours (setup + validation)
- Batches B-D: ~3 hours each
- Retirement pass: ~2 hours
- Observations + friction writing: ~2 hours
- **Total: ~16 hours across 4-5 sessions.**

Medium. The value is in the FRICTION reports surfaced, not in the
renaming itself.

### 9. Dependencies

- **Blocking on PROPOSAL-016** — needs the `status_vocabulary`
  infrastructure to add `retired` cleanly and to make the
  consistency check work for the new value.
- **No blocker beyond that.** Can start as soon as PROPOSAL-016
  ships.

## Status

Planned. Depends on PROPOSAL-016. Doubles as a stress-test for
docdog's own workflow mechanics — the first real multi-session
refactor done entirely through docdog primitives.
