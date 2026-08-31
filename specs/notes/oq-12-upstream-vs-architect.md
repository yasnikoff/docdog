---
id: OQ-12
title: "Upstream-context vs architect-architecture — unify or split?"
collection: questions
status: leaning
related: [EJ-005]
relationships:
  - references: EJ-005
description: "Leaning (a): eliminate the architect spec as a separate artifact. DD-* decisions are authoritative. The architect agent writes DD-* directly. Implementation detail below DD-* lives in code-level docs or task artifacts."
---

# OQ-12: Upstream-context vs architect-architecture — unify or split?

**Status:** LEANING (a)

Eliminate the architect spec as a separate artifact. DD-* decisions are authoritative.
The architect agent writes DD-* directly instead of restating them. Implementation
detail below DD-* level lives in code-level docs or task artifacts.

**Not yet a decision** — depends on how agent instructions evolve during migration
(EJ-005 step 5). Will become clear naturally.
