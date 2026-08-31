---
id: OQ-13
title: "Incremental indexing across branches"
collection: questions
status: resolved
related: [EJ-013, EJ-014]
relationships:
  - references: EJ-013
  - references: EJ-014
description: "Eliminated git-based commit hash tracking. Core indexer compares content hashes against Arango — branch-agnostic. Git diff is an optional fast-path optimization. Branch-specific changes handled via patches convention."
---

# OQ-13: Incremental indexing across branches

**Status:** RESOLVED (EJ-013 + EJ-014)

Eliminated git-based commit hash tracking entirely. Core indexer compares content
hashes against Arango — branch-agnostic. Git diff is an optional fast-path
optimization (tier 2). Branch-specific doc changes handled via patches convention
(tier 3). See EJ-014.
