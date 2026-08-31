---
id: FRICTION-010
title: "Shipped collection names collide with project domain vocabulary — `workflows` is the first real hit"
collection: issues
status: resolved
date: 2026-04-13
severity: inconvenient
fixed_date: 2026-07-11
resolution_approach: redesign
fix_commit: 1b36600acc9ee6b1871d7131a7fb38fcf077b732
description: "RESOLVED 2026-07-11 — the fix it proposed shipped, starting the day it was filed: path-based `.docdog/` namespacing became DD-035 (1b36600), the workflow template seeds the .docdog/workflows|observations|reconciliations scan paths (4f18b34; v3 rail: src/config/templates.ts), the split rule lives in the shipped ejection-resilience explainer, and the convention is lived practice in this repo and the orchestrator adoption plan. No alias machinery was ever needed. Original: docdog's shipped `workflows` collection name collides with the orchestrator repo's Temporal `workflow` domain term; zero-code fix (path namespacing under `.docdog/`) that also tightens DD-034's ejection framing."
related:
  - PROPOSAL-016
  - DD-034
  - DISC-011
relationships:
  - references: PROPOSAL-016
    context: "PROPOSAL-016 shipped `workflows` as a template collection; this friction is the first collision case"
  - references: DD-034
    context: "the proposed fix tightens DD-034's ejection test — see 'Implication for DD-034' below"
  - references: DD-035
    context: anticipated the .docdog-scoped ejection decision by name — landed as exactly that record
  - references: WF-006
    context: the friction-resolve session that verified all five action items against v3 and closed this record as resolved/redesign
  - references: DISC-018
    context: action item 5 discharged — the next collision class (frontmatter keys in adopted repos, Jekyll/Obsidian/ADR tooling) was captured there as its own open design question
  - references: DD-070
    context: the v3 rearchitecture that makes this record's Arango framing historical — the collection name now lives in frontmatter and the path convention carries over unchanged
---

# FRICTION-010: Shipped collection names collide with project domain vocabulary

## The concrete hit

The orchestrator repo (`<host-project>/orchestrator`) uses Temporal for
durable business-process orchestration. "Workflow" is a first-class
domain term in that codebase — Temporal workflows are the core of
the provisioning, reconciliation, and billing-exchange flows. When
docdog's workflow template adds `specs/workflows/` for process
documents (release runbooks, feature-ship loops, reconciliation
procedures), it collides with the project's native use of the word.

The collision is purely at the **language layer**. At the data
layer there's no conflict: Temporal workflows live in Temporal's
runtime, docdog's `workflows` collection lives in ArangoDB. But
the word "workflow" in any agent prompt becomes ambiguous, and
disambiguation overhead compounds across every conversation.

## What happens if we ignore it

Route 1: agents and humans in orchestrator sessions have to
constantly qualify "workflow" — "Temporal workflow" vs "docdog
workflow" vs "process workflow" — and everyone makes mistakes. Not
fatal, persistently annoying.

Route 2: orchestrator's `specs/workflows/` directory gets populated
by docdog's process docs while nobody writes actual Temporal
workflow *documentation* anywhere, because the natural name is
taken. Information loss.

Route 3: orchestrator deletes docdog's shipped `workflows`
collection or ignores it, loses the shipped `status_vocabulary`
and the `follows_workflow` relation type, rebuilds something
equivalent with a different name. Friction for everyone.

## The generalization

This is not a one-off. Nearly every shipped docdog collection
name makes a monolithic claim on an English word. Domains with
realistic collision risk:

| Docdog | Colliders in the wild |
|---|---|
| `workflows` | Temporal, BPMN, Airflow, n8n, user flows, CI/CD |
| `tasks` | Celery, job queues, any task tracker |
| `features` | Feature flags (LaunchDarkly), ML feature stores |
| `observations` | Monitoring, SLO tools, telemetry platforms |
| `issues` | GitHub / GitLab / Jira issues |
| `integrations` | SaaS connector catalogs, webhook systems |
| `decisions` | Decision engines, rules systems |
| `constraints` | Constraint solvers, SRE error budgets |
| `requirements` | Requirements engineering tooling |
| `conversations` | Chat apps, CRM threads |
| `discussions` | Forum software, GitHub discussions |

