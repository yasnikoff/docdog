---
name: ejection-resilience
description: DD-034 + DD-035 in skill-reader terms — what makes a docdog-managed repo workable without docdog, and how skills + artifacts should be laid out
---

# Ejection resilience (DD-034 + DD-035)

This is the test docdog-managed repos are held to:

> **Within the `.docdog/`-scoped slice of a repo, a vanilla agent —
> one with no knowledge of docdog, no access to its CLI or graph —
> can read the on-disk files and reconstruct document
> relationships, process descriptions, and project context. Docdog
> adds retrieval performance and graph queries on top. Without
> docdog, you lose speed and automation; you don't lose the work.**

This supersedes the old test from EJ-030 ("delete every skill,
docdog still works"). The three-layer model — core primitives,
default skills, user skills — stays intact. Only the *test* has
changed.

## Scope: the `.docdog/` folder is the opt-in marker (DD-035)

The guarantee applies only to repos that have opted into docdog
management. Three cases, one rule each:

1. **`.docdog/` exists.** Full commitment applies across `.docdog/`
   and every path listed in `scan_paths`. Frontmatter is
   load-bearing, `relationships:` is load-bearing, status values
   come from the collection's vocabulary.
2. **`.docdog/` never existed.** Not docdog-managed. No
   obligations, no test.
3. **`.docdog/` was deleted.** Explicit opt-out. Docdog owes
   nothing from the moment the folder is gone. Residual markdown
   under `specs/` is still readable — but that's a property of
   markdown, not a promise docdog makes.

Deletion of `.docdog/` has semantic weight: it is the way a repo
opts out. If docdog were never in the repo, there would be no
docdog-related artifacts either.

## Where content lives: the split rule

**Test: "If I delete docdog entirely, is this file still useful?"**

- **Useful without docdog → `specs/`.** Project-native content.
  Decisions, requirements, features, tasks, principles, terms,
  constraints, integrations, open questions, proposals — all
  describe the project and stay valuable even if docdog never
  runs again.
- **Only useful because docdog exists → `.docdog/`.** Docdog-native
  meta. Workflow documents that describe docdog-mediated processes.
  Observations captured while dogfooding docdog. Reconciliation
  records that only make sense under docdog-tracked spec-to-code
  sync. These would be orphaned meta without docdog to attach to.

The workflow template seeds `scan_paths` accordingly: `specs/`
plus `.docdog/workflows/`, `.docdog/observations/`, and
`.docdog/reconciliations/`. Shipped collection names stay canonical
in frontmatter (`collection: workflows`, `observations`, etc.) —
only the path changes, which lets `.docdog/workflows/` (docdog's
process docs) coexist with a project's own `specs/workflows/`
(e.g. Temporal workflows) without any alias machinery.

The rule is heuristic, not mechanical. A general project
observation could sit in `specs/notes/` or `.docdog/observations/`;
a workflow that happens to describe a docdog-free process could go
in either place. The agent or user picks; docdog doesn't police it.

## What this means for skills

**Skills may freely assume docdog is present.** You don't have to
write degraded-mode fallbacks into every step. If docdog isn't
available, the skill simply can't run; that's acceptable.

The folder name `.docdog/skills/` is the coupling marker. Skills
that live there are docdog-aware by convention. Skills that must
work without docdog (rare) should live elsewhere — e.g.
`.claude/skills/` or wherever your agent provider reads non-docdog
skills from.

## What this means for artifacts

**Artifacts are held to a stricter bar.** Every task, workflow,
feature, decision, proposal, and observation must carry its
load-bearing context in frontmatter + body:

1. **Relationships in yaml, not only in prose.** The
   `relationships:` block is the only reliable way a vanilla agent
   can find what a record connects to. Do not rely on the graph
   alone.
2. **Resolve ids to filenames when possible.** A reference like
   `DD-034` in prose should mention the file path
   (`specs/decisions/dd-034-*.md`) so a grep-only agent can
   follow it.
3. **Status values from the collection's vocabulary.** The
   vocabulary lives in the collection's concept record
   (`.docdog/concepts/collection-<name>.md` — an ordinary indexed
   file, searchable via `docdog_search`). Agents reading the file
   should be able to interpret the status without a database
   lookup.
4. **Self-describing bodies.** The body explains the artifact
   enough that someone reading cold understands what it is,
   what it does, and what's next. Don't leave that in the graph.

## The audit

Template authors: when adding a new shipped collection, ask these
five questions of its example artifacts:

1. **What is this?** — answerable from frontmatter.
2. **What state is it in?** — answerable from `status` against
   the collection's vocabulary.
3. **What does "done" / "current" mean here?** — answerable from
   body or acceptance criteria.
4. **What does it connect to?** — answerable from `relationships:`
   + resolved paths in the body.
5. **What process / rule applies to it?** — answerable from a
   linked workflow doc, decision, or principle.

If any of the five requires running docdog to answer, the
template has leaked load-bearing context into the graph. Fix the
frontmatter contract, not the skill.

## The retained working modes

With docdog running:
- Vector search and keyword search
- Graph traversal (`docdog_traverse`)
- MCP tools (`docdog_search`, `docdog_get`, `docdog_create`, etc.)
- Indexer warnings (unknown collections, unknown relationship types)

Without docdog ("ejected mode"):
- grep, find, manual file following
- No vector search; no graph queries
- Work continues — slower, less automatic, but unbroken
- Skills in `.docdog/skills/` stop working; that's fine, you're
  ejected

## The trade

Skills get to be richer and more direct (no defensive
`if docdog then` branches). Artifacts get more discipline (richer
frontmatter, explicit relationships, resolvable references). Net:
the bar shifts from "every skill degrades gracefully" (hard,
brittle, rarely complete) to "every artifact is self-describing"
(checkable at template-design time, once per collection). Smaller
scope, stricter guarantee.
