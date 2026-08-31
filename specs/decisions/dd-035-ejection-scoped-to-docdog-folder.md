---
id: DD-035
title: "Ejection resilience is scoped to the `.docdog/` folder — the folder is the opt-in marker"
collection: decisions
status: current
date: 2026-04-13
description: "Refines DD-034. Docdog's artifact-resilience guarantee applies only to repos that have a `.docdog/` folder. Presence = opt-in; deletion = explicit opt-out; absence = never opted in. Closes a circularity in DD-034's original framing (docdog can't promise resilience for repos that never had docdog), gives deletion semantic weight, and enables path-based namespacing that resolves shipped-name/project-vocab collisions (FRICTION-010) with zero code."
related:
  - DD-034
  - EJ-030
  - FRICTION-010
  - DISC-011
relationships:
  - supersedes: DD-034
    context: "refines DD-034's ejection test by scoping it to docdog-opted-in repos; the reframed commitment stays, its applicability tightens"
  - references: EJ-030
    context: "EJ-030's three-layer model is preserved; this decision only changes the scope of the ejection test"
  - sourced_from: FRICTION-010
    context: "FRICTION-010 surfaced the workflows name collision and the argument that led to this refinement"
  - discussed_in: DISC-011
    context: "DD-034 came out of DISC-011; DD-035 is the day-later tightening"
  - references: OQ-44
    context: OQ-44's retroactive artifact audit can stay open — this decision requires no retroactive migration
---

# DD-035: Ejection is scoped to the `.docdog/` folder

## Statement

**The artifact-resilience guarantee docdog offers applies to repos
that opt into docdog management by having a `.docdog/` folder.
Within the scope of a docdog-managed repo, a vanilla agent — one
that has no knowledge of docdog's CLI, MCP tools, or graph — can
read the on-disk files in `.docdog/` and in any paths listed in
`.docdog/config.yaml`'s `scan_paths`, and reconstruct document
relationships, process descriptions, and project context.**

**Deletion of the `.docdog/` folder is an explicit opt-out from
docdog management.** Docdog owes no resilience guarantees to a
repo that has removed its opt-in marker, because *"if docdog were
never in the repo, there would be no docdog-related artifacts
either."* (User framing, FRICTION-010 discussion.)

## What this refines

DD-034 made an implicit claim that was too broad. Its phrasing
said *"a repo using docdog must remain workable by a vanilla
agent,"* which rests on a hidden circularity: docdog cannot
promise resilience for repos that never had docdog, and it cannot
owe guarantees to repos that deliberately remove it. The test was
reaching past its own contract.

DD-035 tightens the scope to three crisp cases:

1. **`.docdog/` exists.** Full DD-034 commitment applies. The
   project has opted in; docdog owes vanilla-agent readability
   across `.docdog/` and all paths declared in
   `scan_paths`. Frontmatter is load-bearing. The `relationships:`
   block is load-bearing. Everything DD-034 said still holds —
   for this scope.

2. **`.docdog/` never existed.** The repo is not docdog-managed.
   Docdog was never in the contract. No guarantees, no
   obligations, no test to meet. This is the default for every
   repo in the world that hasn't run `docdog init`.

3. **`.docdog/` was deleted.** Explicit opt-out. The user or
   another tool removed the folder on purpose — whether because
   docdog was ejected, the project consolidated on a different
   tool, or someone wanted to start over. Docdog owes nothing
   from the moment `.docdog/` is gone. Any residual markdown
   files in `specs/` or elsewhere remain readable because they
   are plain markdown, but that's a property of markdown, not a
   promise docdog makes.

DD-034's three-layer model from EJ-030 — core primitives /
default skills / user skills — is preserved unchanged. Only the
*test* that judges layers 2 and 3 is rescoped.

## What becomes newly well-defined

### The `.docdog/` folder as the opt-in marker

Before DD-035, `.docdog/` was infrastructure housing: config,
skills, scripts, patches. Under DD-035 it additionally carries
**semantic meaning**:

- **Present** → this repo is docdog-managed. Docdog's commitments
  apply.
- **Absent** → this repo is not docdog-managed (never was, or
  opted out).

This is the first time docdog formally acknowledges its own
opt-in signal. Prior decisions treated `.docdog/` as a convention
without naming the contract it implies.

### `.docdog/` as a namespace for shipped concepts

Shipped docdog concepts whose on-disk file locations would
collide with project vocabulary can live under `.docdog/<concept>/`
instead of `specs/<concept>/`. The collection name in ArangoDB
stays canonical (`workflows`, `observations`, etc.), preserving
shipped status vocabularies and relation type routing. Only the
path changes.

Example for FRICTION-010's orchestrator case:

```
<host-project>/orchestrator/
├── specs/
│   ├── decisions/
│   ├── tasks/
│   ├── features/
│   └── workflows/          ← orchestrator's Temporal workflow docs
└── .docdog/
    ├── config.yaml
    ├── skills/
    ├── scripts/
    ├── workflows/          ← docdog's process docs (runbooks, loops)
    ├── observations/       ← docdog dogfooding notes
    └── reconciliations/    ← spec-reconciliation records
```

