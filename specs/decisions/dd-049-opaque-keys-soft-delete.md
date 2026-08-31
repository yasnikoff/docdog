---
id: DD-049
title: "Auto-generated opaque Arango keys with soft delete"
collection: decisions
status: superseded
date: 2026-04-13
description: "DD-mirror of EJ-013 under DD-034's artifact-resilience lens. Arango `_key` is auto-generated and opaque; meaningful identifiers live as indexed fields. Deletes are soft with a TTL garbage collector."
relationships:
  - supersedes: EJ-013
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-046
  - references: DD-051
---

# DD-049: Opaque keys, soft delete

**Superseded 2026-07-06 by DD-070** — opaque keys and soft-delete+TTL were DB-canonical mechanics; in v3 deletion means deleting the file, and gc is cache eviction.

## Keys

ArangoDB auto-generates every `_key`. Keys are opaque and carry no
functional load. The identifiers agents and humans actually use
(`DD-049`, `EJ-013`, content hashes, source paths) live as indexed
fields on the vertex, not as keys.

Meaningful keys couple document identity to content structure, so
any rename, split, merge, or format change breaks every edge that
references the document. Opaque keys eliminate that failure mode
by construction.

## Soft delete

Vertices are soft-deleted via a `deleted_at` timestamp; all queries
filter `deleted_at == null`. `docdog gc` permanently removes
documents older than the configured TTL. Recent soft-deletes are
recoverable — a cheap safety net for a crashing indexer, not a
version history.

## DD-034 check

Orthogonal. The storage layer's key strategy is invisible to a
vanilla agent reading markdown. What DD-034 requires is that the
stable, meaningful identifiers (the `id:` in frontmatter) survive
indexing — which is exactly what keeping IDs as indexed fields
rather than `_key` guarantees.
