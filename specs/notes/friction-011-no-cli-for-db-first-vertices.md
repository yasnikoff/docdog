---
id: FRICTION-011
title: "No CLI surface for creating DB-first vertices (features, tasks); script-inserted vertices don't auto-materialize frontmatter edges"
collection: issues
status: resolved
description: "docdog_create lives only in the MCP server; without a connected MCP client, creating a feature vertex requires a one-off script, and that script bypasses the disk-indexer's edge materialization pipeline so outbound relationships never become graph edges."
severity: inconvenient
relationships:
  - references: WF-003
    context: the workflow step whose create-a-feature instruction hit the DB-first gap on first instantiation
  - references: EJ-033
    context: the load-bearing DB-first features decision the CLI surface couldn't serve
  - references: FEATURE-001
    context: the vertex whose missing outbound edges demonstrated the frontmatter-to-edges gap
  - references: DP-001
    context: proposed fix checked compliant — categorization stays the user's
  - references: DD-036
    context: the workflow-canonical model this friction was executing against
  - references: DD-070
    context: resolution — dissolved the DB-first premise entirely; both gaps closed by construction
---

# FRICTION-011: No CLI surface for DB-first vertex creation

## Trigger

Phase 2 of the workflow-template dogfooding exercise on the
self-hosted repo. WF-003 step 1 says *"Create a `FEATURE-NNN` in
the `features` collection"*. EJ-033 says features are DB-first —
no source markdown, created via `docdog_create`, rendered to disk
via `render-matrix`.

## What happened

1. Tried `docdog --help` for a CLI verb that creates a vertex.
   None exists. `docdog add` is for frontmatter stamping; `docdog
   split` is for file splitting; `docdog discuss new` is a file
   scaffolder. Nothing creates a vertex directly in any collection.
2. `docdog_create` exists only as an MCP tool (`src/mcp/tools/create.ts`).
   Calling it requires a connected MCP client — not available inside
   an agent session that isn't configured with docdog as an MCP server,
   and not available from a plain shell at all.
3. Fallback: wrote a one-off `.docdog/scripts/seed-feature-017.js`
   that uses `ctx.db` directly to insert the vertex. Worked. The
   script is idempotent and committed for reproducibility.
4. **Second finding at re-index time:** the script-inserted vertex
   carries its `relationships:` in `frontmatter.relationships`, but
   the edge-materialization pipeline only runs over disk-sourced
   sections during `docdog index`. So the FEATURE-001 vertex has no
   outbound `implements`, `follows_workflow`, or `references` edges
   even though the data is present in its frontmatter field.
   Traversal from FEATURE-001 shows only the inbound `contains`
   edges from the task READMEs (which were disk-indexed normally).

## Workaround

- For features: write a seed script. Accept that edges won't
  materialize and resolve that in a follow-up by either (a)
  calling `docdog_relate` from the same script or (b) writing a
  thin `ensureEdges` helper.
- For tasks: stay on the file-first path (`tasks/TASK-NNN/README.md`)
  — the disk indexer handles both vertex creation AND edge
  materialization automatically. This worked cleanly.

## What should change in docdog

Two distinct gaps, either can stand alone:

1. **CLI surface for vertex CRUD.** Something like
   `docdog create <collection> --id X --title "..." --content-file
   body.md [--from-frontmatter body.md]`. Must be able to read
   frontmatter from a file so the agent-first mechanics rule is
   honored (the user writes the body + frontmatter, docdog does
   the mechanical insert). DP-001 compliant because the
   categorization is still the user's.

2. **Script-path edge materialization.** Either:
   - `ctx.createVertex(collection, { frontmatter: {...} })` helper
     that runs the same frontmatter→edges pipeline the disk
     indexer uses, OR
   - `docdog_create` MCP tool accepts a `frontmatter` field and
     runs the pipeline internally, OR
   - `docdog index` includes a "re-materialize edges from
     frontmatter field" pass for vertices whose `frontmatter`
     contains a `relationships:` block but whose outbound edges
     are missing.

## Why this matters

EJ-033 is a load-bearing decision: features (and probably tasks
eventually) are supposed to be DB-first for status-churn reasons.
If DB-first means "write a custom one-off script every time,"
then DB-first in practice reverts to file-first because
file-first has a smoother path. The decision is being honored in
principle and contradicted in ergonomics.

The workflow template ships skills (start-task, feature-matrix,
finalize-task) that explicitly call `docdog_create` as if it were
trivially available. It isn't — those skills only run inside an
MCP-connected agent session. A user running docdog locally with
no MCP wiring has no path to execute the skill literally.

## Related

- EJ-033 — features DB-first.
- WF-003 — docs batch rewrite workflow that hit this gap on its
  first real instantiation.
- DD-036 — the workflow-canonical model Phase 1 established; this
  friction is specifically about executing what the workflows
  prescribe.

## Resolution

Both gaps closed in a single landing pass (2026-04-14):

1. **Shared helper `createVertexWithEdges`** in
   `src/engine/create-vertex.ts`. Runs the same
   frontmatter→relationships→edges pipeline the indexer uses, scoped
   to a single vertex. Also replays orphans so forward references
   promote as soon as their targets land.

2. **CLI verb**: `docdog create <collection>
   --from-frontmatter <file>` reads frontmatter + body from a markdown
   file and delegates to the shared helper. `--title` / `--content-file`
   direct mode is also supported.

3. **MCP `docdog_create` refactored** to delegate to the shared helper.
   This fixed a latent bug: the prior handler accepted `content` +
   `title` but silently discarded any `frontmatter` arg. The tool
   schema now advertises the `frontmatter` field explicitly and any
   `relationships:` entries inside materialize as real edges.

4. **Script helper `ctx.createVertex(input)`** added to
   `ScriptContext`. Scripts in `.docdog/scripts/` can now create
   DB-first vertices with automatic edge materialization instead of
   calling `ctx.db.collection(...).save(...)` and losing edges.

Integration test `tests/integration/create-vertex.test.ts` covers
9 cases: bare creation, edges to existing targets, forward-ref
orphaning + promotion, system-collection rejection, unknown-collection
rejection, duplicate-id rejection, MCP parity for materialization, MCP
error-shape for missing args.

## V3 postscript (2026-07-11)

DD-070 dissolved the premise: there are no DB-first vertices, so both
gaps close by construction rather than by the machinery above.
`createVertexWithEdges`, the `docdog create` CLI verb,
`ctx.createVertex`, and the integration suite died at P-023 §7 step 6.
The surviving half is `docdog_create` in `src/storage/writes.ts`: it
writes a markdown file at a caller-supplied path and reindexes it, so
frontmatter `relationships:` become edges through the one indexer
pipeline every record uses. Status stays resolved — the friction this
record describes cannot recur in a disk-canonical architecture.
