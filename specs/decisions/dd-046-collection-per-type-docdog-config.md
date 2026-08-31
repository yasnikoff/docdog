---
id: DD-046
title: "Collection-per-type with .docdog/config.yaml as the project-local registry"
collection: decisions
status: superseded
date: 2026-04-13
description: "DD-mirror of EJ-010 under DD-034's artifact-resilience lens. One ArangoDB collection per document type; project config lives in .docdog/config.yaml at repo root, not a central system database."
relationships:
  - supersedes: EJ-010
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-044
  - references: DD-047
---

# DD-046: Collection-per-type + .docdog/config.yaml

**Superseded 2026-07-06 by DD-070** — typed collections survive as config-declared frontmatter routing; the Arango collection-per-type materialization specified here dies with the storage swap (DD-070 §6).

ArangoDB collections map one-to-one onto document types: `decisions`,
`requirements`, `principles`, `observations`, `discussions`, `notes`,
and so on — not a single `type`-tagged collection. Edge collections
are per relationship category.

## Project config

Project configuration lives in `.docdog/config.yaml` at the repo
root. The MCP server reads it to know which database and which
collections to use. No central registry, no system database — one
repo, one config.

## Extensibility

Downstream projects add their own vertex collections by editing
`vertex_collections` in config. That list is authoritative; the
indexer does not invent collections from file contents.

## Rationale

Collection-per-type gives clean per-collection indexes, readable
AQL, per-collection schema and status vocabularies, and natural
extensibility. Config-in-repo keeps project configuration
co-located with the artifacts it describes, which is the whole
DD-034 posture.

## DD-034 check

Direct fit. `.docdog/config.yaml` is a plain file at a stable path.
A vanilla agent that has never touched docdog can read it and
learn the full collection layout for the project, with no indexer,
no database, and no skill mediation required.
