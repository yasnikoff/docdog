---
id: FRICTION-006
title: Indexer silently ignores collection reassignment in frontmatter
collection: issues
status: resolved
fixed_date: 2026-04-14
description: Changing a file's `collection:` frontmatter field and re-running docdog index does NOT move the vertex between collections. The reconcile path matches by section_key across all collections and updates in place, so the vertex stays in its original collection with new content. No warning, no error.
severity: blocks-work
relationships:
  - references: DISC-001
  - references: API-IMPROVEMENT-001
  - references: PROPOSAL-002
  - references: OQ-01
  - references: FRICTION-002
  - references: FRICTION-007
---

# Friction: indexer silently ignores `collection:` reassignment

## What happened

During the OQ→questions migration, I changed `collection: notes` to
`collection: questions` in 41 files and ran `docdog index`. Result:

- Indexer processed all 41 files.
- Output: "41 to reconcile, 0 created, 41 updated, 0 removed."
- Every vertex was **updated in place in the `notes` collection**. The
  `questions` collection stayed empty.
- Subsequent `docdog search` still returned them as `[notes]`.
- No warning that `collection: questions` in frontmatter had been ignored.

## Root cause (from reading `src/engine/indexer.ts`)

`reconcileFile()` at line 275 calls `loadExistingVerticesForFile()`, which at
line 400 iterates ALL `vertex_collections` and gathers existing vertices by
`source_file`. Matching is then done by `section_key` in a single
collection-agnostic map (line 281–285). On match:

```ts
await db.collection(ex.collection).update(ex._key, { ... });
```

The update writes to the OLD collection (`ex.collection`), never considering
whether the parser's `section.collection` differs. Collection reassignment
is a silent no-op.

## Expected

One of:

1. **Move semantics (preferred):** if `ex.collection !== section.collection`,
   soft-delete the old vertex and create a new one in the target collection.
   Counts as `moved: N` in the output summary.
2. **Fail fast:** detect the mismatch, error out with a clear message, refuse
   to index until the user resolves it (e.g. by first deleting the old entry).
3. **At minimum, warn:** log "WARNING: section_key OQ-01 exists in collection
   'notes' but frontmatter requests 'questions' — ignoring move" and continue.

Option 1 is the clean fix. Edges pointing at the vertex would either be
rewritten or broken; the design needs to decide which.

## Workaround (used this session)

Wrote `.docdog/scripts/move-collection.ts` that soft-deletes entries from
the source collection by `source_file` prefix, then re-indexing creates
fresh entries in the target. See `specs/notes/api-improvement-collection-move.md`
for the full proposal.

## Impact

Blocks work on collection migrations. Would also bite any user reorganizing
their taxonomy mid-project. The silence is the worst part — output says
"updated" and everything looks fine until you search and see wrong collection.

## Related

- FRICTION-002 (both surface indexer rigidity around schema changes)
- FRICTION-007 (`docdog run` arg parsing, blocked the workaround until fixed)

Surfaced: 2026-04-12 during OQ→questions promotion.

## Resolution (2026-04-14)

Implemented **move semantics** in `reconcileFile`. When a matched
section's `ex.collection !== section.collection`, the old vertex is
soft-deleted with edge cascade and a fresh vertex is created in the
target collection. The move is logged per-record
(`Moved: [DD-MOVE] decisions → notes`) and summarized in the top-level
output (`Indexed: N created, N updated, N removed, N moved`).

**Edge behavior:** inbound edges from other files become soft-deleted
via cascade. They re-materialize when those files are next indexed, or
immediately on `docdog index --full`. A reminder line prints after any
move. Accepted trade-off: rewriting `_to` across arbitrary edge
collections was judged too coupled; `--full` is the honest knob.

Covered by `graph-pipeline.test.ts > moves vertex between collections
when frontmatter collection changes`.
