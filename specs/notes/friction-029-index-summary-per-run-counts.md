---
id: FRICTION-029
title: The `docdog index` summary line reports per-run counts, not cumulative totals — a shrinking edge count reads as loss
collection: notes
status: resolved
description: The docdog index summary line reports per-run counts (vertices/edges/embedded parsed from only the files reindexed this run), so the edges figure is non-monotonic across incremental runs and reads as a cumulative graph total, prompting a false "did I lose edges?" alarm; harvested from the orchestrator adoption dogfood.
severity: cosmetic
relationships:
  - references: PROPOSAL-032
    context: The note's companion complaint — no `docdog status` on the CLI — is already resolved by PROPOSAL-032; the cumulative-footer fix proposed here would reuse the same collectStatus counts
  - references: OBS-013
    context: Harvested from continued orchestrator external-dogfood operation, same adoption run OBS-013 first reported
---

## What was reported

Harvested from the orchestrator adoption run
(`specs/investigations/docdog-adoption/feedback-2026-07-13-index-summary-per-run-counts.md`).
Two coupled frictions surfaced while answering "how big is the graph now?"
from a plain terminal after successive incremental indexes.

## 1. The summary line is per-run, but reads as a cumulative total

Three successive incremental `docdog index` runs printed:

```
347 reindexed — 629 vertices upserted, 0 removed,  292 edges,  629 embedded (0 reused)
190 reindexed — 190 vertices upserted, 1 removed, 2034 edges,    4 embedded (186 reused)
 61 reindexed — 169 vertices upserted, 0 removed,  111 edges,  111 embedded (58 reused)
```

The `edges` count went **292 → 2034 → 111** while the graph only ever
grew. The numbers are correct but **scoped**: incremental `docdog index`
selects the files whose `file_hash` changed, and for each deletes that
file's rows (`DELETE FROM edges WHERE from_id = ?`) and re-inserts what it
parses now. `stats.edges += r.edges` is summed over `changedFiles` only
(`indexer.ts`), so every figure on the line — vertices upserted, edges,
embedded, reused — describes **just the files touched this run**, never the
whole cache. Run 2's 2034 is the frontmatter-grown drain commit re-parsing
~190 files; run 3's 111 is the easy-wins commit's 61 files.

It is working as designed, but the label `edges` with no qualifier reads as
a graph total, and a number that legitimately shrinks while the graph grows
invites exactly the "did I lose edges?" question it prompted.

## 2. The companion complaint is already resolved

The note's second half — *there is no `docdog status` on the CLI, the
cumulative view lives only behind the `docdog_status` MCP tool* — is
**fixed**: PROPOSAL-032 (shipped 2026-07-14) added `docdog status` as a
thin CLI adapter over the same `collectStatus` engine the MCP tool uses.
A shell-only caller can now run `docdog status` to see cumulative totals.
The note predates that ship; recorded here so the loop closes.

## What should change (open — DP-001 tier 1-2, mechanical)

Both suggestions are pure rendering, no judgment:

1. **Qualify the label** — e.g. `edges parsed from reindexed files`
   instead of a bare `edges`, so the per-run scope is stated.
2. **Append a cumulative footer** — `graph total: <N> records / <M> edges`
   from the same counts `collectStatus` already computes. One extra
   `SELECT COUNT(*)` per table at the end of a run removes the ambiguity
   for free, and now that `docdog status` exists (§2) the footer and the
   status command would share one engine.

Same silent-vs-visible family as the other index-summary reports
(FRICTION-020, FRICTION-028): the summary line is the corpus owner's only
window into what indexing did, and an unqualified count is a window that
misleads.

## Resolution (2026-07-15 — resolved/feature)

Both suggestions shipped, as pure rendering (DP-001 tier 1-2):

1. **Per-run scope stated.** The summary line now reads
   `… reindexed — this run: N vertices upserted, … M edges, …`, so the
   `this run:` prefix pairs every per-run figure with its scope
   (`storage/indexer.ts`; the MCP `docdog_index` line in
   `mcp/tools/index-tool.ts` gained the same qualifier).
2. **Cumulative footer.** A second line, `Graph total: <N> record(s),
   <M> edge(s)`, is printed from two `SELECT COUNT(*)`s taken after the
   run — the whole-graph size the question actually wants. Surfaced on
   both the CLI and MCP summaries. The counts also ride on
   `CacheIndexStats` as `totalVertices` / `totalEdges` so both renderers
   and tests read one source.

Verified on this corpus: a no-op incremental run prints
`0 edges` for the run and `Graph total: 297 record(s), 1456 edge(s)` —
the shrinking per-run count no longer reads as loss. §2's companion
complaint (`docdog status` absent) was already closed by PROPOSAL-032.
