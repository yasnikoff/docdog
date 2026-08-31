---
id: DD-038
title: "No automated leak detection pipeline"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-002 under DD-034's artifact-resilience lens. Leak detection handled via CLAUDE.md rules and ad-hoc AI review, not an automated pipeline."
relationships:
  - supersedes: EJ-002
    context: "mirror under DD-034's artifact-resilience lens"
  - references: EJ-012
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check (orthogonal — scopes what docdog does not own)
---

# DD-038: No automated leak detection pipeline

Leak detection (internal names, prices, emails) does not need an
automated pipeline. Handled by:

- CLAUDE.md rules in the Orchestrator repo
- Ad-hoc AI review when needed
- Optionally, a small utility repo with specialized skills (if the
  need arises)

## Rationale

The automated pipeline was built for the docs-internal → output
gate. Without that gate, a lighter approach is sufficient. The AI
already understands the privacy constraints from CLAUDE.md rules.

## DD-034 check

Orthogonal. The decision is about what docdog does *not* own
(leak detection), and DD-034 is about what docdog-managed
artifacts must be. No change.
