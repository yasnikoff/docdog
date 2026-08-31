---
id: PROPOSAL-045
title: "One executor for `docdog split` — patterns become plan generators, the plan file carries whether the output is files or records, and regex is refused"
collection: notes
status: shipped
date: 2026-08-27
description: "`docdog split` has two modes that disagree, and the disagreement is an accident of history: `--on`/`--depth` execute a rule directly and produce sibling files with no edges, while `--format plan`/`--apply-plan` execute a reviewed list and produce child records with `part_of`. Two axes — who chooses boundaries, and what comes out — got bundled into one flag each. This unbundles them. `--on`/`--depth` become pre-population selectors for `--format plan`, which makes pattern mode the last rule in the splitter to be demoted from actor to candidate generator (PROPOSAL-024→028 for edges, PROPOSAL-039 for descent, this for patterns). The plan header gains `output: files | records` so the output shape is a property of the plan rather than of which command you typed, and `parent_id` becomes optional, which is what lets the ingest case — a foreign document with no id, which `planForFile` refuses outright today — through the unified path at all. Pattern mode inherits the three guards it lacks: boundary echo verification, all-or-nothing staging, and the unconditional scan-coverage report. Regex is refused with reasons, and the multi-pattern gap it would have been reached for is closed instead by making `--on` repeatable, which is parity with the `split_on` list PROPOSAL-034 already shipped."
severity: n/a
relationships:
  - extends: PROPOSAL-039
    context: "the plan file becomes the only executor rather than the second of two; guard 4 (no generate-and-apply without review) is respected rather than worked around, and the `output:` key is what lets its `applyPlan` cover the case its own `NO_PARENT_ID` refuses"
  - extends: PROPOSAL-038
    context: "keeps §1 entirely — a pattern stays a structural predicate over heading nodes, which is what makes `--on` worth preserving as a selector — and removes only its executor role; §3's refusal is unchanged and now applies on one path instead of two"
  - references: PROPOSAL-034
    context: "the reason regex is refused rather than weighed: the multi-cohort gap regex would be reached for was already solved with a list, and shipped on the config side, so the CLI is the half that is missing rather than the language"
  - references: PROPOSAL-028
    context: "the generator → review → apply shape this instantiates for boundaries, and the source of the two guards pattern mode is missing: round-trip symmetry in one module, and every write computed in memory before any file is opened"
  - references: DD-072
    context: "unchanged and the reason `output: files` must exist: a files-mode child mints no `part_of`, so the mode has to be declarable rather than inferred from whether the source happened to carry an id"
  - references: DD-068
    context: "the format-commitment objection, applied to regex in `split_on`: a pattern language in every adopter's config.yaml is a shape docdog owns forever, and JS RegExp semantics in YAML is the version of that with the worst failure mode"
  - references: PROPOSAL-041
    context: "the delivery channel for the rewritten ingest skill — a seed docdog update maintains, which is why changing what the skill teaches is now a shippable act rather than a note in a release"
  - references: FRICTION-039
    context: "the repair that made patterns structural; this proposal is what that repair implies once PROPOSAL-039 exists, since a predicate over heading nodes is a fine way to *nominate* boundaries and a poor way to assert them"
  - references: DP-001
    context: "the tier argument runs the opposite direction from most proposals here: this removes a decision from code rather than declining to add one, because `--on` asserting that every matching heading begins a separate idea is the claim descent was forbidden from making"
---

# PROPOSAL-045: one executor, and the plan says what comes out

## Problem

`docdog split` has two modes and they disagree about everything except the
word `split`. PROPOSAL-039 said so in passing — *"the old `--on` / `--depth`
pattern mode is untouched"* — and shipped a second mode beside the first
rather than reconciling them. This is that reconciliation.

The disagreement is **two independent axes bundled into one flag each**:

| | who chooses boundaries | what comes out |
|---|---|---|
| `--on` / `--depth` | a **rule** applied uniformly | sibling **files**; source retired to `.index.md` and deleted; ids parsed from heading text; **no edges**; `--update-config` *removes* the source's scan entry |
| `--format plan` → `--apply-plan` | a **reviewed list** | child **records**; parent stays live with its id and framing prose; `part_of` per child (DD-072); `--update-config` is *additive only* |

