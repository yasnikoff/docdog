---
id: PROPOSAL-016
title: "Workflow primitives — status_vocabulary, three relation types, workflow-template experimentation surface"
collection: proposals
status: shipped
date: 2026-04-13
related:
  - DD-034
  - EJ-030
  - EJ-033
  - DISC-011
  - OQ-35
  - OQ-37
  - PROPOSAL-003
  - PROPOSAL-014
  - PROPOSAL-015
relationships:
  - sourced_from: DISC-011
    context: "direct output of the workflow-primitives discussion"
  - implements: DD-034
    context: "new collections' frontmatter contracts are designed for artifact-level ejection resilience"
  - references: EJ-030
    context: "respects the three-layer model — all workflow content goes to template, not core"
  - references: EJ-033
    context: "extends the workflow template per EJ-033's user-owned scaffolding model"
  - references: PROPOSAL-003
    context: "status_vocabulary + relation types ride on the existing edge pipeline"
  - references: PROPOSAL-014
    context: "status vocab feeds MCP next_actions hints naturally"
  - references: PROPOSAL-015
    context: "extends template content without touching the lifecycle union"
  - references: OQ-35
    context: "resolves OQ-35 in favor of tasks-as-collection (shipped in workflow template, not core)"
  - references: OQ-37
    context: "reframes OQ-37 per DD-034 — audit shifts from per-skill to artifact-template"
  - references: PROPOSAL-017
    context: defers the retired status value to P-017's EJ→DD refactor scope
  - references: DISC-010
    context: warning-not-blocking vocabulary stance grounded in DISC-010's do-not-stop-them
  - references: DP-001
    context: compliance walkthrough — every change mechanical, vocabulary is schema
  - references: OQ-44
    context: excludes OQ-44's retroactive frontmatter backfill from scope
description: "Add status_vocabulary (object-shaped, with descriptions) to dd_collection_meta. Add three relation types to SHIPPED_RELATION_META (follows_workflow, derived_from, reconciles). Extend the workflow template with workflows and reconciliations collections, sequential TASK-NNN numbering via a DB-first-with-scan-fallback script, a richer task frontmatter contract, and one seed workflow document. Zero new CLI commands, zero new MCP tools, zero command trees."
---

# PROPOSAL-016: Workflow primitives

## Motivation

DISC-011 established that docdog's next useful move for
experimentation-grade workflow support is **primitives, not a
workflow engine**. DD-034 rewrote the ejection test to target
artifact resilience instead of skill portability, which freed the
workflow template to freely assume docdog while requiring richer
frontmatter contracts. The immediate blocker to any experimentation
is threefold:

1. **No shared status vocabulary.** Every collection's legal status
   values are convention, not data. Agents guess per-session. The
   same agent flipped PROPOSAL status three times this session on
   vibes — symptom of missing vocabulary.
2. **Missing relation types for the SDD loop.** Tasks need to say
   `follows_workflow:`, `derived_from:`, and `reconciles:` in their
   frontmatter, and the edge pipeline needs those types in
   `SHIPPED_RELATION_META` to route them to the right edge
   collection.
3. **Workflow-template rigidity.** The current workflow template
   bakes process into skill prose (the accelerator-mini pain
   point). We need to move the process into **workflow documents**
   that live in the user's repo and can be freely edited.

None of this requires new core code that knows anything about
"workflows" or "tasks." Status vocabulary is a schema field on
existing meta. Relation types are seeded data. Workflow content is
template content. The docdog/memory rule from the prior session
stays intact: *"don't touch src/engine/, src/arango/, or src/mcp/
for a workflow reason."*

## Specification

### 1. `status_vocabulary` on `dd_collection_meta`

**Schema change** — extend `CollectionMetaEntry` and
`CollectionMetaSeed`:

```ts
interface StatusVocabEntry {
  description: string;
}

interface CollectionMetaEntry {
  // ... existing fields ...
  status_vocabulary?: Record<string, StatusVocabEntry>;
}
```

Object-valued per the DISC-011 resolution. Plain `string[]` was
considered and rejected — the description field gives agents a
mechanical answer to *"what does `blocked` mean for this
collection?"* without requiring a separate lookup. The field is
optional; collections without a vocabulary default to "any string
allowed" (no warning).

