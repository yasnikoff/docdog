---
id: DISC-033
title: "a reload command for the MCP server, refused: what was stale was one Map
  holding a two-file read, and a reload verb would have bought a ritual instead
  of a property"
collection: discussions
status: resolved
date: 2026-07-27
retained_privately: docdog-discussions
relationships:
  - references: PROPOSAL-033
    context: the design under discussion — its resolver is where the staleness
      lived; the machine-scope feature and both of its safety rules survive
      untouched, and this adds a third rule (config is read per call) rather
      than amending either
  - references: FRICTION-037
    context: the friction record this discussion produced and resolved in the same
      session; it carries the field evidence and the failing error message, this
      carries the argument
  - references: DP-001
    context: "the principle that decided it: re-reading an edited file is tier 1,
      while a reload command that must be remembered for the next call to be
      correct is the shape of an invisible default (tier 2) dressed as an
      explicit one"
  - references: DISC-021
    context: its verdict that CLI wins on staleness is the frame this discussion
      narrows — the code half of that claim stands and stays unfixable short of
      a restart, the config half was a bug and is gone
  - references: FRICTION-033
    context: "the precedent argued from: a manual invariant in one subsystem (drop
      the store when the cap changes) was replaced by a mechanical one (the
      recipe id), and the same choice was available here between a reload verb
      and a per-call read"
  - references: PROPOSAL-025
    context: the seeding design that put collection and relation vocabulary in
      .docdog/concepts/ as records rather than config; that choice is why the
      concepts half of 'add a collection' was never stale, and this discussion
      is the first time the split has been measured
---

# DISC-033: a reload command for the MCP server, refused: what was stale was one Map holding a two-file read, and a reload verb would have bought a ritual instead of a property

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-033` for what it
connects to.
