---
id: DD-045
title: "Glossary terms are individual graph vertices"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-009 under DD-034's artifact-resilience lens. Each glossary term is its own vertex; usage edges (`uses_term`, `defined_by`) give a usage index as a side effect of relationship extraction."
relationships:
  - supersedes: EJ-009
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-043
  - references: DD-044
  - references: DD-046
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — each term file stands alone
---

# DD-045: Glossary terms are individual graph vertices

Each glossary term is its own Arango document. Usage edges
(`uses_term`, `defined_by`) connect terms to the artifacts that
reference them, giving a usage index for free.

## What this enables

- Agent hits an unfamiliar term → definition + every artifact
  that uses it, in one traversal.
- Agent authoring a new artifact → "what does X mean?" → definition
  + usage examples as anchors.
- Progressive disclosure: start at the term, walk outward.

## Maintenance cost

Near-zero. The edges are a side effect of the same frontmatter-first
relationship pipeline that DD-043 describes — no separate extraction
pass, no ad-hoc authoring loop.

## DD-034 check

Preserved as a forward-looking commitment. A dedicated `terms`
collection is not currently in `vertex_collections`; when it lands,
the DD-034 test is trivial — each term file stands alone as a
self-contained definition readable by a vanilla agent, and its
`relationships:` block carries the `defined_by`/`uses_term` edges
as authoring artifacts, not inferences.