**Storage:** serialized as yaml in `dd_collection_meta` entries
alongside `description`, `when_to_use`, etc. No schema migration
needed — the field is additive.

**Seed vocabulary** for shipped collections (in `meta-seed.ts`):

```yaml
decisions:
  current: { description: "Active commitment driving current work." }
  superseded: { description: "Replaced by a newer decision with a supersedes edge." }
  deprecated: { description: "No longer active but still referenced; kept for history." }

proposals:
  proposed: { description: "Written, not yet committed to implementation." }
  accepted: { description: "Committed to; implementation planned or in progress." }
  shipped: { description: "Implementation landed." }
  rejected: { description: "Written but declined." }
  superseded: { description: "Replaced by a newer proposal." }

tasks:   # added by workflow-template extension (§3)
  planned: { description: "Committed to but not yet started. Appears in pick queue." }
  in_progress: { description: "Active. Has a branch and may have partial commits." }
  blocked: { description: "Cannot proceed; requires a note pointing at the blocker." }
  done: { description: "Landed. Requires commit_hash in frontmatter." }
  abandoned: { description: "Dropped. Requires a reason in the body." }

workflows:   # added by workflow-template extension (§3)
  draft: { description: "Being written, not yet followed." }
  current: { description: "Active, agents may follow it." }
  deprecated: { description: "Superseded; kept for history." }

reconciliations:   # added by workflow-template extension (§3)
  open: { description: "Conflict identified, not yet resolved upstream." }
  in_progress: { description: "Upstream fix in flight." }
  resolved: { description: "Upstream updated; conflict closed." }
  wont_fix: { description: "Decided not to reconcile; divergence accepted." }

observations:
  current: { description: "Captured finding. Immutable by convention." }

questions:
  open: { description: "Unresolved; needs discussion or decision." }
  leaning: { description: "Preferred direction identified but not committed." }
  resolved: { description: "Answered by a linked decision or proposal." }
  reframed: { description: "Superseded by a different formulation of the question." }

issues:
  open: { description: "Reproducible. Fix not yet landed." }
  resolved: { description: "Fix landed; commit_hash set." }
  wont_fix: { description: "Acknowledged but intentionally not fixed." }

discussions:
  open: { description: "Active thread." }
  resolved: { description: "Reached a conclusion; artifacts extracted." }
  archived: { description: "Closed without resolution." }
```

Covers every shipped collection. `notes`, `principles`,
`requirements`, `guidelines`, `terms`, `domain`, `constraints`,
`integrations` get no vocabulary shipped — status on those is
either `current` or absent, which is the "any string allowed"
default.

**Retirement status.** The generic `retired` value will be added
in PROPOSAL-017's scope when the EJ→DD refactor ships. It's not in
the shipped seed here because no current collection has needed it
yet. Adding later is a one-line seed change.

### 2. `docdog collections describe` renders vocabulary

Current rendering lists description, when-to-use, etc. Add:

```
Status vocabulary:
  planned       — Committed to but not yet started. Appears in pick queue.
  in_progress   — Active. Has a branch and may have partial commits.
  blocked       — Cannot proceed; requires a note pointing at the blocker.
  done          — Landed. Requires commit_hash in frontmatter.
  abandoned     — Dropped. Requires a reason in the body.
```

Thin formatting change in `src/cli/commands/collections.ts`. Also
exposed via `docdog_collections_describe` MCP tool (no schema
change — the field just appears in the JSON).

### 3. Consistency check: loose status validation

`src/arango/meta.ts` `runConsistencyCheck` gets a new warning kind:

```ts
kind: "status_not_in_vocabulary"
```

For each vertex whose collection has a `status_vocabulary`: if
`vertex.status` is not in the vocabulary, emit a warning. **Non-
blocking.** Per DISC-010 "do not stop them" and DD-034's "don't add
runtime workflow enforcement."

### 4. Three new relation types in `SHIPPED_RELATION_META`

Add to `meta-seed.ts`:

```ts
{
  name: "follows_workflow",
  description: "A task executes the steps of a workflow document.",
  when_to_use: "From a task to the workflow it's following.",
  collection: "dd_edges_dependency",
  inverse_label: "followed by",
  symmetric: false,
},
{
  name: "derived_from",
  description: "A task or record was spawned from an earlier spec or observation.",
  when_to_use: "When a task implements a proposal, or an observation motivates a decision.",
  collection: "dd_edges_semantic",
  inverse_label: "produced",
  symmetric: false,
},
{
  name: "reconciles",
  description: "A reconciliation record targets an upstream spec that needs update.",
  when_to_use: "From a reconciliations vertex to the upstream decision/requirement it conflicts with.",
  collection: "dd_edges_temporal",
  inverse_label: "reconciled by",
  symmetric: false,
},
```

