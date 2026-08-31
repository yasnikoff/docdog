---
id: OQ-17
title: "Text content — stored in Arango or file reference?"
collection: questions
status: resolved
related: [EJ-013, EJ-014]
relationships:
  - references: EJ-013
  - references: EJ-014
description: "Full text stored in Arango. Graph is self-contained — MCP queries return content directly without filesystem access. Staleness managed by content hash comparison during indexing. Also enables git-free operation."
---

# OQ-17: Text content — stored in Arango or file reference?

**Status:** RESOLVED (EJ-013)

Full text stored in Arango. Graph is self-contained — MCP queries return content
directly without filesystem access. Staleness managed by content hash comparison
during indexing. Also enables git-free operation (EJ-014 tier 1).
