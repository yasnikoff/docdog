---
id: DISC-024
title: Corpus staleness sweep — retire the v1 docs/ folder, close the records
  the v3 pivot obsoleted
collection: discussions
status: resolved
date: 2026-07-11
retained_privately: docdog-discussions
relationships:
  - references: DD-070
    context: the v3 pivot whose step-6 deletions obsoleted most of the swept cohort
      — the sweep closes the record statuses the pivot left behind
  - references: DD-071
    context: publication boundary — tracked v1 docs/ and .idea/ would ship in the
      fresh public cut, which is what makes the staleness a publish hazard
      rather than mere clutter
  - references: DD-039
    context: git-history-as-archive is what makes deleting docs/ lossless
  - references: OQ-24
    context: the v1 salvage question, status analyzed — its completed review
      (2026-04-11-first-attempt-review) is why docs/ has no remaining reference
      value
  - references: OBS-011
    context: prior hygiene flags folded into this sweep — STATUS-ORCH
      obsolete-worthy, PROPOSAL-017 planned-though-executed
  - references: WF-003
    context: the process the resolution instantiates — batch rewrite with per-batch
      commits and verification
  - references: TASK-005
    context: batch 1 of the sweep — guidance surfaces plus repo hygiene
  - references: TASK-006
    context: batch 2 of the sweep — status flips with supersession edges
  - references: TASK-007
    context: batch 3 of the sweep — the v3-pivot closures for records whose premise died
  - references: WF-002
    context: a guidance surface caught instructing dead commands — `docdog relations
      list`, `collections describe`, `docdog_concepts_search` all died at v3
      step 6
  - references: PROPOSAL-007
    context: the precedent for the sweep's closure convention — replaced proposals
      close as `superseded`
  - references: OBS-006
    context: vocabularies are descriptive, which is what licenses `obsolete` as a
      new status value for the premise-died questions and notes
  - references: PROPOSAL-011
    context: audited by the sweep and explicitly left alone — status-aware search
      filtering is still legitimately open in v3
  - references: PROPOSAL-013
    context: audited by the sweep and explicitly left alone — the pre-Read hook
      proposal survives the v3 pivot
  - references: DISC-013
    context: audited by the sweep and explicitly left alone — the workflow-engine
      questions are live, not v3-pivot residue
  - references: DISC-016
    context: audited by the sweep and explicitly left alone — adopting a mature
      markdown parser is still a live v3 question
  - references: DISC-018
    context: audited by the sweep and explicitly left alone — frontmatter
      namespacing is still a live question for adopted repos
  - references: DISC-021
    context: audited by the sweep and explicitly left alone — the MCP-vs-CLI
      token-cost question survives the v3 pivot
  - references: OQ-38
    context: audited by the sweep and explicitly left alone — the
      restructuring-helpers question is still unanswered in v3
  - references: OQ-41
    context: audited by the sweep and explicitly left alone — file watching and
      incremental indexing remain open in v3
  - references: OQ-43
    context: audited and left open — the id-uniqueness question is live, but its
      recorded Arango answer was flagged here as needing a v3 reframe
  - references: OQ-44
    context: audited by the sweep and explicitly left alone — the retroactive
      artifact-resilience question is still unanswered
  - references: FRICTION-010
    context: audited by the sweep and explicitly left alone — a genuinely unresolved
      friction, not a stale status claim
  - references: FRICTION-012
    context: audited by the sweep and explicitly left alone — a genuinely unresolved
      friction, not a stale status claim
  - references: RECON-001
    context: the `git.patches` vestige this sweep scoped out as a code cleanup was
      reconciled the same day at user request, recorded as RECON-001
  - references: DD-050
    context: its §Current-status was amended when the `git.patches` vestige the
      sweep flagged got cleaned up the same day
---

# DISC-024: Corpus staleness sweep — retire the v1 docs/ folder, close the records the v3 pivot obsoleted

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-024` for what it
connects to.