Routing decisions:
- `follows_workflow` → `dd_edges_dependency` because a task's
  execution depends on the workflow's step list.
- `derived_from` → `dd_edges_semantic` because the link is
  provenance, not dependency.
- `reconciles` → `dd_edges_temporal` because reconciliation is a
  specific kind of "this succeeds that" / "this updates that"
  relationship, which is the temporal category.

`implements` already exists and routes to `dd_edges_dependency` —
no change needed.

### 5. Workflow template extensions

The template at `templates/` gets the following updates. All of
these are user-owned scaffolding post-init per EJ-033 — users can
edit freely, delete, replace.

**5a. New collections in the workflow template's shipped set**
(`src/config/templates.ts`):

```ts
workflow: {
  collections: [
    "decisions",
    "requirements",
    "principles",
    "guidelines",
    "terms",
    "domain",
    "constraints",
    "integrations",
    "features",
    "tasks",
    "conversations",
    "workflows",        // NEW
    "reconciliations",  // NEW
    "notes",
  ],
  defaultCollection: "notes",
  skillsDir: "workflow",
  scriptsDir: "workflow",
},
```

**5b. Sequential `TASK-NNN` numbering.** Replace the date-slug
scheme in `templates/skills/workflow/start-task.md` with a call to
a new helper script.

**New file: `templates/scripts/workflow/next-task-id.js`**

```js
#!/usr/bin/env node
/**
 * Compute the next TASK-NNN id. DB-first if docdog is reachable,
 * disk-fallback otherwise. Prints the id to stdout.
 *
 * DB mode: query MAX(id) from the `tasks` collection.
 * Disk mode: scan `tasks/` for TASK-NNN directories, take max + 1.
 *
 * The two modes should agree; if they diverge, DB wins and we emit
 * a stderr warning nudging the user to re-index.
 */
```

Script lifecycle: invoked by `start-task.md` via
`docdog run workflow/next-task-id` (or directly with node). No
counter file on disk — avoids the merge-conflict surface that the
old workflow template's date-slug scheme was trying to dodge.

**5c. Task frontmatter contract** — seed in
`templates/skills/workflow/start-task.md` and documented in a new
`templates/skills/workflow/task-frontmatter.md` cheat sheet:

```yaml
---
id: TASK-053
title: "<imperative, short>"
collection: tasks
status: planned
description: "<one-line summary for search previews>"
follows_workflow: wf-001-feature-loop  # optional
relationships:
  - implements: FEAT-PROV-L3           # one or more
  - derived_from: PROPOSAL-019         # if spec-driven
  - follows_workflow: WF-001-feature-loop
branch: task/TASK-053-provisioning-l3
commit_hash: null                       # set on done
artifacts_path: tasks/TASK-053/
---
```

The contract is the *default shape*. Users extend freely — drop
fields they don't want, add fields docdog doesn't know about, ship
the template to their own projects. Nothing in core enforces it.
DD-034's artifact-resilience test is satisfied: every field that
matters to a vanilla agent reading the file is in frontmatter.

**5d. Updated `start-task.md`** — removes date-slug rationale,
calls `next-task-id` script, writes the new frontmatter contract,
still handles graceful degradation (task folder on disk works
whether or not docdog MCP is up).

**5e. Example workflow document.** New file at
`templates/content/workflow/example-workflow.md`:

