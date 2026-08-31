---
id: OBS-011
title: "First full suggest-edges triage: 271 edges accepted, 86 skipped with reasons, and a taxonomy of mention shapes that should never become edges"
collection: observations
status: current
date: 2026-07-11
description: "PROPOSAL-024's first corpus-wide harvest, run the day the tool shipped: 445 candidates across 12 collections triaged in 8 per-collection batches — 271 edges accepted through the relate write path (with per-edge context), 91 pruned wholesale (superseded sources), 86 skipped individually. The skips teach the most: anticipated-next-free-number mentions, example/mock ids, range endpoints, and explicit N/A lines are mention shapes that look like references and aren't. Every batch's resweep residue matched its skip list exactly; accept→reindex→resweep is idempotent at scale. Includes the post-triage fan-out baseline: edges never enter search/get/embeddings by construction; context overfetch is confined to traverse depth ≥ 2 from hubs (~60% of the edge set — small-world topology, not edge count), with authored edge contexts as the damper."
relationships:
  - references: PROPOSAL-024
    context: "the tool's first full harvest — same-day validation at 445-candidate scale"
  - references: OBS-003
    context: "the v2 precedent (131 edges, one pass); v3 adds per-edge context authoring and a skip discipline OBS-003's bulk-accept didn't need"
  - references: DISC-022
    context: "closes the open triage work item recorded there"
  - references: DD-070
    context: "biggest single beneficiary — its supersession/resolution batch pass (proposals and OQs) existed only as prose; it now has the declared supersedes/references trace OBS-010's q15 miss asked for"
  - references: OBS-010
    context: "the q15 lesson applied: lineage questions are graph questions, so the missing edges were the fix — not search tuning"
  - references: DP-001
    context: "the division held in practice: the tool swept mechanically, every accept/skip was an agent judgment with a written context"
  - references: WF-003
    context: "executed as 8 reviewable per-collection batches, one commit each — the batch-rewrite discipline applied to edge enrichment"
  - references: DD-034
    context: one of the four hubs cited by everything (small-world topology, not edge count); its 64 bare edges reached 64/64 context coverage in the post-triage backfill
  - references: PROPOSAL-003
    context: one of the four hubs cited by everything; 52/52 context coverage after the hub backfill this record documents
  - references: PROPOSAL-017
    context: surfaced as a hygiene candidate out of scope for the triage — status `planned` though executed to completion (TASK-001..004 all done)
  - references: STATUS-ORCH-MIGRATION-2026-04-13
    context: surfaced as a hygiene candidate out of scope for the triage — `parked` with dead v2 content, obsolete-worthy
---

# OBS-011: First full suggest-edges triage

## What ran

The day PROPOSAL-024 shipped, its first corpus-wide report was
triaged to zero: `docdog suggest-edges --json` (445 candidates,
146→104 live sources, 12 collections), judged batch-by-collection
in 8 batches, each committed separately. Accepted edges went
through the real relate path (`relateFileFirst` via a tsx driver —
frontmatter patch + single-file reindex, never hand-edited YAML),
each with an authored `context:`. After each batch: resweep the
collection, verify the residue equals the deliberate-skip list.
It did, all 8 times.

## Numbers

