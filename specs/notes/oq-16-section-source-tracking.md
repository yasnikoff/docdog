---
id: OQ-16
title: "Section-to-source-file tracking"
collection: questions
status: resolved
related: [EJ-017]
relationships:
  - references: EJ-017
description: "One section = one file. source_file field on every vertex. Indexer finds all vertices for a changed file by querying source_file. File renames handled via content hash: soft-delete old, insert new (embedding cache hit, no re-embed)."
---

# OQ-16: Section-to-source-file tracking

**Status:** RESOLVED (EJ-017)

One section = one file. `source_file` field on every vertex points to the section
file. Indexer finds all vertices for a changed file by querying `source_file`.
File renames: content hash comparison detects unchanged content in new file path —
soft-delete old, insert new (embedding cache hit, no re-embedding).
