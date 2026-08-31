---
id: DISC-020
title: "Collaboration substrate: git-first, and the one-tier lossless-export contract"
collection: discussions
status: resolved
date: 2026-07-01
retained_privately: docdog-discussions
relationships:
  - part_of: DISC-019
    context: Spun out of DISC-019 OQ 7 (collaboration substrate). DISC-019 flagged
      it as deserving its own session; this is that session.
  - references: OQ-22
    context: "OQ-22 was cited as prior art, but its per-scope sync-channel framing
      rests on EJ-016's database-per-scope model, which is superseded. The
      question shrank: how is the SINGLE graph shared, not how do we sync N
      per-scope databases."
  - references: EJ-016
    context: EJ-016 (database-per-scope with per-scope sync) is superseded —
      cross-database edges are impossible in ArangoDB (→ single-DB model,
      DD-058). Its sync-channel framing no longer applies; there is one database
      to share.
  - references: PROPOSAL-021
    context: PROPOSAL-021's `docdog export` + round-trip contract already builds the
      DB→disk half of the git substrate. Git-as-default (fork 1) is de-risked
      because option (a)'s export direction is not greenfield.
  - references: OQ-40
    context: The one-tier collapse (fork 4) OVERTURNS OQ-40's conclusion that 'graph
      edges are always DB-only; edges don't have a disk representation.' Under
      DB-first + git substrate, every edge materializes to frontmatter. OQ-40
      should flip to resolved.
  - references: DD-043
    context: The one-tier model affirms DD-043 (relationships come from frontmatter,
      not agentic inference) as THE canonical edge model — every edge has a
      frontmatter home.
  - references: DP-001
    context: Carrying `discovered_via` preserves inferred-edge provenance instead of
      laundering it (the correct Tier-3 move). Merge-conflict resolution on
      divergent `relationships:` blocks stays Tier-3 — git surfaces it, docdog
      must never auto-pick.
  - references: DD-070
    context: ratified this discussion's four forks in disk-canonical form; the
      DB-first carrier and the shared-Arango opt-in were dropped (DD-070 §5),
      and single-origin edges dissolved the source/discovered_via provenance
      vocabulary (P-023 §1)
  - references: DD-058
    context: DD-058's single-database collapse invalidated OQ-22's per-scope sync
      framing — the ground this discussion rebuilt on
  - references: PROPOSAL-022
    context: named as the promotion target (number shared with DISC-019's DB-first flip)
  - references: PROPOSAL-023
    context: resolved this discussion by carrying its four forks in disk-canonical form
---

# DISC-020: Collaboration substrate: git-first, and the one-tier lossless-export contract

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-020` for what it
connects to.
