---
id: DD-042
title: "Accelerator-mini patching stays as-is"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-006 under DD-034's artifact-resilience lens. The patch system works — keeps history, incremental by default. Long-term, patches could move into Foxx/ArangoDB."
relationships:
  - supersedes: EJ-006
    context: "mirror under DD-034's artifact-resilience lens"
  - references: EJ-014
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — a later patch migration must stay artifact-first
---

# DD-042: Accelerator-mini patching stays as-is

The patch system works well: keeps history, can be applied to new
external versions, incremental by default. Not changing the
mechanism.

Long-term, patch specs could move into Foxx/ArangoDB — the
database becomes the single home for all project knowledge
artifacts (refinements, patches, relationship graph, indexes).
But this is not a migration blocker.

## Rationale

Don't fix what works. The patch system is orthogonal to the
exchange ceremony — it can continue operating independently
during and after migration.

## DD-034 check

Orthogonal. Patches are a pre-docdog mechanism that does not
participate in docdog's artifact contract. If they do migrate
into Foxx/ArangoDB later, that migration must honor DD-034 —
each patch becomes an on-disk artifact first, DB-indexed
second.
