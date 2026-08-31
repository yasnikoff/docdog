---
id: DD-054
title: "Filesystem ownership is single-parent; multi-path discovery is the graph's job"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-018 under DD-034's artifact-resilience lens. A section file belongs to exactly one collection directory. Multiple ways to reach that section are handled by graph edges, not by filesystem multi-inclusion."
relationships:
  - supersedes: EJ-018
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-053
  - references: DD-047
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — relationships frontmatter is the load-bearing authoring contract
---

# DD-054: Single filesystem parent, graph does multi-path

A section file lives in exactly one collection directory. That
directory is its single filesystem parent. Any other way to reach
the section — "it's also relevant to workflows," "it's the
canonical example for principle X" — is a graph edge, not a
second filesystem home.

## Why not multi-inclusion

- **Unambiguous ownership.** Exactly one place answers "where
  does this file live," which means exactly one place answers
  "who edits it on merge conflict."
- **No duplication of graph behavior.** Edges already provide
  multi-path discovery (DD-047's intrinsic-edge model). A second
  filesystem inclusion would be a worse copy of what the graph
  already does correctly.
- **Single-path indexer.** The indexer reads each file exactly
  once. No dedup, no cascading updates, no "which parent's
  frontmatter wins."

## DD-034 check

Preserved cleanly. Filesystem single-parenthood is how a vanilla
agent reading `specs/` knows the file only has to be consistent
with itself, not reconciled against multiple inclusion sites.
Multi-path discovery happens through the `relationships:`
frontmatter block, which is the authoring contract DD-034 makes
load-bearing.
