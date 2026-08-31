---
id: CONCEPT-COLLECTION-DISCUSSIONS
title: "Collection: discussions"
collection: concepts
status: current
concept_kind: collection
name: discussions
scope: user
description: Captured design conversations (DISC-NNN).
when_to_use: At the end of a reasoning-heavy conversation worth preserving as
  durable context.
when_not_to_use: For pure execution threads without design content.
examples:
  - DISC-004
  - DISC-010
status_vocabulary:
  open:
    description: Active thread.
  resolved:
    description: Reached a conclusion; artifacts extracted.
  archived:
    description: Closed without resolution.
relationships:
  - references: DISC-004
    context: cited as example of the collection
  - references: DISC-010
    context: cited as example of the collection
---

# Collection: discussions

Captured design conversations (DISC-NNN).

**When to use:** At the end of a reasoning-heavy conversation worth preserving as durable context.

**When not to use:** For pure execution threads without design content.

**Examples:** DISC-004, DISC-010

## Status vocabulary

- `open` — Active thread.
- `resolved` — Reached a conclusion; artifacts extracted.
- `archived` — Closed without resolution.
