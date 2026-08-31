---
id: OQ-28
title: Discussion queue — `dd_discussions` system collection
collection: questions
status: obsolete
description: "OBSOLETE — planned as dd_conversations' companion (dd_discussions system collection, docdog-managed lifecycle); both died at the v3 pivot with system collections. The queue function is served today by open-status DISC/OQ records filtered by status; a first-class queue would be a new v3 proposal. Original plan: a topics-needing-discussion queue with open→in_progress→resolved lifecycle."
relationships:
  - references: EJ-010
  - companion: OQ-27
    context: the `dd_conversations` question this queue was designed as the forward-looking counterpart to — planned to be built together, both premises died at the v3 pivot
  - references: DD-070
    context: the pivot that ended the `dd_*` system-collection premise; the queue function lives on informally as open-status DISC/OQ records filtered by status
---

# OQ-28: Discussion queue — `dd_discussions` system collection

**Status note (2026-07-11, FEATURE-002):** obsolete — planned as a
`dd_*` system collection to build together with OQ-27's
`dd_conversations`; both premises died at the v3 pivot (DD-070).
The function lives on informally: parked topics are open-status
DISC/OQ records, retrievable by status filter. Wanting the queue as
a first-class mechanism again would be a new proposal.

Forward-looking counterpart to `dd_conversations` (which is historical).
A queue of topics that need discussion, with lifecycle:
`open` → `in_progress` → `resolved`.

**Sources:**
- Agent splits a compound question into separate topics
- Agent notices an unresolved tension while working ("this contradicts EJ-010")
- User says "let's discuss X later" — agent parks it
- End-of-session capture: "These 3 topics came up but weren't resolved"

**On resolution:** edges link the discussion item to the conversation that
resolved it and to any specs created/modified as a result.

**System namespace** — docdog manages the lifecycle (create, status transitions,
auto-linking). Users interact through the agent, not by editing the collection.

**Planned.** Natural companion to `dd_conversations`. Build together.
