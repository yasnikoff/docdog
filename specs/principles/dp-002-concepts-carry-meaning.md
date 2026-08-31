---
id: DP-002
title: Concepts carry their own meaning — in docdog's graph, not in agent heuristics
collection: principles
status: accepted
date: 2026-04-12
related:
  - DP-001
  - DP-003
  - DISC-010
  - PROPOSAL-006
  - PROPOSAL-003
relationships:
  - discussed_in: DISC-010
  - references: DP-001
    context: complementary split — DP-001 keeps judgment out of code, DP-002 keeps agents from guessing what concepts mean
  - references: DP-003
  - references: PROPOSAL-006
  - constrains: PROPOSAL-003
    context: DP-002 reshaped PROPOSAL-003's type registry into dd_relation_meta
  - references: DISC-008
  - references: PROPOSAL-005
description: Every extensible concept in docdog (user-facing vertex collections, relationship types) must carry a semantic description stored inside docdog's own graph. Agents read the description directly; they never infer meaning from a string token alone. Descriptions live in dedicated meta collections (dd_collection_meta, dd_relation_meta), not in YAML config.
---

# DP-002: Concepts carry their own meaning

## Statement

Every extensible concept in docdog — user-facing vertex collections and
relationship types — must carry a semantic description stored inside
docdog's own graph, accessible via docdog's normal query surface.

**Agents must not be asked to infer meaning from a string token.** A
collection named `user_stories` is opaque to an agent that encounters
it without context. The name alone doesn't tell the agent what goes in
it, when to add to it, or how to distinguish it from `requirements`
or `issues`. Same problem for relationship types. The concept itself
must describe itself.

## Where meaning lives

**Inside docdog's graph, in dedicated meta collections.** Not in YAML
config. Not hardcoded in source.

Two shipped collections carry the metadata:

- **`dd_collection_meta`** — one vertex per user-facing vertex
  collection. Holds `description`, `when_to_use`, `when_not_to_use`,
  `examples`, optional `guide_path`, `scope` (shipped/user), provenance
  fields.
- **`dd_relation_meta`** — one vertex per relationship type. Holds
  the same documentation fields plus the runtime routing info
  (`collection`, `inverse_label`, `symmetric`) that PROPOSAL-003
  originally placed in config. **This collection is the single source
  of truth for relationship types.**

## Why not YAML config?

Early framings of this principle stored descriptions in config
(`.docdog/config.yaml` under a `collection_meta:` map). That approach
was rejected during DISC-010 for several reasons:

1. **Two sources of truth.** Config declares which collections exist;
   a parallel metadata map describes them. Keeping both in sync is
   code's job but adds reconciliation overhead on every load.
2. **No composition with search.** Config descriptions aren't indexed
   into the graph, so `docdog search "what captures agent
   conversations"` can't match on a description. Moving descriptions
   into the graph gives the existing search tool immediate power over
   the taxonomy itself.
3. **Self-hosting is the honest move.** Docdog is a memory layer for
   documents. Its own taxonomy is documentation. Storing that
   documentation inside its own graph eats its own dogfood and proves
   the abstraction holds.

## Why not attach metadata to Arango collections directly?

ArangoDB does not support arbitrary user-defined metadata at the
collection level. Collection properties are limited to operational
config (keyOptions, sharding, waitForSync, computedValues, schema
validation). There is no native `description` or `tags` field on a
collection.

Workarounds considered and rejected:

- **Sentinel document inside the collection** (`_key: __meta__` in
  every collection). Every query for real documents has to filter the
  sentinel. Hacky and invasive.
- **Schema `message` field** (Arango 3.7+ JSON Schema). Intended for
  validation error messages, not descriptions. Semantic abuse.

The dedicated meta-collection approach (`dd_collection_meta`,
`dd_relation_meta`) is the clean idiom. Investigated during DISC-010
via Context7 ArangoDB docs.

## Applies to what

- **User-facing vertex collections.** Every collection a user interacts
  with — creates records in, queries, relates to other records —
  needs a meta entry. Shipped set: `decisions`, `notes`, `principles`,
  `requirements`, `questions`, `issues`, `proposals`, `discussions`.
  Plus any project-specific collection the user adds.
- **User-facing relationship types.** Every type an agent can author
  in a `relationships:` frontmatter block. Shipped set: the thirteen
  types from DISC-008's table.

## Does NOT apply to

