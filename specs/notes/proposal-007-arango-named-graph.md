---
id: PROPOSAL-007
title: Arango named graph — register `docdog` for UI visualization + AQL brevity
collection: proposals
status: superseded
date: 2026-04-12
related:
  - PROPOSAL-003
  - DP-001
  - DP-002
relationships:
  - references: PROPOSAL-003
    context: consumes the edge collections PROPOSAL-003 populates
  - references: DP-001
  - references: DP-002
  - references: OQ-42
  - references: DP-003
description: Register a single named graph `docdog` during init that groups every dd_edges_* collection with a maximally permissive from/to listing all current vertex_collections. Unlocks the Arango UI graph viewer, enables GRAPH "docdog" AQL syntax, and gives first-time users something visible in the Graphs tab. Kept permissive — edge-definition enforcement would fight user-extensible collections per OQ-42/DP-002.
---

# PROPOSAL-007: Arango named graph for docdog

**Superseded 2026-07-06 by DD-070** — the Arango named graph dies with Arango; traversal ports to the embedded cache per PROPOSAL-023 §4.

## Motivation

After PROPOSAL-003 landed there are 230+ real edges in the self-
hosted graph — but the Arango UI's **Graphs** tab is empty. Edge
collections exist and traverse works, but Arango's visualization, the
`GRAPH "name"` AQL shorthand, and the "this project is a graph" user
signal all require a **named graph** registration that docdog
currently never creates.

This proposal closes the gap with ~40 LOC of infrastructure.

## Specification

### Named graph: `docdog`

A single graph named `docdog`, created by `setupCollections` after
all collections exist. It is registered via `db.graph("docdog")`.

### Edge definitions

One edge definition per shipped + user edge collection. Each
definition lists **all current vertex_collections** on both `from`
and `to` — intentionally permissive, no enforcement.

```json
{
  "collection": "dd_edges_semantic",
  "from": ["decisions", "principles", "notes", ...],
  "to":   ["decisions", "principles", "notes", ...]
}
```

### Idempotency + updates

- **On init / `docdog index`:** create the graph if missing;
  otherwise replace each edge definition to match the current
  `(vertex_collections, edge_collections)` snapshot.
- **On `docdog collections add`:** after creating the new vertex
  collection, re-run the edge-definition sync so the new collection
  appears in all edge definitions.
- **On `docdog collections remove`:** no graph update (per the
  existing behavior, `remove` doesn't drop the Arango collection —
  the collection stays, just the meta entry goes).

### Why maximally permissive

Strict `(from → to)` pairs are Arango's mechanism for rejecting
out-of-shape edges. Docdog's vertex vocabulary is user-extensible
(DP-002 / OQ-42), and `dd_edges_unspecified` is a catch-all by design
(PROPOSAL-003 §4). Constraining edges would fight both commitments.

We take the named-graph benefits (UI, AQL, discoverability) without
the enforcement feature. DP-003's escape hatch also argues for
permissive: direct AQL still works without `GRAPH "docdog"`.

## DP-001 / DP-002 / DP-003 compliance

- **DP-001:** pure mechanical. The graph definition is derived
  deterministically from `vertex_collections` + `edge_collections`.
  No inference, no judgment. ✅
- **DP-002:** doesn't touch meta collections. The named graph is
  Arango machinery, not user-facing vocabulary. ✅
- **DP-003:** adds a convenience layer, keeps the escape hatch.
  Direct AQL still works. ✅

## Not in scope

- Strict edge definitions / enforcement (would fight OQ-42)
- Per-project graph naming (`docdog_<project>` — no multi-project
  today per CLAUDE.md, one graph per DB is enough)
- Converting existing `traverse()` calls to `GRAPH "docdog"` syntax
  (optional cleanup, not required for the feature to be useful)
- SmartGraphs / enterprise features

## Estimated effort

Small.

- `src/arango/graph.ts` — ~50 LOC: create-or-update helper,
  idempotent sync against current collections
- `setupCollections` wiring — ~5 LOC
- `docdog collections add` hook — ~3 LOC
- Integration test — ~40 LOC: verify graph exists after init,
  verify edge definitions cover all current collections, verify
  update after a new collection is added

## Status

Proposed. Shipping alongside this note.
