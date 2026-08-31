---
id: DISC-034
title: splitting documents into records is authoring, not chunking — why the
  three refused chunking designs do not bind it, and what has to be measured
  before anyone splits
collection: discussions
status: open
date: 2026-07-28
retained_privately: docdog-discussions
relationships:
  - references: FRICTION-031
    context: the record that disclosed the cap and accepted the hole; this
      discussion is the first proposal to close it that is not a chunking
      design, so it reopens FRICTION-031's question without contradicting its
      resolution
  - references: OBS-016
    context: "the refusal argued around: its mechanism (max-cosine lottery,
      whole-record centroid encodes aboutness) is stated for index-time chunks
      of one record and does not transfer to authored records with their own
      titles and descriptions"
  - references: OBS-018
    context: "supplies the rule that makes the case FOR splitting: fusion pays for
      leg diversity, and a subdocument's authored title+description is new text
      in fts5 rather than a redistribution of what a leg already had — which is
      exactly the test OBS-017 failed"
  - references: OBS-019
    context: "its mechanism is the strongest argument for authored splitting: the
      truncated prefix wins because records open with framing and close with
      detail, so a section authored to open with its own framing gets that
      property deliberately instead of by accident"
  - references: OBS-020
    context: the third refused arm; cited for its generalized lesson — an aggregate
      cannot tell you a design is succeeding for the opposite of its stated
      reason — which is why this discussion demands a mechanism measurement, not
      just an MRR delta
  - references: OBS-013
    context: the 0.694 on the adopted 9.5MB corpus is the number this would have to
      move, and OBS-018 already names that corpus as the live unknown its
      refusals are not scoped to
  - references: OQ-38
    context: "the open question this discussion partly answers: it asked what
      restructuring helpers docdog should provide, and named extract-sections as
      a nice-to-have; the AST rewrite of splitFile is the concrete first piece"
  - references: DISC-022
    context: the discussion that gated chunking on evidence while ungating
      suggest-edges; the same gate is applied here, and the audit demanded below
      is what would open it
  - references: FRICTION-023
    context: the split PARSER's coverage gaps — distinct from the split COMMAND's
      line-prefix bug found here; the two are separate code paths and the parser
      half was already fixed by PROPOSAL-034
  - references: DP-001
    context: "decides the labor split: AST parsing and size-driven descent are tier
      1-2 mechanics, while choosing where a document divides and writing each
      subdocument's description are tier 3 and stay with the agent+user"
  - follows_workflow: WF-001
    context: captured under the discussion-capture workflow; four artifacts were
      surfaced, proposed, and approved in the same session
  - references: FRICTION-039
    context: the defect this discussion found by reading the code before arguing the
      design — the split command's line scan, distinct from the parser's AST
  - references: PROPOSAL-038
    context: "the approved half: the AST rewrite plus size-driven descent, which
      does not wait on the audit this discussion demands"
  - references: DP-004
    context: the discipline half, written as a reviewable criterion; ships proposed
      because ratifying it means agreeing how it applies to this corpus's own 54
      violators
  - references: DD-072
    context: "settles the relation question the discussion opened: part_of wins, the
      child declares it, parent is retired from the shipped seed"
---

# DISC-034: splitting documents into records is authoring, not chunking — why the three refused chunking designs do not bind it, and what has to be measured before anyone splits

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-034` for what it
connects to.
