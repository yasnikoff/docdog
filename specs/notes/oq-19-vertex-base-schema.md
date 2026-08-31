---
id: OQ-19
title: "Vertex base schema — shared fields across all vertex collections"
collection: questions
status: resolved
description: "RESOLVED by the v3 embedded-cache schema (DD-070): one shared vertex shape across all collections in the disposable SQLite cache, rebuilt from disk, with the frontmatter contract (id, title, collection, status, description) as the durable half. The Arango-era candidate list (_key, embedding, indexed_from_commit) is historical."
relationships:
  - references: DD-070
    context: "the v3 architecture that resolved this — the cache schema is the shared vertex shape, disk frontmatter the durable contract"
---

# OQ-19: Vertex base schema

**Status note (2026-07-11, FEATURE-002):** resolved by v3 (DD-070) —
the embedded SQLite cache defines one shared vertex shape for all
collections (`src/storage/schema.ts`), rebuilt from disk; the
frontmatter contract carries the durable half. The candidate list
below is the Arango-era sketch, kept for history.

Shared fields across all vertex collections. Not yet defined. Candidate fields:

```
_key, title, content, embedding, source_file, heading_path,
status, indexed_at, indexed_from_commit
```

Must be consistent across all vertex types. Project-specific collections can
extend but not contradict the base.
