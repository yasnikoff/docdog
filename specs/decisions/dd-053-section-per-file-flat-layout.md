---
id: DD-053
title: "Sections are individual files in a flat per-collection directory"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-017 under DD-034's artifact-resilience lens. Each section is its own markdown file with frontmatter; the collection directory is flat. Index files — EJ-017's second half — are not used in practice and are preserved as an optional future mechanism."
relationships:
  - supersedes: EJ-017
    context: "mirror under DD-034's artifact-resilience lens, sharpened against current reality"
  - references: DD-044
  - references: DD-049
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — flat layout keeps every artifact one filename away
  - references: DD-047
    context: delegates cross-cutting discovery to the graph per DD-047; the filesystem stays flat
---

# DD-053: Section-per-file, flat per-collection directory

Each section is its own markdown file with its own frontmatter.
Collection directories are flat — `specs/decisions/dd-053-*.md`,
`specs/decisions/dd-054-*.md`, and so on. One file = one
ID-bearing section = one Arango vertex (DD-044).

## What dropped out

EJ-017's original framing also prescribed nested `<collection>/`
subdirectories with a sibling `<collection>.index.md` for
group-level metadata. In practice nothing uses that. The codebase
never grew the index-file parser beyond a hint in `parsers`
(the `.index.md` preamble case is still referenced for the `split`
parser, but flat directories are the authored shape). The flat
layout wins because:

- Git merges stay trivial (two branches editing the same section
  are the only conflict case).
- The indexer's default parser is "one file, one vertex" and
  nothing else.
- Cross-cutting discovery is the graph's job (DD-047), not the
  filesystem's.

Index files remain a **reserved mechanism** for collections that
genuinely need group-level metadata, but no current collection
uses one, and shipping without them has been fine.

## DD-034 check

Direct fit. A flat directory of section files is the simplest
possible shape for a vanilla agent — `ls specs/decisions/` and
every artifact is one filename away. Index files, if they come
back, have to carry their own DD-034 story; for now the flat
layout is authoritative.
