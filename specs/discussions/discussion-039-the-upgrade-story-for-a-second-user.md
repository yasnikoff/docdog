---
id: DISC-039
title: The upgrade story for a second user — the npx pin that can strand an
  adopter, and why the registry check belongs in update rather than status
collection: discussions
status: resolved
date: 2026-08-25
retained_privately: docdog-discussions
relationships:
  - references: PROPOSAL-041
    context: the one leg of the upgrade story that already exists — it brings the
      repo's seeded files up to the installed docdog, and therefore presupposes
      that the new docdog was installed, which is the leg nothing covers
  - references: PROPOSAL-037
    context: its Limits section ruled a registry check out of scope on the grounds
      that a status which phones home is worse than the problem; the decision
      here keeps that refusal by putting the socket in update and letting status
      report only the cached verdict
  - references: FRICTION-017
    context: the first recorded instance of an adopter unable to obtain docdog from
      its advertised source; this thread is the same failure one release later,
      moved from acquisition to upgrade
  - references: DD-071
    context: the publication boundary this release runs through — origin/main
      carries a squashed v0.3.0 that npm never received, which is how the
      version gap was found
  - references: FRICTION-041
    context: one of the three open frictions that fire on exactly the path a second
      user walks; the user chose to fix all three before publishing
  - references: FRICTION-042
    context: the seeded CLAUDE.md block a second user would receive is stale,
      listing 6 of the kernel 8 and v2 config keys — the upgrade path would hand
      them a worse block than they have
  - references: FRICTION-043
    context: the specs skill's flat index goes stale on the next write, so an
      adopter's first install ships a snapshot that is already wrong
  - references: FRICTION-018
    context: the network-restricted sandbox that constrains the design — the upgrade
      check must never enter a path that has to work offline, which is why it is
      not in index
  - references: DP-001
    context: the principle that places the trigger policy — when to check is
      judgment and goes to the agent in the skill; opening the socket and
      comparing two version strings is tier 1 and stays in code
  - follows_workflow: WF-001
---

# DISC-039: The upgrade story for a second user — the npx pin that can strand an adopter, and why the registry check belongs in update rather than status

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-039` for what it
connects to.
