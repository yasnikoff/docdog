---
id: CONCEPT-COLLECTION-DECISIONS
title: "Collection: decisions"
collection: concepts
status: current
concept_kind: collection
name: decisions
scope: shipped
description: Durable commitments about architecture, principles, or direction.
when_to_use: When the user commits to a direction that shapes future work and
  future work should cite it.
when_not_to_use: Exploratory ideas go in discussions; bugs and limitations go in issues.
examples:
  - DD-001
status_vocabulary:
  current:
    description: Active commitment driving current work.
  superseded:
    description: Replaced by a newer decision with a supersedes edge.
  deprecated:
    description: No longer active but still referenced; kept for history.
---

# Collection: decisions

Durable commitments about architecture, principles, or direction.

**When to use:** When the user commits to a direction that shapes future work and future work should cite it.

**When not to use:** Exploratory ideas go in discussions; bugs and limitations go in issues.

**Examples:** DD-001

## Status vocabulary

- `current` — Active commitment driving current work.
- `superseded` — Replaced by a newer decision with a supersedes edge.
- `deprecated` — No longer active but still referenced; kept for history.
