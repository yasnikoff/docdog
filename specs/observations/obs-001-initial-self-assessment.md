---
id: OBS-001
title: Initial self-assessment after the 2026-04-12 PROPOSAL-003/006/007 session
collection: observations
status: current
date: 2026-04-12
description: Candid assessment by the assistant at the end of the big self-hosting session. Covers whether docdog is helpful, estimated context-quality impact, estimated token savings, and the prioritized wish list of features the author would have used during this session. Baseline for future assessments — re-run periodically to see if the wins materialize in practice.
relationships:
  - references: PROPOSAL-003
    context: the session's centerpiece — the two-pass edge pipeline and 230-edge seeding this assessment covers
  - references: PROPOSAL-006
  - references: PROPOSAL-007
  - references: DP-001
    context: established the same session — every wish-list item shipped with a tier compliance check in its proposal
  - references: DP-002
  - references: PROPOSAL-008
  - references: PROPOSAL-009
  - references: PROPOSAL-010
  - references: PROPOSAL-004
  - references: FRICTION-009
  - references: PROPOSAL-005
  - references: PROPOSAL-011
  - references: PROPOSAL-012
---

# OBS-001: Initial self-assessment

Captured at the end of the 2026-04-12 session after shipping
PROPOSAL-003 (full two-pass edge pipeline), PROPOSAL-006 (meta
collections), PROPOSAL-007 (named graph), seeding 230 real
frontmatter edges across 83 specs, and reaching 144 tests green.

## Dogfooding caveat

During this entire session the assistant never once invoked
`docdog search`, `docdog_search`, `docdog_traverse`, or
`docdog_concepts_search` to guide its own work. It approached docdog
as a **developer** (Read tool on spec files, grep for names, git log
for history) rather than as a **consumer** of the retrieval layer.

That means every claim below is inferred from mechanics, not lived.
The honest thing to do is close this gap in the next session: do the
work both ways and measure. This is what motivates the CLAUDE.md
dual-track directive being added alongside this observation.

## Builder's verdict on the shipped pieces

The pieces fit together. Concretely:

- **DP-002 paid off**: when PROPOSAL-003 needed type routing,
  `dd_relation_meta` was already the right shape waiting for it — no
  reshape needed.
- **§7.2 state machine translated cleanly** because the spec was
  decomposed by state (8 rows), not by procedure.
- **Friction surfaced quickly**: the "frontmatter-only edit bypasses
  pass 2" bug was caught by the first seeding pass, not a test,
  because the surface is small and the feedback is immediate.

## Estimated context-quality impact

For docdog-like projects (~100–200 spec files, a few hundred edges):
**~15–30% improvement in "right context first time"** vs plain
markdown + grep. Gains concentrate on (a) vocabulary-mismatch queries
where vector search beats grep, and (b) relationship queries where
grep returns dozens of matches but only a handful are actual edges.

For orchestrator-scale (500+ files, thousands of cross-references):
**~25–40%**. The win scales with graph density. Step-based
architectures have natural dependency chains that a typed graph
captures but grep can't navigate cleanly.

## Estimated token savings

Based on this session's Read patterns (~50 spec-file reads, many
redundant because the assistant didn't remember full content across
turns):

- **Specs-heavy task** (design, planning, requirements gathering):
  30–60% savings on retrieval, which is 20–40% of total session
  tokens. **Net ~10–25% overall.**
- **Code-heavy work** (this session): **~5–15%**. Specs are a smaller
  share of context than code.
- **Orchestrator-scale**: **~20–35% overall** — larger corpus means
  more redundant reads without docdog, and per-query savings compound.

**Caveat:** actual savings depend on query quality. A badly-targeted
search that returns 10 sections costs about the same as reading the
whole file. The win requires narrow queries, which
`docdog_concepts_search` + `docdog_collections_list` help with, but
the learning curve is real.

## Wish list from this session (ranked by frequency of wanting it)

1. **CLI `docdog traverse <id>`** — wanted it every time I verified a
   seeding batch; had to use the Arango UI or write a tsx script. See
   PROPOSAL-008.
2. **`docdog recent --since <commit>`** — wanted it at end of session
   to update memory; reconstructed by hand from `git log`. See
   PROPOSAL-009.
3. **"Related but not declared" suggestions** — grep body text for
   mentions that lack a `relationships:` entry. Would turn
   dogfooding into systematic edge discovery. See PROPOSAL-010.
4. **`docdog gc list --orphans`** — PROPOSAL-004 territory, unshipped.
   Zero orphans in this session, but if there'd been one I'd have
   wanted a real command.
5. **Whole-file disk deletion detection** — FRICTION-009, filed.
6. **`docdog refs` scaffold** — PROPOSAL-005, unshipped. Code→spec
   links would have guided several refactors.
7. **Status-aware search filtering** — `docdog search ... --status
   accepted` to exclude proposed proposals. See PROPOSAL-011.
8. **`docdog discuss new` scaffold** — v1 had this, v2 removed it.
   Manually creating discussion files with correct frontmatter and
   next-id resolution is friction. See PROPOSAL-012.

## Meta-observation

The biggest behavior change would come from docdog **nudging
agents to use it**, not from any single new feature. A CLAUDE.md
convention like "before designing anything, run `docdog search
<topic>` and cite what you found" would change retrieval patterns
far more than any individual CLI addition. The dual-track
directive added alongside this observation is the first step;
enforcement via a hook is the logical follow-up if the convention
doesn't stick.

## Re-assessment criteria

This observation is a baseline. The next assessment (OBS-NNN) should
measure:

- Did the dual-track directive actually change the assistant's
  retrieval patterns?
- Were the estimated token savings realized on tasks where the
  assistant used docdog search vs raw Read?
- Which wish-list items were actually used after shipping?
- What new friction surfaced that wasn't visible at baseline?
