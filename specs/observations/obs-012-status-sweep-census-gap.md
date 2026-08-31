---
id: OBS-012
title: "Staleness sweeps must enumerate the corpus's actual status values first — the scoped grep missed `planned`, the between-batch census caught it"
collection: observations
status: current
date: 2026-07-11
description: "During FEATURE-002's staleness sweep, the scope-freezing grep enumerated an assumed status set (open|proposed|draft|in-progress|active) and missed records at planned (OQ-27/28) and parked (STATUS-ORCH — caught earlier only because memory flagged it). Because vocabularies are descriptive (OBS-006), a sweep that hardcodes the value list re-commits the staleness bug at the meta level. Correct first step: enumerate values actually present (grep -o over ^status:, sort -u), then classify every value. WF-003's verify-between-batches design worked exactly as intended — the batch-3 census caught the gap before finalize, and the fix cost one scope amendment instead of a follow-up feature."
relationships:
  - sourced_from: FEATURE-002
    context: the sweep whose scope-freezing grep under-enumerated the status vocabulary
  - references: WF-003
    context: "step 6 (verify between batches) is what caught the miss — evidence the loop pays for itself"
  - references: OBS-006
    context: the descriptive-vocabulary lesson this observation applies at sweep time — collections grow status values organically, so no fixed list is safe to assume
  - references: DISC-024
    context: the originating discussion; its leave-alone census is only trustworthy because the final grep enumerated every live value
  - references: OQ-27
    context: one of the two records at `planned` that the scope-freezing grep missed; caught by the WF-003 step-6 census and closed via scope amendment
  - references: OQ-28
    context: one of the two records at `planned` that the scope-freezing grep missed; caught by the WF-003 step-6 census and closed via scope amendment
  - references: PROPOSAL-017
    context: carried the missed `planned` value and made the frozen scope only because OBS-011 had already flagged it — the grep alone would not have caught it
  - references: OBS-011
    context: the hygiene flags that put PROPOSAL-017 and STATUS-ORCH into the frozen scope at all, covering for the grep's under-enumerated status list
  - references: FEATURE-001
    context: the first WF-003 instantiation; the sweep this record observes is the second and the first to exercise the scope-amendment path
---

# OBS-012: Enumerate status values before sweeping by status

## What happened

FEATURE-002 froze its target set from a grep for
`^status: (open|proposed|draft|in-progress|active)`. The corpus's
questions and proposals collections had organically grown other
"this is still live" values — `planned` (OQ-27, OQ-28, and
PROPOSAL-017 before batch 2) and `parked` (STATUS-ORCH). PROPOSAL-017
and STATUS-ORCH made the frozen scope only because OBS-011 had
already flagged them; OQ-27/28 were caught by the WF-003 step-6
census between batch 3 and finalize, and closed via scope amendment.

## The lesson

OBS-006 established that status vocabularies are descriptive —
collections accumulate values organically. The corollary for any
status-driven sweep: **the value list is data, not an assumption.**
Enumerate what actually exists first (`grep -o '^status: .*' -r
specs | sort | uniq -c` or equivalent), decide per value whether it
means "claims currency," then sweep. A hardcoded value list is the
same class of staleness the sweep exists to fix.

## Process evidence

WF-003's between-batch verification earned its keep: the miss was
caught inside the feature's own loop at the cost of a one-paragraph
scope amendment, not discovered later as a fourth batch or a
follow-up feature. This is the second instantiation of WF-003
(after FEATURE-001) and the first to exercise the
scope-amendment path.
