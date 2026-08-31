---
id: PROPOSAL-009
title: "`docdog recent` — session retrospective helper"
collection: proposals
status: superseded
date: 2026-04-12
related:
  - PROPOSAL-008
  - OBS-001
relationships:
  - sourced_from: OBS-001
    context: "#2 on the wish list"
  - references: PROPOSAL-008
  - references: PROPOSAL-006
  - references: PROPOSAL-007
  - references: FRICTION-009
  - references: DP-001
    context: pure timestamp query, no inference
  - references: DP-002
  - references: DP-003
  - references: PROPOSAL-003
    context: named in the 2026-04-12 session roster this proposal's motivation reconstructs by hand (PROPOSAL-006/003/007, 9 commits, 230 edges) — the reconstruction cost is the argument for the command
description: "SUPERSEDED at the v3 pivot: the recent command died at step 6 (DD-070 §3) and was not resurrected; with disk canonical, git log over the corpus serves the session-retrospective need. A revival would be a new proposal. Original v2 pitch: surface vertices created or updated within a time range or commit window."
---

# PROPOSAL-009: `docdog recent`

**Status note (2026-07-11, FEATURE-002):** superseded — died at v3
step 6 with the rest of the non-kernel CLI (DD-070 §3). The
motivating gap is smaller in v3: records are disk-canonical files,
so `git log --oneline -- specs/` answers "what did this session
produce?" directly. If a first-class command is wanted again, it is
a new proposal amending DD-070 §4.

## Motivation

At the end of a long session (2026-04-12 shipped 9 commits,
PROPOSAL-006/003/007, 230 edges, 144 tests) the assistant wanted to
update its memory with "what did this session produce?". The
reconstruction was manual: `git log --oneline`, read commit messages,
infer which specs changed, look each one up, paste titles. ~15
minutes of agent work that docdog already has the data for.

Every indexed vertex carries `indexed_at` and `source_file`. A
command that surfaces them in a human-readable list makes this a
one-liner.

## Specification

```
docdog recent [options]

Options:
  --days <n>            Vertices indexed within the last N days
  --since <ref>         Git ref or ISO timestamp (default: HEAD~1)
  --collection <name>   Filter to one collection
  --limit <n>           Cap results (default: 50)
  --json                Raw JSON output
```

### Behavior

1. Compute the time threshold: if `--since` is a git ref, use the
   commit's author timestamp; if ISO, parse directly. Default: HEAD~1.
2. Query every vertex collection for `indexed_at >= threshold AND
   deleted_at == null`.
3. Sort by `indexed_at DESC`, cap at `--limit`.
4. Render as `[id] title — collection (indexed HH:MM)`.

### Text output

```
PROPOSAL-007  Arango named graph...        — proposals    (22:06)
OBS-001       Initial self-assessment...   — observations (22:30)
FRICTION-009  Indexer whole-file deletion  — issues       (21:34)
...
```

## DP-001 / DP-002 / DP-003 compliance

- **DP-001:** pure timestamp query. No inference.
- **DP-002:** N/A.
- **DP-003:** first-class command for a common query that currently
  requires ad-hoc AQL. ✅

## Estimated effort

Small.

- CLI command (~40 LOC)
- Git ref → timestamp resolver (~15 LOC, reuse existing git helper)
- AQL union across vertex collections (~20 LOC)
- Integration test (~40 LOC)

**Total:** ~75 LOC + ~40 LOC tests.

## Not in scope

- Diff-style output showing what changed inside each vertex
- Interactive paging
- Activity heatmap / stats

## Status

Proposed. #2 on the OBS-001 wish list.
