---
id: OQ-14
title: "Edge attribute schema — what metadata do edges carry?"
collection: questions
status: analyzed
related: [EJ-011, EJ-016]
relationships:
  - references: EJ-011
  - references: EJ-016
description: "Full analysis in notes/2026-04-11-edge-schema-analysis.md. Revised by EJ-011 (intrinsic properties only, no relevance scores) and EJ-016 (multi-tenancy via database-per-scope, not edge fields). Phased rollout of edge fields."
---

# OQ-14: Edge attribute schema — what metadata do edges carry?

**Status:** ANALYZED

Full analysis in `notes/2026-04-11-edge-schema-analysis.md`. Revised by EJ-011
(intrinsic properties only, no relevance scores) and EJ-016 (multi-tenancy via
database-per-scope, not edge fields).

**Phase 1 (MVP):** `type`, `role`, `context`, `source`, `date`, `discovered_via`,
`anchor_text`, `status`. All intrinsic. See EJ-011.

**Phase 2 (mature):** Add `level`, `forward_summary`/`reverse_summary`, `tags`.

**Phase 3:** Add `volatility` (computed from revision history).

**Remaining:** The `type`/`role` taxonomy needs finalizing. Key edge types identified:
`references`, `constrains`, `implements`, `supersedes`, `revised_by`, `sourced_from`,
`companion`, `uses_term`, `cross_cutting`, `parent`/`child`.
