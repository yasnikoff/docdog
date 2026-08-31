---
id: CONCEPT-RELATION-PART-OF
title: "Relation: part_of"
collection: concepts
status: current
concept_kind: relation
name: part_of
scope: shipped
description: A is a component of B's larger whole.
when_to_use: When A is one piece of a multi-part artifact described by B.
when_not_to_use: Not for provenance (sourced_from) or ordering (depends_on).
  A separate parent/child hierarchy type is deliberately not shipped —
  register one if composition and hierarchy must stay distinct.
inverse_label: contains
symmetric: false
---

# Relation: part_of

A is a component of B's larger whole.

**When to use:** When A is one piece of a multi-part artifact described by B.

**When not to use:** Not for provenance (sourced_from) or ordering (depends_on). A separate parent/child hierarchy type is deliberately not shipped — register one if composition and hierarchy must stay distinct.

**Inverse label:** contains

**Symmetric:** no