```markdown
---
id: WF-000-example-feature-loop
title: "Example feature loop — pick, plan, code, review, finalize"
collection: workflows
status: current
description: "Seed workflow document. Copy, edit, rename — this is how process lives in docdog."
---

# WF-000: Example feature loop

This file is a seed. Delete or edit it freely — it exists so you
can see the shape of a workflow document before writing your own.

## Trigger

A task has been picked and has status `planned`.

## Steps

1. **Read the task frontmatter.** `docdog_get TASK-NNN` returns
   `implements`, `derived_from`, and any linked proposal context.
2. **Brainstorm.** Write `tasks/TASK-NNN/design.md` with the
   alternatives considered. Optional — skip for small tasks.
3. **Plan.** Write `tasks/TASK-NNN/plan.md` with concrete steps,
   file paths, acceptance criteria.
4. **Code.** Implement. Commit with `Refs: TASK-NNN`.
5. **Review.** Run the reviewer skill or a second pass; capture
   any findings as `tasks/TASK-NNN/review.md`.
6. **Test.** Run the test suite; fix until green.
7. **Finalize.** Update task status to `done`, stamp
   `commit_hash`, flip the linked proposal or feature to `shipped`
   if appropriate.
8. **Backport / reconcile.** If implementation revealed upstream
   spec issues, create a `reconciliations` record with a
   `reconciles` edge to the offending upstream artifact.
9. **Update the feature matrix.** Run the render-matrix script.

## Produces

- A git commit with `Refs: TASK-NNN`
- A completed task record
- Possibly: new observations, reconciliation records, updated
  feature matrix output

## Supersedes

(none — this is the example seed)
```

Users rename, edit, and version this as their process evolves.
The workflow is data; editing it doesn't require touching any
skill prose.

**5f. Documentation of the ejection-resilient frontmatter
contract.** A new file at
`templates/skills/workflow/ejection-resilience.md` explaining
DD-034 in skill-reader terms: what fields must be in every
frontmatter block, what's optional, why the `relationships:`
block is non-negotiable.

### 6. DP-001 / DD-034 / EJ-030 / EJ-033 compliance walkthrough

- **DP-001 (mechanical code, no inference).** Every change is
  mechanical: status_vocabulary is schema, new relation types are
  seed data, consistency check is a set-membership test, template
  content is template content. No inference. ✅
- **DD-034 (artifact-level ejection resilience).** New task,
  workflow, and reconciliation frontmatter contracts carry all
  load-bearing context. The example workflow doc is itself
  self-describing without requiring docdog. ✅
- **EJ-030 (docdog is a memory layer).** Core changes are limited
  to schema (`status_vocabulary` on meta) and seed data (relation
  types). Zero workflow machinery in `src/engine/`, `src/arango/`
  queries, or `src/mcp/` beyond what's already there. ✅
- **EJ-033 (features DB-first, templates user-owned).** New
  collections ship as template content, not core. Users own them
  post-init. ✅
- **PROPOSAL-015 (vertex lifecycle symmetry).** New collections
  slot into the existing workflow template's shipped set via
  `src/config/templates.ts`. Lifecycle union already handles it. ✅

### 7. Estimated effort

**Core (~120 LOC):**
- `status_vocabulary` field on `CollectionMetaEntry` type + meta
  upsert (~20 LOC in `src/arango/meta.ts`)
- Seed data entries in `src/arango/meta-seed.ts` (~100 LOC of
  vocabulary content)
- Three new entries in `SHIPPED_RELATION_META` (~30 LOC)
- `docdog collections describe` rendering of vocabulary (~20 LOC
  in `src/cli/commands/collections.ts`)
- Consistency check: `status_not_in_vocabulary` warning (~15 LOC
  in `src/arango/meta.ts`)

**Template content (~300 LOC):**
- Update `templates/skills/workflow/start-task.md`
- New `templates/scripts/workflow/next-task-id.js`
- New `templates/skills/workflow/task-frontmatter.md`
- New `templates/content/workflow/example-workflow.md`
- New `templates/skills/workflow/ejection-resilience.md`
- Update `src/config/templates.ts` workflow entry

**Tests (~150 LOC):**
- Unit: vocabulary upsert, describe rendering, consistency warning
- Unit: relation type routing for the three new types
- Integration: init --template workflow creates the new
  collections, meta seeds vocab entries, consistency check clean

**Total:** ~570 LOC + ~150 LOC tests. Medium-small.

### 8. Not in scope

- **No `docdog tasks` command tree.** Per DISC-011, the user wants
  to experiment via editing template skills directly, not by
  binding to prescribed commands.
- **No `docdog workflows apply` runtime.** Workflow docs are
  inert; agents interpret.
- **No `docdog features matrix` command.** The render-matrix
  script already exists; no need for a first-class CLI verb.
- **No auto-status transitions.** DD-034's "no runtime
  enforcement" rule.
