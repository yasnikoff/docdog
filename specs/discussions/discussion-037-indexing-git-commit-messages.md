---
id: DISC-037
title: Indexing git commit messages — the archive docdog declared and never made
  retrievable, why it is tier 2 rather than tier 1, and the derived-edge line it
  must not cross
collection: discussions
status: open
date: 2026-07-29
retained_privately: docdog-discussions
relationships:
  - references: DD-050
    context: "the tier ladder that decides the framing — tier 1 is defined as never
      calling git, so commit indexing is tier 2 and inherits tier 2's
      discipline: no git means the feature is absent and nothing else changes"
  - references: DD-039
    context: the decision that makes the gap self-inflicted — it declares git
      history the archive for extended context, and docdog ships zero retrieval
      over that archive
  - references: PROPOSAL-009
    context: the bar this has to clear; it was superseded on the finding that git
      log over the corpus already answers the retrospective need, which is why
      search alone does not justify the feature
  - references: PROPOSAL-029
    context: tier 2's only existing citizen (gitCommonDir) and the model for how the
      git call must be wrapped — the core may call git, it may never need it
  - references: PROPOSAL-028
    context: the accept-from design whose forbidden --accept-all shape is exactly
      what auto-materializing id mentions from commit messages would be
  - references: OBS-014
    context: "the measurement that prices auto-linking: roughly 46% of mention
      candidates were judged skip, so mention-derived commit edges would be
      about half wrong"
  - references: OBS-018
    context: the closed retrieval question that sets the acceptance bar — anything
      adding documents to the ranked pool re-runs the frozen 40, and 0.03 is the
      noise floor that decides
  - references: OBS-013
    context: "the live unknown that makes scale the primary risk: 0.694 on a 9.5MB
      adopted corpus already shows what volume does to this ranker"
  - references: DP-001
    context: the principle that splits the feature — reading and storing commit
      metadata is tier 1 mechanics, selecting important commits or weighting by
      conventional-commit type is tier 3 and must never be built
  - follows_workflow: WF-001
---

# DISC-037: Indexing git commit messages — the archive docdog declared and never made retrievable, why it is tier 2 rather than tier 1, and the derived-edge line it must not cross

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-037` for what it
connects to.
