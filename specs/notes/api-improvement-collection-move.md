---
id: API-IMPROVEMENT-001
title: Indexer should honor collection reassignment (move semantics)
collection: proposals
status: superseded
related:
  - FRICTION-006
  - EJ-017
  - EJ-029
relationships:
  - references: FRICTION-006
  - references: EJ-017
  - references: EJ-029
  - references: OQ-01
description: "SUPERSEDED at the v3 pivot: the reconcile problem dissolved — the cache is disposable and rebuilt from disk (DD-070), so a changed collection: lands where frontmatter says on the next index; there is no persistent vertex to move and no edges to rewrite. Original v2 proposal: indexer move semantics (soft-delete + create + edge rewriting) behind a default-on config flag."
---

# API improvement: indexer should honor collection reassignment

**Status note (2026-07-11, FEATURE-002):** superseded — v3's
disk-canonical architecture (DD-070) dissolved the problem this
proposal solves. The cache is disposable and rebuilt from
frontmatter, so `collection:` reassignment takes effect on the next
`docdog index` with nothing to soft-delete or rewrite; FRICTION-006's
v2 reconcile bug has no v3 equivalent.

**Context:** see FRICTION-006 for the bug this addresses.

## Current behavior

`reconcileFile()` matches existing vertices by `section_key` across all
vertex collections, then updates whichever collection the vertex currently
lives in. The parser's `section.collection` is only consulted on **create**
(line 343: `db.collection(section.collection).save(vertex)`). On **update**
(line 354), it uses `ex.collection` — the existing collection, not the
requested one. Collection reassignment via frontmatter is silently dropped.

## Proposal: move semantics

When `ex.collection !== section.collection`:

1. **Soft-delete** the existing vertex in `ex.collection`:
   `db.collection(ex.collection).update(ex._key, { deleted_at: now })`
2. **Create** a new vertex in `section.collection` using the normal create path.
   This generates a fresh `_key` and `_id`.
3. **Rewrite inbound edges** from the old `_id` to the new `_id`. This is the
   hard part — see "Edge handling" below.
4. Count as `moved: N` in the reconcile summary, distinct from created/updated/
   removed.

### Edge handling

Edges reference vertices by `_id` (`{collection}/{_key}`). A move changes the
`_id`, so edges pointing at the old vertex become dangling.

Options:

**A. Rewrite edges in the same transaction.** Query all edge collections for
edges with `_from` or `_to` matching the old `_id`, update to the new `_id`.
Atomic, preserves graph. Cost: one AQL pass per edge collection per move.
For a batch move (41 OQs), this is 41 × N edge collections queries unless
batched. Acceptable at this scale.

**B. Leave edges pointing at the soft-deleted vertex.** Simpler. Edges
still work for traversal if queries filter `deleted_at == null` on the
target vertex — but then the edge is effectively dangling. On GC, the
edge becomes orphaned. Cleaner to rewrite.

**C. Refuse to move if edges exist.** Print "Cannot move OQ-01: 3 edges
reference it. Resolve edges first." User has to manually handle. Safe
but painful.

**Recommendation:** A (rewrite in transaction). For the current scale
(thousands of vertices max), the AQL cost is negligible. Document that
move-via-frontmatter rewrites edges.

## Alternative: fail-fast mode

For users who want strict semantics, add a config flag:

```yaml
index:
  on_collection_change: move    # default: auto-move with edge rewrite
  # on_collection_change: error # alternative: fail with clear message
  # on_collection_change: warn  # alternative: warn and ignore (current behavior + warning)
```

Default to `move`. `error` is for users who want to enforce immutable
collection assignment as a schema discipline. `warn` is the "current
behavior but at least tell me" option.

## Why not require deleting via CLI first?

The current workaround — the `.docdog/scripts/move-collection.ts` written
this session — does exactly this: soft-delete via AQL, then index. It works
but it's a two-step manual process the user has to discover. Making the
indexer handle it removes a sharp edge.

## Testing

Add integration tests in `tests/integration/indexer.test.ts`:

1. **Move with no edges:** index file in `notes`, change frontmatter to
   `questions`, re-index. Assert: old notes entry soft-deleted, new questions
   entry exists, content unchanged, `section_key` preserved.
2. **Move with edges:** as above but with an edge pointing at the vertex.
   Assert: edge `_to` updated to new `_id`, still reachable via traversal.
3. **Move with inbound + outbound edges.** Both rewritten.
4. **Batch move (N > 1 files in one index run):** all moves complete, all
   edges rewritten.
5. **`on_collection_change: error` mode:** index fails with clear message,
   original vertex untouched.

## Estimated effort

Small. The logic is ~30 LOC in `reconcileFile()` plus edge rewriting helper
(~50 LOC across the 5 edge collections). Tests ~100 LOC. Total: ~200 LOC
plus whatever is needed for the config flag plumbing.

## Related improvements this unlocks

- Taxonomy refactoring: users can reorganize their spec structure without
  writing custom scripts.
- OQ → questions (this session): directly supported.
- Converting notes → decisions as ideas mature: natural workflow.
- Automated migrations: "docdog refactor move-ids OQ-* questions" as a
  future CLI helper built on top of this primitive.

## Status

Proposed. Not yet committed to implementation. File FRICTION-006 references
this as the canonical solution.

Surfaced: 2026-04-12.
