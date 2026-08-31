---
id: CONCEPT-RELATION-REFERENCES
title: "Relation: references"
collection: concepts
status: current
concept_kind: relation
name: references
scope: shipped
description: A references B as conceptual cross-reference without causal weight.
when_to_use: When a record mentions another record as context — the default
  typed relationship.
when_not_to_use: When a more specific shipped type applies (supersedes,
  implements, depends_on, …) — references is the generic fallback.
inverse_label: referenced by
symmetric: false
---

# Relation: references

A references B as conceptual cross-reference without causal weight.

**When to use:** When a record mentions another record as context — the default typed relationship.

**When not to use:** When a more specific shipped type applies (supersedes, implements, depends_on, …) — references is the generic fallback.

**Inverse label:** referenced by

**Symmetric:** no
