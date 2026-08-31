---
id: OQ-33
title: "Ingesting external content into DB-only collections"
collection: questions
status: obsolete
related: [OQ-32]
relationships:
  - references: OQ-32
  - references: DD-070
    context: DB-only collections cannot exist in v3 — disk is canonical and the cache disposable, so everything indexed is a file somewhere
description: "OBSOLETE — the dependency (OQ-32's DB-first write path) died at the v3 pivot: DD-070 makes disk canonical, so DB-only content has no home by design and docdog_create writes files. If a keep-content-out-of-the-repo need returns, it is a new v3 question. Original question: how to ingest external content into DB-only collections."
---

# OQ-33: Ingesting external content into DB-only collections

**Status note (2026-07-11, FEATURE-002):** obsolete — DB-only
collections cannot exist in v3: disk is canonical and the cache is
disposable (DD-070), so everything indexed is a file somewhere. The
question's proper solution (OQ-32's DB-first write path) died with
the pivot. If "indexed but not committed to this repo" becomes a
real need again, it is a new question against the v3 architecture.

For the migration of working-context content: refinements live in a separate
source location but should end up in the destination project's ArangoDB, not as
files in the destination repo.

**Current workarounds:**
- Temporary scan_paths pointing to the source, index, remove from config
- Temp directory: stamp files there, index, delete directory

**Proper solution (depends on OQ-32):** `docdog_create` MCP tool or a
`docdog ingest --db-only` flag that indexes files but doesn't keep them.

**For MVP:** The workaround (temp scan_paths) is fine. Proper solution comes with
the DB-first write path.
