---
id: PROPOSAL-010
title: "`docdog suggest-edges` — detect undeclared references in body text"
collection: proposals
status: superseded
date: 2026-04-12
related:
  - PROPOSAL-003
  - OBS-001
relationships:
  - sourced_from: OBS-001
    context: "#3 on the wish list — turn dogfooding into systematic edge discovery"
  - references: PROPOSAL-003
    context: the worked example — its §7 prose mentioned EJ-011 with no declared edge
  - references: EJ-011
  - references: DP-001
    context: the split the principle dictates — mechanical scan, suggest-only output, judgment stays with the agent
  - references: EJ-030
    context: second target in the worked-example suggestion output
  - references: DP-002
  - references: DP-003
description: "SUPERSEDED by PROPOSAL-024 — resurrected as the v3 docdog suggest-edges command (shipped 2026-07-11); detection logic and CLI shape carried over. Original v2 pitch: scan each vertex's body text for mentions of other known ids and suggest relationships entries for any mention not already declared as an edge, turning the dogfooding loop into systematic edge population."
---

# PROPOSAL-010: `docdog suggest-edges`

**Status note (2026-07-11, FEATURE-002):** superseded by
PROPOSAL-024, which re-implemented this spec over the v3 SQLite
cache after the v2 tool died in the kernel purge (DD-070 §3). The
idea was proven in production first — OBS-003 records the 131
accepted suggestions from the v2 run.

## Motivation

During the OBS-001 seeding pass, the assistant hand-converted
`related: [X, Y]` lists into typed `relationships:` blocks for ~80
specs. That covered the explicit links. But many specs also mention
other ids **in their prose** without declaring them as edges —
PROPOSAL-003 §7 mentions EJ-011 in body text, for example, but
EJ-011 isn't in its `relationships:` list.

A simple grep-and-diff surfaces these gaps mechanically. Turning
them into edges is a judgment call (what type? does the mention
warrant an edge at all?), so the command **suggests** rather than
auto-writes — DP-001 compliance.

## Specification

```
docdog suggest-edges [options]

Options:
  --path <glob>       Limit scan to matching source files
  --id <pattern>      Limit to ids matching pattern (e.g. "DP-*")
  --format <fmt>      text | yaml (default: text)
```

### Behavior

1. Load the global id map (same as indexer pass 1): `{ id → _id }`.
2. For each vertex with `content` populated:
   - Regex-scan body for `\b[A-Z]+-\d+\b` (catches EJ-NN, DP-NNN,
     PROPOSAL-NN, DISC-NNN, FRICTION-NNN, OQ-NN, FR-NNN, OBS-NNN).
   - Drop self-references.
   - Drop mentions that already have a `relationships:` edge to the
     same target.
3. Output the residuals as suggestions: "PROPOSAL-003 mentions
   EJ-011 in body text but has no edge. Add `- references: EJ-011`?"

### YAML format

```yaml
PROPOSAL-003:
  suggested:
    - references: EJ-011
    - references: EJ-030
```

The yaml format is paste-ready — the user can review and append into
the relevant file's frontmatter.

## DP-001 / DP-002 / DP-003 compliance

- **DP-001:** the **scan** is mechanical (regex on body text,
  set-diff against existing edges). The **type assignment**
  (`references` is the default) is a visible Tier 2 default, not
  inference. The command **suggests**, never auto-writes — final
  decision stays with the agent+user loop. ✅
- **DP-002:** N/A.
- **DP-003:** new first-class command that closes a friction visible
  after PROPOSAL-003 landed. ✅

## Estimated effort

Small–medium.

- ID regex + scanner (~30 LOC)
- Existing-edge lookup helper (~30 LOC, one AQL query per vertex or
  one batch)
- Output formatters (~40 LOC)
- Integration test (~60 LOC): vertex with declared + undeclared
  mentions, self-reference filtering, regex coverage

**Total:** ~100 LOC + ~60 LOC tests.

## Not in scope

- Auto-applying suggestions (DP-001 forbids)
- Confidence scoring / ranking suggestions by strength of mention
- Semantic type inference (e.g. "this mention is `constrains`, not
  `references`") — that's agent judgment

## Status

Proposed. #3 on the OBS-001 wish list. Highest potential **graph
density** improvement per LOC.
