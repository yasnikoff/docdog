---
id: CONCEPT-COLLECTION-PROPOSALS
title: "Collection: proposals"
collection: concepts
status: current
concept_kind: collection
name: proposals
scope: user
description: Formal design proposals (PROPOSAL-NNN) — specs that are not yet committed.
when_to_use: When spec'ing a feature or API in enough detail to review before implementing.
examples:
  - PROPOSAL-003
  - PROPOSAL-005
  - PROPOSAL-006
status_vocabulary:
  proposed:
    description: Written, not yet committed to implementation.
  planned:
    description: Committed to; queued for implementation.
  accepted:
    description: Implementation in progress.
  shipped:
    description: Implementation landed.
  rejected:
    description: Written but declined.
  superseded:
    description: Replaced by a newer proposal.
relationships:
  - references: PROPOSAL-003
    context: cited as example of the collection
  - references: PROPOSAL-005
    context: cited as example of the collection
  - references: PROPOSAL-006
    context: cited as example of the collection
---

# Collection: proposals

Formal design proposals (PROPOSAL-NNN) — specs that are not yet committed.

**When to use:** When spec'ing a feature or API in enough detail to review before implementing.

**Examples:** PROPOSAL-003, PROPOSAL-005, PROPOSAL-006

## Status vocabulary

- `proposed` — Written, not yet committed to implementation.
- `planned` — Committed to; queued for implementation.
- `accepted` — Implementation in progress.
- `shipped` — Implementation landed.
- `rejected` — Written but declined.
- `superseded` — Replaced by a newer proposal.
