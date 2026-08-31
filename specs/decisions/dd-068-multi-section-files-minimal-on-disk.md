---
id: DD-068
title: "Multi-section files keep minimal per-section metadata on disk; rich metadata lives in Arango"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-032 under DD-034's artifact-resilience lens. Split-parsed files keep only `id`, `title`, `status`, `date` on disk. Rich fields (description, edges, enrichment) live in Arango only. Users pick explicitly: multi-section prose + minimal disk metadata, OR one-file-per-section + rich disk metadata."
relationships:
  - supersedes: EJ-032
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-053
  - references: DD-059
  - references: DD-065
  - references: DD-067
  - references: PROPOSAL-003
    context: split-parsed records sit outside P-003's frontmatter-first relate pipeline — write tools refuse them
  - references: DD-034
    context: the one place DD-034's test is explicitly partial — split-parsed sections trade per-section frontmatter for file integrity
---

# DD-068: Multi-section files stay minimal on disk

When a user keeps multi-section files indexed via the `split`
parser (DD-067), the per-section metadata that lands on disk is
limited to what the parser extracts: `id`, `title`, `status`,
and `date`.

## What stays in Arango only

- Agent-authored `description` fields (DD-059), added via
  `docdog_update`.
- Relationship edges (via `docdog_relate`, PROPOSAL-003's
  frontmatter-first pipeline doesn't apply to split-parsed
  sections).
- Any other enrichment that would otherwise need a YAML block
  wedged between prose sections.

The file on disk stays as the user wrote it. Re-indexing never
writes back. A human reading the file does not see agent
enrichment; a query via MCP or CLI does.

## The explicit tradeoff

| You want                                   | Do this                                                     |
|--------------------------------------------|-------------------------------------------------------------|
| Keep existing multi-section prose files    | Split parser, limited disk metadata, rich DB metadata       |
| Rich per-section metadata on disk          | Split the file on disk, use the default parser (DD-053)     |

Both options are first-class. Neither is forced.

## Why no per-section frontmatter convention

Considered and rejected:

- **Extending the split parser with more inline patterns** —
  heuristic, fragile, and every pattern is a format commitment
  docdog then owns forever.
- **HTML comments carrying structured metadata** — ugly,
  non-standard, and invisible to markdown tooling.
- **YAML frontmatter blocks between sections** — breaks every
  markdown parser except docdog's own.

The user's writing experience wins. Multi-section files are
authored as prose; inventing a metadata convention inside them
would degrade the authoring experience in exchange for a
capability (rich on-disk metadata) that the split-vs-single-
file choice already provides cleanly.

## Interaction with DD-034

This is the one place where DD-034's test is explicitly
*partial*. A vanilla agent reading a multi-section file sees
the prose and the minimal frontmatter — which is enough to
know the section exists and what it's about, but not enough to
recover description, edges, or enrichment. That information is
in Arango only.

The tradeoff is intentional. DD-065 covers the full shape:
published content in the "DD-034 applies" tier stays as
section-per-file markdown. The split-parser path is for the
working-context tier or for corpora that deliberately opt into
the tradeoff.

## DD-034 check

Partial by design, scoped by the tier. DD-068 is specifically
the carve-out where `.split` + in-disk multi-section files are
allowed to lean on Arango for the rich side of metadata. That
carve-out exists because the alternative (forcing every corpus
into section-per-file) would break an authoring model users
already depend on.
