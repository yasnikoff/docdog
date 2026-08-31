---
id: OQ-05
title: "What happens to /prepare-exchange and /ingest --from-orchestrator?"
collection: questions
status: resolved
related: [EJ-005]
relationships:
  - references: EJ-005
description: "Both die. No exchange = no skills. Transition period may need temporary sync, but the tooling-first approach means we build the replacement before removing the old workflow."
---

# OQ-05: What happens to `/prepare-exchange` and `/ingest --from-orchestrator`?

**Status:** RESOLVED

Both die. No exchange = no skills. Transition period may need temporary sync,
but the tooling-first approach (EJ-005) means we build the replacement before
removing the old workflow.
