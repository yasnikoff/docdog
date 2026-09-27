---
id: OBS-029
title: "Mining high-cosine undeclared pairs for contradictions: 13 of the top 30 needed attention, and every contradiction was a stale record beside the one that superseded it"
collection: observations
status: current
date: 2026-09-27
description: "Pairwise cosine over the 181 live records, minus pairs with a declared edge or a shared parent, top 30 judged by agents: 5 contradictions (all drift), 8 tensions, 12 missing edges, 5 noise. Embeddings cannot judge agreement, but similarity is a necessary condition for contradiction, and as a candidate generator it found two stale lines shipping in adopter templates."
relationships:
  - references: DP-001
    context: "the split this experiment respects — candidate generation is tier 1 arithmetic, the verdict is tier 3 and was made by agents with verbatim quotes, never by a threshold"
  - references: FRICTION-055
    context: "the same failure seen from the other side — status cannot say a record has aged; 055 found a claim about the world going stale, this finds claims about docdog going stale beside the record that changed them"
  - references: FRICTION-051
    context: "both confirmed defects were in shipped skill templates, the population 051 showed drifts silently; skill-vs-record pairs were the richest source here too"
  - references: PROPOSAL-046
    context: "two of the five contradictions are the delete-means-reject wording 046 retired, surviving in relate.md and in PROPOSAL-028's body; also the ledger shape a productised version of this would reuse"
  - references: OBS-019
    context: "why the grain is wrong — the stored vector is a whole-record centroid of an 8,000-char prefix and encodes aboutness, so it pairs topics, not claims"
  - references: OBS-024
    context: "the blind spot inherited — a contradiction in a record's tail past the embed cap cannot move the cosine at all"
  - references: OBS-027
    context: "a companion finding about stale records: 027 showed the ranker does not over-surface them; this shows a pair-miner can surface them on purpose"
---

# OBS-029: similarity finds stale records, not contradictions

## Question

Can vector embeddings find contradictions in the spec corpus mechanically?

Not directly. Cosine measures topic, not agreement. "auto_gc defaults to
true" and "auto_gc defaults to false" are near-neighbours. But two records
can only contradict if they are about the same thing, so **similarity is a
necessary condition**, and that makes it usable as a candidate generator for
an agent's verdict. The experiment measures the precision of that generator.

## Method

Run 2026-09-27 against a fresh `docdog index`: 373 records, 2,028 edges.
It used the stored vectors (`chunks.embedding` in `index.db`, one per record)
and computed no new ones.

1. **Live set.** 181 records with status in {current, shipped, accepted, open,
   leaning, proposed, ongoing, narrowed, analyzed}, giving 16,290 pairs. A
   superseded record disagreeing with its successor is supersession working,
   so those records are excluded.
