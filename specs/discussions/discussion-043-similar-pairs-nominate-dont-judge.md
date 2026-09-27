---
id: DISC-043
title: "A similar-pairs command as the one mechanical run that nominates
  contradictions, duplicates and missing edges — docdog nominates and validates,
  something outside it judges"
collection: discussions
status: open
date: 2026-09-27
retained_privately: docdog-discussions
relationships:
  - sourced_from: OBS-029
    context: "the scratch script this would make repeatable, and the labeled pairs
      that must be frozen as the gold set before anything is built — its finding
      (the catch is stale records, contradictions a minority) sets the verdict
      vocabulary"
  - references: DP-001
    context: "decides the labor split: nominating pairs is tier 1-2 mechanics, every
      verdict on a pair is tier 3, so docdog nominates and validates and never
      judges"
  - references: PROPOSAL-024
    context: "the command shape being copied — report-only candidates, a review file,
      no --accept-all"
  - references: PROPOSAL-028
    context: "the round trip that is the seam between docdog and whatever judges:
      --format review out, --accept-from in, symmetric"
  - references: PROPOSAL-046
    context: "the durable-rejection ledger whose shape carries over, with the key
      widened from the source's hash to BOTH bodies' hashes, since a contradiction
      can begin when either side is edited"
  - references: OBS-016
    context: "the chunking refusal that is scoped to record-FINDING and does not
      bind pair NOMINATION — max-cosine lottery and lost aboutness are ranking
      costs, and nomination is judged on recall with the judge re-reading both
      whole records"
  - references: OBS-019
    context: "why record-level vectors cannot nominate from hub tails: past the cap
      is never embedded, and the tail of a hub is where stale detail accumulates"
  - references: OBS-020
    context: "inverts for this use: late chunking helps retrieval by making spans
      collapse together, which is exactly what a claim-level nominator must not do
      — naive chunks, if any"
  - references: OBS-018
    context: "the closed retrieval question this must not reopen — a paragraph store
      for nomination is a separate stratum that never feeds search"
  - references: OBS-024
    context: "measures the blind tail a paragraph index would reach: ~16% of this
      corpus's characters, concentrated on the hubs"
  - references: OBS-014
    context: "the validator lesson applied to verdicts — a judge's evidence must be
      verbatim quotes docdog can find in both files, or the verdict is refused"
  - references: FRICTION-033
    context: "recipe keying, applied to cached verdicts: a judgment from a different
      prompt or model must stop matching, not be served as current"
  - references: FRICTION-055
    context: "a second consumer of the same judge loop — separating observed claims
      about external state from decided ones is sentence classification, which
      status cannot carry"
  - references: PROPOSAL-042
    context: "the socket inventory an in-process LLM call would break: docdog opens
      three, and only the opt-in ollama URL sends corpus content"
  - references: DD-073
    context: "why a judge provider must be chosen by the record's repo of origin —
      private discussion bodies must not reach a cloud model"
  - references: FRICTION-025
    context: "the residue problem a first-pass judge could attack on suggest-edges'
      474 live candidates, writing ledger-shaped verdicts for a human to confirm"
  - references: WF-006
    context: "pairs restricted to open notes is a friction deduplicator nearly for
      free"
  - references: FRICTION-046
    context: "why jev must never route the embedder per call: vectors from two
      recipes are not comparable, and this was the bug where the store silently
      went mixed"
  - references: PROPOSAL-049
    context: "the proposal this surfaced — docdog pairs, with the review format, the
      both-hash ledger and the paragraph level gated on an experiment"
  - references: OBS-030
    context: "answers the open paragraph-index question (measured, dropped) and puts
      numbers on the routing position: a typed triage model in front of a frontier
      judge matched the frontier judge alone at 70% of its cost"
  - follows_workflow: WF-001
    context: captured under the discussion-capture workflow
---

# DISC-043: A similar-pairs command as the one mechanical run that nominates contradictions, duplicates and missing edges — docdog nominates and validates, something outside it judges

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-043` for what it
connects to.
