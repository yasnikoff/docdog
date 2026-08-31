---
id: PROPOSAL-011
title: Status-aware search filtering
collection: proposals
status: shipped
date: 2026-04-12
related:
  - OBS-001
relationships:
  - sourced_from: OBS-001
    context: "#7 on the wish list"
  - references: DP-001
    context: pure filter on an existing field, no inference
  - references: DP-002
  - references: DP-003
  - references: PROPOSAL-023
    context: "where it actually shipped — the v3 search rebuild (§7 step 4) carried status/excludeStatus as vertex-level WHERE clauses from the start, and CLI + MCP wiring followed at step 5"
  - references: PROPOSAL-027
    context: "the generalization question answered: the generic where filter deliberately refuses status/collection/scope keys (one syntax path per filter) because status needs list allowlist + blocklist semantics that single-value equality cannot express"
description: Add `--status <list>` to `docdog search` and `--status` / `--exclude-status` to `docdog_search` MCP so agents can query only accepted decisions, skip proposed proposals, or filter by any status the project uses. Status is already indexed; the filter surface just needs wiring.
---

# PROPOSAL-011: Status-aware search filtering

## Motivation

Every vertex has a `status` field (`current`, `accepted`, `proposed`,
`resolved`, `open`, `draft`, etc.) stored by the indexer. Search
currently ignores it. Asking "what's our stance on concurrent
writes" returns proposed proposals alongside accepted decisions and
the agent has to filter in its head.

The index already has everything needed — just expose the filter.

## Specification

### CLI

```
docdog search <query> [--status <list>] [--exclude-status <list>]
```

- `--status accepted,current` — return only vertices matching one
  of the listed statuses
- `--exclude-status proposed,draft` — return everything except these
- Both accept comma-separated lists
- Default: no filter (current behavior)

### MCP `docdog_search`

Add optional `status` and `exclude_status` array parameters with the
same semantics. Keep existing shape backwards-compatible.

### Behavior

Filter applied AFTER vector ranking so relevance scores stay
consistent. Vertices without a status field are treated as
"unknown" — included by default, excluded if `--status` is set.

## DP-001 / DP-002 / DP-003 compliance

- **DP-001:** pure filter on an existing field. No inference. ✅
- **DP-002:** N/A — status values are free-form strings the agent
  authors. Docdog doesn't prescribe a status vocabulary. (A future
  proposal could put status vocabulary into a meta collection if
  that becomes a real pain point.)
- **DP-003:** extends the search command surface rather than forcing
  agents into direct AQL filters. ✅

## Estimated effort

Very small.

- Add `status` + `exclude_status` to the search AQL filter (~10 LOC)
- CLI option parsing (~10 LOC)
- MCP tool schema update (~5 LOC)
- Integration test (~40 LOC)

**Total:** ~25 LOC + ~40 LOC tests.

## Not in scope

- Prescribing a status vocabulary (see DP-002 footnote above)
- Auto-filtering based on query heuristics ("proposed" queries
  include drafts) — that's agent judgment

## Status

Shipped — discovered already implemented on 2026-07-14 when this
record was picked up for implementation. The v3 search rebuild
(PROPOSAL-023) carried the filter from day one rather than porting
it as a separate feature: `status` / `excludeStatus` in
`src/storage/search.ts` (`vertexFilters`), `--status` /
`--exclude-status` on the CLI, `status` / `exclude_status` on the
`docdog_search` MCP schema, covered by
`tests/unit/storage-search.test.ts`.

Two deliberate divergences from the spec above:

- Filtering happens **inside each retrieval leg** (plain WHERE
  clauses before BM25/cosine ranking), not after ranking. At docdog
  scale this is cheaper and fusion ranks whatever survives; the
  "scores stay consistent" concern doesn't arise because both legs
  see the same filtered candidate set.
- There are no status-less vertices to treat as "unknown": the
  indexer defaults a missing `status:` to `current` at index time,
  so the allowlist matches them only if `current` is listed. The
  blocklist additionally keeps `status IS NULL` rows as a
  belt-and-braces guard.
