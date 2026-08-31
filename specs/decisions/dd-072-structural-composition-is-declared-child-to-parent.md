---
id: DD-072
title: "Structural composition is declared once, by the child, as `part_of` — and `parent` is retired from the shipped vocabulary"
collection: decisions
status: accepted
date: 2026-07-28
relationships:
  - discussed_in: DISC-034
    context: "the thread that surfaced the collision while checking whether a new parent_doc relation type was needed; it was not — two types already covered the case, in opposite directions"
  - references: DP-002
    context: "the principle that puts vocabulary meaning in concept records; this is that vocabulary being pruned rather than extended, and the seed is where the change lands"
  - references: FRICTION-012
    context: "the rule this enforces — write the forward type, never store the inverse; two registered types for one structural edge is that rule's failure mode built into the seed itself"
  - references: PROPOSAL-026
    context: "the seeding design being amended: templates/concepts/ is the source of truth for what ships, pinned by a unit test, so retiring a type is a template edit plus a test update"
  - references: PROPOSAL-038
    context: "the splitter that will eventually mint these edges when it grows the record-splitting mode; deciding the direction now keeps that proposal from having to choose under time pressure"
  - discussed_in: DISC-035
    context: "the follow-on thread that added clause 4 — the edge is a traversal contract and never a ranking input — and recorded the TOC-parent distractor hazard that constrains any splitting design"
  - references: OBS-018
    context: "the sweep clause 4 defers to: the shipped ranker is the argmax, so a graph term is a new ranker owing a new sweep"
  - references: OBS-016
    context: "the max-cosine lottery clause 4 exists to prevent rebuilding on the graph — a parent with six children plus a sibling boost is that mechanism restated"
---

# DD-072: one structural edge, declared by the child

## Context

DISC-034 proposed a new relation type — `parent_doc` — to join a split
subdocument to the document it came from. The vocabulary check found the type
already exists. Twice.

`.docdog/concepts/` ships both:

| type | statement | inverse label |
|---|---|---|
| `part_of` | A is a component of B's larger whole | contains |
| `parent`  | A is the structural parent of B (composition or hierarchical grouping) | child of |

`parent`'s `when_to_use` reads *"When B belongs inside A's structure (section
within a document, etc.)"* — naming this exact case. So the two describe one
relationship in opposite directions, and both ship in every fresh `docdog init`.

That is FRICTION-012's failure mode installed at the seed. The rule there is
that a relationship is written once, in the direction the source asserts it,
and inverses are never stored — `inverse_label` is display-only. A vocabulary
offering both directions as first-class types invites exactly the reciprocal
edge that rule forbids, and worse, invites it *inconsistently*: two authors in
one corpus will pick different ones and traverse will show a graph that is
half-connected in each direction.

## Decision

**`part_of` is the structural composition type. The child declares it. The
parent declares nothing.**

```yaml
# in the child record
relationships:
  - part_of: DD-070
    context: "§4, the kernel surface"
```

**`parent` is retired from the shipped seed** (`templates/concepts/`), and its
concept record is removed from what `docdog init` installs.

## Why this direction

Four reasons, in decreasing weight:

1. **Traverse reads inbound for free.** The parent enumerates its children
   without declaring anything, so the child-declares form is strictly cheaper
   in edges for identical query power. The parent-declares form would need one
   edge per child written into the parent.
2. **Adding a section touches one new file, never the hub.** Under
   parent-declares, every new subdocument edits the parent — the record every
   branch touches. PROPOSAL-030's union merge driver exists precisely because
   hub records are conflict magnets; this avoids manufacturing a new one.
3. **The child's claim is the durable one.** A section knows what it is part
   of from the moment it exists. A parent's roster is a fact about a set that
   changes whenever the set changes.
4. **`part_of` is a forward verb from its source; `parent` reads as an
   attribute.** The registry's shape is *A —[verb]→ B*, and "DD-070 parent
   DD-070-03" only parses as a verb by charity.

The FEATURE-002 roster lesson from OBS-014's drain applies directly: a
same-typed reciprocal is not a second relationship. A parent's table of
contents stays **prose** and is not re-declared as edges.

## Clause 4 — `part_of` is a traversal contract, never a ranking input

The edge exists to give a **reassembly guarantee**: if search returns a
fragment, one hop reaches the whole, and a second reaches its siblings. That is
what it buys and it is the whole of what it buys.

**It must not be used to change rank** — no sibling boosting, no rolling a
parent's score up from its children, no graph term in the fusion. Two reasons,
and this clause exists so a later proposal cannot assume otherwise:

1. **It would be a new ranker.** OBS-018 swept 1,470 configurations of leg
   weight × RRF-K × length normalization × chunk layout and found the argmax is
   the shipped ranker — a null that cannot be overfit around. A graph term
   reopens that question and owes its own sweep before anyone believes it.
2. **It is where the max-cosine lottery gets rebuilt.** OBS-016's mechanism was
   that more vectors per document is more tickets in a relative ranking. A
   parent with six children already gets six chances at the top-K; a sibling
   boost on top is that failure mode reconstructed on the graph instead of on
   spans.

The related hazard, recorded here because it constrains any splitting design:
a TOC parent is **about everything its children are about and contains none of
it**, which makes it a natural distractor. It cannot be excluded from the index
to avoid this — an unindexed parent has no cache row, so every inbound
`part_of` edge would dangle. The parent is a real record and the risk is
measured, not designed around. See DISC-035.

## Migration

- **Existing `parent` edges keep working.** The relations registry is advisory
  (DISC-023) — an unregistered type warns at index time and the edge resolves
  normally. Nothing breaks in a corpus that already used it.
- **This repo declares no `parent` edges**, so there is nothing to rewrite
  here.
- **The seed change is a template edit plus a test update.** PROPOSAL-026 made
  `templates/concepts/` the source of truth for what ships, pinned by a unit
  test asserting seed and template agree; removing `relation-parent.md` from
  the template requires updating that test in the same commit or the packaging
  check fails — which is the mechanism working as designed.
- **Repair semantics still apply**: a corpus that re-inits will not get
  `parent` back, and one that wants it can add the concept record locally. The
  registry is per-project.

## Consequences

- One structural type, one direction, no ambiguity for an author or an agent.
- Any future record-splitting mode (DISC-034's open half) has its edge shape
  decided before it needs one.
- The shipped vocabulary shrinks by one, which is the rarer and healthier
  direction for a seed to move.