Nothing about *"I know the pattern"* implies *"retire the source and mint no
edges."* The pairing is historical: pattern mode was built for pre-docdog bulk
ingest of a foreign document, plan mode for composing a record that already
exists. Both jobs are real. Neither needs its boundary-selection mechanism
welded to its output shape.

Three consequences, in increasing severity.

**1. The rule still acts.** Pattern mode is the last input in the splitter that
executes its own selection. PROPOSAL-039's argument against descent-as-default
was that *"a mechanical heuristic standing in for a judgment call is exactly
the shape DP-001 exists to catch"* — and `--on "## DD-"` asserts, uniformly and
unreviewably, that every matching heading begins a separate idea. That is the
same claim descent was forbidden from making, hard-coded by the caller instead
of computed by the tool. The tier objection does not care which.

**2. Pattern mode is missing three guards plan mode has**, and they are not
cosmetic:

- **No boundary echo verification.** The plan carries `at:` alongside the
  outline ordinal precisely so "the source changed under this plan" becomes a
  refusal. Pattern mode re-derives boundaries at write time and cannot notice.
- **No all-or-nothing staging.** `splitFile` writes file-by-file with a
  `skipped` counter; PROPOSAL-028's rule — every write computed in memory
  before any file is opened — was adopted by `applyPlan` and never
  back-ported. A pattern split that hits an existing file halfway leaves a
  half-written directory and a source that may or may not still exist.
- **No unconditional coverage report.** Plan mode always says whether
  `scan_paths` reaches the children, because the failure is silent. Pattern
  mode prints a conditional "Note:" nudge, and only when `--update-config` was
  *not* passed.

**3. The unified path is blocked by one line.** `planForFile` throws
`NO_PARENT_ID` when the source declares no `id:`. A foreign document being
ingested has none. So plan mode **cannot run on the ingest case at all**, which
is why "just use the plan file" is not today an answer to anything.

## Design

### 1. `--on` / `--depth` become pre-population selectors for the plan

Today `--format plan` refuses them outright — *"--format plan emits boundaries
for review; --on and --depth apply them directly. Give one or the other."*
Lift that refusal and invert the relationship:

```
docdog split f.md                                → report; write nothing (unchanged)
docdog split f.md --format plan                  → boundaries at descent's suggested depth
docdog split f.md --format plan --on "## DD-"    → boundaries at every matching heading
docdog split f.md --format plan --depth 3        → boundaries at every H3
docdog split --apply-plan p.yaml                 → the one executor
```

The selector chooses which outline entries arrive pre-populated in `sections:`.
That is all it does, and it is what a rule was always good for. Everything the
plan already guarantees then applies to a pattern-selected split for free.

**`--on` becomes repeatable.** The predicate is already
`matchesAnyPattern(h, patterns)` over an *array*; the CLI passes a
one-element array while config's `split_on` has accepted a list since
PROPOSAL-034. Today two `--on` flags silently take the last one. This is a
commander collector and the parity is overdue.

**`--on` / `--depth` no longer execute.** Passing either without
`--format plan` is an error naming the two-command form. No deprecation shim:
the repo has removed whole command cohorts before (v3 step 6), `templates
refresh` was absorbed into `update` in this release, and the rewritten `ingest`
skill reaches adopters through `docdog update` as an ordinary seed refresh
(PROPOSAL-041) rather than through a release note nobody reads.

### 2. The plan header carries the output shape

```yaml
version: 2
source: specs/architecture.md
output: files            # or: records
collection: decisions
sections:
  - heading: 3
    at: "DD-ARCH-01 Storage"
    id: DD-ARCH-01
    title: Storage
```

- **`output: records`** — today's `applyPlan`. Requires `parent_id`. Each child
  gets `part_of` pointing at it; the parent is rewritten down to its framing
  prose plus a roster; coverage is fixed by `addScanPath` (additive).
