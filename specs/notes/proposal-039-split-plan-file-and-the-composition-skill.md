---
id: PROPOSAL-039
title: "A plan file for `docdog split`, and a shipped composition skill — because choosing where a document divides is tier 3, so the tool must be able to be told boundaries rather than infer them"
collection: notes
status: shipped
date: 2026-07-29
shipped_date: 2026-07-29
description: "Splitting at semantic boundaries is DP-001 tier 3 by definition, which makes it agent work and makes the tool's job to execute a decision it did not make. Today it cannot: every input docdog split accepts is a rule (--on pattern, and PROPOSAL-038 would add --depth), so an agent that has decided boundaries semantically has no way to express them. Adds the plan-file round trip this repo has already shipped twice — `split --format plan` emits the heading outline with char counts and descent's suggestion, the agent edits boundaries and writes titles and descriptions, `split --apply-plan` executes and mints part_of edges per DD-072. Ships a composition skill through templates/skills/_common/ so an adopting project inherits it at init rather than reinventing it. Explicitly unmeasured, with the reasons that bound the guess recorded."
relationships:
  - discussed_in: DISC-034
    context: "the parent thread; this is its open half — record-splitting proper — reopened from the direction the thread did not take, that the boundary choice is judgment and belongs outside the code"
  - discussed_in: DISC-035
    context: "the follow-on that recorded the TOC-parent distractor hazard; the skill's rule that a parent keeps framing prose is the cheap hedge against it"
  - references: PROPOSAL-038
    context: "the mechanical prerequisite, and the proposal this amends: its size-driven descent is demoted from default action to reported diagnostic, because a mechanical heuristic standing in for a judgment call is the shape DP-001 exists to catch"
  - references: DP-001
    context: "the principle that produces the whole design — where a document divides into ideas is inference about meaning, so the tool may compute and report but never choose"
  - references: DP-004
    context: "the test the skill carries: is the tail a different idea or the same idea in detail; and the reason 'leave it alone' must be a first-class outcome rather than a fallback"
  - references: DD-072
    context: "the edge direction this executes mechanically — the child declares part_of, the parent declares nothing, so apply-plan writes edges only into the new files"
  - references: PROPOSAL-028
    context: "the pattern being reused: --format review, agent edits, --accept-from; one module owning the format both ways is that implementation's proven property and should be repeated here"
  - references: DP-003
    context: "clause 3 firing again — hand-splitting a document and hand-writing its frontmatter is the escape hatch, and the plan file is the toolbelt gap it reveals"
  - references: OBS-014
    context: "the validator lesson: every accepted item must be in the tool's own emitted candidate set, or an agent invented it — applied here to boundaries instead of edges"
  - references: OBS-019
    context: "the measurement that keeps 'leave it alone' honest — over-cap records retrieve well, so nothing licenses a skill that always finds a split"
  - references: PROPOSAL-031
    context: "the promotion path for derived child ids; renumber exists precisely so a provisional derived id can become a first-class one later"
  - references: PROPOSAL-019
    context: "the skills channel this ships through; templates/skills/_common/ is seeded at init, which is what makes an adopting project inherit the skill rather than reinvent it"
---

# PROPOSAL-039: tell the tool where to split

## Problem

Two statements, and the second follows from the first.

**Choosing where a document divides is DP-001 tier 3.** Not merely *suited* to
an agent — forbidden to code. "Is this section a different idea, or the same
idea in more detail?" is inference about meaning, which is the category docdog's
code does not enter.

**The tool cannot be told the answer.** Every input `docdog split` accepts is a
*rule*: `--on "## DD-"` today, `--depth <n>` under PROPOSAL-038. Both describe a
pattern the tool then applies uniformly. An agent that has read a document and
decided its boundaries semantically — merge these two sections, split that one
in the middle, leave that one alone — has **no way to express that decision.**

That is the gap. It is not a missing parser; FRICTION-039 covers the parser. It
is a missing *input shape*.

## Amendment to PROPOSAL-038

PROPOSAL-038 §2 proposed size-driven descent as **the default when no flags are
given** — the tool picks a heading depth and acts on it, tier 2.

That is mis-tiered, and this proposal corrects it. A mechanical heuristic
standing in for a judgment call is exactly the shape DP-001 exists to catch:
"every piece fits under the cap" is a fine *fact* and a poor *decision*, because
it optimizes the one property that OBS-019 measured does not predict retrieval
quality.

