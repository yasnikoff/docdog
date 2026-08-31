---
id: WF-006
title: "Friction resolve — drain the open friction backlog through docdog's retrieval surface"
collection: workflows
status: current
date: 2026-04-14
description: "How to deliberately work down the open friction backlog while stress-testing docdog's retrieval layer. Docdog is the primary working tool at every step; bypass only when blocked and log the bypass. Composes with WF-002 (capture side) and WF-004 (code-change loop)."
relationships:
  - references: DD-036
    context: "DD-036 made process workflows first-class artifacts under .docdog/workflows/"
  - references: WF-001
    context: "DISC-017 — the discussion that designed this workflow — was captured under WF-001"
  - references: WF-002
    context: "WF-006 is the drain side of the pipeline whose capture side is WF-002; WF-002's OBS records feed WF-006 step 1, and WF-006 step 4 can produce WF-002 observations"
  - references: WF-004
    context: "WF-006 step 6c delegates the actual code change to WF-004 rather than re-specifying the code loop"
  - references: DP-001
    context: "WF-006 step 5 mandates walking every DP as a design lens; FRICTION-008 is the motivating case"
  - references: DISC-017
    context: "design discussion that produced this workflow"
  - references: FRICTION-008
    context: the motivating precedent for escalate-to-redesign and surface-before-fixing
---

# WF-006: Friction resolve

## Trigger

A session dedicated to working down the open friction backlog, or
any task whose goal is "fix FRICTION-NNN" rather than "ship feature
X." Also: end-of-milestone cleanup passes where the user wants to
drain accumulated frictions before moving on.

**Not triggered by:** incidentally hitting friction during other
work — that's the capture side, WF-002. If you *notice* a new
friction mid-task, log it per WF-002 and keep going; don't switch
workflows mid-stream.

## Why

Docdog's value is the retrieval layer it provides to agents. Every
friction-resolve session is an opportunity to exercise that layer
under realistic conditions — survey, pair-detection, adjacency
discovery, cross-friction search, dedup checks. Shipping the fix is
the visible output; exercising retrieval is the point. A session
that closes a friction without a single docdog query has shipped
something, but it has not done this workflow.

## How this workflow uses docdog

**Docdog is the primary working tool at every step.** Surveying the
open set, picking a friction, discovering related context, finding
adjacent code, checking for pairs, verifying the fix is retrievable
— all of these go through `docdog search`, `docdog_search`,
`docdog_get`, `docdog_traverse`, `docdog_concepts_search`, or
`docdog_relate` first.

Filesystem, grep, and direct `Read` are permitted **only** when
docdog itself is blocking the step. When that happens, the bypass
itself is captured as a new FRICTION or OBS *in the same session*
— that is the primary value the bypass produces. A friction-resolve
session with zero docdog queries is a workflow violation regardless
of whether the fix shipped.

## Dedupe before capture

Any time this workflow would produce a new OBS or FRICTION
(whether from a bypass, a dual-track compare, a pair-check miss,
or an adjacency-scan miss), **first search existing observations
and frictions for a prior match**. If a prior record already names
the gap, reference it in this session's work instead of writing a
duplicate. The dedupe rule applies workflow-wide; individual steps
below don't re-state it.

## Steps

1. **Survey open frictions and offer the user a menu of
   approaches.** Enumerate them with `docdog list --status open`,
   narrowing by `--collection` or `--where severity=…` as needed.
   Use `list`, not `search`: the survey is a completeness claim,
   and ranked retrieval cannot make one — a record can match the
   filter and still fall below a query's recall (FRICTION-036,
   resolved). Every survey before this one ended in a filesystem
   grep for exactly that reason; that detour is now unnecessary,
   and reaching for it again is itself the signal to log.
   Present the user with a menu:
   - *highest severity first* (blocks-work → inconvenient →
     cosmetic)
   - *oldest open first*
   - *by theme* (e.g. "all indexer frictions", "all gc
     frictions" — discovered via `docdog_concepts_search` or
     traversal, not grep)
   - *user names one* (`FRICTION-NNN`)
   - *agent picks* (state the reasoning; user can override)

   Wait for the user's choice. Don't unilaterally pick.

2. **User picks.** Record the choice (which friction, which
   approach) in the session context. If the user picks an
   approach rather than a specific id, run the approach's query
   and pick the top candidate, confirming with the user before
   moving on.

3. **Pair check via docdog.** Before touching the chosen
   friction, query docdog for any other open friction sharing a
   relationship target, a theme, or an adjacent code surface. If
   one surfaces, present it to the user as a candidate pair with
   one-line reasoning. The user decides whether to pair. If the
   pair check returns nothing but you later discover the pair by
   other means, that is a retrieval miss — log it.

