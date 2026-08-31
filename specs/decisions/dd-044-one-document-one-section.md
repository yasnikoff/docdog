---
id: DD-044
title: "One Arango document = one section, not one file"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-008 under DD-034's artifact-resilience lens. Documents are section-granularity — one ID-bearing section per vertex, enabling fine-grained graph edges and queries."
relationships:
  - supersedes: EJ-008
    context: "mirror under DD-034's artifact-resilience lens, with sharpening"
  - references: EJ-010
  - references: EJ-013
  - references: EJ-017
  - references: DD-034
    context: "section-granularity is what makes the relationships: frontmatter block load-bearing per artifact"
---

# DD-044: One Arango document = one section, not one file

Arango documents are section-granularity, not file-granularity.
Each document is a focused, concise chunk about one thing —
typically one ID-bearing section (DD-*, DP-*, FR-*, CG-*).

A 3000-line file like `design/decisions/architecture.md` becomes
~20 Arango documents, each independently addressable and linkable
via graph edges. Queries return just the relevant section + its
graph neighbors, not the entire file.

## Subsection rule

The ID (DD-ARCH-09, DP-11, etc.) is the natural granularity.
Subsections within one ID stay together — they describe aspects
of the same decision. If a subsection is independently referenced
by other documents and has its own heading, it may be split into
a separate document with a `parent` edge back to its ID.

## Rationale

The Orama spike proved that file-level granularity overfetches —
a query for "saga compensation" shouldn't return the entire
architecture decisions file. The graph model requires
fine-grained nodes to create meaningful edges. Section-level
documents are small enough to return directly to agents and
large enough to be self-contained.

## DD-034 check

Sharpened. DD-034 makes the `relationships:` frontmatter block
load-bearing per artifact. Section-level granularity is what
makes that workable: a 3000-line file cannot carry one
coherent `relationships:` block for 20 distinct decisions, but
20 section-level artifacts each can. The section-as-document
model and the per-artifact frontmatter contract are
complementary — one is the retrieval shape, the other is the
authoring contract.
