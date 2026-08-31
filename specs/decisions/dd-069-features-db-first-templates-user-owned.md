---
id: DD-069
title: "Features are DB-first with a rendered disk snapshot; templates are user-owned scaffolding"
collection: decisions
status: superseded
date: 2026-04-13
description: "DD-mirror of EJ-033 under DD-034's artifact-resilience lens. The `features` collection is DB-first — `docdog_create`/`docdog_update` are the write path and a `render-matrix` script produces `specs/features.md` as a derivative snapshot. Templates (minimal/structured/workflow) are seed content users own post-init; docdog core has no awareness of tasks/features/conversations semantics."
relationships:
  - supersedes: EJ-033
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-065
  - references: DD-066
  - references: DD-061
---

# DD-069: Features DB-first; templates user-owned

**Superseded 2026-07-06 by DD-070** — features become ordinary disk records; the templates-user-owned half survives, restated in DD-070 §6.

Two commitments that usually get tangled in discussion and are
clearer together.

## Features are DB-first

The `features` collection (shipped in the `workflow` template)
is written via `docdog_create` and `docdog_update`, not via
edit-then-index. A `render-matrix` script produces
`specs/features.md` as a derivative disk snapshot. The markdown
file carries a `do not edit` header and is idempotently
overwritten on re-render.

**Rationale:**

- Feature status churns fast (multiple transitions per day on
  active work). Disk-first means an edit + re-index cycle per
  transition, which adds friction that compounds across many
  small updates.
- Features sit between normative specs (stable, disk-first)
  and working context (ephemeral, DB-only). The DB-first
  pattern fits the middle tier cleanly — see DD-065.
- The derivative snapshot exists for human readers and for
  DD-034 compliance: a vanilla agent reading
  `specs/features.md` finds the current shape of the feature
  matrix without ever touching Arango. The snapshot is
  regenerated, not round-tripped, so there's no drift risk.

## Templates are user-owned scaffolding

Docdog ships three templates (DD-061: `minimal`, `structured`,
`workflow`). Each bundles a collection set, default skills,
and optionally starter scripts. On `docdog init`, the template
is copied into the user's project.

**From that point forward, templates are seed content owned by
the user.** Docdog core:

- Never reads from `tasks/`, `features/`, or `conversations/`
  collections. Only the user's skills do.
- Never enforces workflow semantics — status vocabularies are
  free strings, state transitions are user-decided.
- Never auto-syncs template content after init. Sync is opt-in
  via `docdog templates refresh`.

This is DD-066's "memory layer, not workflow engine" applied
to the template layer: the template decides what the seed looks
like, and from then on it's the user's repo.

## Risks acknowledged (unchanged from EJ-033)

- **Scaffolding drift.** A user's `.docdog/skills/` will
  diverge from docdog's shipped templates over time. That's
  expected. Users who customize own the divergence.
- **Opinionated defaults.** Shipping ~14 skills in the
  `workflow` template is more opinionated than `minimal`.
  Users who want less pick a smaller template or delete skills
  after init.
- **Salvageable.** If docdog's core ever regrets shipping
  workflow skills, the `workflow` template can be extracted
  into a separate `@yasnikoff/docdog-workflow` package that
  depends on docdog core. The code is decoupled enough to
  support this.

## DD-034 check

The features half is a carve-out by design, like DD-068.
The `specs/features.md` snapshot exists so DD-034 is satisfied
by a derivative on-disk artifact rather than by the DB vertex
directly. The templates half is direct-fit: seed content on
disk, owned by the user, visible to any agent reading the
project without docdog.
