---
id: DD-051
title: "Embedding cache keyed by content hash"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-015 under DD-034's artifact-resilience lens. Embeddings are cached in a dedicated Arango collection keyed by content hash, so branch switches and repeated indexing skip re-embedding."
relationships:
  - supersedes: EJ-015
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-049
  - references: DD-050
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check
---

# DD-051: Embedding cache keyed by content hash

**Amendment (2026-07-14, PROPOSAL-029 shipped).** Two things below are
now out of date, and one of them was a bug in the key itself:

1. **Where it lives.** There is no Arango collection — there has not
   been one since DD-070. The cache is a SQLite table, and as of
   PROPOSAL-029 it is no longer a table *inside* `index.db` but its own
   file, `embeddings.db`, resolving to `<git-common-dir>/docdog/` when
   git answers and to `.docdog/cache/` otherwise. A table keyed by
   content had no business inside a file scoped to one working tree.
   Writes are `INSERT OR IGNORE` — the store is a grow-only set.
2. **The key is EOL-canonical.** The hash is taken over content whose
   line endings are normalized to LF first (`src/engine/discovery.ts`).
   Without that, the same record checked out under `core.autocrlf=true`
   hashes differently than the tree it was cut from — verified on this
   repo, where a worktree's `CONTRIBUTING.md` and the trunk's differ by
   every line ending — and the cache missed on every lookup for the one
   case it was built to serve. Line endings are a checkout policy, not
   content.

The claim below — that the cost of a branch/worktree round-trip is
zero — is true only with both corrections in place. Body preserved
as written.

Embeddings are cached in a dedicated Arango collection keyed by
content hash. This eliminates re-embedding on branch switches and
on repeated indexing of unchanged content.

## Indexer flow

1. Chunk the file, compute content hash.
2. Compare the hash to the vertex already in Arango — if unchanged,
   skip.
3. If changed, look up `embedding_cache[content_hash]`:
   - hit → reuse the embedding, no ONNX/Ollama call.
   - miss → generate, store in cache, store on the vertex.
4. The vertex document carries both `content_hash` and `embedding`
   (copied from the cache).

## Branch-switch performance

Branch switches change a subset of sections. Switching back, the
original content hashes are still in the cache, so the embedding
cost of the round-trip is zero. Branch-switch cost reduces to scan +
hash + cache lookup, all cheap.

## DD-034 check

Orthogonal and enabling. The cache is an internal acceleration layer
keyed by a pure function of artifact content, so it can never
introduce drift between the on-disk artifact and what an agent
retrieves — the embedding is always "the embedding of whatever text
is currently in the artifact," by construction.
