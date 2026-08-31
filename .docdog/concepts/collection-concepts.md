---
id: CONCEPT-COLLECTION-CONCEPTS
title: "Collection: concepts"
collection: concepts
status: current
concept_kind: collection
name: concepts
scope: shipped
description: Registry records for docdog's own taxonomy — one record per vertex
  collection and per relationship type, carrying DP-002's
  description/when_to_use/vocabulary metadata as disk-canonical indexed
  markdown.
when_to_use: "When adding a new collection or relationship type: write its
  concept record here so its meaning is searchable in the graph (DP-002)."
when_not_to_use: For project content records — concepts describe the taxonomy,
  they are not part of it.
relationships:
  - references: DP-002
    context: the principle whose description/when_to_use/vocabulary model these records carry to disk
---

# Collection: concepts

Registry records for docdog's own taxonomy — one record per vertex collection and per relationship type, carrying DP-002's description/when_to_use/vocabulary metadata as disk-canonical indexed markdown.

Relation records (`concept_kind: relation`) feed the relations registry: their `inverse_label` and `symmetric` fields drive how edges are displayed from the target side. The registry is advisory — unknown relationship types are recorded with a warning, never rejected. Editing or deleting a concept file is the supported way to change the vocabulary; re-run `docdog index` afterwards.

**When to use:** When adding a new collection or relationship type: write its concept record here so its meaning is searchable in the graph (DP-002).

**When not to use:** For project content records — concepts describe the taxonomy, they are not part of it.