The ones that don't seem to collide much — `principles`,
`guidelines`, `terms`, `proposals`, `reconciliations`, `notes`,
`questions` — are still not zero risk. Any project in a weird
enough domain will find a collision somewhere.

## The proposed fix: path-based namespacing under `.docdog/`

Zero code changes. Pure convention:

**Docdog-shipped concepts whose on-disk files would collide with
project vocabulary live under `.docdog/<concept>/` instead of
`specs/<concept>/`.** The collection name in ArangoDB stays
canonical (`workflows`), preserving all shipped vocabulary + edge
routing, but the on-disk path changes so the project is free to
use `specs/workflows/` for its own domain concept.

Example for orchestrator:

```
specs/
  decisions/
  tasks/
  features/
  workflows/           ← orchestrator's Temporal workflow docs
  ...

.docdog/
  config.yaml
  skills/
  scripts/
  workflows/           ← docdog's process docs (runbooks, loops, etc.)
  observations/        ← docdog dogfooding notes
  reconciliations/     ← (if used) spec-reconciliation records
```

The indexer already supports arbitrary `scan_paths`, so this is
purely a scan path added at init time. No code changes, no new
schema, no new machinery.

## The split rule

**Project-native content** goes in `specs/` because it's useful
domain material that would survive docdog being removed:
- decisions, requirements, features, tasks, issues, questions,
  proposals, discussions, principles, terms, constraints,
  integrations, domain, guidelines, notes

**Docdog-native content** goes in `.docdog/` because it exists
*because docdog exists* — remove docdog and these files become
orphaned meta-content with nothing to attach to:
- workflows (process docs describing docdog-mediated processes)
- observations (dogfooding findings)
- reconciliations (only meaningful if docdog is tracking
  spec-to-code sync)

**The test:** *"If I delete docdog entirely, is this file still
useful?"* If yes → `specs/`. If no → `.docdog/`.

## Implication for DD-034 — this tightens the ejection test

DD-034 currently says *"a vanilla agent reading the on-disk repo
can reconstruct document relationships, process descriptions, and
project context without docdog."* Implicitly that's a promise
over every file in the repo.

The `.docdog/`-scoping fix tightens this in a principled way:

> **If the `.docdog/` folder exists, the files inside it are
> vanilla-agent readable.** The frontmatter is load-bearing, the
> relationships are explicit, the bodies are self-describing.
> Deletion of `.docdog/` is an explicit opt-out from docdog
> management — docdog owes no guarantees to a repo that removed
> the folder, because "if docdog were never in the repo, there
> would be no docdog-related artifacts either."

This is strictly better than the old phrasing because:

1. It resolves a hidden circularity. The old test implied docdog
   had to make every repo workable without docdog, which is
   impossible for repos that never had docdog. The new test only
   promises anything for repos that opted in.
2. It makes `.docdog/` the **opt-in signal.** Presence = "this
   project uses docdog." Absence = "this project has opted out
   (or never opted in)." Semantically clean.
3. It gives deletion a meaning. `rm -rf .docdog/` is a deliberate
   ejection. Before the refinement, that command was ambiguous
   ("did they mean to do that?"). After, it's explicit and
   docdog stops owing guarantees.
4. It does not weaken the artifact-resilience commitment for the
   content that matters. Project-native specs still live in
   `specs/` and must remain vanilla-agent readable. The
   `.docdog/` folder only holds content that requires docdog
   context to have meant anything in the first place.

DD-034 should be amended (or superseded) to reflect this tighter
framing. Probably a new DD rather than editing DD-034 in place,
since it's a genuine refinement of the commitment.

## Why not build alias / rename machinery instead

