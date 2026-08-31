---
id: CONCEPT-COLLECTION-QUESTIONS
title: "Collection: questions"
collection: concepts
status: current
concept_kind: collection
name: questions
scope: user
description: Open questions (OQ-NN) — design questions awaiting resolution.
when_to_use: When an unresolved design question needs a durable record so it
  doesn't get lost.
examples:
  - OQ-42
  - OQ-43
status_vocabulary:
  open:
    description: Unresolved; not yet investigated.
  ongoing:
    description: Still open but actively being worked on.
  analyzed:
    description: Studied; a full analysis exists but no lean committed yet.
  narrowed:
    description: Option space reduced; a direction is forming.
  leaning:
    description: Preferred direction identified but not committed.
  planned:
    description: A direction is committed; implementation queued.
  resolved:
    description: Answered by a linked decision or proposal.
  reframed:
    description: Superseded by a different formulation of the question.
relationships:
  - references: OQ-42
    context: cited as example of the collection
  - references: OQ-43
    context: cited as example of the collection
---

# Collection: questions

Open questions (OQ-NN) — design questions awaiting resolution.

**When to use:** When an unresolved design question needs a durable record so it doesn't get lost.

**Examples:** OQ-42, OQ-43

## Status vocabulary

- `open` — Unresolved; not yet investigated.
- `ongoing` — Still open but actively being worked on.
- `analyzed` — Studied; a full analysis exists but no lean committed yet.
- `narrowed` — Option space reduced; a direction is forming.
- `leaning` — Preferred direction identified but not committed.
- `planned` — A direction is committed; implementation queued.
- `resolved` — Answered by a linked decision or proposal.
- `reframed` — Superseded by a different formulation of the question.