Both uses of "workflow" coexist. No alias machinery, no rename,
no schema change. The indexer already supports arbitrary
`scan_paths`, so the workflow template's default `scan_paths`
can include `.docdog/workflows/` alongside `specs/`.

### The split rule for where content lives

**Test:** *"If I delete docdog entirely, is this file still
useful?"*

- **Useful without docdog → `specs/`.** The content is
  project-native. Decisions about the system architecture,
  product requirements, feature specifications, tasks,
  friction reports about the project, design discussions,
  principles, terms of the domain, constraints the project
  operates under, integration contracts, open questions,
  proposals — all of these describe the project and its
  work, and they stay valuable even if docdog is never
  heard from again.
- **Only useful because docdog exists → `.docdog/`.** The
  content is docdog-native meta. Workflow documents that
  describe how docdog-mediated processes run. Observations
  that capture findings from dogfooding docdog itself.
  Reconciliation records that only make sense in a
  docdog-tracked spec-to-code sync. These would be
  orphaned meta-content without docdog's context to attach
  to.

The rule is heuristic, not mechanical. An observation about a
general project finding could go in `specs/notes/` or
`.docdog/observations/`. A workflow that happens to describe a
docdog-free process could go in either place. The agent or
user picks; docdog doesn't police it.

## Implication for `scan_paths`

Under DD-035, the workflow template's default `scan_paths` at
init time should include `.docdog/workflows/`,
`.docdog/observations/`, and `.docdog/reconciliations/` in
addition to `specs/`. Implementation is a small edit to
`src/cli/commands/init.ts` in a follow-up commit. This decision
commits only to the *intent*; the template change is a separate
piece of work.

For existing projects (including docdog's own self-hosted
repo), the convention applies going forward. Existing content
in `specs/observations/` stays where it is — retroactive
migration of already-written artifacts is not required by
DD-035 and would churn git history for no gain. New projects
onboarded via `docdog init --template workflow` get the
`.docdog/`-scoped convention from day one.

## What this does not change

- **EJ-030's three-layer model.** Core primitives / default
  skills / user skills, still intact. DD-035 scopes the test
  clause; it does not revoke anything about layer ownership.
- **DD-034's statement that skills may assume docdog.** Still
  true. Nothing about DD-035 restores the EJ-030 "delete every
  skill, docdog still works" test.
- **`relationships:` frontmatter as load-bearing.** Still the
  principle. Under DD-035 this principle applies specifically
  to the docdog-managed scope — but within that scope, every
  task, workflow, feature, decision, proposal, and observation
  must carry its edges in yaml, not only in the graph.
- **Frontmatter schemas.** No change to task/workflow/feature
  contracts. DD-035 is about where files live, not about what
  they contain.
- **Shipped collection names.** No rename, no alias, no schema
  change. `workflows` is still `workflows` in `dd_collection_meta`.
- **Core code.** Zero src/ changes. DD-035 is a decision about
  convention and contract, not about machinery. The template
  update that follows this decision is small (~10 LOC in
  `init.ts`'s config writer) and happens in a follow-up.

## The circularity DD-034 accidentally held

DD-034 phrased the contract as *"a vanilla agent must be able to
reconstruct the repo without docdog."* Read strictly, that implies
docdog owes something to *every* repo — including repos that
never had docdog at all, which is impossible, and repos that
opted out, which is unfair.

The correct reading was always narrower: *"a vanilla agent must
be able to reconstruct the **docdog-managed slice of a repo**
without docdog running."* DD-035 writes this narrower reading
down explicitly, closes the circularity, and hands deletion a
clean semantic meaning it previously lacked.

FRICTION-010 surfaced the gap. The orchestrator's Temporal
workflow collision was the concrete symptom; the overreach in
DD-034's phrasing was the underlying cause. Fix the phrasing,
and the collision resolves itself via `.docdog/`-scoped paths.

## Action items

1. **Amend `templates/skills/workflow/ejection-resilience.md`**
   with the split rule ("delete docdog, is this file still
   useful?") and the three-case scope (present / never-existed
   / deleted).
2. **Update `src/cli/commands/init.ts`** so `docdog init
   --template workflow` seeds `scan_paths` to include
   `.docdog/workflows/`, `.docdog/observations/`, and
   `.docdog/reconciliations/` alongside `specs/`.
3. **Update this repo's own `.docdog/config.yaml`** to add the
   same scan paths, then create the directories (currently they
   don't exist; observations in this repo live under
   `specs/observations/` and can stay there — grandfathered).
4. **Orchestrator bootstrap uses `.docdog/`-scoped paths from day
   one.** Process docs → `.docdog/workflows/`. Temporal workflow
   documentation (if orchestrator wants it in docdog at all) →
   `specs/workflows/` or a user-named collection. No collision.
5. **OQ-44 (retroactive artifact audit) can stay open** — DD-035
   does not require retroactive migration of pre-DD-034 files.
   The audit remains a deferred question.

## Status

Current. Supersedes DD-034's test clause only; DD-034 itself
stays as the parent reframe with DD-035 as its tightening. The
three-layer model, the commitment to artifact-level
frontmatter, and the "skills may assume docdog" permission all
carry forward intact.
