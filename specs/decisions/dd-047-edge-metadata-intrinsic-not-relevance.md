---
id: DD-047
title: "Edge metadata is intrinsic properties, not pre-computed relevance"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-011 under DD-034's artifact-resilience lens. Edges carry intrinsic facts (type, role, context, source). Relevance is computed per query, not baked into the edge."
relationships:
  - supersedes: EJ-011
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-043
  - references: DD-046
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check
---

# DD-047: Edge metadata is intrinsic, not relevance-scored

Edge attributes must be intrinsic to the relationship — facts that
don't change depending on who's querying or why. Relevance is the
agent's job at query time, against task context plus these intrinsic
properties.

## Edges carry (intrinsic)

- `type` — relationship category (from the edge collection).
- `role` — directional meaning within the type.
- `context` — one-line factual summary of what connects the two
  vertices.
- `source` — who created the edge (authored frontmatter, indexer,
  skill, human).
- `date` — when created/updated.
- `discovered_via` — `explicit` (written in a `relationships:`
  block) or `inferred`.
- `anchor_text` — the literal text that motivated the edge.
- `status` — `current` | `superseded` | `deprecated`.

## Edges do NOT carry (query-dependent)

- ~~`weight`~~ — relevant to what? Depends on the task.
- ~~`confidence`~~ — confident for what purpose?
- Any pre-computed relevance score.

## DD-034 check

Preserved. Intrinsic edge attributes are stable facts an agent can
read and reason about without needing to know the query context
they were created in. Pre-computed relevance would bake one reader's
perspective into the artifact itself, which is the opposite of
artifact resilience.
