---
id: DISC-017
title: Formalize WF-006 friction resolve — resolve loop as docdog-first
  retrieval stress test
collection: discussions
status: resolved
date: 2026-04-14
retained_privately: docdog-discussions
relationships:
  - references: DD-036
    context: process workflows live as first-class artifacts, not prose in
      .claude/CLAUDE.md
  - references: WF-001
    context: this discussion was captured per WF-001
  - references: WF-002
    context: WF-006 composes with WF-002 — capture-as-you-go (WF-002) feeds the
      resolve backlog (WF-006); dedupe rule lives in the WF-006 preamble
  - references: WF-004
    context: WF-006 step 6c delegates the actual code change to WF-004 rather than
      re-specifying the code loop
  - references: DP-001
    context: WF-006 step 5 mandates walking every DP as a design lens; FRICTION-008
      is the motivating case where a small patch would have masked a Tier-3
      violation
  - references: FRICTION-001
    context: part of the commit range a251cd4..1ecdb82 whose shape this workflow
      formalizes
  - references: FRICTION-002
  - references: FRICTION-004
  - references: FRICTION-005
  - references: FRICTION-006
  - references: FRICTION-008
  - references: WF-006
    context: the friction-resolve workflow this discussion formalized (stress-test
      docdog first, fixing frictions second)
  - references: DISC-007
    context: prior-art set whose joint reading visibly strengthened FRICTION-008's
      fix — motivates WF-006's read-the-set step
  - references: PROPOSAL-004
    context: prior-art set whose joint reading visibly strengthened FRICTION-008's
      fix — motivates WF-006's read-the-set step
---

# DISC-017: Formalize WF-006 friction resolve — resolve loop as docdog-first retrieval stress test

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-017` for what it
connects to.
