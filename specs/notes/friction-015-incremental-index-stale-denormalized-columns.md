---
id: FRICTION-015
title: "Incremental index propagates frontmatter blob but not denormalized top-level columns (status/description/scope) on body-unchanged edits"
collection: issues
status: resolved
severity: inconvenient
fixed_date: 2026-07-11
resolution_approach: obsoleted
fix_commit: 095146bf77f1d52b8356b7e610407188342e1847
description: "Surfaced while backfilling commit_hash on TASK-001..004. A frontmatter-only edit whose body is unchanged takes the indexer's `unchangedForEdges` path (src/engine/indexer.ts:650-659), which writes back only `{ file_hash, frontmatter }`. The denormalized top-level columns `status`, `description`, and `scope` are NOT updated there — only the create/update (re-embed) paths refresh them. So a body-unchanged edit that flips `status:` (or edits `description:`/`scope:`) leaves the column that status filters and search previews read stale until a body change forces a re-embed or `docdog index --full` runs. commit_hash isn't denormalized, so this integrity pass was unaffected — the gap was found by reading the reconcile code, not by a broken result. Obsoleted 2026-07-11: DD-070's v3 rearchitecture deleted the v2 engine path, and the v3 indexer's whole-file-hash fast-path re-derives every column on any frontmatter edit — the gap is structurally excluded."
relationships:
  - references: DISC-019
    context: "DISC-019's DB-first flip makes the DB authoritative, so denormalized-column sync stops being a rebuildable-projection convenience and becomes a correctness invariant on the write path. Close this gap when DISC-019/DISC-020 promote to a proposal (the planned but not-yet-written PROPOSAL-022)."
  - references: FRICTION-006
    context: "Same reconcile neighborhood — FRICTION-006 handled a frontmatter `collection:` change via soft-delete+recreate; this is the sibling case of an in-place body-unchanged frontmatter change that the update path handles only partially."
  - references: DD-034
    context: "The on-disk frontmatter stays authoritative and correct; only the DB projection's denormalized columns drift. The DD-034 'file is load-bearing' guarantee is intact — this is a DB-query-surface staleness, not a data loss."
  - references: DD-070
    context: "obsoleted by v3: src/engine/indexer.ts and its unchangedForEdges path were deleted (P-023 §5), and under a disposable cache denormalized columns relaxed back to rebuildable projections (P-023 §1)"
  - references: PROPOSAL-017
    context: the batch tasks whose commit_hash backfill exposed the stale denormalized columns
  - references: TASK-004
    context: the control case — its body edit made it the only file counted as updated
  - references: DISC-020
    context: deferred its real fix there; closed in the same resolution pass
  - references: PROPOSAL-022
    context: the planned promotion that would have owned the column-sync invariant; P-023 rejected that framing
  - references: PROPOSAL-023
    context: resolution — its §1 relaxed the invariant; denormalized columns are disposable cache
---

# FRICTION-015: Incremental index doesn't refresh denormalized columns on body-unchanged frontmatter edits

## Trigger

Routine task-record integrity pass: backfilling `commit_hash` on
the four `done` PROPOSAL-017 batch tasks (TASK-001..004) and
resolving TASK-004's one stale acceptance-criterion. Three of the
four edits changed *only* frontmatter (`commit_hash: null` → a real
hash) with no change to the section body.

The incremental `docdog index` reported `0 created, 1 updated,
1 removed` — only TASK-004 (which also had a body edit) counted as
updated. That prompted a check of whether the three frontmatter-only
edits had actually reached the DB.

## Diagnosis

They *had* — reading `src/engine/indexer.ts` shows body-unchanged
sections whose file reached reconcile take the `unchangedForEdges`
path:

```js
// src/engine/indexer.ts:650-659
for (const { existing: ex, section } of unchangedForEdges) {
  vertices.push({ sectionKey: section.sectionKey, vertexId: ex._id, frontmatter: section.frontmatter });
  await db.collection(ex.collection).update(ex._key, {
    file_hash: file.fileHash,
    frontmatter: section.frontmatter,
  });
}
```

So the stored `frontmatter` blob **is** refreshed (that's why the
`commit_hash` backfill landed correctly on the incremental run).
But note what this update omits versus the create/update paths
(`indexer.ts:600-618` and `:634-646`): those write the denormalized
top-level columns

