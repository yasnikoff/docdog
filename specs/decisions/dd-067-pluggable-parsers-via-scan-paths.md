---
id: DD-067
title: "Pluggable indexer parsers declared per scan-path"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-031 under DD-034's artifact-resilience lens. `scan_paths` entries can declare a parser (`default`, `split`, `table`, `script`) and parser-specific options. Backward-compatible with string entries (treated as `default`). Users keep their existing doc structure; the indexer adapts."
relationships:
  - supersedes: EJ-031
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-053
  - references: DD-063
  - references: DD-066
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check
  - references: DD-051
    context: per-section content hashes key the embedding cache per DD-051
  - references: DD-064
    context: split/add (DD-064) remain one-shot restructuring tools alongside the non-destructive parser path
---

# DD-067: Pluggable parsers via scan_paths

The indexer supports multiple parsing strategies per path,
declared in `scan_paths`. Replaces the implicit "one file =
one vertex" assumption with explicit parser selection.

## Parser types

- **`default`** — one file = one vertex (DD-053). The simplest
  case; covers section-per-file corpora.
- **`split`** — multi-section files split on a heading pattern.
  Reuses the `docdog split` logic at runtime; nothing is
  written back to disk.
- **`table`** — each row of a markdown table becomes a vertex.
  The idiomatic shape for glossaries and term lists.
- **`script`** — user-provided parser in `.docdog/scripts/`.
  The escape hatch for anything the built-in parsers can't
  express (DD-063).

## Config shape

Backward-compatible: strings still work and are treated as
`default`.

```yaml
scan_paths:
  - specs/decisions/                         # default parser
  - path: specs/decisions/architecture.md
    parser: split
    split_on: "## DD-"
    collection: decisions
  - path: specs/glossary.md
    parser: table
    collection: terms
    group_by_heading: true
  - path: specs/custom.md
    parser: script
    script: parse-custom
    collection: notes
```

## Multi-section change detection

Vertices are matched to file sections by frontmatter `id`
(content hash is the fallback when `id` is missing). Removed
sections are soft-deleted on re-index. File hash is the
fast-path skip; per-section content hash keys the embedding
cache (DD-051).

## Why this matters for DD-066

DD-066 says users keep their existing doc structure. The
original indexer dictated format (one file, one vertex, or
nothing). Pluggable parsers let users declare their structure
without rewriting — which is exactly what "memory layer, not
workflow engine" requires at the storage boundary. The
`split` and `add` commands (DD-064) remain as one-shot
migration tools for users who *want* to restructure, but are
no longer required.

## DD-034 check

Shape-preserving. The parser choice is declared in
`config.yaml` where a vanilla agent can read it. Whatever the
parser does at runtime, the artifact on disk is still the
truth; the parser just decides how many vertices each file
produces.
