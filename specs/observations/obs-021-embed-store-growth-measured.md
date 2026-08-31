---
id: OBS-021
title: "The grow-only embed store measured: 19% orphaned in 7 days, ~18 MB/year — and the age-based eviction gc.ts already promises cannot work as written"
collection: observations
status: current
date: 2026-07-20
commit_hash: 457a180
description: "A design question — 'additive indexing means the index grows forever' — checked against the code and measured. The premise splits: index.db is not additive (sweepGhostFiles drops vanished files), embeddings.db genuinely is, and its growth driver is editing rather than deletion, since the key is (content_hash, model). Measured here: 384 rows / 310 live / 74 orphaned (19%) in 7 days, ~4.7 KB/row, extrapolating to ~18 MB/year. The deferred mitigation in gc.ts is age-based eviction; embed_cache stores only created_at and get() touches nothing, so age would evict old-but-live rows and a true LRU needs a schema bump whose rebuild costs the full re-embed the store exists to prevent."
relationships:
  - references: PROPOSAL-029
    context: "measures the grow-only property the proposal chose deliberately ('first-writer-wins makes the store a grow-only set'), and prices it: the unbounded growth is real and costs single-digit MB/year, so the choice holds"
  - references: OBS-015
    context: "same store, opposite face — OBS-015 measured what the shared store saves (792 vectors carried, 0 re-embedded); this measures what it accumulates, and notes that its 792 > 746 was the first sighting of the same orphan class"
  - references: DD-051
    context: "the (content_hash, model) key is the growth driver: every edit of every record mints a row and orphans the old one, which makes edit volume — not file deletion — the thing that fills the store"
  - references: DD-070
    context: "§2's disposability is what keeps this a non-problem: rm embeddings.db is always safe, so unbounded growth has a known-cost escape hatch and never becomes corruption"
  - references: DP-001
    context: "the recommended mitigation is tier 1 — report row count, stale share and size in docdog status, and let the eviction policy be chosen by a human when the number is alarming, rather than encoding a retention judgment in code"
  - references: DP-003
    context: "clause 3 counts instantiations before building an escape hatch into the toolbelt; this is instantiation zero — nobody has hit a size problem — which is why the finding is filed rather than fixed"
  - references: WF-002
    context: "dual-track dogfooding: the question arrived as a design doubt in conversation, and the answer needed the live store on disk rather than a reading of the source"
---

# OBS-021: What the grow-only store actually costs

## The question

*"Indexing was rebuilt to be additive only, for worktrees. Doesn't that
mean deleted files stay in the index forever and it grows unbounded?"*

The premise splits in two, and the half that survives is not the half
the question expects.

## `index.db` is not additive

`sweepGhostFiles` (`src/storage/indexer.ts:607`) reads the `files` table,
and for any row under a prefix *this run covered* whose path is missing
from the discovered set, drops the file's vertices and every row keyed by
them. Per-file reindex does the same for sections that vanished from a
file that still exists (`indexer.ts:459`). Delete a record's file, run
`docdog index`, and it leaves the cache. The cache is bounded by corpus
size, not by history.

One live edge: the sweep is scoped to the prefixes the run covered, so
`docdog index --path specs/notes` will not notice a deletion under
`specs/decisions`. That is deliberate — a scoped run must never sweep
outside its scope — but it means scoped runs leave stale rows until a
full-scope run reconciles them.

## `embeddings.db` is, and deletion is not why

PROPOSAL-029 says it outright: `INSERT OR IGNORE`, first-writer-wins,
*"makes the store a grow-only set: conflict-free, mergeable by union,
safe for two worktrees to write at once."* There is no eviction on the
write path and none on read.

**The growth driver is editing, not deletion.** The key is
`(content_hash, model)`, so every edit of every record mints a new row
and orphans the old one. Files that leave the corpus are a rounding
error beside ordinary revision. Worktrees did not create this
accumulation — it predates them, sitting in `index.db`'s `embed_cache`.
What worktrees changed is that eviction became *unsafe*, because
liveness is a per-tree question about a store that is no longer
per-tree, which is why `gc` refuses on a shared store.

## Numbers

Docdog's own repo, `457a180`, store at `.git/docdog/embeddings.db`:

| | |
|---|---|
| Rows | **384** |
| Live vertices | 310 |
| Orphaned rows | **74 (19%)** |
| File size | 1.81 MB (**~4.7 KB/row**) |
| `created_at` span | 2026-07-13 → 2026-07-20 (**7 days**) |

74 orphans in a week on a 310-record corpus — roughly 10/day, or
**~18 MB/year** at this editing rate.