4. **Read the friction and every related target via both paths,
   then compare.**
   - *Docdog path:* `docdog_get FRICTION-NNN`, then `docdog_get`
     or `docdog_traverse` for every entry in `relationships:`.
   - *Direct path:* `Read` the friction file and related files
     directly.
   - *Compare.* Did both surface the same content? Did docdog
     miss something the file had, or vice versa? Did traversal
     pull in context you wouldn't have found by reading the
     file alone?
   - If the comparison surfaces something new and distinct,
     capture per WF-002 (subject to the workflow-wide dedupe
     rule).

5. **Apply every DP-NNN as a design lens to the candidate fix.**
   Walk the principles one at a time and ask: does the fix
   *honor* the principle, or does it patch around a violation?
   If the latter, escalate to redesign rather than shipping the
   patch. FRICTION-008's resolution (kill `deleted_ttl_hours`
   entirely rather than hedge with opt-in) is the motivating
   case — the small patch would have locked in a Tier-3
   violation.

6. **Adjacency scan, surface, implement.**

   **6a. Adjacency scan via docdog.** Before designing the fix,
   query docdog for: (i) every spec/decision/proposal
   referencing the friction's subject, (ii) every other open
   friction sharing any related node, (iii) concepts matching
   the friction's theme. The goal is to find work the friction
   file *didn't* name. If docdog returns nothing where grep
   would later find something, that is a retrieval miss — log
   it.

   **6b. Surface judgment calls to the user.** Before writing
   code, surface any scope / irreversibility / naming /
   compatibility decisions the agent can't make alone. Wait for
   explicit alignment. FRICTION-008 only became "kill the field
   entirely" after this surfacing step.

   **6c. Implement via WF-004.** If the resolution is a code
   change, enter WF-004 with the task brief = friction file +
   adjacency findings from 6a + alignment from 6b. If the
   resolution is *not* a code change (won't-fix, obsoleted,
   already-fixed-by-X), skip to step 7 directly.

7. **Write the structured resolution onto the friction file.**

   **Frontmatter augmentation:**
   ```yaml
   status: resolved
   fixed_date: YYYY-MM-DD
   resolution_approach: redesign | patch | obsoleted | wontfix | paired
   fix_commit: <full sha>
   relationships:
     # extend with every spec/decision/proposal the fix touched or created
   ```

   **Prose section** (`## Resolution (YYYY-MM-DD)`), four
   parts:
   1. *Approach taken and why* — one or two sentences. The
      "why" is what future retrieval surfaces.
   2. *What shipped* — bullets citing concrete code changes and
      tests added.
   3. *Rejected alternatives* — even one line. Without this the
      section is just a changelog; with it, a future agent
      searching for "we tried X, chose Y" lands here.
   4. *Knock-on effects* — frictions obsoleted, proposals
      closed out, records that now need updating.

8. **Reindex, commit, capture WF-002 observation if warranted.**
   Run `docdog index`. Commit with
   `fix: FRICTION-NNN — <desc>` (or `feat: FRICTION-NNN — <desc>`
   when the fix introduces a new surface); note knock-on
   effects in the commit body. If the session surfaced anything
   notable beyond the per-step captures (a pattern worth
   generalizing, a cross-friction insight), capture it per
   WF-002 subject to the dedupe rule.

## Produces

- The target friction file updated to `status: resolved` with
  augmented frontmatter and a structured resolution section.
- Zero or more new FRICTION records for docdog retrieval gaps
  hit during the session (bypass, pair-check miss,
  adjacency-scan miss).
- Zero or more new OBS records per WF-002 triggers.
- One git commit (or two, when a pair was resolved together).

## Terminal states

- **Resolved:** target friction closed, resolution section
  written, commit landed, index rebuilt.
- **Obsoleted:** the chosen friction turned out to already be
  fixed, or to be masked by a different resolution. The
  frontmatter flips to `status: resolved` with
  `resolution_approach: obsoleted` and the prose section
  explains what obsoleted it and when.
- **Deferred:** the agent surfaced a judgment call in 6b that
  the user wants to take to a separate discussion first. The
  friction stays `open`; the session produces a DISC record per
  WF-001 instead of a fix commit.
- **Blocked on docdog:** retrieval itself was the blocker and
  even the bypass couldn't complete the step. The session
  produces a new FRICTION against docdog and the original
  friction stays `open`.

## Notes

- A friction-resolve session with zero docdog queries is a
  workflow violation regardless of whether the fix shipped. If
  you find yourself reaching for `Read` and `grep` by reflex,
  pause and ask whether docdog would have answered first.
- The "rejected alternatives" line in the resolution section is
  the single highest-leverage piece of retrieval payload this
  workflow produces. Don't skip it even when it feels obvious.
- Pairing is a retrieval check, not an intuition. If you find a
  pair without docdog finding it, the pair is evidence *and* a
  meta-FRICTION.
- Composition with WF-004 is load-bearing: WF-006 owns the
  pre-code discovery and the post-code resolution shape; WF-004
  owns the code loop itself. Don't duplicate WF-004 steps here.
