---
id: DD-060
title: "`dd_` prefix reserves the system namespace; user collections live unprefixed"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-024 under DD-034's artifact-resilience lens. System collections use the `dd_` prefix and are docdog machinery. User content collections have no prefix and are declared in `vertex_collections`. `default_collection` catches unroutable files."
relationships:
  - supersedes: EJ-024
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-046
  - references: DD-057
  - references: DD-050
  - references: DD-051
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check
---

# DD-060: `dd_` namespace, user namespace

Two namespaces coexist in each project database:

## System namespace (`dd_` prefix)

System collections are docdog machinery — never user content:

- `dd_patches` — proposed section changes (DD-050 tier 3).
- `dd_edges_structural` / `dd_edges_semantic` /
  `dd_edges_temporal` / `dd_edges_dependency` /
  `dd_edges_crosscutting` / `dd_edges_unspecified` — one
  collection per relationship category plus a fallback.
- `dd_embedding_cache` — content-hash-keyed (DD-051).
- `dd_collection_meta`, `dd_relation_meta` — schema / vocabulary
  registries.

The `dd_` prefix is a contract: docdog owns these collections,
users do not modify them. They are frozen constants in
`src/arango/collections.ts`.

## User namespace (no prefix)

User content collections have no prefix. They are declared per
project in `.docdog/config.yaml` under `vertex_collections`, or
shipped by the active template (DD-057). Examples: `decisions`,
`notes`, `principles`, `features`, `tasks`.

## `default_collection`

`default_collection` names a catch-all for files that can't be
routed via `collection:` frontmatter or directory-name
inference. It must be a member of `vertex_collections` (system
or user). If unset, unroutable files are skipped with a warning
rather than silently vanishing.

## Why `dd_` specifically

- `_`-prefix is reserved by ArangoDB itself.
- `system:` contains a colon, which is invalid in Arango
  collection names.
- `dd_` is short, unlikely to collide with real user vocabulary,
  and sorts predictably in collection listings.

## DD-034 check

Preserved. The namespace split is visible in the config file —
anything prefixed `dd_` is off-limits, anything else is the
user's (or the template's). A vanilla agent opening
`.docdog/config.yaml` can read the full user collection set
directly, and can know by convention that the system collections
exist without ever touching the database.