Three options were considered and rejected for now:

1. **Alias field on `dd_collection_meta`.** A user collection
   declares `alias_of: workflows` and inherits shipped vocab +
   relation routing. Clean but new schema + resolver work.
2. **Template-level rename at init.** `docdog init --rename
   workflows=process_docs`. Touches config schema, seed upsert,
   every downstream query that references canonical names.
3. **Prefix-based namespacing.** `proj_workflows` everywhere.
   Ugly, invasive, rejected.

The path-based `.docdog/` convention is strictly cheaper than
any of these and strictly good for the ejection-resilience
framing. If multiple projects hit collisions that path-scoping
doesn't resolve, the alias field becomes the next step. Until
then, YAGNI.

## Action items

1. **Amend or supersede DD-034** with a new DD that formalizes the
   "`.docdog/` folder as opt-in marker" refinement. Probably
   `DD-035-ejection-is-scoped-to-docdog-folder.md` or similar.
2. **Update the workflow template** so that on `docdog init
   --template workflow`, the seed `scan_paths` includes
   `.docdog/workflows/`, `.docdog/observations/`,
   `.docdog/reconciliations/` in addition to `specs/`.
3. **Document the split rule** in
   `templates/skills/workflow/ejection-resilience.md` (the DD-034
   explainer that ships with the workflow template) — add a
   section on "where files live" with the `specs/` vs `.docdog/`
   heuristic.
4. **Orchestrator bootstrap uses the convention from day one.**
   Process docs go in `.docdog/workflows/`. Temporal workflow
   documentation (if any) can freely use `specs/workflows/`.
5. **Capture any follow-on collisions as friction items** so the
   collision pattern stays visible. If a second case is
   qualitatively different (path-scoping doesn't help), that's
   the signal to build alias machinery.

## Status

Resolved 2026-07-11 — see Resolution below. (Filed as open;
blocked nothing, but wanted addressing before the orchestrator
bootstrap, because choosing the path convention after the first
`docdog init` is harder than choosing it first.)

## Resolution (2026-07-11)

**Approach: redesign — the friction's own proposed fix was adopted
and shipped, starting the day it was filed; this WF-006 session
verified each action item against v3 and closes the record.**

What shipped, against the five action items:

1. **DD-035 landed the same day** (`1b36600`,
   `specs/decisions/dd-035-ejection-scoped-to-docdog-folder.md`) —
   `.docdog/` as the opt-in marker, the split rule, the three-case
   scope. It carries a `source of` edge back to this friction.
2. **The workflow template seeds the scan paths** — `4f18b34`, then
   the v3 rail: `src/config/templates.ts` `workflows.defaultScanPaths`
   is `specs/` plus `.docdog/workflows/`, `.docdog/observations/`,
   `.docdog/reconciliations/` (and `.docdog/concepts/` since
   PROPOSAL-025/026).
3. **The split rule is documented in the shipped explainer**
   (`templates/skills/workflows/ejection-resilience.md`, "Where
   content lives") — including this friction's Temporal coexistence
   example.
4. **The convention is lived practice** — this repo's own WF/OBS/RECON
   records index from `.docdog/workflows|observations|reconciliations/`,
   and the orchestrator adoption plan (PLAN-DOCDOG-001) inherits the
   seeded paths at init, before any collision can form.
5. **Follow-on collisions stayed visible** — the next collision class
   (frontmatter keys in adopted repos, Jekyll/Obsidian/ADR tooling)
   was captured as DISC-018, open as its own design question.

*Rejected alternatives:* alias field on collection meta, init-time
rename, prefix namespacing — rejected in the body when filed, and
they stayed unnecessary: no second collision case ever required
alias machinery. The YAGNI call held through the v3 pivot.

*Knock-on effects:* none open. The body's Arango framing
(`dd_collection_meta`, "collection lives in ArangoDB") is historical
— under v3 the collection name lives in frontmatter and the path
convention carries over unchanged (DD-070).
