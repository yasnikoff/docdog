---
id: OQ-01
title: "Where do Orchestrator docs live after ejection?"
collection: questions
status: resolved
related: [EJ-001, EJ-005]
relationships:
  - references: EJ-001
  - references: EJ-005
description: "Docs go into the Orchestrator's specs/ folder. Content migration happens after tooling is built. Minor remaining: internal structure after flattening upstream-context; how accelerator-mini discovers docs."
---

# OQ-01: Where do Orchestrator docs live after ejection?

**Status:** RESOLVED (mostly)

Docs go into the Orchestrator's `specs/` folder (EJ-001). Content migration happens
after tooling is built (EJ-005).

**Remaining (minor):** What's the internal structure after flattening upstream-context?
What gets renamed vs. merged? How does accelerator-mini discover docs (currently
hardcoded to `upstream-context/`)?
