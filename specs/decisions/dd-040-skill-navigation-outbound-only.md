---
id: DD-040
title: "Skill-produced navigation aids are additive outbound links only"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-004 under DD-034's artifact-resilience lens. Skills record only outbound edges from sections they directly worked with. No entry beats a wrong entry."
relationships:
  - supersedes: EJ-004
    context: "mirror under DD-034's artifact-resilience lens, with sharpening"
  - references: EJ-007
  - references: EJ-011
  - references: EJ-012
  - references: DD-034
    context: "skill-produced enrichment that lives only in DB counts as cache-tier under DD-034"
---

# DD-040: Skill-produced navigation aids are additive outbound links only

Skills in a docdog-managed repo may maintain lightweight navigation
aids (tags, cross-references, index entries) as part of focused
work (e.g., `/finalize-task`). These aids follow strict rules to
prevent low-quality entries from misleading agents:

1. **Outbound links only.** A skill finishing a task can record
   "this task used DP-11" (link *from* the focused source). It
   must NOT claim "DP-11 applies to these N files" (link *to* —
   requires full-scan knowledge the skill doesn't have).
2. **Never authoritative.** The index explicitly frames itself as
   partial: "these are known connections, not all connections."
   Agents treat it as a starting point, not the complete picture.
3. **No entry beats a wrong entry.** If the skill isn't confident
   about a tag, it doesn't add it. Gaps are expected and filled by
   the external tool.
4. **Freshness markers.** Each entry carries source and timestamp
   (e.g., "added by /finalize-task TASK-051, 2026-04-05"). Agents
   can judge trustworthiness.

The external tool owns the reverse direction: "find everything
relevant to X" queries, full-scan gap analysis, new-tag
propagation across existing specs.

## Rationale

The TASK-052 case study showed that a partial index presented as
complete is worse than no index — the topic index listed
DD-ARCH-19 under error handling, which could lead an agent to
stop looking before finding DP-11. The outbound-only constraint
ensures skill-produced entries are reliable within their scope.

## DD-034 check

Sharpened. Under DD-034, the on-disk `relationships:` block is
the source of truth for graph edges. Skill-produced navigation
aids that live only in the DB count as cache-tier enrichment —
they are fine to produce via `docdog_create` / `docdog_update`,
but they must never become the *only* place a relationship
exists. If a skill discovers a relationship that deserves to
survive ejection, it edits the frontmatter of the relevant
artifact, not just the graph.
