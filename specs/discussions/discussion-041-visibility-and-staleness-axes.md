---
id: DISC-041
title: "Three publication blockers reduce to two axes docdog does not model:
  visibility (indexed but not committed) and staleness (marked but never
  measured)"
collection: discussions
status: resolved
retained_privately: docdog-discussions
relationships:
  - references: OBS-027
    context: the measurement that closed Axis 2 — it reversed this record's own
      implied remedy, finding stale material under-represented rather than
      over-represented in retrieval
  - references: FRICTION-053
    context: "everything Axis 2 turned out to actually be: the surfaces that choose
      records for you would not say whether a record is live"
  - references: DD-070
    context: the invariant both axes press on — disk is canonical and git is the
      archive, which is exactly what a record that must NOT reach git gives up
  - references: DD-071
    context: "the publication boundary this discussion suspends: it decided the
      corpus ships whole, and the privacy axis is the case where that is the
      wrong default"
  - references: OQ-33
    context: predicted this discussion by name — 'if indexed but not committed to
      this repo becomes a real need again, it is a new question against the v3
      architecture'
  - references: OQ-03
    context: "the standing answer on privacy, and its thinness is the finding:
      CLAUDE.md rules plus ad-hoc review, no mechanism"
  - references: DD-058
    context: the scope field this would reach for, and the reason it cannot be
      reached for unexamined — scope already carries two unrelated meanings in
      this corpus
  - references: DISC-012
    context: "decided the global `outdated: bool` primitive that the staleness axis
      needs and that was never built — zero records carry it, zero code reads
      it"
  - references: DP-001
    context: "the line both axes are drawn against: docdog may detect and report a
      visibility crossing mechanically, and may never decide what is private or
      what is stale"
  - references: PROPOSAL-047
    context: "the one piece of this discussion that is broken regardless of how the
      rest lands, split out and specified: the tracked-to-ignored edge guard"
  - references: FRICTION-052
    context: surfaced while auditing the privacy surfaces — a redaction engine wired
      to nothing behind a config key that appears live in every adopting project
  - references: DP-002
    context: supplies the second meaning that makes `scope` unusable as a visibility
      marker — DD-058 answers who may see this, DP-002 answers who wrote it
  - references: WF-003
    context: the pruning process that already exists — half of Axis 2's finding is
      that the policy and its batch workflow are in place and only the detection
      is missing
  - references: FRICTION-025
    context: the constraint on how any suppression here may work — a candidate that
      vanishes silently leaves no trace and the same judgment is redone every
      sweep
  - references: OBS-018
    context: "the measurement that inverts abstract-only: complementarity is the
      product, so a record whose body is an abstract has a structurally crippled
      FTS leg"
  - references: OBS-024
    context: the mirror case, measured — a leg that cannot see the answer is noise
      with a vote, which is what an abstract-only body would do to the FTS leg
  - references: OBS-026
    context: the growth number the disk-saving argument for abstract-only is weighed
      against — ~2 MB/year of ordinary churn does not buy the retrieval cost
  - references: DP-003
    context: "clause 3 is the deferral standard applied twice here: three
      hypothetical adapters are not the three actual hand-rollings that trigger
      a framework"
  - references: DD-064
    context: the escape hatch that makes Round 3's middle row already-solved —
      custom ingest formats live in project scripts and `docdog run` invokes
      them
  - references: PROPOSAL-028
    context: the precedent the adapter deferral is held to — it waited for three
      real hand-rollings rather than three plausible ones
  - references: OBS-016
    context: one of four measurements that each overturned a retrieval intuition,
      which is why the history stub is endorsed only pending measurement
  - references: OBS-017
    context: one of four measurements that each overturned a retrieval intuition,
      which is why the history stub is endorsed only pending measurement
  - references: OBS-019
    context: one of four measurements that each overturned a retrieval intuition,
      which is why the history stub is endorsed only pending measurement
  - references: OBS-020
    context: one of four measurements that each overturned a retrieval intuition,
      twice finding the mechanism was the opposite of the stated one
  - references: OBS-023
    context: the instrument the history stub must be measured on before it is built
      — run-external-eval against a real corpus
  - references: FRICTION-033
    context: one of the two consumers of `content_hash`, the per-section hash Round
      3 identifies as half of docdog's whole staleness mechanism
  - references: PROPOSAL-046
    context: the other consumer of `content_hash` — the rejection ledger keys on it,
      which is what makes editing a body expire its rejections
---

# DISC-041: Three publication blockers reduce to two axes docdog does not model: visibility (indexed but not committed) and staleness (marked but never measured)

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-041` for what it
connects to.
