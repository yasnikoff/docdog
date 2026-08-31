---
id: PROPOSAL-008
title: "`docdog traverse` — CLI wrapper for graph traversal"
collection: proposals
status: superseded
date: 2026-04-12
related:
  - PROPOSAL-003
  - PROPOSAL-007
  - OBS-001
relationships:
  - references: PROPOSAL-003
    context: wraps its §8.1 effective_type traversal in a terminal surface — the 230-edge seeding session was the motivating itch
  - references: PROPOSAL-007
  - sourced_from: OBS-001
    context: "#1 on the wish list from the initial self-assessment"
  - references: PROPOSAL-006
  - references: DP-002
  - references: PROPOSAL-005
  - references: DISC-010
  - references: DP-001
    context: pure mechanical wrapper over the existing traverse path
  - references: DP-003
  - references: FR-001
description: "SUPERSEDED at the v3 pivot: the traverse CLI died at step 6 and was not resurrected (only suggest-edges was, PROPOSAL-024); graph walks are served by the docdog_traverse MCP tool (kernel 8). A CLI wrapper revival would be a new proposal amending DD-070 §4. Original v2 pitch: a ~30-LOC CLI wrapper around the traverse query, motivated by Arango-UI-or-tsx-script friction."
---

# PROPOSAL-008: `docdog traverse` CLI

**Status note (2026-07-11, FEATURE-002):** superseded — the v2
`traverse` CLI died at v3 step 6 (DD-070 §3); `docdog_traverse`
(kernel 8 MCP) is the surviving surface, and the Arango-UI friction
that motivated a terminal wrapper is gone with Arango itself. If
terminal graph walks become a real need again, that is a new
proposal amending DD-070 §4 — PROPOSAL-024 is the precedent for
what earns resurrection.

## Motivation

The MCP surface has `docdog_traverse` and it works (PROPOSAL-003 §8.1
effective_type wired and tested), but there's no terminal equivalent.
During the PROPOSAL-003 seeding session (230 edges across 83 specs),
the assistant repeatedly wanted to sanity-check each batch visually
without opening the Arango UI. Options today:

1. Open Arango UI → Graphs → docdog (now works after PROPOSAL-007)
2. Write a one-off `npx tsx` script
3. Direct AQL via arangosh

None are terminal-native. A CLI wrapper closes the gap.

## Specification

```
docdog traverse <id-or-_id> [options]

Options:
  --depth <n>            Traversal depth (default: 1, max: 3)
  --direction <dir>      outbound | inbound | any (default: any)
  --collections <list>   Comma-separated edge collections (default: all)
  --json                 Raw JSON output
```

### Behavior

1. Resolve the argument: if it looks like `collection/key`, use as
   `_id` directly; otherwise look up by `id` field via the global id
   map (same scan used by the indexer's pass 1).
2. Delegate to the existing `traverse()` function in
   `src/arango/queries.ts`.
3. Apply `effective_type` resolution via `RelationsRegistry.load()`
   so both directions read naturally.
4. Render as a readable tree (default) or raw JSON (--json).

### Text output format

```
PROPOSAL-006 — Meta collections reshape
  ↓ implements            → DP-002                (depth 1)
  ↓ blocks                → PROPOSAL-003           (depth 1)
  ↓ blocks                → PROPOSAL-005           (depth 1)
  ↓ discussed_in          → DISC-010               (depth 1)
  ↓ references (3)        → DP-001, DP-003, FR-001 (depth 1)
  ↑ referenced by         ← DP-002                (depth 1)
  ↑ depended on by        ← PROPOSAL-003           (depth 1)
```

Arrows: `↓` outbound, `↑` inbound. Grouped by effective_type when a
single edge type has multiple targets.

## DP-001 / DP-002 / DP-003 compliance

- **DP-001:** pure mechanical wrapper over existing traverse + the
  existing registry lookup. No inference.
- **DP-002:** consumes dd_relation_meta via the registry. ✅
- **DP-003:** adds a first-class CLI command for what's currently a
  direct-DB escape hatch. The escape hatch stays.

## Estimated effort

Small.

- CLI registration in `src/cli/commands/traverse.ts` (~40 LOC)
- ID resolution helper that accepts either `_id` or `id` (~20 LOC,
  can reuse the indexer's `buildGlobalIdMap`)
- Text rendering / grouping (~30 LOC)
- Integration test (~50 LOC): resolve-by-id, effective_type in both
  directions, --json round-trip

**Total:** ~90 LOC + ~50 LOC tests.

## Not in scope

- Interactive/paged output
- Colored output (future polish)
- Multi-step path queries (agentic follow-up)

## Status

Proposed. Highest value/effort ratio in the OBS-001 wish list.
