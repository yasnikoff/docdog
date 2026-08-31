---
id: OQ-09
title: What lessons from docs-internal carry forward?
collection: questions
status: ongoing
description: To be captured as the migration progresses. Early lessons span vector search limits, partial-index hazards, preserved refinement/patch workflows, and eliminated transformation pipeline.
relationships:
  - references: EJ-004
---

# OQ-09: What lessons from docs-internal carry forward?

**Status:** ongoing — captured as migration progresses.

Early lessons:
- Vector search alone insufficient for conceptual queries (spike)
- Partial indexes presented as complete are worse than no index (EJ-004)
- The refinement process (interactive, numbered, with rationale) is valuable — preserve it
- The patch system works well — preserve the mechanism
- Content transformation pipeline was over-engineered — eliminate
- v1 docdog's skill format, config loader, template engine, and dogfooding
  protocol are proven patterns worth preserving
