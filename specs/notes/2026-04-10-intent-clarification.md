---
id: NOTE-2026-04-10-intent-clarification
title: "2026-04-10 — Intent Clarification"
collection: notes
description: "First eject-session intent framing: user motivation, scope boundaries, and what docdog is/isn't."
---

# 2026-04-10 — Intent Clarification

First `/eject` session. Established the user's motivation and boundaries.

## Key Points

- docs-internal was the first iteration, built organically from small utilities
- The output content is valuable; the delivery ceremony is the problem
- Goal: manage Orchestrator docs inside the Orchestrator repo directly, shorter cycles,
  no canonical/output split
- Not rushing — gradual migration with well-considered transitions

## Original Separation Rationale (two concerns)

1. **Privacy:** Internal docs must stay out of customer-visible Orchestrator repo
2. **History value vs. bloat:** Spec evolution history is useful but bloats the main repo

Both concerns are unresolved — migration plan must address them.

## Accelerator-Mini

Stays here initially. Works well. Not clear if it belongs in the Orchestrator repo.
Separate concern from the exchange workflow ejection.

## User's Framing

- "ceremony kills momentum. tokens are wasted."
- docs-internal will be "eventually abandoned and superseded by the next iteration
  with lessons learned"
- This is a first-time build — user is learning what works and what doesn't
