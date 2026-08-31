---
id: DD-066
title: "Docdog is a memory layer; workflows belong to users (with DD-034 as the test, DISC-013 as the open tension)"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-030 under DD-034's artifact-resilience lens. Docdog core ships storage, search, and traversal primitives. Workflows are user-owned. DD-034 / DD-035 replaced EJ-030's original test (`delete every skill and docdog still works`) with a stronger artifact-resilience test. DISC-013 is the open tension: three minimal workflow-engine primitives are being considered without breaking this commitment."
relationships:
  - supersedes: EJ-030
    context: "mirror under DD-034's artifact-resilience lens; test clause was already superseded by DD-034 + DD-035"
  - references: DD-034
    context: the artifact-resilience lens this mirror is cut under — its test replaced EJ-030's
  - references: DD-035
  - references: DD-065
  - references: DD-069
  - references: DISC-013
    context: engages DISC-013's open question on minimal workflow-engine primitives
  - references: DP-001
    context: the sketched engine boundary is checked DP-001-clean (data-driven dispatch from frontmatter)
  - references: PROPOSAL-019
    context: defers the workflow-primitives carve-out details to P-019
  - references: EJ-029
    context: records the softening of EJ-029's agent-MCP-first absolute via DD-065's cross-reference
---

# DD-066: Memory layer, not workflow engine

Docdog core provides primitives for storing, searching, and
traversing content. It does not ship workflows, enforce
lifecycles, or manage processes. Those belong to the user.

## Three layers, unchanged from EJ-030

1. **Core primitives (docdog owns).** Vertices, edges, search,
   traverse, CRUD, indexer, embedder, GC, MCP tools, CLI. The
   only required layer; everything else is optional.
2. **Default skills and templates (docdog ships, user owns
   post-init).** Provider-neutral markdown seeded from the
   active template. Fully replaceable; git history is the
   archive when a user rewrites them.
3. **User skills and workflows (user owns completely).**
   Project-specific workflows, custom scripts, edits to the
   shipped skills, new skills entirely. No upstream coupling.

The three-layer split is still the correct posture. Nothing in
v2 has argued against it.

## The test clause — already superseded

EJ-030 shipped with a test: *"a project using only core
primitives and its own skills must be fully functional. If a
user cannot delete every default skill and replace them with
their own, docdog has overreached."*

That test was superseded by **DD-034** and scoped by
**DD-035**. The current test is stronger:

> A vanilla agent — one that has never heard of docdog — must
> be able to reconstruct the corpus's content, relationships,
> and process descriptions from the on-disk artifacts alone
> (DD-034), as long as those artifacts live in the
> docdog-managed slice of the repo (DD-035's `.docdog/` opt-in
> marker).

DD-034 subsumes the "delete every skill" test: if the
artifacts alone are enough, skill deletion is trivially
survivable. The reverse doesn't hold — an agent could have
read a carefully-authored skill cluster and still be unable to
reconstruct the artifact layer from disk. DD-034 is the real
commitment; EJ-030's version was the first draft of it.

## The DISC-013 tension

DISC-013 is open on whether docdog should grow a minimal set
of workflow-engine primitives: step markers, delegate-to-
workflow, and pause/ask with an auto-accept mode. On its face
this reads like a direct violation of "not a workflow engine."

It isn't. The distinction DD-066 enforces is between:

- **Owning processes** — shipping an opinionated workflow
  runtime that enforces lifecycles, state machines, and
  agent behavior. This is what EJ-030 rejects, and DD-066
  continues to reject.
- **Providing primitives** — three machine-readable markers
  that workflow artifacts *can* use to express composition
  and human handoff. The workflow is still prose, still
  user-owned, still DP-001-clean (dispatch is data-driven
  from frontmatter). The engine just makes the prose
  executable where it already wanted to be.

A workflow artifact that uses none of the primitives is still
valid. Users who write their own workflows without ever
touching the primitives get the same experience they have
today. The primitives only pay for themselves where the user
reached for them deliberately. That is consistent with
memory-layer-not-workflow-engine; the details will be
resolved in PROPOSAL-019 when it carves out.

## Implications that carried forward

- `conversations` / `discussions` are user collections, not
  `dd_*`.
- `dd_patches` remains on the system side for now, but is
  reconsiderable if a user ever needs to model their own
  patch workflow differently.
- EJ-029's absolute claim about agent-MCP-first was softened
  by DD-065's DD-066 cross-reference — user workflows must
  remain functional even without docdog.

## DD-034 check

This *is* the decision that says DD-034 is the test. DD-034
doesn't need a DD-034 check applied to it; DD-066 is the
record that makes the lineage from EJ-030 to DD-034 explicit.