- **Shipped `dd_*` infrastructure collections** (`dd_edges_structural`,
  `dd_edges_semantic`, `dd_edges_temporal`, `dd_edges_dependency`,
  `dd_edges_crosscutting`, `dd_edges_unspecified`, `dd_edges_orphan`,
  `dd_code_refs`, `dd_ids`, `dd_embedding_cache`, `dd_meta`,
  `dd_collection_meta`, `dd_relation_meta` itself, etc.).
- These are internal plumbing. Their meaning lives in docdog's design
  documents and in the shipped skills that operate on them. Agents
  working with docdog learn the infrastructure from the docs, not
  from discoverable meta entries. Cluttering `dd_collection_meta`
  with self-referential entries for all the `dd_*` collections would
  add noise without value.

## Shipped defaults and new concept creation

Docdog ships with `dd_collection_meta` and `dd_relation_meta`
pre-seeded at `docdog init` time with entries for every shipped
user-facing collection and relationship type. Seed content is defined
in docdog source (Tier 2 per DP-001 — visible in source, overridable
at runtime by editing the meta collections).

When a user creates a new collection or relationship type:

1. They add a meta vertex to `dd_collection_meta` (or
   `dd_relation_meta`) with at minimum a `description` field
2. Docdog's consistency check picks up the new entry and creates the
   underlying Arango collection (for collections) or registers the
   type (for relations) on the next `docdog index` or explicit sync
3. The new concept is immediately usable by agents — searching for
   its description, adding records, authoring relationships

Direct DB writes to the meta collections are explicitly allowed under
DP-003 as the development escape hatch. Docdog commits (also under
DP-003) to providing first-class CLI commands (`docdog collections
add`, `docdog relations add`, etc.) so direct DB writes are rare in
steady state.

## Required field: `description`

The **only required field** is `description` — a one-sentence
statement of what the concept captures. Optional fields enrich the
picture:

- `when_to_use` — one sentence on the trigger conditions
- `when_not_to_use` — one sentence on what this concept is NOT for
  (distinguishing from adjacent concepts)
- `examples` — array of record ids that illustrate the concept well
- `guide_path` — optional path to a longer markdown guide
  (indexed via the normal indexer; rich prose becomes searchable)
- `scope` — `shipped | user` provenance marker

A concept with only a `description` is valid but sparse. Concepts
with rich metadata are more findable and more useful to agents.

## Consistency enforcement

On every `docdog index` run, the indexer compares
`vertex_collections` (as present in ArangoDB) against entries in
`dd_collection_meta`. For each mismatch:

- **Collection exists, no meta entry:** warn the user, suggest
  `docdog collections describe <name>` or direct DB write. Don't
  block indexing.
- **Meta entry exists, no collection:** create the collection on the
  next sync. Useful for declaring "I want to add a `user_stories`
  collection" by writing the meta first.
- **Shipped concept with missing description:** error — this is a
  docdog bug. The shipped seed must have been incomplete.

Warning, not error, on user-facing mismatches is deliberate. Per
user's direction in DISC-010: *"if they want stupid dog, do not stop
them."*

## Relationship to other principles

- **Complements DP-001 (agent-first mechanics).** DP-001 says code
  never judges. DP-002 says agents don't have to guess from names —
  meaning is always available as data they can read. Together: code
  provides mechanical tools over a graph that describes itself.
- **Enables DP-003 (comprehensive toolbelt).** The meta collections
  are the interface the toolbelt manipulates. `docdog collections
  list/describe/add` and `docdog relations list/describe/add` are
  first-class CLI commands that operate over the meta collections.
- **Supersedes part of PROPOSAL-003 §2 / §8.** The runtime type
  registry originally placed in `relationships.types` config moves
  into `dd_relation_meta`. PROPOSAL-003's fourth amendment rewrites
  this section.
- **First application: PROPOSAL-006** — the meta-reshape
  implementation. Must land before PROPOSAL-005 step 1 so
  `dd_code_refs` can get a proper meta entry at creation time.

## Test for new features

Every new collection or relationship type added to docdog must:

1. Have a meta entry written as part of its creation path
2. Meta entry must include at minimum a `description`
3. If the concept is user-facing, its meta entry must be visible via
   `docdog collections describe` or `docdog relations describe`

If a feature proposal doesn't specify how its new concepts get their
meta entries, it's incomplete and needs to be amended before
implementation.