- `status`   (from `frontmatter.status`, default `current`)
- `description` (from `frontmatter.description`)
- `scope`    (from `frontmatter.scope`, default `shared`)
- `indexed_at`

The `unchangedForEdges` path writes none of them. The change
detector keys on a body-only content hash
(`contentHash = sha256(section.content)`, `indexer.ts:444`), so a
frontmatter-only edit never reaches the re-embed path that would
refresh those columns.

## Impact

For a body-unchanged edit that changes one of the denormalized
fields:

- **`status:`** — the top-level `status` column that status filters
  and consistency checks read stays at the old value. A record
  flipped `open` → `resolved` (body untouched) would still match a
  `status == "open"` query until something forces a re-embed.
- **`description:`** — search-result previews render the stale
  description.
- **`scope:`** — scope-scoped queries could include/exclude the
  vertex incorrectly.

It is silent: nothing warns that the column and the frontmatter blob
disagree. Severity is `inconvenient` rather than `blocks-work`
because the on-disk file stays correct (DD-034 intact), the drift is
narrow (only three fields, only on body-unchanged edits), and any
subsequent body edit or `docdog index --full` re-syncs it.

`commit_hash` is *not* denormalized, so this session's backfill was
fully applied — the gap was found by reading the code, not by a
wrong result.

## Workaround used

None needed for `commit_hash`. For a field that *is* denormalized,
`docdog index --full` rebuilds every vertex from disk and re-syncs
the columns. (This pass ran `--full` anyway, so the corpus is
consistent now.)

## What should change

Make the `unchangedForEdges` update path write the same denormalized
projection the create/update paths do — at minimum `status`,
`description`, `scope` — derived from `section.frontmatter` with the
same defaults. It's a mechanical (Tier-1) change: the columns are a
pure function of frontmatter, so no judgment is involved. Whether to
also bump `indexed_at` on a frontmatter-only edit is a smaller call
(arguably it *should* reflect "last time the DB row changed," not
"last time we re-embedded").

## Related

- **DISC-019 / DISC-020** — the DB-first flip and lossless-export
  contract (not yet promoted to a proposal — the planned
  PROPOSAL-022). Once the DB is authoritative and disk is an export,
  denormalized-column consistency is an invariant the write path must
  guarantee, not a projection nicety. Close this gap there if not
  sooner.
- **FRICTION-006** — indexer moving a vertex between collections on
  a `collection:` frontmatter change. Same reconcile code; the
  sibling case of a frontmatter change the indexer must act on.
- **DD-034** — the on-disk frontmatter remains the load-bearing
  authority; this is DB-query-surface drift, not data loss.

## Resolution (2026-07-11)

**Approach: obsoleted** — resolved by rearchitecture, not by the
proposed patch. DD-070's v3 cutover deleted the entire v2 engine
(`src/engine/indexer.ts`, including the `unchangedForEdges` path this
record diagnoses) in the session-6 deletion pass (commit `095146bf`),
and PROPOSAL-023 §1 explicitly relaxed the invariant this friction
leaned on: under a disposable cache, denormalized columns are
rebuildable projections again — a wrong column is a reindex away from
correct.

- **Why the gap can't recur in v3:** the v3 indexer's incremental
  fast-path keys on a whole-file hash (`sha256(raw)`,
  src/engine/discovery.ts — frontmatter included), so a
  frontmatter-only edit re-derives the file's vertices completely.
  There is no partial-update path that could leave `status` /
  `description` columns stale. (v2 keyed change detection on a
  body-only content hash — that asymmetry was the root cause.)
- **What shipped:** nothing against this friction directly; the
  surface died before the proposed column-sync patch was written.
- **Rejected alternatives:** making `unchangedForEdges` write the
  denormalized projection (this record's proposal) — correct against
  v2, mooted by deletion. PROPOSAL-022 §7 had promoted column sync to
  a write-path correctness invariant; PROPOSAL-023 rejected that
  framing along with DB-first.
- **Knock-on:** DISC-019 / DISC-020 — the records this friction
  deferred its real fix to — close in the same pass, resolved by
  DD-070.
