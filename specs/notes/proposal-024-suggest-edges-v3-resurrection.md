---
id: PROPOSAL-024
title: "Resurrect suggest-edges as a v3 CLI command over the SQLite cache"
collection: proposals
status: shipped
date: 2026-07-11
description: "Bring back v2's undeclared-mention scanner (PROPOSAL-010, proven in OBS-003) as `docdog suggest-edges`: a read-only cache scan that reports known-id mentions lacking a declared edge, with a fixed multi-segment id grammar, fallback-key sources included, and a recordable flag for split-parsed files. Amends DD-070 §4's CLI list; the MCP kernel 8 is untouched."
relationships:
  - references: DISC-022
    context: "the ratifying discussion — need was already committed (the orchestrator adoption's edge-seeding phase), so the wait-for-evidence gate did not apply"
  - supersedes: PROPOSAL-010
    context: "the v2 spec this re-implements and replaces as the active commitment; detection logic and CLI shape carry over, the Arango data access becomes three SQL statements"
  - references: OBS-003
    context: "the usage evidence: the v2 scanner surfaced 131 undeclared references accepted in one fast idempotent pass — the tool died in the v3 kernel purge, not on merit"
  - references: DD-070
    context: "amends §4: the CLI list grows by suggest-edges; recorded there inline so the kernel-surface record stays truthful"
  - references: DP-001
    context: "tier walk: mention detection is Tier-1 mechanics, the `references` suggestion type is a visible Tier-2 default, acceptance and typing stay with the agent — nothing is ever written"
  - references: FRICTION-016
    context: distribution-shape evidence — copied template artifacts rot in place
  - references: OBS-011
    context: the first full triage of this command's output — 271 edges accepted, 86 reasoned skips, and the taxonomy of mention shapes that must never become edges
---

# PROPOSAL-024: Resurrect suggest-edges over the v3 cache

## Motivation

DISC-022 carries the full argument; the short form: the mechanical
half of edge derivation was already built, proven (OBS-003), and
deleted for kernel minimalism rather than failure — and corpus
adoption (the orchestrator plan's edge-seeding phase) is a committed
consumer. Without the tool, every adopting repo's agents hand-roll
the same sweep with ad-hoc regexes and sampled coverage; DP-001 says
that mechanical work belongs in tested code, with agents keeping the
judgment (accept, type, contextualize).

## Design

`src/storage/suggest.ts` + `src/cli/commands/suggest-edges.ts`.

- **Pure cache read.** Requires an indexed cache (`openCacheRead` —
  same contract as search); loads all vertex ids, all outbound
  edges, and each body; reports `known-id mentions − self −
  already-declared`, deduped, per source. Never writes; the loop is
  report → agent reviews → `docdog_relate` / frontmatter edit →
  reindex.
- **Mention grammar fixes the v2 bug.** v2's `[A-Z][A-Z0-9]*-\d+`
  could read `ARCH-01` out of `DD-ARCH-01`. The v3 regex matches
  dash-joined uppercase segments ending in digits, whole
  (`DD-ARCH-01`, `FR-ADMIN-01`, `T123-01`). Lookalikes (UTF-8,
  SHA-256) are filtered by the known-id intersection.
  **Amended 2026-07-14 (FRICTION-026):** the grammar also swallows a
  trailing `/<digits>` run, whose bare numbers repeat the head's stem —
  `OQ-18/19/21` is three mentions, `DD-ARCH-01/02` is two. Matching the
  head alone hid the siblings *and* made the report offer an edge to one
  member of a set and not the others, which is the arbitrary subset
  OBS-011's own skip taxonomy tells reviewers to reject. Same bug class
  as the v2 tail read, at the other end of the id; the known-id
  intersection remains the only arbiter of what is real.
- **`references` is the suggested type** — a visible Tier-2 default
  (DP-001), overridden per edge at acceptance.
- **Fallback-key sources participate.** v2 skipped records without
  frontmatter ids; v3 includes them (their vertex id is the
  path-derived key) — an id-less investigation note citing DD-070
  is exactly the edge worth recording.
- **`recordable` flag per source.** Split/table/script-parsed
  records refuse relate/update (no per-section frontmatter home —
  see storage/writes.ts); suggestions from them are flagged so the
  agent records the edge on the citing local record or edits the
  file. Resolution reuses the writes path's own predicate
  (`matchScanEntry` → parser), so the flag can't drift from the
  refusal behavior.
- **Dangling declared edges still suppress.** An edge to a target
  with no vertex is a recorded intent; re-suggesting it would nag.
- **CLI:** `docdog suggest-edges [--collection a,b] [--id 'DD-*']
  [--path substr] [--format text|yaml] [--json]`. `yaml` emits
  paste-ready `relationships:` blocks; empty result prints the
  OBS-003-era sentence ("No undeclared edge suggestions found.").

## Deliberately not in scope

- **No MCP tool** — the kernel 8 stands. This is a batch operation
  (post-ingest, periodic hygiene), not a mid-conversation
  primitive; agents shell out. Promote to MCP only if mid-loop
  usage demonstrably appears.
- **No template script distribution** — FRICTION-016 is the
  evidence that copied artifacts rot; a subcommand ships versioned
  and tested.
- **No acceptance automation, no type inference, no semantic
  matching** ("per the abstraction principle" stays agent work —
  the populate skill's second pass).

## Implemented

2026-07-11, same session as ratification. 8 unit tests
(`tests/unit/storage-suggest.test.ts`) cover dedupe, self/declared/
unknown/lookalike drops, fallback-key sources, the multi-segment
regression, the recordable flag, and all three filters. First run
on this corpus: 440 undeclared mentions across 146 records —
triaging them is a separate task (the tool reports; nobody said
accept-all). DD-070 §4, .claude/CLAUDE.md, and the populate skill
updated in the same change. *The triage ran later the same day:
271 edges accepted, 86 reasoned skips, 91 superseded-source prunes
— OBS-011 records the numbers and the skip taxonomy.*
