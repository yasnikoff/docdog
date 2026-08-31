---
id: DD-036
title: "Process workflows live in `.docdog/workflows/`; CLAUDE.md shrinks to pointers"
collection: decisions
status: current
date: 2026-04-13
description: "Establishes that repeatable agent-facing processes (discussion capture, dual-track dogfooding, docs batch rewrite) are first-class artifacts in the `workflows` collection rather than prose buried in `.claude/CLAUDE.md`, so they become retrievable, graph-connected, and self-updating."
relationships:
  - references: DD-034
    context: "DD-034 requires vanilla agents to reconstruct process descriptions from on-disk frontmatter+bodies; workflows-as-artifacts is the concrete mechanism for processes that previously lived only in CLAUDE.md prose"
  - references: DD-035
    context: "DD-035's .docdog/-scoped split rule puts docdog-native workflow docs under `.docdog/workflows/` since they are only useful with docdog present"
  - references: OBS-001
    context: "the original observation that CLAUDE.md-embedded process guidance fails to actually steer agents; workflows-as-artifacts closes that gap via retrievability"
  - references: PROPOSAL-016
    context: "provides the status_vocabulary and the `follows_workflow` relation type that make workflow artifacts first-class"
  - references: WF-001
    context: discussion-capture workflow canonicalized under .docdog/workflows/ by this decision
  - references: WF-002
    context: dual-track dogfooding workflow canonicalized by this decision; its CLAUDE.md prose home retired
  - references: WF-003
    context: docs-batch-rewrite workflow canonicalized by this decision
  - references: OBS-006
    context: the OBS-001..006 dogfooding arc cited as the motive force for canonical workflow artifacts
  - references: EJ-030
    context: explicitly layers over EJ-030's three-layer model without retracting it
  - references: DISC-012
    context: WF-003's rename from corpus-batch-refactor traces to this discussion
---

# DD-036: Process workflows are canonical; CLAUDE.md shrinks to pointers

## Statement

**Repeatable agent-facing processes in this repo live as first-class
artifacts in the `workflows` collection under `.docdog/workflows/`,
not as prose inside `.claude/CLAUDE.md`.** CLAUDE.md retains only:

1. Stable orientation facts (project layout, CLI surface, dual
   dogfooding modes, key invariants).
2. Pointers to workflow artifacts — a short "Process workflows"
   section that lists the current set by id and tells the agent
   to `docdog_get` them when relevant.

When a process changes, the workflow artifact is the single source
of truth. CLAUDE.md does not re-narrate the process inline.

## What this refines

CLAUDE.md is a great *bootstrap* for agents that haven't loaded
docdog yet, and a poor *retrieval surface* once they have. Its
process sections have four recurring problems:

1. **Not searchable by `docdog search`.** CLAUDE.md sits outside
   `scan_paths` on purpose — putting it in would pollute every
   query with ambient convention chatter. So nothing in it is
   retrievable via vector or keyword search.
2. **Not reachable by graph traversal.** No collection, no id, no
   `relationships:` block. A task that wants to say "I follow the
   discussion-capture process" has no edge target to aim at.
3. **Duplicative with the corpus.** Process guidance written here
   shadows decisions and observations that already live in
   `specs/`, so the same rule can disagree with itself depending
   on which file an agent happens to read.
4. **Prone to silent drift.** The underlying process evolves in
   discussions and commits, but the CLAUDE.md section gets edited
   late or not at all.

Moving process documentation into the `workflows` collection fixes
all four:

1. `docdog search "discussion capture"` returns the current
   version, ranked by the indexer.
2. `docdog_traverse` from a discussion or task can follow a
   `follows_workflow` edge directly to the process doc.
3. Each workflow artifact carries its own `relationships:` back
   to the decisions and observations that justify it — a single
   place the rationale lives.
4. The workflow artifact is the thing agents read when they need
   to know *"how do we do X here?"* — edit the doc, reindex, done.

## Where workflows live

Per DD-035's split rule (*"if I delete docdog, is this file still
useful?"*), process workflows about docdog-mediated flows belong
in `.docdog/workflows/`. They are docdog-native meta — the
discussion workflow only makes sense because `discussions` is a
docdog collection; the dual-track dogfooding workflow only makes
sense because docdog is the thing being dogfooded.

Project-native workflows (e.g. a release procedure that would be
valuable even without docdog) may still live in `specs/workflows/`.
This repo currently has none.

## What stays in CLAUDE.md

CLAUDE.md is not going away. It still carries:

- **Orientation:** "This is the docdog self-hosting repo, here's
  how it's structured."
- **Factual references:** documentation layout, CLI surface, dual
  dogfooding modes, rebuild cycle, key invariants.
- **Pointers into workflows:** a short "Process workflows" section
  that lists the current set by id and tells the agent to
  `docdog_get` or `docdog search` for them when relevant.

CLAUDE.md does **not** narrate:

- How to capture a discussion → `WF-001`.
- How to run the dual-track dogfooding loop → `WF-002`.
- How to refactor a corpus in batches → `WF-003`.
- (Future rounds) How to file a friction note, how to walk the
  design-principles review, how to run the rebuild cycle for code
  changes — each becomes its own workflow artifact as the
  transition progresses. This commit ships only the first three.

## Why this is a decision and not just a convention

Two reasons:

1. **It changes where the dual-track directive lives.** The
   dual-track-work convention — every non-trivial spec task gets
   done with docdog as well as grep — is the motive force behind
   OBS-001 through OBS-006. Moving its canonical home from
   CLAUDE.md to `WF-002` changes where future agents look for the
   rule. That's a meaningful contract change, not a cosmetic
   edit, and it deserves a decision record.

2. **It establishes the model docdog wants to promote to other
   repos.** The orchestrator bootstrap (queued next) will use
   this same convention from day one: `.claude/CLAUDE.md` is a
   thin pointer layer; workflow artifacts are canonical. Capturing
   the intent as DD-036 gives the orchestrator repo something
   concrete to cite and lets the convention propagate instead of
   being re-invented case by case.

## What this does not change

- **CLAUDE.md files outside docdog-managed repos.** This decision
  is about docdog's own repo and any future docdog-managed repo,
  not about how Claude Code uses CLAUDE.md files generally.
- **The discussion workflow, dual-track workflow, or batch
  refactor workflow themselves.** Only their location changes.
  The substance of each process moves into its new home with
  minor shaping for the workflow-artifact frontmatter contract.
- **EJ-030, DD-034, DD-035, or any prior decision.** DD-036 adds
  a new layer over the top; it retracts nothing.
- **The observation-capture grandfathering.** Per DD-035,
  existing observations stay under `specs/observations/`. The
  workflow that describes how to capture them lives in
  `.docdog/workflows/` (WF-002), but the records it produces
  keep their current home.

## Action items

1. Write `WF-001` (discussion capture), `WF-002` (dual-track
   dogfooding), `WF-003` (docs batch rewrite — originally drafted
   as "corpus batch refactor", renamed per DISC-012) under
   `.docdog/workflows/`.
2. Shrink `.claude/CLAUDE.md`: replace the "Dual-track work" and
   "Discussion workflow" sections with a short "Process
   workflows" pointer section. Keep orientation + factual
   references intact.
3. Index + commit everything in one change.
4. *(Later rounds, not this commit)* Capture the remaining
   CLAUDE.md process sections as workflows: rebuild cycle,
   design-principles review walk, friction capture.
5. *(Later)* Apply the same model when bootstrapping the
   orchestrator repo.

## Status

Current. Establishes the workflow-as-canonical model for this
repo's process documentation and the template docdog wants to
promote to downstream docdog-managed repos.