- **`output: files`** — today's `splitFile` tail. `parent_id` is absent and that
  is legal. No `part_of` is minted. The source becomes `<base>.index.md` and is
  deleted; coverage is fixed by `updateConfigAfterSplit` (which *removes* the
  source's entry, correct here and only here, because the source stops being a
  record).

**Default:** `records` when the source declares an `id:`, `files` when it does
not. Printed in the plan header either way, and overridable — DP-001 tier 2, a
visible default with an explicit override, never an inference the reader has to
reconstruct.

**Two relaxations that `output: files` needs to be faithful to today:**

- **`description:` is not required.** PROPOSAL-039 guard 2 refuses an empty
  description because a description-free *record* is worse than a bare edge —
  fts5 indexes it and it has nothing to say for itself. A files-mode child is
  the artifact pattern mode writes today, which carries no description at all,
  and nothing declares `part_of` it. The guard stays exactly as-is under
  `output: records`.
- **`id:` may be empty**, meaning "no `id:` key in the child's frontmatter" —
  what `fm.id = id ?? undefined` produces today for a heading that carries no
  id. The renderer fills it from `parseHeading(entry.text)` when the heading has
  one.

Together these are what keep bulk ingest at **one extra command and zero extra
judgment**:

```
docdog split arch.md --format plan --on "## DD-" > p.yaml && docdog split --apply-plan p.yaml
```

That is the honest cost of the unification, stated rather than hidden. What it
buys is that the boundary list is visible before anything executes, on the mode
where "the pattern matched 40 of 41 headings" is currently discovered by
reading the output directory afterwards.

### 3. One validator, one staging, one coverage report

`applyPlan` branches on `plan.output` for exactly three things: the child
frontmatter shape, what happens to the source, and which coverage function
runs. Everything else is shared and stays shared — parse, validate, the
partition walk, in-memory staging, collision detection, the over-cap report,
and coverage *detection*, which is unconditional in both modes because the
failure it catches is silent in both.

`splitFile`'s executor role is deleted. Its section-writing body moves into the
files branch of `applyPlan`.

### 4. Two sharp edges closed on the way past

- **Zero matches is an error when a selector was given.** `--format plan --on X`
  matching nothing writes no plan, says so on stderr, and exits non-zero.
  Today's `No matches` exits **0**, so a script or agent wrapping it sees
  success. Zero matches with *no* selector — descent found no depth that fits —
  keeps today's behavior: `sections: []` with the explanation in comments, exit
  0, because that is a fact about the document rather than a failed request.
- **The no-selector report names every form.** An id-bearing file is currently
  told only about `--format plan`; an agent that looks before splitting — the
  behavior the report exists to encourage — never learns `--on` exists.

## Why not regex

Asked directly, and refused, in the register PROPOSAL-034 used for
auto-fallback: the evidence argues for the smaller fix.

**It does not buy what the failures need.** Three ways a caller gets this
wrong: writes a regex, omits the `#` markers, needs two cohorts. Only the third
is real expressiveness, and PROPOSAL-034 **already solved it with a list** and
shipped it — on the config side. §1's repeatable `--on` is the missing half.
Adding a pattern language to fix multi-cohort is re-solving a solved problem
with a bigger tool.

**It is a silently breaking overload.** `split-pattern.ts` documents
`### [TASK-` as a valid literal prefix — *"the prefix may include literal
brackets."* Reinterpreting `--on` as regex changes that pattern's meaning
without erroring, for exactly the corpora that write bracketed ids.

**It is a durable on-disk format, not just a flag.** `parseSplitPattern` is
shared by the CLI and the indexer-time parser, so regex lands in every
adopter's `config.yaml` as `split_on:` — JS `RegExp` semantics leaking into
YAML, owned forever. That is DD-068's objection to inline metadata patterns,
arriving in a different costume.

**It converts a loud failure into a quiet one.** `{depth, prefix}` is checkable
by eye and fails at zero matches with the outline printed beside it. A regex
fails at *39 of 41 matches*, and under today's direct execution you find out by
reading the output directory.

**The better escape hatch already exists.** Anything a regex could select, the
plan file selects by ordinal, with review. DP-003 clause 3 licenses building a
tool when the workaround is reached for repeatedly — here the workaround is
strictly more expressive than the tool would be.

