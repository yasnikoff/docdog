---
id: OQ-32
title: "DB-first write path — `docdog_create` / `docdog_update` MCP tools"
collection: questions
status: resolved
related: [EJ-029]
relationships:
  - references: EJ-029
  - references: DD-070
    context: resolved by — writes are disk-first; the DB-first option rejected
description: "Currently only way to create a vertex is: write .md file → docdog index. EJ-029 requires MCP tools that write directly to ArangoDB for working-context collections. Without this, agents can't create content without a disk intermediate."
---

# OQ-32: DB-first write path — `docdog_create` / `docdog_update` MCP tools

**Resolved 2026-07-06 by DD-070** — writes are disk-first: create/update/relate edit the file, then reindex. The DB-first option is rejected.

Currently the only way to create a vertex is: write .md file → `docdog index`.
EJ-029 requires MCP tools that write directly to ArangoDB for working-context
collections (refinements, discussions). Without this, agents can't create content
without a disk intermediate.

**Scope:** Create, update, and soft-delete vertices via MCP. The indexer remains
for disk→DB (published specs edited by hand). Export remains for DB→disk.

**Design considerations:**
- Should `docdog_create` auto-embed? (yes — same as indexer)
- Should it auto-extract edges? (no — that's the agent's job via `docdog_relate`)
- Frontmatter format or structured fields? (structured — it's an API, not a file)
- Conflict with indexer? (if a vertex was created via MCP and also exists as a file,
  which wins? Probably: source_file=null means "DB-created, no file backing")
