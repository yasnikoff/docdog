---
id: OQ-42
title: User-extensible relationship types and edge storage collections
collection: questions
status: resolved
resolution: accepted-option-a
resolved_date: 2026-04-12
resolved_by: PROPOSAL-006
related:
  - OQ-14
  - EJ-011
  - EJ-030
  - DISC-004
  - PROPOSAL-003
  - PROPOSAL-006
  - DP-002
relationships:
  - discussed_in: DISC-004
  - references: OQ-14
  - references: EJ-011
  - references: EJ-030
    context: the layered shipped-vs-user model the extensibility commitment parallels
  - references: PROPOSAL-003
    context: the consumer — its vocabulary and routing design assumes this commitment resolves yes
  - references: PROPOSAL-006
    context: Resolved by PROPOSAL-006 shipping dd_relation_meta
  - references: DP-002
  - references: DP-003
description: Should docdog commit to user-extensibility for relationship vocabulary and edge storage, paralleling the vertex_collections model? Surfaced during DISC-004 as a new requirement not captured in OQ-14 or EJ-011.
---

# OQ-42: User-extensible relationship types and edge storage collections

## Context

During DISC-004 (designing the `relationships:` frontmatter block) a
new design commitment surfaced that wasn't in OQ-14 or EJ-011: docdog
should let users declare their own relationship types and their own
edge storage collections, paralleling how `vertex_collections:` is
already user-extensible.

The `vertex_collections` side already works this way — users add
`questions`, `issues`, `proposals`, `discussions` to their own config
and `docdog init` creates them. The edge side has a `edge_collections:`
config field too, currently empty by default, but there's no
user-facing workflow for extending the vocabulary *and* routing.

## The requirement, stated

Users must be able to:

1. **Declare project-specific relationship types** in frontmatter
   (e.g. `owns`, `reviewed-by`, `derived-from`) without docdog rejecting
   them.
2. **Declare project-specific edge storage collections** in
   `.docdog/config.yaml` (`edge_collections: [project_edges]`), created
   by `docdog init` alongside the shipped `dd_edges_*`.
3. **Route user types to user collections** via a config-declared map.
   Types not in the map fall back to `dd_edges_unspecified` with a
   warning.

## Proposed config shape

```yaml
edge_collections:
  - project_edges      # user-declared, created by init

relationships:
  type_map:
    # User-declared types → user collections
    owns:        project_edges
    reviewed-by: project_edges
    # Overrides to shipped routing (if ever needed)
    constrains:  dd_edges_structural  # example override
```

Docdog core ships a hardcoded default map for the known vocabulary
(`references → dd_edges_semantic`, etc.). The `type_map` in config is
**additive + overriding** — user entries extend or override the
defaults.

## Why this matters

Without this commitment, users are stuck with exactly the shipped
vocabulary. They can't capture project-specific semantics in the graph;
they'd have to fall back to generic `references` edges and lose the
ability to query by meaningful relationship kind.

With this commitment, docdog becomes a memory *layer* (per EJ-030) that
carries domain-specific graph schemas on top of a uniform extraction
and storage model.

## Options

- **(a) Accept as a commitment.** Ships with the `relationships.type_map`
  config field. PROPOSAL-003 depends on this being accepted.
- **(b) Reject — closed vocabulary only.** Users who need custom types
  must fork docdog or build external tooling. PROPOSAL-003 narrows to
  shipped-only vocabulary.
- **(c) Accept types but not storage.** User types are allowed but
  always route to `dd_edges_unspecified` with a warning. Simpler but
  dumps domain semantics into a single bucket.

## Lean

**(a)** — full acceptance. Parallels the `vertex_collections` model
that's already proven in this dogfooding session. Option (c) is a
stepping stone if (a) turns out to be too much surface area.

## Status

**Resolved 2026-04-12 — accepted option (a)** by PROPOSAL-006 shipping.

PROPOSAL-006 (steps 1–3, commits `81d9c0f` / `f9adb0b` / `bc51478`)
implements option (a) directly:

- `dd_relation_meta` is the user-extensible relationship type registry.
  Users add project-specific types via `docdog relations add <type>
  --collection ... --inverse-label ...` or direct DB write per DP-003.
- `edge_collections: [project_edges]` in `.docdog/config.yaml` remains
  the declaration point for user edge storage collections, created by
  `docdog init` alongside the shipped `dd_edges_*` set. See PROPOSAL-006
  §4 for why this stays in config rather than moving to a meta
  collection.
- Routing is stored per-type on `dd_relation_meta.collection`,
  replacing the previously-proposed `relationships.type_map` config
  field. Unknown or unrouted types fall back to `dd_edges_unspecified`
  per PROPOSAL-003 §4 (to be implemented as part of PROPOSAL-003).

The config shape proposed in this OQ is superseded by the
`dd_relation_meta` schema in PROPOSAL-006 §2. Option (a) is ratified
and in production use; PROPOSAL-003 is free to proceed.

Surfaced: 2026-04-12 during DISC-004.
Resolved: 2026-04-12 via PROPOSAL-006 implementation.
