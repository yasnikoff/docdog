---
id: DD-034
title: "Ejection resilience lives in artifacts, not in skills"
collection: decisions
status: current
date: 2026-04-13
description: "Reframes EJ-030's test. The guarantee docdog offers is that a vanilla agent reading the on-disk repo can reconstruct document relationships, process descriptions, and project context — docdog adds retrieval performance and graph queries on top. Skills may freely assume docdog; the source of truth is the frontmatter and bodies."
related:
  - EJ-030
  - EJ-033
  - DISC-004
  - PROPOSAL-003
  - PROPOSAL-015
  - OQ-37
relationships:
  - supersedes: EJ-030
    context: "supersedes the 'delete every skill, docdog still works' clause only — the three-layer model of core / default skills / user skills is preserved"
  - references: EJ-033
    context: default skills and templates are user-owned post-init per its shipped-collection reading
  - references: DISC-004
    context: "the relationships: frontmatter block becomes load-bearing under the new test"
  - references: PROPOSAL-003
    context: "edge pipeline is now a principle, not just a mechanism — it reads from disk frontmatter, which is the source of truth"
  - references: PROPOSAL-015
    context: the template-owned shipped set is the mechanism behind layer 2's user-owns-post-init reading
  - references: OQ-37
    context: "reframes OQ-37 from per-skill audit to artifact-template audit"
  - references: EJ-029
    context: DB-first-by-design collections (EJ-029, EJ-033) count as cache, not source of truth, under this decision's resilience test
  - references: OQ-44
    context: opportunistic backfill of pre-standard artifacts stays optional — delegated to OQ-44
  - references: PROPOSAL-017
    context: anticipates P-017's stress-test refactor creating DD mirrors for pre-v2 EJ entries
---

# DD-034: Ejection resilience lives in artifacts, not in skills

## Statement

**A repo using docdog must remain workable by a vanilla agent — one
that doesn't know docdog exists — without loss of document
relationships, process descriptions, or project context. Docdog adds
retrieval performance, vector/keyword search, graph traversal, and
automation on top. Without docdog, the work continues in an "ejected
or temporarily disconnected from docdog" mode; the work does not
fragment.**

The on-disk files — their frontmatter and bodies — are the source
of truth. The graph in ArangoDB is a derived, high-performance
mirror built from them. Skills, by contrast, may freely assume
docdog is present. Skills are tools the *docdog-aware* agent uses.
Artifacts are the *shared language* any agent, docdog-aware or not,
must be able to read.

## What this supersedes

This decision supersedes **one clause** of EJ-030: the test
*"delete every skill in .docdog/skills/, docdog still works as a
memory layer."* That test pointed in the right direction but
measured the wrong thing. It was a statement about docdog's
resilience to skill deletion — a statement about *docdog's*
contract. The new test is a statement about the *repo's* contract.

**EJ-030's three-layer model stays intact:**

1. Core primitives (docdog owns) — still required, still minimal.
2. Default skills (docdog ships as template content, user owns
   post-init per EJ-033) — still replaceable.
3. User skills / workflows — still user-owned completely.

What changes is the *test* by which layer 2 and 3 are judged.
Skills no longer need to work without docdog. Artifacts do.

## The new test

Pick any spec, task, workflow, or feature file in a docdog-managed
repo. Hand it to an agent that has no knowledge of docdog's CLI,
MCP tools, or graph. Can that agent:

1. **Understand what the artifact is** from its frontmatter
   (`collection`, `id`, `title`, `status`, `description`)?
2. **Find its immediate relationships** from the `relationships:`
   frontmatter block — without querying a database?
3. **Read its body and act on its content** — e.g. follow a
   workflow doc's steps, implement a task's acceptance criteria,
   apply a decision's constraint?
4. **Locate the related artifacts on disk** by following the
   frontmatter IDs to filenames via the project's layout
   conventions?

If the answer to any of these is "no, you need docdog running to
figure that out," the artifact has leaked load-bearing context into
the graph and needs to be fixed at the frontmatter/body level.

The test is checked at **template design time** and at
**artifact-creation time** by the agent writing the file — not by
a runtime check in docdog core.

## Load-bearing implication: the `relationships:` block is now a principle

DISC-004 and PROPOSAL-003 introduced the `relationships:`
frontmatter block as a mechanical feature — extract edges from
yaml during indexing. Under DD-034 it becomes a **principle**.
Every task, feature, workflow, decision, proposal, and observation
must carry its relationships in `relationships:` — not only as
edges in `dd_edges_*`. The database can reconstruct the frontmatter,
but the frontmatter cannot be reconstructed from the database
without the disk files existing, so the disk wins.

This costs nothing in practice — v2's edge pipeline already reads
from frontmatter. DD-034 just commits to never growing a DB-first
edge that has no frontmatter source.

**Exception:** agent-authored enrichment via `docdog_create` /
`docdog_update` on working collections (notes, conversations,
observations that originate via MCP and live in DB only) is fine —
those collections are DB-first by design (EJ-029, EJ-033) and
count as cache, not source of truth. Ejection workflow for them
is: export to disk before disconnecting, or accept that DB-only
working context is lost on ejection.

## Folder boundary: docdog-coupled vs vanilla skills

Skills that assume docdog is present belong in `.docdog/skills/` —
the folder name signals the coupling. Skills that must work without
docdog (if any — they're rare) belong outside that folder, e.g.
`.claude/skills/` or `.cursor/rules/`. The folder is the boundary
marker; docdog does not enforce it in code.

Under DD-034, the `.docdog/skills/` folder carries no guarantee of
vanilla-agent portability — that's what it means for a skill to
"assume docdog."

## What this does not require

- **The DB is not a superset of disk.** DB is a mirror. Anything
  that exists only in DB and isn't derivable from disk is working
  context (cache-tier), not source of truth.
- **No runtime check in docdog core.** Core doesn't try to detect
  whether an artifact "would be readable by a vanilla agent" — the
  test is a design check applied by template authors and
  artifact-creating agents.
- **No retroactive rewrite of existing specs.** Pre-DD-034 artifacts
  are grandfathered. New artifacts created going forward are held
  to the standard. Opportunistic backfill is fine but not required.
  (See OQ-44.)
- **Not a revocation of EJ-030's three-layer model.** Core, default
  skills, user skills — all still exist, all still have the
  ownership they did. Only the *test* by which layer 2/3 are
  judged is replaced.

## Naming note: EJ → DD

Pre-v2 decisions were numbered EJ-NNN ("ejection judgment" from
the docs-internal → orchestrator ejection era). V2 moves to DD-NNN
for new decisions. DD-034 continues the numeric sequence from
EJ-033 — this is intentional so references from old work keep
working by number alone. PROPOSAL-017 plans a stress-test refactor
that creates DD mirrors for the pre-v2 EJ entries, reframes them
under DD-034 where applicable, and retires the EJ entries when all
references are migrated.

## Rationale summary

The user observation that triggered this decision: *"skills will
inevitably be docdog aware."* Pretending otherwise produced the
wrong test. The right test is one docdog *can* meet — artifact
self-description — and meeting it is strictly more valuable than
the old test, because it protects the work from any loss of the
tooling layer, not just the skill layer.