- **No legacy EJ→DD refactor.** That's PROPOSAL-017, which also
  introduces the `retired` status value.
- **No retroactive frontmatter audit.** OQ-44 asks whether
  existing specs should be backfilled to DD-034 standards;
  default is no, opportunistic yes.
- **No removal of date-slug support entirely.** If a project
  prefers date-slug, they edit `start-task.md` to call their own
  naming logic. The scaffold defaults to sequential; users
  override.

### 9. Dependencies

- **Soft dep on PROPOSAL-015** (shipped) — workflow template's
  shipped collection list is now template-scoped, so adding
  `workflows` and `reconciliations` is a one-line edit to
  `templates.ts`.
- **Soft dep on PROPOSAL-003** (shipped) — relation types route
  via `SHIPPED_RELATION_META` which is already wired through the
  edge pipeline.
- **Soft dep on PROPOSAL-014** (shipped) — status_vocabulary pairs
  naturally with MCP next_actions hints (future: `next_actions`
  can suggest valid transitions per vocabulary). Not implemented
  in this proposal but leaves the door open.
- **No blocker.** Ships in isolation.

### 10. Implementation order

Single commit landed in two logical passes so review stays
tractable:

1. **Core + seed data** — type field, vocabulary seeds, three
   relation types, describe rendering, consistency check, unit
   tests.
2. **Template content** — new collections in `templates.ts`,
   new skill files, new script, new example workflow doc,
   integration test.

Can split into two commits if the diff is big; one commit if
the diff stays tight. Judgment call at implementation time.

## Status

Shipped. Landed in one pass:

**Core:**
- `StatusVocabEntry` type + `status_vocabulary` field on
  `CollectionMetaSeed` and `CollectionMetaEntry`
- Seed content + refresh path in `src/arango/meta.ts`
- `CollectionMetaInput`/`Patch` carry the vocab through CRUD
- `status_not_in_vocabulary` warning kind in `runConsistencyCheck`
- Three new relation types in `SHIPPED_RELATION_META`:
  `follows_workflow` (dd_edges_dependency), `derived_from`
  (dd_edges_semantic), `reconciles` (dd_edges_temporal)
- Shipped vocabularies for: decisions, proposals, questions,
  issues, discussions, observations, workflows, tasks, features,
  reconciliations — 9 collections with explicit vocabs, plus
  conversations/notes/principles/etc. intentionally without
- `docdog collections describe` renders vocabulary

**Template (workflow):**
- `workflows` and `reconciliations` added to workflow template's
  shipped collection set in `src/config/templates.ts`
- `templates/scripts/workflow/next-task-id.js` — DB-first sequential
  TASK-NNN with disk-scan fallback, no counter file
- `templates/skills/workflow/start-task.md` rewritten for
  sequential TASK-NNN and the DD-034 frontmatter contract
- `templates/skills/workflow/task-frontmatter.md` — reference
  cheat sheet
- `templates/skills/workflow/ejection-resilience.md` — DD-034
  explainer for skill readers
- `templates/skills/workflow/example-workflow-seed.md` — seed
  workflow document demonstrating the shape

**Tests:**
- `tests/unit/status-vocabulary-seed.test.ts` — 14 unit cases on
  shipped seed content and new relation type routing
- `tests/integration/meta-collections.test.ts` — 5 new cases for
  seed round-trip, user-defined vocabulary CRUD, new relation
  type seeding, `status_not_in_vocabulary` warning, and silence
  on collections without a vocabulary

**Verification against live repo:** `docdog init` re-seeded
cleanly (5 new shipped entries: workflows, tasks, features,
reconciliations, observations; 5 refreshed for vocabulary
addition). `docdog collections describe tasks` renders the
vocabulary. `docdog collections check` on real data surfaced
**actual drift** — vertices in issues/questions with status
values not in the new vocabularies (`fixed`, `analyzed`,
`narrowed`, `ongoing`, `planned`). The feature is delivering
value on first run.

**Total diff:** 222/222 tests green (121 unit + 101 integration
+ 1 pre-existing skip). Core ~120 LOC + seed data ~180 LOC +
template content ~600 LOC + tests ~200 LOC.

Unblocks orchestrator bootstrap — the onboarding can now call
`docdog init --template workflow` and get the workflows /
reconciliations / tasks collections with status vocabularies
out of the box.
