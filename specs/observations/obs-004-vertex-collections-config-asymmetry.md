---
id: OBS-004
title: "Shipped vertex collections live in config while shipped edge collections are hardcoded"
collection: observations
status: current
date: 2026-04-12
commit_hash: a924f87585362b5fff33787602db1254c7deca29
description: "The 14 shipped user-facing vertex collections sit in `.docdog/config.yaml` alongside any user extensions, while shipped dd_edges_* are hardcoded in source — an asymmetry EJ-021 and PROPOSAL-006 §4 both implicitly argue against."
relationships:
  - references: EJ-021
  - references: EJ-010
  - references: PROPOSAL-006
  - references: DP-002
  - references: PROPOSAL-014
    context: the feature shipped in the very session whose retrieval-not-used gap this records
---

# OBS-004: Vertex-collection lifecycle asymmetry vs edges

## Trigger

User asked: *"I've noticed that collections are still in the config.
Is this aligned with current specs/decisions or a consequence of you
missing context?"* — during a session that had just shipped
PROPOSAL-014 without once touching `docdog search` until this
question was raised.

## What I found (via docdog, not grep)

`docdog search "vertex_collections config meta registry"` surfaced
four specs the question actually hinges on:

1. **EJ-021 — Custom vertex and edge collections via config.** Words
   it as *"projects **extend** the built-in collection set by
   declaring custom collections"*. The verb "extend" implies built-ins
   exist separately from user declarations.
2. **EJ-010 — Collection-per-type + .docdog config.** Original MVP
   list. Predates the `dd_` prefix discipline and DP-002.
3. **PROPOSAL-006 §4 — `edge_collections` stays in config.** Draws
   the explicit line: *"`edge_collections` is a collection lifecycle
   concern, not a taxonomy concern. PROPOSAL-006 moves taxonomy
   metadata to DB; it does not move collection lifecycle
   declarations."* And: *"Shipped `dd_edges_*` collections are
   hardcoded in source as always-create; user-declared edge
   collections come from the config list."*
4. **DP-002 — Concepts carry their own meaning.** Orthogonal —
   concerns `dd_collection_meta`, not the lifecycle list.

`docdog_traverse` from EJ-021 and EJ-010 confirmed no newer decision
supersedes either.

## The actual asymmetry

Source code, `src/arango/collections.ts:11`:

```ts
export const SYSTEM_VERTEX_COLLECTIONS = [
  "dd_patches",
] as const;
```

Only `dd_patches`. Every user-facing shipped vertex collection —
`decisions`, `requirements`, `principles`, `guidelines`, `terms`,
`domain`, `constraints`, `integrations`, `notes`, `questions`,
`issues`, `proposals`, `discussions`, `observations` — is listed in
the project's own `.docdog/config.yaml` instead.

Edges, same file line 28, go the other way:

```ts
export const SYSTEM_EDGE_COLLECTIONS = [
  "dd_edges_structural", "dd_edges_semantic", "dd_edges_temporal",
  "dd_edges_dependency", "dd_edges_crosscutting", "dd_edges_unspecified",
] as const;
```

All six shipped edges are source constants; config `edge_collections:
[]` is empty on purpose.

So two shipped concepts get opposite treatment:

| aspect | vertices | edges |
|---|---|---|
| shipped lifecycle declaration | config yaml | source constant |
| user extensions | config yaml | config yaml |
| distinguishable? | no — intermixed | yes — separated |

## Why this matters (not just aesthetics)

1. **Breaks EJ-021's "extend the built-in set" model.** If a user
   removes `decisions` from `vertex_collections` in their config,
   nothing stops them — and the shipped seed from PROPOSAL-006
   would then reference a collection nobody is creating. The
   built-in/extension boundary only exists in documentation, not in
   code.
2. **Inconsistent with PROPOSAL-006 §4's own rationale.** That
   section's argument — "lifecycle is a code concern, taxonomy is a
   DB concern" — applies equally to shipped vertices and edges. It
   was only spelled out for edges because PROPOSAL-006's explicit
   scope was the taxonomy reshape, not lifecycle cleanup.
3. **PROPOSAL-006's `docdog collections add` auto-creates the
   underlying Arango collection without editing config.** After
   that command, a new user collection exists in Arango + has a
   meta entry — but is absent from `config.yaml`. On the next
   `docdog index`, `getVertexCollections(config)` won't return it.
   Third drift vector.
4. **New onboarding confusion.** A reader of the config file can't
   tell which entries are "remove at your own peril" shipped
   defaults and which are this project's own additions. The edge
   list has no such ambiguity because shipped-vs-user is visually
   obvious.

## Was this a context-miss on my part?

Partly yes. Without docdog, I would have read the config file,
noticed the list looks weird, and either shrugged or started
editing. With docdog I found three specs in one query that frame
the question correctly: EJ-021 sets the "extend built-ins" model,
PROPOSAL-006 §4 articulates the lifecycle/taxonomy split, and
DP-002 is the principle neither config side touches. That's the
exact scaffolding needed to say *"the current state is a
consequence of PROPOSAL-006's scope excluding lifecycle cleanup,
not a deliberate choice."*

Raw grep would have found the EJ-021/EJ-010 text eventually, but
would not have surfaced PROPOSAL-006 §4 as the clearest precedent
— the §4 title is about edges, not vertices, and the relevant
rationale is buried mid-section.

## Suggested next step (not done here)

A follow-up proposal to symmetrize: move shipped user-facing
vertex collections into a `SHIPPED_VERTEX_COLLECTIONS` constant
analogous to edges, have `getVertexCollections` union
`SHIPPED_VERTEX_COLLECTIONS + SYSTEM_VERTEX_COLLECTIONS +
config.vertex_collections`, and make `docdog init` stop writing
the shipped list into new config files. The config would contain
only genuine user additions, matching the edge model. EJ-021's
wording would finally match the code.

Cost: small. Risk: have to handle existing projects whose config
lists shipped collections — treat duplicates as a no-op and nudge
users to remove the redundant entries on next index (or leave
them, since the set-union in `getVertexCollections` is already
duplicate-safe).
