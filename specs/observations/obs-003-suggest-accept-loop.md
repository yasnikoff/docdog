---
id: OBS-003
title: "Suggest → accept → reindex loop — honest retrospective"
collection: observations
status: current
date: 2026-04-12
description: "What it actually felt like to use `docdog suggest-edges` to surface 131 undeclared references and accept them in a single mechanical pass. Captures the wins (fast round-trip, clean idempotency), the ugly parts (I still wasn't using docdog as a retrieval layer even during this task), and what the data suggests about PROPOSAL-010's real-world leverage."
relationships:
  - references: PROPOSAL-010
  - references: OBS-001
  - references: OBS-002
  - references: DP-001
    context: the loop it validates — mechanical sweep, agent-owned acceptance
  - references: PROPOSAL-003
    context: the record whose 16 undeclared edges were the sweep's biggest single-source haul
---

# OBS-003: Suggest → accept retrospective

The first real test of PROPOSAL-010 ran right after the tool was
shipped. I wrote `suggest-edges`, wrote a throwaway tsx script that
parsed the output and appended each suggestion to its source file's
`relationships:` block, ran it, reindexed. Took about 45 minutes
from "tool doesn't exist" to "131 new edges committed." Captures
below are honest — wins and misses.

## Wins

**The tool found real gaps.** PROPOSAL-003 alone picked up 16 new
edges — every other spec it cites in prose but didn't explicitly
declare. OBS-001 correctly surfaced all eight wish-list items as
missing `references` to the proposals that now document each wish.
These weren't noise; every single one was a legitimate link.

**The corpus grew by 52%.** 254 → 386 live frontmatter edges in one
mechanical pass. That's the kind of graph-density improvement
PROPOSAL-010 predicted, and it arrived on the first run against
real content.

**Clean idempotency.** After accepting all 131, `docdog
suggest-edges` returned "No undeclared edge suggestions found."
The loop closes. If I add a new mention to any spec and rerun, the
new edge shows up; otherwise silence. That's exactly the
steady-state behavior PROPOSAL-010 §Not in scope intended.

**Reindex was boring.** 131 new edges, zero orphans, zero
unspecified — meaning every target resolved cleanly against the
global id map. The two-pass indexer + state machine from PROPOSAL-003
handled the whole batch without touching anything else. 171 tests
still green. Boring in this context is the highest compliment.

## Losses

**I still don't use docdog as a retrieval layer during work.** I
promised this behavior change in OBS-001 and the CLAUDE.md
dual-track directive. During this accept pass I:

- Used `git log` to reconstruct the session, not `docdog recent`
  (which I had just shipped)
- Used `grep` to check edge counts, not `docdog_search`
- Used the Arango UI through `curl` to verify totals, not `docdog
  traverse`
- Wrote a throwaway tsx script instead of checking whether
  `suggest-edges --json` could be piped into a jq pipeline

I'm treating docdog as a batch tool that runs and produces output,
not as a live retrieval layer I query mid-task. The tools work; the
habit doesn't.

**Why it keeps happening:** the tools I need for specific answers
(edge counts, vertex lookups, recent activity) exist, but asking
docdog feels like extra typing compared to the reflexes I already
have. `git log` is shorter than `docdog recent --since HEAD~5`. The
behavior change requires either (a) a hook that surfaces docdog
results automatically, or (b) an interactive prompt-layer that I
reach for instinctively. Neither exists yet. See the wish list in
§Open questions below.

**Type defaulting was right for bulk, wrong as a stopping point.**
All 131 suggestions landed as `references`. That's the safe default
and it was correct for a mechanical pass. But ~10-15 of them are
obvious upgrades waiting to happen:

- `PROPOSAL-003 → DISC-005/007/008` should be `discussed_in` (those
  discussions amended PROPOSAL-003)
- `PROPOSAL-003 → FRICTION-006/008` should be `sourced_from`
  (frictions that motivated specific clauses)
- A few `depends_on`/`blocks` that got flattened to `references`

This isn't a PROPOSAL-010 defect — the spec explicitly says type
assignment is agent judgment and the tool suggests rather than
decides. But it does mean the **next** feature that's worth
proposing is a second-pass triage tool, or a convention where
`suggest-edges` output is reviewed for upgrades before acceptance.
See PROPOSAL-013 open slot below.

**Cosmetic YAML reformatting.** The `yaml` library's stringify
output changed inline arrays to block form and stripped safe
quotes. Content-equivalent and the indexer handles both, but the
git diff is noisy — 43 files touched, most lines unchanged
semantically. A future accept-suggestions CLI should probably
edit the `relationships:` block surgically rather than
round-tripping the whole frontmatter.

## What the numbers tell me

If 131 out of 254 existing edges (+52%) were discoverable
mechanically from body text alone, the initial manual seeding
captured maybe 66% of the signal. That's a reasonable estimate of
how much an unaided author leaves on the table when they write
`related: [X, Y]` lists from memory rather than scanning prose.

For an **orchestrator-scale corpus** with 10x the files, I'd expect
the initial-seeding-completeness ratio to be worse (more prose =
more forgotten references) and the suggest-edges leverage to be
correspondingly larger. Rough guess: 2000+ undeclared edges on a
fresh run over the orchestrator spec folder, with a similar
one-pass accept → reindex closing the loop.

## Open questions / future work

1. **Accept-suggestions as a first-class CLI**, not a throwaway
   script. Takes `--yaml` output from `suggest-edges`, applies
   surgical frontmatter edits (no full round-trip), commits
   atomically. Could fold into PROPOSAL-010 or become PROPOSAL-013.

2. **Type-upgrade pass** — a companion command
   `docdog suggest-type-upgrades` that flags existing `references`
   edges whose source/target pair matches a pattern worth
   reviewing (proposal → friction = probably sourced_from,
   proposal → disc = probably discussed_in, etc.). Still suggests
   rather than auto-applies.

3. **The retrieval habit problem.** Shipping more commands doesn't
   fix the fact that I don't reach for them. A pre-tool-call hook
   that runs `docdog search` on relevant keywords before letting
   me Read a spec file would force the behavior change. Worth
   drafting as a proposal — might be PROPOSAL-014 territory.

4. **Bulk-accept diff noise.** YAML round-tripping changes too
   many lines. Surgical edits only. (Blocked by open question #1.)

## Re-assessment signal

Next session, measure:

- Did I use `docdog search`/`traverse`/`recent` at least once
  during a non-trivial task without prompting myself to do so?
- Did the freshly-upgraded edge types surface through any new
  workflow (e.g. filter-by-type in a search)?
- Did `suggest-edges` find new gaps, or did the graph hold at
  zero suggestions?

If the first answer is still "no," the retrieval habit problem
becomes the next blocker and the wish list should re-rank around
that.
