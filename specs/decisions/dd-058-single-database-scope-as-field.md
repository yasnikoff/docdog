---
id: DD-058
title: "Single ArangoDB database per project; scope is a per-document string field"
collection: decisions
status: superseded
date: 2026-04-13
description: "DD-mirror of EJ-022 under DD-034's artifact-resilience lens. All project data lives in one Arango database. Every vertex carries a free-string `scope` field (default `shared`). Edges cross scopes freely; scope filtering is a caller concern."
relationships:
  - supersedes: EJ-022
    context: "mirror under DD-034's artifact-resilience lens"
  - supersedes: DD-052
    context: "closes the historical link chain: EJ-016 → EJ-022 → DD-058, mirrored as DD-052 → DD-058"
  - references: DD-046
  - references: DD-047
---

# DD-058: Single database, scope as a per-document field

**Superseded 2026-07-06 by DD-070** — the single-ArangoDB-database model dies with Arango; scope-as-field survives in the cache schema (DD-070 §6).

All data for a project lives in **one** ArangoDB database. Every
vertex carries a `scope: string` field with a default of
`"shared"`. Scope is a free string — no enum, no central
registration.

## Why not database-per-scope

Database-per-scope was the original model (EJ-016, historically
mirrored as DD-052). It was abandoned because ArangoDB edges
cannot cross databases, and the primary use case — personal
notes that reference shared decisions — depends on real graph
edges across scope boundaries.

The alternative EJ-016 reached for (plain `ref_*` string fields
resolved by Foxx) turns traversal into a manual string-joining
exercise and loses most of the graph model's value. One database
with a scope field keeps the graph connected.

## Edge behavior

Edges have no scope field. Traversal follows edges regardless of
the scope of the vertices they connect. Scope filtering is
applied to returned vertices by the caller — `docdog_search`, a
user-written query, or a skill's filter block. This is
DP-001-clean: the data layer stays mechanical, the filter
decision lives at the call site.

## DD-034 check

Preserved. Scope is a frontmatter-visible field on each artifact,
readable without docdog running. A vanilla agent that finds a
note tagged `scope: personal` can tell immediately that it's not
part of the shared corpus — no graph query required.
