---
id: FRICTION-035
title: "status counts vectors nothing hashes to, not vectors nothing can reach — after a recipe change those stop being the same set"
collection: notes
status: resolved
fixed_date: 2026-07-21
resolution_approach: patch
fix_commit: 49357bb
description: "OBS-021's unused share is computed by findUnusedRows, which filters on content_hash alone and ignores the key's second column. That is deliberate — it is what makes reverting a model (now a recipe) free. But it means a row keyed to a superseded recipe whose content is still live counts as USED, though nothing can ever read it again. Measured immediately after FRICTION-033 shipped: 704 rows, of which 390 are unreachable, and status reported 77 (11%) unused. The number did not become wrong; it stayed true to its definition while its definition stopped matching what a reader takes it to mean."
date: 2026-07-20
severity: inconvenient
relationships:
  - references: OBS-021
    context: the measurement that established the unused share as a reported number and modelled the store's growth as tracking revision volume; a recipe change is a second growth term it does not contain, and this note is the gap between what it measures and what it now reads as
  - references: FRICTION-033
    context: "the change that created the category: keying by recipe rather than by model is what makes a row unreachable while its content stays live — the fix is sound and this is its disclosed cost, found by measuring it rather than by reasoning about it"
  - references: DISC-032
    context: the decision that made gc union every worktree's liveness rather than refuse; the same content-only liveness test is what this note is about, seen from the reporting side rather than the sweeping side
  - references: DP-001
    context: tier 1 if it stays disclosure — counting rows whose recipe is not the current one is arithmetic; it would become tier 3 the moment it recommended evicting them, because whether an old recipe is worth keeping is a judgment about future intent
  - references: FRICTION-021
    context: "surfaced while testing this fix — change detection is file-hash-only and config-blind, so a dtype/cap recipe change (unlike a bare-model change) does not force the full reindex that would re-embed unchanged records under the new recipe; FRICTION-033's mixed-vintage protection therefore holds only on a full pass, not an incremental one"
---

> Found by measuring the store right after FRICTION-033's recipe keying landed,
> to check a prediction about what `status` would say. The prediction was that
> the count would under-report; it did, by more than expected.

## What I was doing

Verifying the FRICTION-033 fix end-to-end on this repo's real corpus. After a
full reindex under the new recipe key, `docdog status` reported:

```
Embed store:  .git\docdog\embeddings.db (704 vector(s), 3.2 MB, shared across worktrees)
  77 (11%) unused by this working tree — ...
```

704 rows is 390 written under the old bare-model key plus 314 written under
`nomic-ai/nomic-embed-text-v1@8000`. **Every one of those 390 is unreachable** —
no lookup will ever produce that key again unless the recipe is reverted. The
reported unused count is 77.

## What went wrong

Nothing broke. `findUnusedRows` does exactly what it says: it filters on
`content_hash` and ignores the second key column. Its own comment explains why,
and the reason is good — a live hash keeps its rows under every model, which is
what makes switching a model back free, and now what makes reverting a cap free.
FRICTION-033 chose that property on purpose.

The consequence is that "unused" and "unreachable" are different sets, and they
were identical until the day a recipe changed:

| | reachable | unreachable |
|---|---|---|
| **content live** | the working set | **invisible — counted as used** |
| **content dead** | counted as unused | counted as unused |

The bottom-left cell is what `status` reports. The top-right cell is 55% of this
store and appears nowhere. A reader looking at "11% unused" concludes the store
is in good shape; the true share of it that can never be read again is 55%.

This is the failure shape this project keeps re-filing — FRICTION-019,
FRICTION-028, FRICTION-031, and FRICTION-033 itself. Well-formed output,
confident number, nothing reported. Here it arrives through a new door: the
number is not wrong, and no code changed under it. **Its definition stopped
matching its reading.** A metric can rot without anyone editing it, if the
world it describes gains a case it was never asked about.

## What I used instead

Counted by hand, against a store I happened to know the history of:

```sql
SELECT model, COUNT(*) FROM embed_cache GROUP BY model;
```

which is only interpretable because I know which of those keys is current.
`status` knows that too, and does not say it.

## What should change in docdog

Report the second cell. `status` gains a count of rows whose recipe is not the
current one — disclosure in the same register as the embed-cap warning, which
also reports a cost it deliberately declines to fix.

