---
id: OBS-026
title: "The embed store's growth driver is neither edits nor deletions — it is recipe changes, and gc could not touch them, shrink the file, or get itself run"
collection: observations
status: current
description: "Re-measured OBS-021 at 38 days: edit churn is ~1.2 rows/day (~2 MB/yr, not 18), one recipe change froze 50% of the store unreachable in a single day, and VACUUM was absent so gc never shrank the file — fixed by auto_gc, --prune-recipes, --retain-days and compaction."
relationships:
  - extends: OBS-021
  - implements: DISC-032
  - references: FRICTION-033
  - references: FRICTION-035
  - references: DP-001
  - amends: PROPOSAL-029
    context: "reverses §5: the shared-store gc refusal became a sweep over the union of every worktree's liveness, with a retain_days floor and auto_gc"
---

# OBS-026: three separate reasons the store kept growing

## The question asked

*"The append-only rule for embeddings has an unpleasant consequence: nobody
runs gc and the embeddings grow infinitely. The append-only rule was for
allowing work in different worktrees, so it stays. What are the options?
Can we have a setting with two modes — deletion clears the index row
(one-worktree mode), or only gc does?"*

The proposed setting turned out to already exist, in a better form than a
setting. The complaint underneath it turned out to be three unrelated
defects, only one of which anyone had named.

## What was already true

**The two-mode knob is `git worktree list`.** DISC-032 replaced
PROPOSAL-029 §5's shared-store refusal with a liveness *union* across every
working tree: one tree sweeps without ceremony, several sweep the
complement of the union. So "one-worktree mode" is **detected, not
declared** — and a config knob asserting it would be a human invariant
standing in for a mechanical answer, which is the exact trade DISC-032
rejected when it threw out documentation-plus-discipline. Verified before
any code was written:

```
$ docdog gc --dry-run
Would evict 122 stale embedding(s) — 661 live, 783 scanned.
```

No refusal. `CLAUDE.md` still described the refusal and has been corrected.

**"Deletion clears the row" cannot be hooked, because there is no
deletion.** An *edit* does not delete anything: the indexer writes a new
`(content_hash, recipe)` row and stops referencing the old one. To evict on
edit you would diff against the record's previous hash — the same liveness
question `gc` asks, per-record instead of per-sweep, and unsafe on a shared
store for the same reason. The safe version of "evict on edit" **is** "run
gc after index", which is what shipped.

## What was measured

Store at `1dfd19f`, 38 days after OBS-021's snapshot:

| | OBS-021 (2026-07-20) | now (2026-08-27) |
|---|---|---|
| Rows | 384 | **783** |
| File | 1.81 MB | **3.5 MB** |

The aggregate looks like OBS-021's ~10 rows/day holding. The composition
says otherwise:

| Recipe | Rows | Window |
|---|---|---|
| `nomic-embed-text-v1@8000` (current) | 393 | 2026-07-20 → now |
| `nomic-embed-text-v1` (pre-FRICTION-033) | **390** | 2026-07-13 → 2026-07-20, **frozen** |

By month: **July 751, August 32.** July contains a full corpus re-embed —
the day `embedRecipe` shipped and every row's key changed. August is
ordinary editing: **32 rows in 27 days ≈ 1.2/day ≈ 2 MB/year.**

**Correction to OBS-021.** Its ~18 MB/year was extrapolated from a 7-day
window that happened to contain heavy churn, and the steady state is an
order of magnitude below it. Its *finding* — that edits rather than
deletions drive growth — survives; its rate does not. Same instrument, same
corpus, a longer window: **a growth rate measured across one week is a
measurement of that week.**

### The finding

**The dominant term is neither edits nor deletions. It is recipe changes.**
One cap change minted **390 rows / 1.7 MB — 50% of the file, roughly 1.4
years of edit churn — in a single day**, and `gc` cannot touch any of it.
That is not a bug: `findUnusedRows` is content-keyed on purpose, because
retaining these rows is exactly what makes reverting the model, cap or
dtype free (FRICTION-033). But it means the largest growth event the store
has is the one event with **no sweep at all**, and FRICTION-035 disclosed
the stratum without anyone noticing it was also the growth answer.

### The third defect, found by grep

