---
id: CONCEPT-COLLECTION-RECONCILIATIONS
title: "Collection: reconciliations"
collection: concepts
status: current
concept_kind: collection
name: reconciliations
scope: shipped
description: Records of conflicts between downstream implementation and upstream
  specs — tracked during spec-driven development for later backport.
when_to_use: When implementation reveals an upstream spec needs revision. Each
  record targets one upstream artifact via a reconciles edge.
status_vocabulary:
  open:
    description: Conflict identified, not yet resolved upstream.
  in_progress:
    description: Upstream fix in flight.
  resolved:
    description: Upstream updated; conflict closed.
  wont_fix:
    description: Decided not to reconcile; divergence accepted.
---

# Collection: reconciliations

Records of conflicts between downstream implementation and upstream specs — tracked during spec-driven development for later backport.

**When to use:** When implementation reveals an upstream spec needs revision. Each record targets one upstream artifact via a reconciles edge.

## Status vocabulary

- `open` — Conflict identified, not yet resolved upstream.
- `in_progress` — Upstream fix in flight.
- `resolved` — Upstream updated; conflict closed.
- `wont_fix` — Decided not to reconcile; divergence accepted.