> **Corrected 2026-08-27 by OBS-026 — this rate is wrong.** Re-measured
> across 38 days rather than 7, ordinary edit churn is **~1.2 rows/day
> (~2 MB/year)**. This window contained a full corpus re-embed, so the
> number above is that event amortized over a week and reported as a
> steady state. The *finding* below — that growth is driven by edits, not
> deletions — stands. OBS-026 also names the driver that dwarfs both:
> a **recipe change**, which orphans the entire corpus in a day and which
> content-keyed `gc` cannot sweep at all. Changing the embedding model
multiplies it, since `model` is part of the key and the old model's rows
have no owner under any liveness test but remain perfectly valid should
it come back (which is exactly why `evictStaleEmbeddings` is
model-agnostic).

So: unbounded in principle, single-digit MB/year in practice. `gc.ts:20`
already claimed *"the store is single-digit megabytes and nobody has a
size problem"* — that is now measured rather than asserted, and it holds.

## The trap in the deferred mitigation

`gc.ts:18` names the intended fix: *"Age-based eviction is the
semantically correct sweep there, and is deliberately not built yet."*

**It does not work as written.** `embed_cache` carries `created_at` and
nothing else temporal, and the handle's `get()` (`embed-store.ts:194`)
is a pure read — it records no access. So age measured on `created_at`
is age-since-*first-embed*, not age-since-last-use: a record written a
year ago and never edited has an ancient timestamp and is perfectly
live. Age-based eviction would evict precisely the rows whose re-embed
is least justified.

A true LRU needs `last_used_at` written on read. That is a column, so
`EMBED_SCHEMA_VERSION` goes to 2, so `openEmbedStore` calls `rebuild()`,
which drops every table (`embed-store.ts:237`) — **one full re-embed for
every user, to install the feature that prevents paying for storage.**
The independence of the two schema versions was designed to stop cache
changes billing a re-embed (PROPOSAL-029's opening paragraph); it cannot
protect a change to the embed schema itself.

Anyone reaching for the `gc.ts:18` note should read this paragraph
first.

## Recommendation: report it, don't sweep it — **shipped**

Add embed-store row count, orphan share, and file size to `docdog
status`. Pure mechanics (DP-001 tier 1), no schema change, no retention
policy encoded in code — and it converts invisible growth into visible
growth, so the eviction question gets designed when a number is
alarming instead of now. `rm embeddings.db` stays the escape hatch that
always works, at a cost the status output would make legible.

**Implemented the same day.** `EmbedStoreReport.unused` counts rows no
live vertex hashes to, and both surfaces print it because both already
render `formatEmbedStore`. The liveness query moved to
`findUnusedRows` in `storage/embed-store.ts` and `gc` now calls it too —
one definition, so the count status reports and the set gc deletes
cannot drift apart. On this corpus it reads:

```
Embed store:  ...\.git\docdog\embeddings.db (385 vector(s), 1.7 MB, shared across worktrees)
  74 (19%) unused by this working tree — may still be live in another
  worktree, so gc refuses to sweep a shared store
```

The wording branches on `shared`, and that branch is the feature. An
unshared store names `docdog gc`; a shared one names the refusal
instead, because pointing at gc there would both recommend a command
that refuses and imply the rows are garbage when they may be a sibling
worktree's live vectors. A clean store prints nothing extra.

Two alternatives, both ranked below it:

**Union liveness across worktrees.** `git worktree list` enumerates the
trees, each has its own `index.db`, and the union of their live hash
sets makes gc's refusal unnecessary. It answers the question gc actually
refuses. But it cannot see commits checked out *nowhere*, and those are
the case the shared store is most valuable for — so it lifts the
refusal without making the sweep safe in the scenario that motivated
the refusal.

**Age-based with touch-on-read.** Correct, and pays the full re-embed
above. Do it when someone has a size problem.

## Why the eviction half is filed and not fixed

Reporting shipped; **evicting did not**, and the split is the point.
DP-003 clause 3 counts instantiations before a gap earns a tool, and
this is **instantiation zero** — the growth was hypothesized in
conversation, and the measurement says nobody will hit it for years.
Reporting a number costs nothing and needs no policy; choosing what to
delete needs both a schema bump and a retention judgment, so it waits
for someone who actually has a size problem.

The finding worth keeping is not "the store grows". It is the two
corrections: growth is driven by *edits* rather than deletions, and the
mitigation the source already promises is unimplementable at its stated
cost.

> **Both halves resolved (2026-08-27, OBS-026).** The eviction half waited
> for an instantiation and got one: someone hit the growth and asked. What
> shipped is not the age-based eviction this section defers — that stays
> forbidden for the reason given above — but its **inverse**,
> `embed.retain_days`, a floor that keeps young rows rather than a ceiling
> that discards old ones. Same column, opposite comparison, and the
> failure mode flips with it: being wrong retains a row instead of
> discarding a live one. Alongside it: `embed.auto_gc` (the sweep runs
> itself, since *nothing running it* was the actual defect), `VACUUM` (the
> file never shrank), and `gc --prune-recipes` for the stratum this record
> did not know was the dominant growth term.
