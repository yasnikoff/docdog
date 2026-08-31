---
id: OBS-010
title: "First measured retrieval eval: hybrid search beats a generous grep baseline 0.87 to 0.45 MRR; the two misses teach more than the wins"
collection: observations
status: current
date: 2026-07-11
description: "P-023 §7 step 7 executed: 40 frozen queries with gold answers over the live 249-record corpus, docdog hybrid vs isolated FTS5/vector legs vs a two-variant grep baseline. DD-070 §8's missing 'measured retrieval win' now exists and is qualified real: hybrid Hit@1 80% / MRR 0.871 vs grep-rank 30% / 0.446, median tokens-to-locate 143 vs ~6.5k on the honest transcript, and RRF fusion beats both of its own legs. Grep wins one category — exact-id lineage lookups — where the right docdog tool is traverse, not search. The data motivates no search-code change: vector thresholding stays deferred, two misses in forty don't buy a tuning pass."
relationships:
  - references: DD-070
    context: "produces the 'measured retrieval win' §8 named as missing; the claim is confirmed with qualifications recorded here"
  - references: PROPOSAL-023
    context: "completes §7 step 7, the final step of the implementation order; §6's accepted gaps (no fuzzy, unthresholded vector leg) drew no failures in this data"
  - references: DD-059
    context: "the tokens-to-locate win rides partly on agent-authored description fields — the MCP render surfaces description over mechanical preview, and this corpus has rich descriptions"
  - references: DD-066
    context: "the memory-layer bet this measurement was meant to validate before the workflow engine was cut in its favor"
  - references: WF-002
    context: "the eval is the dual-track comparison run deliberately and at scale: same questions through docdog and through grep, scored"
  - references: WF-006
    context: query-set source — the survey menu's questions rephrased from the asking side
  - references: OBS-005
    context: the recorded retrieval miss became eval query material
  - references: DP-001
    context: "twice: judgment-once/runs-are-levers harness design, and no speculative tuning bought by two misses"
  - references: EJ-030
    context: the what-superseded-EJ-030 query shape where grep beat hybrid 4/4 — the traverse-first lesson
---

# OBS-010: First measured retrieval eval

## What ran

P-023 §7 step 7. A frozen query set (`tests/eval/queries.yaml`, 40
queries) built from real usage of this corpus — session-handoff
questions, WF-006's survey menu, OBS-005's recorded miss, and the
corpus's own DISC/OQ/FRICTION questions rephrased from the asking
side. Gold answers (1–3 records each) were judged once against the
live corpus and frozen; the harness
(`tests/eval/run-retrieval-eval.ts`) is mechanical and re-runnable
(DP-001: judgment happened once, runs are levers). Full per-query
table in `tests/eval/report.md`; method and caveats in
`tests/eval/README.md`.

Five routes: the real `search()` (hybrid), its FTS5 and vector legs
isolated (mirrored SQL), and a grep baseline read two ways —
`rg-rank` (generous: files ranked by distinct-terms-matched then
match count) and `rg-walk` (honest: the single `rg -in` transcript
in path order). Grep engine validated against ripgrep 14.1.1.

## Numbers (249 records @ b2ef456, 2026-07-11)

| system | Hit@1 | Hit@5 | Hit@10 | MRR@10 | median tokens-to-locate |
|---|---|---|---|---|---|
| hybrid | 80% | 95% | 95% | 0.871 | 143 |
| fts (leg) | 53% | 83% | 90% | 0.656 | — |
| vector (leg) | 55% | 90% | 93% | 0.686 | — |
| rg-rank | 30% | 63% | 75% | 0.446 | — |
| rg-walk | 3% | 5% | 15% | 0.047 | ~6,500 |

## Verdict on DD-070 §8

**The measured retrieval win exists.** Against the *generous* grep
reading — a ranking a script could build but an agent mid-task
realistically wouldn't — hybrid answers at rank 1 more than twice as
often. Against the *honest* grep transcript, the reading cost to
reach the answer drops ~45× (143 vs ~6,500 approximate tokens).
Three qualifications keep this honest:

1. **The corpus is small (~250 records) and self-describing.**
   Agent-authored titles and `description:` fields (DD-059) do real
   lifting — the MCP render shows description over mechanical
   preview, so part of the token win is authoring discipline, not
   ranking. On a corpus with bare frontmatter the gap would narrow.
2. **Gold judgments were made by the same agent that built the
   system** (bias acknowledged), though before any system ran, and
   one gold was amended pre-freeze when the first run showed a
   record that plainly answers (q03, noted in queries.yaml).
3. **No reformulation loops on either side.** Real agents retry
   failed greps *and* failed searches; this measures single-shot.

## What the breakdown teaches

- **Fusion earns its keep.** Hybrid (0.871) beats both of its own
  legs (0.656 / 0.686) — FTS and vector fail on *different*
  queries, which is exactly the regime where reciprocal-rank fusion
  pays. Neither leg alone would have beaten the corpus.
- **Grep wins exactly one category: exact-id lineage.** On "what
  superseded EJ-030"-shaped queries (id literal in the query),
  rg-rank went 4/4 at rank 1 vs hybrid's 0.63 MRR. The corrective
  isn't a search change — the kernel already has the right tool for
  edge-shaped questions (`docdog_traverse`), and BM25 dilution on
  ubiquitous ids (every recent record cites DD-070) is structural.
  Agent practice: ids in the question → traverse first.
- **Miss 1, q05 "what did we replace ArangoDB with":** every route
  except rg-rank missed. "ArangoDB" appears in ~70 records; the
  records *about* replacing it say "embedded SQLite", so the query's
  keywords are anti-discriminative and BM25's length normalization
  buries the long umbrella decision. Grep's crude
  total-match-count accidentally surfaces it. Known failure shape:
  short queries made of ubiquitous corpus vocabulary.
- **Miss 2, q15 "which decisions did DD-070 supersede":** the
  answer *is* DD-070's own frontmatter, but dozens of records cite
  DD-070 and outscore it. Same lesson as lineage above: this is a
  graph question wearing a search costume.
- **rg-walk is the real "no docdog" experience** and it is dire:
  3% Hit@1, and the transcript cost to even *reach* the answer is
  thousands of tokens because path order front-loads whatever sorts
  first. Ranking — any ranking — is most of the value; relevance
  ranking is the rest.

## What this does NOT motivate

No search-code change. Two misses in forty, both with a structural
explanation and one with an existing kernel answer, do not buy a
tuning pass (DP-001: no speculative knobs). Specifically:

- **Vector-leg score thresholding stays deferred** — the vector leg
  produced no false-positive flood in any query; the deferral now
  has data behind it instead of in front of it.
- **Eval-suggested candidates, deliberately unproposed:** id-exact
  match boosting (would fix q15, touches one query in forty),
  section-granularity chunking (`chunks.ord` still always 0 — no
  query here needed sub-record targeting). Either becomes
  PROPOSAL-024 material only if repeated real usage — not this
  eval alone — keeps hitting the same wall.

## Re-running

`docdog index && npx tsx tests/eval/run-retrieval-eval.ts` — same
corpus + same query set → same report. The query set is frozen;
extend by appending so runs stay comparable across time.
