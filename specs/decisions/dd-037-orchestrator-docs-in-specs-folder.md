---
id: DD-037
title: "Orchestrator docs live directly in specs/, authored in-place"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-001 under DD-034's artifact-resilience lens. Docs live directly in the Orchestrator's specs/ folder — no copy ceremony, authored in-place."
relationships:
  - supersedes: EJ-001
    context: "mirror under DD-034's artifact-resilience lens"
  - references: EJ-005
  - references: EJ-017
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check (orthogonal — layout is already source-of-truth side)
---

# DD-037: Orchestrator docs live directly in specs/

Docs live directly in the Orchestrator's `specs/` folder. The existing
`upstream-context/` subfolder gets renamed but preserved for
externally-sourced docs. New docs are authored in-place — no copy
ceremony.

## Rationale

Eliminates the manual copy workflow entirely. `specs/` is already
where the Orchestrator looks for context. Keeping a subfolder for
external sources leaves room for supplementary material without the
versioned exchange overhead.

## DD-034 check

Orthogonal. The decision is about on-disk layout, which is already
the source-of-truth side of DD-034's test. Authoring in-place means
a vanilla agent reading `specs/` finds the current state without any
docdog-mediated step.
