---
id: DISC-025
title: Document attributes — generalize filter/patch to all frontmatter fields,
  reject an attribute-registration mechanism
collection: discussions
status: resolved
date: 2026-07-12
retained_privately: docdog-discussions
relationships:
  - references: DP-001
    context: the tier walk that decided the shape — filtering and patching
      caller-stated fields is Tier-1 mechanics; a registration step adds
      ceremony without any mechanical payoff at docdog corpus scale
  - references: DD-070
    context: v3 architecture makes the generic model nearly free — frontmatter_json
      is already on every vertex row (§6), and the change adds params to
      existing kernel tools, not new tools
  - references: DD-058
    context: "the scope filter is the working precedent: scope is not a cache
      column, it is json_extract over frontmatter_json at query time — the
      generic filter is that mechanism with the path parameterized"
  - references: DISC-023
    context: established that vocabulary blocks ship as advisory data consumed by
      agents, not code — the same pattern covers documenting any attribute's
      meaning, so registration carries nothing that concept records don't
      already
  - references: PROPOSAL-026
    context: collection concept records are the documentation home for
      per-collection attribute vocabularies, exactly as they are for
      status_vocabulary
  - references: OBS-010
    context: the measured retrieval win — hybrid search is docdog's real answer on a
      small corpus, which is what demotes the `where` filter to a convenience
      and makes the update half the sharper gap
  - references: FEATURE-002
    context: its staleness sweep demonstrated the status-plus-`supersedes` idiom at
      corpus scale, which is why the motivating `is_outdated` boolean was
      rejected as strictly worse
  - references: PROPOSAL-027
    context: the outcome — drafted here with the full spec (param shapes, reserved
      keys, single-syntax-path refusals, DP walk) and shipped the same session
---

# DISC-025: Document attributes — generalize filter/patch to all frontmatter fields, reject an attribute-registration mechanism

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-025` for what it
connects to.
