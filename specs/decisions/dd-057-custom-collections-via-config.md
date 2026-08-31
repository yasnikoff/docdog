---
id: DD-057
title: "Projects extend the collection set through .docdog/config.yaml"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-021 under DD-034's artifact-resilience lens. Projects add their own vertex collections by declaring them in `vertex_collections`. System collections stay frozen. No code changes to add a collection type; unroutable files fail loudly."
relationships:
  - supersedes: EJ-021
    context: "mirror under DD-034's artifact-resilience lens — refined against PROPOSAL-015's shipped-vs-user split"
  - references: DD-046
  - references: DD-058
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — template upgrades must not orphan user extensions
  - references: PROPOSAL-015
    context: builds on P-015's runtime collection-set refinement EJ-021 didn't anticipate
---

# DD-057: Custom collections via config

Projects extend the collection set by listing them in
`.docdog/config.yaml` under `vertex_collections`. No code
changes, no database migration scripts, no docdog rebuild.

```yaml
vertex_collections:
  - tickets      # user-defined
  - runbooks     # user-defined
```

## Three tiers, not two

PROPOSAL-015 introduced a refinement EJ-021 didn't anticipate.
The full collection set at runtime is:

1. **System collections** — `dd_*` prefix, frozen constants in
   `src/arango/collections.ts`. Always present. Owned by docdog.
2. **Template-shipped collections** — per-template defaults
   (e.g. `decisions`, `notes`, `principles` in the structured
   template; `features`, `tasks`, `workflows`, `reconciliations`,
   `conversations` in the workflow template). Shipped with the
   template, available out of the box, not duplicated into the
   user's config.
3. **User-declared collections** — the `vertex_collections` list
   in `config.yaml`. Project-specific extensions that the user
   owns.

`getVertexCollections()` unions all three. The split exists so
that a template upgrade can evolve its shipped collection set
without orphaning user extensions — DD-034 needs this to hold if
retemplating is ever a supported operation.

## Unknown-collection policy

A file whose `collection:` frontmatter value isn't in any tier is
**skipped with a warning** by default. `docdog index
--create-collections` auto-creates the collection and indexes the
file but does not persist the change to config — the user has to
add it manually, or the next indexer run warns again.

## DD-034 check

Direct fit. The authoritative collection list is
config-in-repo plus template-in-repo; nothing is inferred from
file contents. A vanilla agent can read `config.yaml` and the
template's `.docdog/` seed and know every collection that exists
without touching the database.
