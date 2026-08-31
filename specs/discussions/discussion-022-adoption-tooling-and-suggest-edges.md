---
id: DISC-022
title: Adoption tooling for external corpora — what ships as code, what stays
  agentic, and resurrecting suggest-edges
collection: discussions
status: resolved
date: 2026-07-11
retained_privately: docdog-discussions
relationships:
  - references: OBS-003
    context: the evidence that flips the gating argument — v2 suggest-edges surfaced
      131 undeclared references, accepted in one fast idempotent pass; the tool
      is proven, not speculative
  - references: PROPOSAL-010
    context: the v2 spec for suggest-edges; a v3 resurrection re-implements its
      detection over the SQLite cache instead of Arango
  - references: DD-070
    context: the kernel prune that deleted suggest-edges for minimalism, not
      failure; resurrection means amending the §4 CLI list, which needs a
      proposal, not a quiet exception
  - references: DP-001
    context: "the tiering walk both ways: detection is Tier 1 mechanics, the
      `references` default is visible Tier 2, acceptance stays agentic — and the
      principle argues FOR the tool, since hand-rolled per-repo sweeps are
      mechanics done by judgment machinery"
  - references: OBS-010
    context: "the evidence-before-features discipline invoked and then scoped: it
      still gates chunking (zero observed need) but does not gate suggest-edges
      (need already committed)"
  - references: FRICTION-016
    context: surfaced by this discussion — the shipped ingest skill mis-describes
      `docdog add`; also the staleness evidence against distributing
      suggest-edges as a copied template script
  - references: WF-002
    context: "the feedback-channel strand extends the dogfooding loop cross-repo:
      adopter notes collect in the adopting repo, docdog-side sessions harvest
      them into FRICTION/OBS records"
  - references: PROPOSAL-024
    context: the outcome — user ratified same day ('go, build it'); the command
      shipped with the design agreed here
  - references: FRICTION-005
    context: the id-inference removal whose history explains why `docdog add`
      deliberately can't do bulk ids (surfaced by the tool's own first sweep of
      this record)
  - references: DD-036
    context: the processes-as-artifacts decision that makes an upgraded ingest/adopt
      skill, not this discussion, the home for the adoption playbook
  - references: OBS-011
    context: the same-day triage of the first suggest-edges sweep this discussion
      authorized — 440 undeclared mentions across 146 records reduced to 271
      accepted edges
---

# DISC-022: Adoption tooling for external corpora — what ships as code, what stays agentic, and resurrecting suggest-edges

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-022` for what it
connects to.
