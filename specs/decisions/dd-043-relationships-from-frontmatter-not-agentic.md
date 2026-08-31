---
id: DD-043
title: "Relationships come from frontmatter blocks, not agentic extraction"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-007, reframed under DD-034. EJ-007 proposed agentic cross-reference extraction from prose; v2 shipped PROPOSAL-003's mechanical `relationships:` frontmatter block. DD-034 makes that block the principled answer: relationships are authored, not inferred."
relationships:
  - supersedes: EJ-007
    context: "reframe under DD-034 — EJ-007's agentic extraction is replaced by PROPOSAL-003's frontmatter-block mechanics"
  - references: DD-034
    context: "relationships: block is load-bearing under DD-034's artifact-resilience test"
  - references: PROPOSAL-003
    context: "introduced the frontmatter-block pipeline this decision ratifies"
  - references: EJ-004
  - references: EJ-008
  - references: EJ-011
  - references: DD-040
    context: cache-tier agentic enrichment on working collections stays allowed per DD-040, provided surviving relationships get written back to frontmatter
---

# DD-043: Relationships come from frontmatter blocks, not agentic extraction

Cross-reference edges in docdog's graph are materialized from the
`relationships:` frontmatter block on each artifact. They are
**authored by the agent writing the artifact**, not inferred by
an AI pass over prose.

## What this supersedes

EJ-007 proposed two modes of AI-agentic extraction — a large
initial pass and an incremental pass on changed chunks — to pull
edges out of free-form prose (*"Related: DP-11", "see DD-ARCH-19",
"per the principle in…"*). V2 went a different direction:

- PROPOSAL-003 shipped the `relationships:` frontmatter block as
  a mechanical feature.
- DD-034 then elevated that block to a principle: the disk
  frontmatter is the source of truth for edges, and the graph is a
  derived mirror.

EJ-007's problem framing is still correct — prose-embedded
cross-references are too varied for regex. The resolution is
different: **don't put cross-references in prose**. Put them in
the `relationships:` block at authoring time. The mechanical
pipeline reads them from yaml during indexing.

## What stays

- **Agent involvement at authoring time.** The agent writing a
  decision or task is still the entity that decides which ids
  belong in `relationships:`. The decision is agentic; only the
  *extraction* is mechanical.
- **Room for agentic enrichment on working collections.** Skills
  that discover a useful link may create edges via `docdog_relate`
  on working collections (notes, observations) as cache-tier
  enrichment per DD-040 — as long as the relationship that
  deserves to survive ejection gets written back into frontmatter.

## DD-034 check

Reframed. EJ-007's statement conflicted with the artifact-
resilience test: a graph built by an agent pass over prose has
no disk-side source of truth, so it cannot be reconstructed by a
vanilla agent without the pass being re-run. DD-043 aligns with
DD-034 by making the disk-side frontmatter the only sanctioned
source for edges.