DP-001 does **not** forbid regex: the author declares it explicitly, so it stays
tier 2. It is refused on evidence, not on principle, and that distinction is
recorded here so a later proposal is not told it has a principle to overcome
that it does not.

**If it is ever built anyway**, the bounded shape is: a separate key
(`--on-regex` / `split_match: regex`), never an overload of `--on`, so a
literal `## [TASK-` cannot change meaning; anchored to heading *text* at a
declared depth, so it stays a structural predicate with a freer matcher rather
than a program over raw lines; and preview-mandatory — which is to say it emits
a plan rather than executing, which is this proposal arriving from the other
direction.

## What this does not include

- **No change to index-time splitting.** `split_on` in `config.yaml` keeps
  executing directly, and the "a rule must not act" argument deliberately does
  not reach it: index-time splitting produces **cache rows, not files**. It is
  a read, it is re-derived from disk on every `docdog index`, and a wrong
  `split_on` costs a reindex rather than a shredded document. There is nothing
  to review and nowhere to put the review.
- **No MCP tool.** Splitting is a filesystem operation on a path; DD-070 §4's
  parity rule is satisfied by the CLI, and the body-bearing-write exception
  does not apply.
- **No new relation type, no schema bump, no ranking change.** DD-072 clause 4
  and OBS-018 are untouched.
- **No `--auto-apply`.** PROPOSAL-039 guard 4 stands. The two-command form is
  the point, not an obstacle to be optimized away later.
- **No `--keep-source`.** Pattern mode's *"don't rename the source, for safety
  during testing"* flag does not survive, decided during implementation when
  both agents found the proposal silent on it. Its purpose is now served by the
  plan file plus `--dry-run` — the boundaries are visible before anything
  writes, which is the whole of what the flag was for. It has no meaning under
  `output: records`, where the parent must be rewritten because it keeps its id
  and its inbound edges. And under `output: files` it is a corpus footgun: the
  source stays a scanned record while every section becomes one too, so the
  same content is indexed twice. Pattern mode shipped it; that is not an
  argument that it was right.

## Principle walk

- **DP-001.** Runs the unusual direction: this **removes** a decision from
  code. Pattern mode's uniform assertion about where ideas divide becomes a
  nomination the agent reviews (tier 3 → tier 1 nomination + human judgment).
  `output:`'s default is tier 2 — visible, printed, overridable. Nothing new
  infers anything.
- **DP-002.** No new vocabulary. `output:` is a plan-file key alongside
  `version` / `source` / `collection`, not a concept an agent must infer from a
  token; `part_of` is unchanged and files mode mints none by design.
- **DP-003.** Clause 3 is **not** firing — no new command, no new escape hatch.
  This is a merge of two surfaces into one, which is the rarer and healthier
  direction for a CLI to move.
- **DD-034 / shape-preserving.** The artifact on disk is what it was; the plan
  file is a transient the agent edits and discards.
- **DD-070 §4.** CLI-only, and the surface **shrinks**: four modes become three.

## Acceptance

1. `--format plan --on "## DD-"` emits a plan whose `sections:` are exactly the
   matching headings, in document order, with `output:` in the header.
2. Two `--on` flags select the union of both cohorts, in document order.
3. `--on` or `--depth` without `--format plan` is an error naming the
   two-command form; nothing is written.
4. `--format plan --on X` matching nothing writes no plan and exits non-zero;
   no selector and no fitting depth still emits `sections: []` and exits 0.
5. `--apply-plan` on `output: files` reproduces today's pattern-mode result
   byte-for-byte: same child files, same frontmatter, `<base>.index.md` written,
   source deleted, no `part_of`.
6. `output: files` accepts an empty `description:` and an empty `id:`;
   `output: records` refuses an empty description unless overridden, unchanged.
7. A plan with `output: records` and no `parent_id` is refused; one with
   `output: files` and no `parent_id` applies.
8. A files-mode plan that would overwrite an existing file writes **nothing**,
   including no `.index.md` and no source deletion.
