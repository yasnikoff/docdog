---
id: DD-041
title: "Gradual migration — tooling first, then content"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-005 under DD-034's artifact-resilience lens. Build ArangoDB/MCP tooling first, then migrate content. Tooling-first means the new system is already better when content moves."
relationships:
  - supersedes: EJ-005
    context: "mirror under DD-034's artifact-resilience lens"
  - references: EJ-004
  - references: EJ-007
  - references: EJ-010
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check (orthogonal — sequencing vs artifact contract)
---

# DD-041: Gradual migration — tooling first, then content

Migration is gradual, not big-bang. Sequence:

1. **Build the ArangoDB/MCP tooling.** Foundation everything else
   depends on.
2. **Migrate existing refinements into ArangoDB.** Refinement
   history is the most valuable artifact — seed data for the
   relationship graph.
3. **Build skills/Foxx services to continue refinement** inside
   the Orchestrator, using ArangoDB as the backing store.
4. **Flatten upstream-context into specs/.** Only after tooling is
   operational and agents can discover context through the MCP
   server.
5. **Update agent instructions (CLAUDE.md, skills).** Derived
   naturally from changes above — not designed upfront.

## Rationale

The TASK-052 case study proved agents already struggle with
context discovery. Migrating content before tooling is ready
would make the problem worse. Tooling-first means the new system
is already better than the old one when content moves.

## DD-034 check

Orthogonal. The decision is about migration sequencing; DD-034
is about the artifact contract the migration produces. The two
operate at different layers. Historically, this sequencing is
what shipped v2.