**Descent is retained and demoted.** Same computation, reported rather than
applied: at each heading depth, what pieces would result and how large is each.
It becomes the strongest input the agent reads, and stops being the actor.

PROPOSAL-038 §1 (AST matching) and §3 (refuse, never cut blind) are unchanged.
§3 improves — a refusal now has somewhere to go instead of being a dead end.

## The plan file

The round trip this repo has shipped twice already (PROPOSAL-024 → 028 for
edges, and DP-003 clause 3's third instantiation):

```
docdog split <file> --format plan > plan.yaml
#   tool emits: heading outline with depth, per-section char counts, cumulative
#   sizes, over-cap flags, and descent's proposal — labelled as a suggestion
#
#   agent edits: merges sections, moves boundaries, drops some, and writes each
#   resulting piece's title, description, collection and id
#
docdog split --apply-plan plan.yaml
#   tool executes: writes child files with frontmatter, mints the part_of edge
#   from each child to the parent (DD-072), rewrites the parent, reports
```

The split of labour is exact. The tool owns everything derivable from the
document — structure, sizes, offsets, edges, file writes. The agent owns
everything that requires reading it — where the ideas divide, what each one is
called, what its description says.

### Guards, each with precedent

1. **Every plan boundary is validated against the AST the tool emitted.** A
   boundary that is not a heading node in that file is a hard error, never a
   best-effort match. This is OBS-014's lesson transposed from edges to
   boundaries: the validator lives outside the agent, because an agent that
   invents a boundary must be caught the same way one that invented an edge was.
2. **An empty description is refused by default**, with an explicit override
   flag. PROPOSAL-028 made this call after OBS-011's context backfill, and a
   description-free child is worse than a bare edge — fts5 indexes it and the
   record has nothing to say for itself.
3. **All writes are computed in memory before any file is opened.**
   PROPOSAL-028's third implementation fact, and it matters more here: a plan
   that fails halfway must not leave a document half-shredded.
4. **There is no `--auto-split-all`.** The `--accept-all` analogue, tier 3,
   recorded here as never-build so a later proposal cannot assume otherwise.
   A batch mode over an *already-reviewed* plan set is fine; a mode that
   generates and applies without review is not.

### Child ids — decided

DISC-034 left this open; the plan file forces it. **Derived from the parent by
default** (`DD-070-01`, `DD-070-02`), **overridable per section in the plan.**
Derived is mechanical, traceable, and collision-free without consulting a
sequence that goes stale within a session. `docdog renumber` (PROPOSAL-031) is
the promotion path for a child that later earns a first-class id — which is what
renumber was built for.

## The skill

`templates/skills/_common/` is seeded into every project's `.docdog/skills/` by
`docdog init`, alongside `index`, `ingest`, `populate`, `relate` and `search`.
That is the channel that makes an adopting project **inherit** this rather than
reinvent it, which is the stated goal.

Beyond the mechanics of the plan round trip, the skill must carry four things:

- **DP-004's third question as its central test** — *is the tail a different
  idea, or the same idea in detail?* Long is not the defect; plural is.
- **"Leave it alone" as a first-class outcome the skill genuinely reaches.**
  DP-004 is `proposed`, not accepted, and OBS-019 measured that over-cap records
  retrieve *well* — the truncated prefix is often the better vector. A skill
  that always finds a split would quietly ratify a principle no measurement
  supports, and would be wrong on precisely this repo's narrative records.
- **The parent keeps framing prose, not just a table of contents.** DISC-035's
  hazard (d): a pure TOC is about everything its children are about and contains
  none of it. It cannot be un-indexed to dodge this, because every inbound
  `part_of` edge would dangle.
- **Git first, one record at a time, never a corpus sweep.**

## On shipping this unmeasured

Deliberate, and the reasons that **bound** the guess are worth recording so this
does not read as abandoning the evidence discipline that produced OBS-016
through OBS-020.

Chunking, late chunking and raising the cap each changed **retrieval mechanics
globally**, for every query and every record, reversible only by re-embedding.
This changes **no ranker** — DD-072 clause 4 and OBS-018 are untouched. It
changes the corpus, one record at a time, under review, in git. A wrong guess
costs one record and a revert.

**And the skill records what it did** — which record, which boundaries, on what
reasoning. That is roughly ten lines of skill text and it is the difference
between an *unmeasured* feature and an *unmeasurable* one: if suite 2 is ever
built (DISC-035, DISC-036), there is a population of splits and a before-state
in git to measure it against.

## What this does not include

- **No MCP tool.** Splitting is a filesystem operation on a path; the CLI parity
  rule (DD-070 §4) is satisfied by the command, and the body-bearing-write
  exception does not apply. The agent edits the plan file with its own file
  tools.
- **No new relation type.** DD-072 settled it.
- **No schema bump, no config key, no ranking change.**
- **No measurement.** Named above rather than omitted.

## Acceptance

1. `--format plan` on a multi-section file emits every heading with depth, char
   count, and cumulative size, plus descent's suggested depth marked as advisory.
2. A plan naming a boundary that is not a heading in the source is rejected with
   the offending entry named — not silently dropped, not fuzzy-matched.
3. A plan section with no description is refused unless the override flag is
   given.
4. `--apply-plan` writes each child with `part_of` pointing at the parent, and
   writes no edge into the parent.
5. A plan that fails validation writes nothing at all.
6. `docdog init` seeds the composition skill into `.docdog/skills/`, and the
   packaging test pins template and seed together (PROPOSAL-026).

## Shipped (2026-07-29)

All six criteria, 38 tests in `tests/unit/split-plan.test.ts` plus the
packaging check in `tests/unit/skill-seeds.test.ts` (474 total, green).

- **`src/engine/split-plan.ts`** owns the format both ways — outline, descent,
  render, parse, validate. PROPOSAL-028's round-trip symmetry is the reason it
  is one module and not two.
- **`inspectFile` / `planForFile` / `applyPlan`** in `src/engine/ingest.ts`.
- **`docdog split` gained four modes** and lost its required `--collection`:
  no selector reports, `--format plan` emits, `--apply-plan` executes, and the
  old `--on` / `--depth` pattern mode is untouched. The file argument is
  refused alongside `--apply-plan`, because the plan names its own source and
  two answers to "which file" is one too many.
- **`templates/skills/_common/compose.md`** ships the skill.

Three decisions the design left implicit and the implementation had to make:

1. **Boundaries partition the document.** Each entry owns everything from its
   heading to the *next entry's* heading — not to the next same-or-shallower
   heading. That is what makes "delete an entry to merge it upward" work, it
   is the reviewer's most common edit, and it means preamble plus every child
   body reconstructs the source with nothing orphaned between them. Pinned by
   a test.
2. **Descent measures the same partition**, so the numbers it reports are the
   numbers `--apply-plan` produces — including the unwelcome case where a
   shallower heading after the last boundary is absorbed into the final piece.
   Measuring each heading's own section instead would have read better and
   been a different number from the one you get.
3. **The parent's frontmatter and preamble are preserved by slicing, not
   rewriting.** `raw.slice(0, firstBoundary.startOffset)` keeps the frontmatter
   byte-identical, which matters because a parent is a live record with edges
   and a description, not a leftover.

### Follow-on: scan-path coverage (same day)

Apply now reports whether `scan_paths` reaches the children, and `--update-config`
opts into adding the output directory. The report is unconditional because the
failure is silent — the writes succeed, `docdog index` reports nothing, and the
parent's prose roster points at records that are not in the corpus. Directory
scan paths recurse, so coverage usually already holds; a parent reached by a
*file-level* entry is the case that bites.

The edit is **additive only**, and deliberately not a reuse of
`updateConfigAfterSplit`. That function removes the entry matching the source,
which is right for pattern mode — the source becomes `.index.md` and stops being
a record — and destructive here, where the parent stays live at the same path.
Removing its coverage would un-index it and dangle every inbound `part_of` the
same run just wrote, which is DISC-035's un-index hazard arriving as a side
effect. Two modes, two functions.

It stayed opt-in rather than automatic, matching pattern mode and following the
`.gitattributes` precedent: `docdog index` reports drift and never rewrites it.
`scan_paths` is user-owned policy, and a command that splits one record should
not edit it as a side effect. Detection is tier 1 and always runs; the write is
tier 2 and asks.

The boundary key is the heading's **outline ordinal**, with `at:` carried
alongside as an echo that is verified against it. Heading text repeats within a
document and ordinals do not; the echo is what turns "the source changed under
this plan" from a silent wrong-span write into a refusal.
