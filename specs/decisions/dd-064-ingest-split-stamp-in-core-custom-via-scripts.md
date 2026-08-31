---
id: DD-064
title: "Ingest split/stamp live in core; custom ingest formats live in project scripts"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-028 under DD-034's artifact-resilience lens. Docdog core ships two generic ingest operations — heading-based split and frontmatter stamp. Anything project-specific (table ingests, CSV, Confluence exports) belongs in `.docdog/scripts/`."
relationships:
  - supersedes: EJ-028
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-053
  - references: DD-063
  - references: DD-067
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — ingest output is section-per-file markdown DD-034 already governs
---

# DD-064: Split/stamp in core, custom formats in scripts

Docdog core ships exactly two generic ingest operations:

## `docdog split`

```
docdog split <file> --on <pattern> --collection <name> --output <dir>
```

Splits a multi-section file on a heading pattern, one section
per output file. Extracts `id`, `title`, `status`, and `date`
into each output's YAML frontmatter. Recognizes the usual ID
shapes (`DD-*`, `DP-*`, `FR-*`, `EJ-*`, `CG-*`).

Useful for migrating a corpus that started as one-file-per-
collection into the section-per-file layout (DD-053). One-shot,
not part of steady-state indexing.

## `docdog add` (frontmatter stamp)

```
docdog add <source> --collection <name> [--output <dir>]
```

Adds or merges YAML frontmatter onto files that already exist
as one-file-per-section. Extracts the title from the first
heading and the ID from the filename pattern. Preserves any
frontmatter that's already present.

## Custom formats go in scripts

Anything else — table-based glossaries, CSV exports, Confluence
dumps, Jira tickets — lives in `.docdog/scripts/` as a project-
specific ingest script (DD-063). The runtime parser for
table-shaped files is a different concern: it's about indexing
a file that stays on disk, not about importing content from a
foreign format. See DD-067 for the pluggable-parser story.

## Why not make it configurable

A general-purpose, configurable parser for arbitrary formats
is hard to get right and probably impossible at the level of
fidelity an agent would need to trust it. Scripts are strictly
more powerful, require no upstream changes, and keep the
project-specific logic in the project where it belongs.

## DD-034 check

Orthogonal. Ingest is a one-shot transform at the boundary;
the artifacts it produces are section-per-file markdown, which
is the shape DD-034 already governs. The ingest commands
themselves aren't artifact-resilience-critical — they're a
migration tool whose output is.
