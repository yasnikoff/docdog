---
id: DISC-027
title: "Parallel id minting — not unresolvable: partition the space by an
  identity that was already agreed under coordination"
collection: discussions
status: resolved
date: 2026-07-14
retained_privately: docdog-discussions
relationships:
  - references: DISC-026
    context: corollary 1 of its theory, taken to a conclusion — that discussion
      identified the sequential counter as the one thing that cannot merge; this
      one shows the counter simply must not be read off-trunk, and that
      partitioning makes the collision unrepresentable rather than merely
      unlikely
  - references: OQ-43
    context: its open half is answered here — contested ids get partitioned away at
      the source and reported as residue, rather than prevented by the registry
      it was leaning toward
  - references: PROPOSAL-031
    context: "the mechanics this discussion authorizes: the renumber promotion
      primitive plus contested ids surfaced through the existing status tool"
  - references: DP-001
    context: the tier walk that draws the docdog/host-project line — renaming an id
      and reporting duplicates is mechanics; deciding which namespace a branch
      owns and when a record is promoted is policy, and policy lives in the
      adopting project's skills
  - references: DD-050
    context: the reason docdog must not learn what a task branch is —
      branch-awareness in the core would break tier 1, so the namespace
      convention stays outside docdog and only the git-optional tier-2 guard
      could ever know about branches
  - references: OBS-013
    context: the external dogfood whose skills supplied the answer — its backport
      mechanism is the working, production-tested instance of partition-by-task
  - references: PROPOSAL-024
    context: the read-only report shape OQ-43 said a future answer would take, and
      which the contested-id half of PROPOSAL-031 adopts
  - references: OQ-46
    context: the id-syntax question this discussion surfaced as a side effect — if
      ids may be namespaced, slash-list expansion's safety net (a bogus
      expansion naming no real id) weakens
---

# DISC-027: Parallel id minting — not unresolvable: partition the space by an identity that was already agreed under coordination

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-027` for what it
connects to.