- **445 candidates** at triage start (the corpus had grown past the
  shipping-day 440 — the tool's own records added mentions).
- **91 pruned wholesale** — standing rule: sources with status
  `superseded` skip entirely (era-frozen text; supersession lineage
  already declared; 42 of 69 decision sources were EJ-era).
- **271 edges accepted** (268 candidates + 3 manual: DD-070's
  FRICTION-009/011/015, invisible to the tool inside the slash-list
  "FRICTION-006/009/011/015").
- **86 skipped individually, each with a reason.**
- Cache edge count 782 → **1,053**. Final full-corpus residue at
  triage close: 177, fully accounted for (91 + 86). (This record
  then adds ~19 of its own — the taxonomy's example ids, which by
  its own rules stay unedged; the load-bearing relations are in the
  frontmatter above.)
- Types: overwhelmingly `references`; 3 `supersedes` (DD-070 →
  P-007/P-018/P-021 — its batch pass had set their status but never
  declared the edges, exactly OBS-010's q15 gap).

## The skip taxonomy (the real yield)

Mention shapes that match the id grammar but must not become edges:

1. **Anticipated next-free-numbers.** Records guess the number of a
   future artifact ("call it PROPOSAL-018", "might be PROPOSAL-014
   territory", "DD-072 / PROPOSAL-024 material if pursued") and the
   number later lands on different content. Six skipped (DISC-021→
   P-024, OBS-003→P-013/P-014, OBS-010→P-024, DISC-012→P-018,
   OQ-45→P-018); accepted only where the landed record matches the
   anticipation exactly (FRICTION-010→DD-035, DISC-012→WF-004,
   OBS-002→OBS-003, P-017's DD-035/036/067 projections were
   off-by-two and skipped).
2. **Example/mock ids.** Fictional ids in YAML examples, mock search
   output, and template snippets (the seed skill's fictional WF-001
   "feature loop", P-013's mock hook results, example
   `relationships:` blocks). The worst case collides with a real
   record's id.
3. **Range/roster endpoints.** "EJ-001..EJ-008", batch rosters,
   supersession lists. The set is the reference; edges to whichever
   members happen to be named would be an arbitrary subset. (A
   *complete* enumeration is different — FEATURE-001 → its four
   tasks was accepted.)
4. **Explicit N/A.** "DP-002: N/A" compliance lines — the record
   itself declares non-applicability.
5. **Source classes that shouldn't carry edges:** `.docdog/skills/`
   copies (template re-syncs clobber local frontmatter; template-side
   edges would ship dangling into adopting repos) and public-facing
   root docs (CONTRIBUTING.md — added frontmatter changes GitHub
   rendering). Their id mentions are teaching material.

## What it teaches about the tool

- **Slash-lists are invisible** ("FRICTION-006/009/011/015" yields
  only the first id). Manual completion was needed once; fine at
  this frequency, a parser nicety if it recurs.
- **A source-status filter would have saved the biggest manual
  step** (the 91-candidate superseded prune ran through jq, not the
  tool). `--exclude-status superseded` on sources mirrors search's
  existing filter vocabulary. future-proposal material only if the
  orchestrator adoption hits the same wall.
- **Idempotency held at scale**: 8 accept→reindex→resweep cycles,
  zero duplicate suggestions, zero duplicate-edge errors, residue
  always exactly the skip list.
- Volume calibration: 61% of live candidates became edges. The tool
  over-reports by design (report, don't decide) — the 39% skip rate
  is the agent's judgment layer working, not tool noise.

## Post-triage fan-out baseline (the overfetch question)

Asked immediately after the triage: does tripling down on edges
cause context overfetching? Measured same day against the live cache
(256 vertices, 1,060 edges — the 1,053 at triage close plus this
record's own 7), rendering `traverse()` output exactly as the MCP
handler does and estimating tokens as chars/4:

| Seed | degree | depth 1 | depth 2 | depth 3 |
|---|---|---|---|---|
| DP-001 | 64 | 64 rows ≈ 4.0k tok | 618 ≈ 38k | 1,013 ≈ 58k |
| DD-070 | 56 | 56 ≈ 4.2k | 514 ≈ 33k | 1,025 ≈ 59k |
| OBS-011 | 7 | 7 ≈ 0.6k | 176 ≈ 12k | 845 ≈ 51k |

- **Edges are invisible to search and get by construction.** Parsers
  strip frontmatter from `body_text`, so relationships never enter
  FTS or embeddings (ranking unaffected — OBS-010's token economics
  hold); `docdog_search` renders no edges and `docdog_get` renders
  header + body only. A 23-edge relationships block adds zero tokens
  to a get.
- **Overfetch is confined to `docdog_traverse` at depth ≥ 2.** Depth
  2 from any hub returns ~60% of all edges; depth 3 is effectively
  the whole graph. That is small-world topology (DP-001, DD-034,
  DD-070, PROPOSAL-003 are cited by everything), not the new edge
  count — it was already true at 782 edges. Dampers: depth defaults
  to 1, hard cap 3, and traverse returns ~3 metadata lines per edge,
  never bodies.
- **Edge contexts are the anti-overfetch device.** A bare edge forces
  a `get` to learn why it exists; the authored context lets the agent
  skip that fetch. Depth-1-then-selective-get is the intended loop,
  and the triage made it cheaper per decision. Corollary: edge
  *quality*, not count, is the overfetch control — accepting the
  taxonomy's example ids and roster mentions would have turned
  depth-1 hub views from a routing table into noise.
- **Known gap, same evidence gate as the rest:** traverse has no
  `type` filter or result limit — "what did DD-070 supersede" costs
  all 56 depth-1 rows to find the 3 `supersedes` edges. Pure Tier-1
  mechanics if ever needed; future-proposal material only if the
  orchestrator corpus (bigger, denser) makes hub views hurt.
- **Followed through same day: the hub context backfill.** The four
  under-contextualized hubs carried 92 bare edges; the 82 declared by
  live records got authored contexts in five WF-003-style batches
  (hub self-files, discussions, proposals, OQs+frictions,
  decisions/principles/observations), each context sourced from the
  citing record's own text. Coverage after: DP-001 63/64, DD-034
  64/64, PROPOSAL-003 52/52, DD-070 56/56; corpus-wide 50% → 57%.
  The 10-edge residue (and EJ-030 at 22/31) is entirely edges
  declared by superseded records — era-frozen under the triage's
  standing prune, left bare deliberately.

## Aftermath

- Every live collection drains to a stable, explained residue;
  future sweeps diff against this baseline (skipped candidates
  reappear by design — this record is the standing answer to why).
- Hygiene candidates surfaced but out of scope here:
  STATUS-ORCH-MIGRATION-2026-04-13 is `parked` with dead v2 content
  (obsolete-worthy); PROPOSAL-017 is `planned` though executed to
  completion (TASK-001..004 all done).