Explicitly **not** proposed: sweeping them. Evicting a superseded recipe is
exactly the property FRICTION-033 traded for, and `gc` keying on content is
load-bearing for both. The tension is real and already recorded there: *reverting
is free* and *the old vintage ages out* are one mechanism read in opposite
directions, and this codebase picked the first. This note asks only that the
consequence be visible, not reversed.

One structural obstacle, which is why this is filed rather than fixed inline:
`embedRecipe` lives in `storage/indexer.ts`, beside the `embedInput` it must
stay in step with. `status.ts` cannot import it without pulling in the indexer
and its embedder — the exact dependency `embed-health.ts` was split out to
avoid, per its own header. So the fix's first move is probably to relocate
`embedRecipe` next to `MAX_EMBED_CHARS` in `embed-health.ts`, which holds most
of the recipe already, leaving a pointer at `embedInput`. That is a small change
with a real design question inside it (what is the natural home of "the recipe"
— where it is applied, or where its inputs live?), and it deserves deciding
rather than defaulting.

## Resolution (2026-07-21)

**Approach: patch — disclose the second cell, evict nothing.** `status` now
reports the superseded stratum alongside the unused one, in the same register
as the embed-cap warning: a measured cost stated, not fixed. Sweeping was
refused exactly as the note asked, because eviction would undo the free-revert
trade FRICTION-033 chose and `gc`'s content-only key is load-bearing for it.

**The design question, decided.** The recipe's home is **where its inputs
live**, not where it is applied. `embedRecipe` moved from `storage/indexer.ts`
to `storage/embed-health.ts`, beside `MAX_EMBED_CHARS` — the recipe is a naming
of (model, cap, dtype), and two of those three already lived there. `embedInput`
stays in the indexer (it is the one *application* of the cap) with a pointer
comment binding the two: change what `embedInput` emits and you must extend the
recipe. `indexer.ts` re-exports `embedRecipe` so every existing importer (and
the embed-store test) is unaffected. This is what lets `status.ts` compute the
current recipe without importing the indexer and its embedder — the precise
dependency `embed-health.ts` was split out to avoid.

**What shipped:**
- `embedRecipe` relocated to `embed-health.ts`; re-exported from `indexer.ts`;
  stale "storage/indexer.ts" pointers in `embed-store.ts` and `embed-health.ts`
  corrected (`src/storage/embed-health.ts`, `src/storage/indexer.ts`,
  `src/storage/embed-store.ts`).
- `countSupersededRecipeRows(embedDb, currentRecipe)` added beside
  `findUnusedRows` — `COUNT(*) WHERE model <> ?`, the recipe opaque exactly as
  the store treats `model` (`src/storage/embed-store.ts`).
- `EmbedStoreReport.supersededRecipe` plumbed through `collectStatus`;
  `formatEmbedStore` grows a second disclosure line when it is non-zero, worded
  to state the cost and *not* point at `gc` (`src/storage/status.ts`). Both
  surfaces (CLI, MCP) pick it up through the shared formatter unchanged.
- Tests: end-to-end recipe-change strands the old rows and `status` counts them
  while `unused` cannot see them (`storage-status.test.ts`); a focused
  `countSupersededRecipeRows` unit test and a two-independent-lines render test;
  the `EmbedStoreReport` literals gained the new field
  (`storage-status.test.ts`, `storage-embed-store.test.ts`). 415 pass.
- Verified on this repo's real corpus: `docdog status` now reports
  **390 (55%) written under a superseded recipe** beside the 80 (11%) unused —
  the exact 390 this note measured by hand, previously invisible.

**Rejected alternatives:** sweeping the stratum (undoes free-revert, the whole
point of FRICTION-033); keeping `embedRecipe` in the indexer and having `status`
reach the recipe some other way (there is no other way that avoids the embedder
import — the relocation *is* the fix's enabling move); folding the count into
`unused` (they are different sets — dead-content vs dead-recipe — that do not
sum, so two lines, not one).

**Knock-on effects:** the end-to-end test surfaced that a dtype recipe change
needs `index --full` to actually re-embed — incremental change detection is
file-hash-only and config-blind (**FRICTION-021**), so **FRICTION-033**'s
mixed-vintage guarantee holds only on a full pass. Not re-filed (those two
already name it); recorded here and as an edge. `MAX_EMBED_CHARS`'s own comment
about the recipe carrying the cap now points to the recipe one definition below
it rather than across a file boundary.
