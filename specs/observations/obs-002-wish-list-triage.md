---
id: OBS-002
title: Wish-list triage — value/effort ranking for OBS-001 features
collection: observations
status: current
date: 2026-04-12
description: Ranks the 8 features from OBS-001 by value-to-effort ratio for the next implementation round. Combines impact on the assistant's daily workflow with LOC + complexity estimates from each proposal, plus a crude 'unblock factor' for proposals that enable downstream work. Recommends implementation order.
relationships:
  - sourced_from: OBS-001
  - references: PROPOSAL-008
  - references: PROPOSAL-009
  - references: PROPOSAL-010
  - references: PROPOSAL-011
  - references: PROPOSAL-012
  - references: PROPOSAL-004
  - references: PROPOSAL-005
  - references: FRICTION-009
  - references: DP-001
    context: the what-not-to-include line — auto-writing suggested edges is forbidden, suggestions only
  - references: PROPOSAL-007
  - references: DP-002
  - references: OQ-42
  - references: OBS-003
    context: the anticipated follow-up — OBS-003 delivered the did-round-1-get-used reading for the top-ranked command
---

# OBS-002: Wish-list triage

## Scoring method

Each item gets three scores (1–5):

- **Value** — how often does the assistant want this during a
  typical work session? (5 = every time, 1 = occasional)
- **Effort** — 5 = very small (<~50 LOC), 1 = large (>~500 LOC).
  Higher is better.
- **Unblock** — 5 = unblocks/enables several downstream items,
  1 = purely standalone.

Total = Value + Effort + Unblock. Ranked desc.

## Ranking table

| # | Feature | Proposal | Value | Effort | Unblock | Total |
|---|---|---|---|---|---|---|
| 1 | `docdog traverse` CLI | PROPOSAL-008 | 5 | 4 | 3 | **12** |
| 2 | Status-aware search | PROPOSAL-011 | 4 | 5 | 2 | **11** |
| 3 | `docdog recent` | PROPOSAL-009 | 4 | 4 | 2 | **10** |
| 4 | `docdog discuss new` | PROPOSAL-012 | 3 | 5 | 2 | **10** |
| 5 | `suggest-edges` | PROPOSAL-010 | 4 | 4 | 2 | **10** |
| 6 | `gc list --orphans` | PROPOSAL-004 | 2 | 3 | 3 | **8** |
| 7 | Whole-file deletion | FRICTION-009 | 3 | 4 | 1 | **8** |
| 8 | `docdog refs` | PROPOSAL-005 | 5 | 1 | 4 | **10** |

## Notes on individual scores

**PROPOSAL-008 (`docdog traverse`):** value=5 because every seeding
batch during OBS-001's session wanted this. Effort=4 (small,
~90 LOC). Unblock=3 because it changes retrieval patterns
generally and becomes the default "look at the graph" move.

**PROPOSAL-011 (status-aware search):** effort=5 (smallest shipped
LOC on the list, ~25 LOC). Value=4 because it meaningfully
improves every search query without changing the agent's workflow.
Unblock=2 (pure filter, no downstream).

**PROPOSAL-009 (`docdog recent`):** value=4 because every
end-of-session memory update wants it. Effort=4 (~75 LOC).

**PROPOSAL-012 (`docdog discuss new`):** effort=5 (~50 LOC). Value
lower because discussion capture is session-end, not per-task.
Would remove friction from the CLAUDE.md workflow that currently
requires hand-authoring frontmatter.

**PROPOSAL-010 (`suggest-edges`):** highest potential for
**graph density** improvement per LOC. Would find dozens of
undeclared edges across the existing 230-edge corpus. Value=4
because it's a one-shot discovery tool rather than a per-task
lookup.

**PROPOSAL-005 (`docdog refs`):** value=5 (code→spec links would
reshape refactor work), unblock=4 (enables the orchestrator
bootstrap workflow), but effort=1 (~500+ LOC and multi-step).
Total 10 but should come after the quick wins.

**FRICTION-009 (whole-file deletion):** filed friction, not a
proposal. Effort=4, value=3 (not hit during this session because
nothing was deleted), unblock=1.

**PROPOSAL-004 (`gc list --orphans`):** the subset of PROPOSAL-004
needed for orphan visibility. Value=2 because zero orphans across
230 edges in OBS-001. Low urgency right now.

## Recommended implementation order

**Round 1 — Quick wins (all together, ~250 LOC):**

1. **PROPOSAL-011 (status-aware search)** — ~25 LOC, immediate
   quality-of-life on every search.
2. **PROPOSAL-008 (`docdog traverse` CLI)** — ~90 LOC, highest
   per-session frequency.
3. **PROPOSAL-009 (`docdog recent`)** — ~75 LOC, end-of-session
   helper, composes naturally with the traverse output.
4. **PROPOSAL-012 (`docdog discuss new`)** — ~50 LOC, closes the
   discussion-capture friction.

After round 1, the CLI surface has the tools needed to make
dogfooding the graph trivial. Commit each as a separate atomic change
for reversibility.

**Round 2 — Systematic discovery:**

5. **PROPOSAL-010 (`suggest-edges`)** — ~100 LOC. Run it against the
   current 230-edge corpus and see how many additional edges surface.
   This is both a feature ship AND a data-quality pass in one.

**Round 3 — Larger efforts (separate sessions):**

6. **FRICTION-009 cleanup** — ~30 LOC + tests, ships independently
   once someone has a moment.
7. **PROPOSAL-004 `gc list --orphans`** — carve out the orphans
   surface from the fuller PROPOSAL-004 if/when orphans start
   accumulating.
8. **PROPOSAL-005 `docdog refs`** — largest piece, needs its own
   focused session; defer until round 1+2 confirm the smaller
   features actually changed behavior.

## What NOT to include

- **Auto-writing edges from suggestions** (PROPOSAL-010) — DP-001
  forbids. Stays as suggestions only.
- **Enforcement on the named graph** (PROPOSAL-007 followup) —
  fights DP-002/OQ-42, rejected in the original proposal.
- **Interactive prompts in any new command** — scriptable surface
  means no TTY dependencies.

## Re-evaluation

Revisit this triage after Round 1 ships. OBS-003 should measure:
did the round-1 commands actually get used? Did the assistant's
retrieval patterns change? Any friction that wasn't visible from
the design sketches?
