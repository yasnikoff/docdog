---
id: DD-061
title: "Per-project databases named `docdog_<project>`; three shipped templates"
collection: decisions
status: superseded
date: 2026-04-13
description: "DD-mirror of EJ-025 under DD-034's artifact-resilience lens. Each project gets its own Arango database named `docdog_<project_name>`. Shipped templates are now `minimal`, `structured`, and `workflow` (three, not two) — EJ-025's `orchestrator` template was renamed and joined by the workflow template via EJ-033 / PROPOSAL-015."
relationships:
  - supersedes: EJ-025
    context: "mirror under DD-034's artifact-resilience lens — template set sharpened against current reality"
  - references: DD-046
  - references: DD-055
  - references: DD-057
---

# DD-061: Database naming and shipped templates

**Superseded 2026-07-06 by DD-070** — docdog_<project> database naming dies with Arango; the template set (minimal/structured/workflow) survives (DD-070 §6).

## Database naming

Each project gets its own ArangoDB database named
`docdog_<project_name>`. The `docdog_` prefix is a constant
(`DEFAULT_ARANGO_DB_PREFIX`) in `src/config/defaults.ts`.

- `docdog_docdog` — this repo, dogfooding itself.
- `docdog_<app>` — any user project named `<app>` (hyphens and
  special characters normalized at init time).

Database-per-project gives clean isolation — one project's
`arangodump` doesn't touch another's, and the `docdog_` prefix
keeps the set discoverable in the ArangoDB UI.

## Templates

`docdog init --template <name>` scaffolds the project with a
predefined collection set, default skills, and optionally
starter scripts. **Three templates ship today** (EJ-025
originally only described two; the set grew):

- **`minimal`** — `notes` only. For projects that just want a
  searchable knowledge base with zero up-front taxonomy. Users
  extend via `vertex_collections` in config (DD-057).
- **`structured`** — the set of collections that match a typical
  spec-driven project: `decisions`, `requirements`, `principles`,
  `notes`, `observations`, `discussions`, `proposals`, `issues`,
  `questions`. This repo's own template, pre-PROPOSAL-015.
- **`workflow`** — `structured` plus the workflow-loop
  collections: `features`, `tasks`, `workflows`,
  `reconciliations`, `conversations`. Shipped skills include the
  code-change loop (see OBS-008 / DISC-013 — the cluster is
  currently uncaptured as a workflow artifact, which is a known
  gap).

Both `structured` and `workflow` include `notes` as
`default_collection` so unroutable files always have a home.

## What EJ-025 didn't anticipate

- **PROPOSAL-015 template-shipped tier.** Template collections
  are a distinct tier from user-declared `vertex_collections`
  (DD-057). EJ-025 implicitly treated the template's collection
  list as seed content copied into the user's config. The
  current model keeps template-shipped collections out of the
  user's config entirely.
- **`orchestrator` template** as named in EJ-025 no longer
  exists. Its collection set evolved into `structured` when the
  template generalized beyond its original host project.

## DD-034 check

Direct fit. Database naming is deterministic from project name.
Templates are seed content that lands on disk at init time and
is thereafter owned by the user — a vanilla agent reading
`.docdog/` finds the current state with no docdog-mediated
step.