`grep -rn "VACUUM" src/` returned nothing. Deleting rows returns pages to
SQLite's freelist, not to the filesystem — so `gc` could evict a sixth of
the store and **move the file size by zero**. The only symptom anyone
reports is file size, and the only command addressing it did not.

## What shipped

Four changes that compose, rather than one policy. Each was checked against
DP-001; none encodes a judgment.

1. **Compaction** (tier 1). Any sweep that deletes now `VACUUM`s and reports
   the delta. Both sides are WAL-checkpointed before measuring, or the
   number is fiction — a test pins that, because a naive `statSync` around
   the VACUUM reads the *growth* as shrinkage. Failure is a value, never a
   throw: the lock is shared with every worktree, and by then the rows are
   already gone.
2. **`gc --prune-recipes`** (tier 1 mechanics behind a tier 3 decision made
   by the person typing it). Deletes the unreachable stratum. Never a
   default and never reached by the automatic path: it *spends* the
   free-revert property rather than reclaiming waste, and which of those two
   goods you want is not inferable from the corpus.
3. **`embed.auto_gc`, default true** (tier 2). `docdog index` sweeps at the
   end of a full-scope run. This is the one that answers the actual
   complaint: the store was sweepable for weeks and stayed full because
   nothing ran the sweep, and an opt-in knob reproduces that exactly —
   nobody enables a setting they have not gone looking for. Gated on
   full-scope runs, on `auto_gc`, and on **no blind worktrees**: `gc` names
   an unreadable sibling and lets a human weigh it, while a side effect of
   a command typed for another reason has nobody to ask, so it declines.
4. **`embed.retain_days`, default 7** (tier 2). DISC-032 item 3, unbuilt
   until the mechanism it modifies was in use. Never evict rows younger
   than N days.

### Why the floor is not the LRU OBS-021 forbade

Same column, opposite comparison, opposite failure mode. `created_at` is
age-since-first-embed and `get()` records no access, so **age-as-a-ceiling**
("evict rows older than N") reads one as the other and discards exactly the
long-lived, still-live rows whose re-embed is least justified — OBS-021's
trap, now pinned by a test named for it. **Age-as-a-floor** ("keep rows
newer than N") never concludes an old row is dead, only that a young one is
not yet safe to call dead; being wrong costs a retained row instead of a
discarded one, and it needs no schema change. Real LRU still needs
`last_used_at`, still bumps `EMBED_SCHEMA_VERSION`, still drops the store —
a full re-embed to install the feature that saves storage.

What the floor buys is the residual gap DISC-032 accepted rather than
plugged: **a commit checked out in no working tree is invisible to the
liveness union.** Age cannot see that branch either — but the work that
made it was recent, and recency is a property the store does record.

## Measured result on this corpus

```
$ docdog gc
Evicted 114 stale embedding(s) — 661 live, 783 scanned.
  8 unused row(s) kept by the 7-day retention floor (--retain-days 0 to ignore it).
  Compacted 3.5 MB → 3.0 MB (reclaimed 588 KB).
```

588 KB that no previous version of this command could return. Unused fell
122 → 8 (16% → 1%); the superseded stratum fell 390 → 307 only because 83
of the evicted rows were old-recipe rows for dead content. `--prune-recipes`
would take the remaining 307 (46% of the file) and was deliberately **not**
run here — spending free-revert is the user's call, not the implementer's.

## One defect introduced and fixed in the same session

Adding the floor made `docdog status` say *"8 unused — run docdog gc to
evict them"* about 8 rows `gc` would refuse to evict. That is precisely the
drift OBS-021 built a shared `findUnusedRows` to prevent, reintroduced one
layer up: the count and the sweep agreed, and the *remedy sentence* did
not. `status` now computes the same floor and says so. **A shared query is
not a shared answer — the prose around it is part of the contract.**

## What is still not built

- **Capacity-bounded eviction** (keep at most N rows / M MB). Buildable
  without the LRU trap, since it would only order rows already unused. Not
  built: nobody has a size problem, which is DP-003 clause 3 instantiation
  zero, and 2 MB/year does not make one.
- **A second recipe stratum accumulating.** The current one is frozen; a
  *future* recipe change mints another. `--prune-recipes` is the answer and
  is one flag away, so this needs no design.