2. **Cosine.** Max-cosine per pair (identical to `vectorLeg`'s per-record max).
3. **Filter.** Drop any pair with a declared edge in either direction, and any
   two records sharing a `part_of` parent. A declared edge already explains
   the overlap.
4. **Judge.** The top 30 survivors went to three agents, 10 pairs each, all
   given the same rubric. The labels were CONTRADICTION (incompatible, both
   presented as current; **two verbatim quotes required**), TENSION (one
   misleads a reader who has not read the other), MISSING-EDGE and
   UNRELATED-SIMILAR. The rubric said to prefer false negatives.

The script was about 40 lines of better-sqlite3 in a scratch directory, not
committed. Steps 1–3 above are the whole algorithm.

## Result

**Cosine is compressed:** p50 0.628, p90 0.728, p99 0.802, max 0.930. Only
rank carries signal, so no absolute threshold is meaningful.

**Similarity recovers declared structure.** 106 of the 200 most similar live
pairs already carry an edge. That is the sanity check that the signal is
relational at all.

**Top 30 undeclared pairs (cosine 0.930 → 0.819):**

| Label | Count |
|---|---|
| Contradiction (all drift) | 5 |
| Tension | 8 |
| Missing edge | 12 |
| Unrelated-similar | 5 |

**Contradictions:**

1. **`relate` skill vs `populate` skill.** `relate.md` said *"delete the rows
   you reject"*. Since PROPOSAL-046, deleting a row means *defer*, and
   refusing needs `reject:`. The line was byte-identical in
   `templates/skills/_common/relate.md`, so every adopter shipped with the
   instruction that recreates FRICTION-025. **Fixed with this record.**
2. **DD-064 (current) vs the `ingest` skill.** DD-064 still describes
   one-step `split --on` and filename-derived ids for `add`. PROPOSAL-045
   removed the first and DP-001 forbids the second.
3. **PROPOSAL-039 vs the `compose` skill.** P-039 says *"the old `--on` /
   `--depth` pattern mode is untouched"*. PROPOSAL-045 made the plan the only
   executor.
4. **PROPOSAL-029 §5 vs OBS-026.** §5 says gc refuses a shared store.
   DISC-032 reversed that, and P-029 carries no banner.
5. **PROPOSAL-028 vs the `populate` skill.** This is the same
   delete-means-reject change as #1. PROPOSAL-046 `extends` P-028, but
   P-028's body was never marked.

**Tensions worth acting on:**

- The `ejection-resilience` skill attributed the superseded test to DD-066.
  It came from EJ-030. **Fixed with this record**, in the template and its
  mirror.
- CONCEPT-RELATION-PARENT is still `current` although DD-072 retired it as
  FRICTION-012's overlap.
- OQ-39 is still `leaning` although DD-068 decided it.
- PROPOSAL-023 still describes one cache file, and PROPOSAL-019 still
  describes the flat `specs.md`. Neither points forward to the proposal that
  changed it: PROPOSAL-029 and PROPOSAL-041/044 respectively.

## Findings

1. **What this method finds is stale records.** Every contradiction has one
   shape: an older decision or shipped proposal next to the newer skill or
   observation that restates the current behaviour, with no pointer forward.
   No pair contained two contemporaneous claims in conflict. `status` cannot
   say "this passage has aged" (FRICTION-055). This can point at where it has.
2. **Skill ↔ record pairs are the richest seam.** A skill is rewritten when
   behaviour changes and a decision is not, so the skill paraphrases its source
   closely (cosine 0.93) and exposes the source's drift. That is also why the
   two shipped defects were in templates.
3. **Precision is high enough to be worth a reviewer's time.** 13 of 30
   pairs needed a change and 25 of 30 were actionable once missing edges are
   counted.
4. **Noise is mechanically separable.** Most UNRELATED-SIMILAR pairs were
   concept records built from the same template, where format drives the
   cosine. Excluding concept-vs-concept pairs is a tier-1 filter.
5. **Blind spots, by construction:**
   - A conflict with a *third* record: PARENT's real conflict is with DD-072,
     which is not its pair partner.
   - Anything in a record's tail past the embed cap (OBS-024).
   - Any claim about the world (FRICTION-055).
   - Records that already carry an edge, since those pairs are filtered
     before anyone reads them. PROPOSAL-028 ↔ populate surfaced only because
     the edge ran through PROPOSAL-046.

## Scope and caveats

- 30 pairs, one corpus, one day.
- Labels are agent judgments. Only the two template findings were verified
  by hand before being fixed.
- The per-batch agents never saw each other's pairs, so no cross-batch
  consistency check was done.
- Recall is unmeasured: nothing here says how many contradictions sit below
  rank 30.

## Open, not done here

- ~~The other contradictions and the tensions listed above.~~ Done the same
  day. Amendment banners and forward edges went onto DD-064, PROPOSAL-039,
  PROPOSAL-029, PROPOSAL-028, PROPOSAL-023 and PROPOSAL-019. OQ-39 is
  `resolved` against DD-068. `relation-parent.md` was deleted, since no edge
  used it and DD-072 retired it. The `relate` skill's type table now lists
  `part_of` instead of `parent` / `child`. Fixing OQ-39 surfaced one record
  the pairing never ranked: **DD-068 itself** still put rich metadata "in
  Arango only", and got a DD-070 banner. That is the third-record blind spot
  from finding 5, met in practice: reviewing a stale pair led to a stale
  record outside it.
- Whether this belongs in docdog as a surface. The obvious shape is
  `suggest-edges` with a similarity-sourced candidate set, reusing PROPOSAL-046's
  body-hash ledger so a pair judged consistent stays quiet until either body
  changes. That needs a proposal and a DP-001 walk first. Any
  contradiction-scoring model (e.g. an NLI cross-encoder) could only order the
  queue, never assert a verdict.
