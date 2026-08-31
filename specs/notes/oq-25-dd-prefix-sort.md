---
id: OQ-25
title: "`dd_` prefix sorts mid-alphabet among user collections"
collection: questions
status: obsolete
description: "OBSOLETE — the premise (ArangoDB UI collection listing) died at the v3 pivot (DD-070): no Arango, no UI, no dd_* collection namespace in the SQLite cache. Original question: the dd_ prefix sorted mid-alphabet among user collections in the Arango UI."
relationships:
  - references: DD-070
    context: the pivot that removed ArangoDB entirely — no collection-listing UI and no `dd_*` namespace in the embedded cache, so the sort annoyance cannot recur
---

# OQ-25: `dd_` prefix sorts mid-alphabet among user collections

**Status note (2026-07-11, FEATURE-002):** obsolete — v3 (DD-070)
removed ArangoDB entirely; there is no collection-listing UI and no
`dd_*` namespace in the embedded cache, so the annoyance this
question tracked cannot recur.

In ArangoDB UI, `dd_edges_semantic` appears between `decisions` and `domain`.
Not a blocker — but worth reconsidering the prefix if it becomes annoying.
Alternatives considered: `_` (conflicts with ArangoDB system), `__`, `system_`.
Revisit after more projects use docdog and we see how the UI feels.