9. Apply reports scan coverage on both output modes.
10. A source edited between plan and apply is refused by the `at:` echo on both
    modes.

## Test plan

- `tests/unit/split-plan.test.ts` — `output:` parse/render/validate both ways,
  version 2, unknown-output hard error, optional `parent_id`, the two
  relaxations scoped to files mode only.
- `tests/unit/ingest.test.ts` — the files branch against the existing
  pattern-mode expectations (criterion 5 is the regression bar), all-or-nothing
  staging, both coverage functions firing on the right mode.
- CLI-level: selector-without-plan error, repeatable `--on`, exit codes.

## Implementation (2026-08-27)

All ten criteria, **589 → 638 tests**, lint and build clean, `docdog index`
clean on the real corpus. Every criterion was afterwards re-verified
end-to-end against the built CLI rather than only through unit tests, which
is how item 6 below was found. `splitFile` / `SplitOptions` / `SplitResult` are
deleted; `matchesAnyPattern` widened from `HeadingInfo` to a structural
`HeadingLike {depth, text}` so an `OutlineEntry` can use the same predicate,
which is what lets `--on` nominate plan boundaries without duplicating it.
Index-time splitting is untouched, as scoped.

Five decisions the design left implicit, one of which is a behaviour change
rather than a detail:

1. **Criterion 5's byte-for-byte parity has exactly one carve-out, and it is
   an improvement.** Old `splitFile` ended each section at the next heading of
   the *same-or-shallower* depth, so a **non-matching sibling between two
   boundaries was silently dropped** — `## DD-01 … ## Notes … ## DD-02` lost
   `## Notes` entirely, from the files and from the corpus. Plan boundaries
   **partition**, so it is absorbed into the preceding child instead. This is
   not negotiable in the unified design: partition is what makes "delete an
   entry to merge it upward" true, and PROPOSAL-039 made that the reviewer's
   most common edit. Silent content loss was the old default and it should not
   have been. Pinned by its own test. Every pre-existing pattern-mode test is a
   contiguous single-depth cohort, so all of them are byte-identical either
   way — which is why this was invisible until the modes met.
2. **`output:` is required in a *parsed* plan, never defaulted.** The default
   applies when the plan is *emitted*. An absent key is reachable only by hand
   deletion, and guessing there would guess whether the source survives.
3. **A leftover `parent_id:` under `output: files` is accepted and ignored.**
   Refusing it (loud over quiet, normally right here) would break the override
   path: editing one word in an emitted plan is how you change modes, and a
   records-mode plan always carries `parent_id`, so a refusal turns a one-word
   override into a two-edit trap.
4. **No `--output-mode` flag.** The override is editing the plan, which is
   where every other boundary decision already lives. A CLI flag would be a
   second way to say it, and the two could disagree.
5. Two signature changes with no callers outside the four files:
   `ApplyPlanOptions.output` → `outputDir` (`plan.output` now means the mode),
   and `ApplyPlanResult.parentId` is nullable.

6. **One regression the unit tests could not see, found by typing the
   commands.** The unified no-selector report dropped `--collection` from the
   command it suggests. A source with no declared `collection:` cannot emit a
   plan without being told one — so the first command an agent copies out of
   the report fails, and it fails on the **foreign document**, which is the
   case this proposal exists to bring onto the plan path at all. The old
   pattern-mode report named the flag; the rewrite lost it. Fixed, and the
   hint lines were extracted to `describeNextSteps` for the same reason
   `describeDescent` was extracted: *a line the report prints is a line
   something has to be able to check.* Five tests, **648 → 653**. The general
   lesson is the one that made it worth writing down: a unit suite that
   exercises `planForFile` directly can be green while the sentence telling a
   human how to reach `planForFile` is wrong — **suggested commands are part
   of the surface, and the only test for one is running it.**

## Not filed separately

The two sharp edges in §4 were offered as friction records and folded in here
instead: both are fixed by this proposal's own implementation, and a FRICTION
record whose resolution is "see the proposal that was already open" is
bookkeeping rather than signal. If this proposal is rejected, they should be
filed.
