---
id: CONCEPT-COLLECTION-ISSUES
title: "Collection: issues"
collection: concepts
status: current
concept_kind: collection
name: issues
scope: user
description: Bugs, friction reports, and limitations (FRICTION-NNN) worth fixing.
when_to_use: When encountering a bug, UX friction, or limitation during docdog use.
examples:
  - FRICTION-001
  - FRICTION-006
status_vocabulary:
  open:
    description: Reproducible. Fix not yet landed.
  resolved:
    description: Fix landed; commit_hash set.
  wont_fix:
    description: Acknowledged but intentionally not fixed.
relationships:
  - references: FRICTION-001
    context: cited as example of the collection
  - references: FRICTION-006
    context: cited as example of the collection
---

# Collection: issues

Bugs, friction reports, and limitations (FRICTION-NNN) worth fixing.

**When to use:** When encountering a bug, UX friction, or limitation during docdog use.

**Examples:** FRICTION-001, FRICTION-006

## Status vocabulary

- `open` — Reproducible. Fix not yet landed.
- `resolved` — Fix landed; commit_hash set.
- `wont_fix` — Acknowledged but intentionally not fixed.
