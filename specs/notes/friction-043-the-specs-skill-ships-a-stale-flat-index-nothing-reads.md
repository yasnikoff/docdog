---
id: FRICTION-043
title: "the specs skill ships a 159 KB flat index that is stale on the next write and read by nothing but its own SKILL.md"
collection: notes
status: resolved
fixed_date: 2026-08-25
resolution_approach: fix
fix_commit: 9d3c597
description: "docdog skill install specs emits specs.index.md, a committed snapshot of every vertex. It has no invalidation path, so it goes stale on the next spec write — measured missing 12 records hours after generation — and the recipe printed directly above it in the same file reads the live corpus instead."
severity: inconvenient
relationships:
  - references: FRICTION-040
    context: "the previous defect in what `docdog skill install` writes; that one was the shape of the path, this one is the content of the payload"
  - references: FRICTION-036
    context: "`docdog list` is the live, exhaustive enumeration that makes the flat index's prefix-listing use case redundant — the fix for 036 removed this file's last unique job without anyone noticing"
  - references: PROPOSAL-039
    context: "the feature whose output invalidated the index within hours: apply-plan mints child records a snapshot cannot know about, and rewrites the parent the snapshot still summarises"
  - references: PROPOSAL-019
    context: "the skills channel this ships through, and where the fix lands"
---

# The specs skill ships a flat index that is stale on write

## What I was trying to do

Work in an adopting repo (1,170 records) whose `.claude/skills/` holds both
seeded docdog skills. Not navigating anything in particular — the file was
noticed because it is by a wide margin the largest thing in `.claude/`.

## What went wrong

`docdog skill install specs` emits two files. `SKILL.md` is 8.7 KB.
`specs.index.md` is **159 KB / 885 lines**, a line-delimited
`id | collection | path | summary` table over every vertex with an id, and it
is committed to git.

**It is a snapshot with no invalidation path.** Regeneration happens only when
someone re-runs `docdog skill install specs`. Nothing reports that it has
drifted, because nothing can: `docdog update` classifies seeded files by
comparing *shipped template bytes* to *disk bytes*, and this file's authority is
neither — it is the corpus.

Measured at the moment of deletion, hours after its last regeneration:

- All **twelve** child records created that day by `docdog split --apply-plan`
  were missing.
- Its `SPEC-167` row still carried the summary of a document that had since been
  split into four records, so the one row that did exist was actively wrong.

The irony is worth stating plainly: **docdog's own composition feature is what
invalidated docdog's own index.** Any corpus healthy enough to be using
PROPOSAL-039 is a corpus where this file is wrong.

**Nothing reads it.** A search across the adopting repo found mentions in
exactly two files: `docdog-specs/SKILL.md` (three — the "lookup-of-last-resort"
line and two `rg` recipes) and one *conditional* line in
`docdog-navigate-specs/SKILL.md`. That repo's own retrieval protocol — a
`.claude/rules/` file establishing docdog-first with grep as the fallback —
never mentions it.

**Its stated job is already done, better, on the line above it.** SKILL.md
introduces the id lookup like this:

```bash
# "The fastest path is grep over the configured scan paths:"
rg "^id:\s*ID-HERE\b" .

# "If the id is unusual or similar to others, the flat index is cheaper to scan:"
rg "^ID-HERE " ./specs.index.md
```

The first reads live files and cannot go stale. The second reads a snapshot that
can. "Cheaper to scan" is true and irrelevant — both are `rg` invocations
returning matching lines, and the cost difference is unmeasurable next to being
wrong. The prefix-enumeration case (`rg "^FR-PROV-" ./specs.index.md`) is served
by `rg "^id:\s*FR-PROV-" specs/`, and when docdog is running, `docdog list
--collection <name> --json` is exhaustive, current, and structured — which is
precisely what FRICTION-036 asked for and got.

**And SKILL.md licenses opening it.** The line is:

> It is regenerated whenever this skill is regenerated and is safe to open
> directly.

It is never *auto*-loaded — Claude Code preloads only a skill's `name` and
`description` — so this is not a constant context tax. But it is a sanctioned
159 KB read (~40K tokens) sitting in a directory the agent is explicitly told to
consult. The sanctioned access should have been `rg` and only `rg`.

### A smaller instance of the same thing, in SKILL.md itself

Half of `SKILL.md`'s 8.7 KB — which *does* load on every invocation — is
generated corpus state:

```
- `DD-ARCH-` — found in: `upstream-decisions` (39 vertices)
- `CG-` — found in: `upstream-guidelines` (88 vertices)
```

The prefix→collection map has real navigational value and is fairly stable. The
**vertex counts** are the part that rots on every write while earning nothing: no
lookup needs them, and a reader who trusts them is misled about corpus size. They
were already wrong (136 for `SPEC-` against 146 live) before anything was split.

## Workaround

Deleted `specs.index.md` from the adopting repo, kept `SKILL.md` with its
lookups repointed at the live corpus, relabelled the generated lists as a
snapshot rather than an authority, and left a note in `SKILL.md` to delete the
file again if a future `docdog skill install specs` recreates it. The
`docdog-navigate-specs` reference needed no edit — it is conditional, so with no
index present it degrades to a no-op.

## What should change in docdog

**Stop emitting it.** That is the whole recommendation. The two live lookups
dominate it on correctness, and it loses nothing that FRICTION-036's `docdog
list` has not already replaced. Deleting the emitter is a smaller change than
maintaining an invalidation path for a file with no readers.

If a flat index is wanted anyway, then two constraints follow from the above and
neither is optional:

1. **It cannot be a committed snapshot.** A generated-from-corpus artifact
   belongs in `.docdog/cache/` — which is exactly what that directory is for —
   refreshed by `docdog index`, which is the command that already knows when the
   corpus changed. Emitting it into a git-tracked skill directory puts corpus
   state on the wrong side of the seed/cache line.
2. **Drop "safe to open directly."** Sanction `rg` over it and nothing else.

Trim the vertex counts from `SKILL.md` regardless. The prefix map can stay.

### The durable half

This is FRICTION-042's shape with the direction reversed, and the pair is worth
holding together.

- **042:** prose *about docdog's surface*, duplicated into seeds, corrected in
  some and not others. Detectable, because the template is the authority and
  `update` compares against it.
- **043:** content *about the adopter's corpus*, duplicated into a seed,
  corrected in none. **Undetectable by the same mechanism**, because `update`'s
  authority is the shipped template and this file's authority is the corpus.
  Byte-identical to what the installer would produce and completely wrong are
  the same state to `update`.

So the generalisation is not "seeds go stale" — 042 already said that, and
`update` answers it. It is: **a seed whose content derives from the adopter's
corpus has no drift detector at all, and `docdog update` structurally cannot be
one.** Anything in that category either needs to live in the cache under
`docdog index`, or should not be generated. Worth a sweep for other seeds that
embed corpus-derived values; the vertex counts in `SKILL.md` are one already, in
the same command's other output file.


## Resolution (2026-08-25, 9d3c597)

Stopped emitting it, which was the whole recommendation.

Gone: `hasIndex`, `indexPath`, `indexWritten`, `indexEntries`,
`formatIndexFile`, the `index_path` placeholder, `pickSummary` and its
markdown-stripping helpers, and their tests. `skill install` now writes
exactly one file per skill, `SKILL.md`. The discovery query narrowed with
it — three columns instead of six, since nothing needs a summary any more.

SKILL.md's lookups now read the live corpus: `rg` over the scan paths for
one id or a whole prefix, and `docdog get` / `docdog list` / `docdog search`
when docdog is running. The "safe to open directly" licence is gone with the
file it licensed. The prefix map lost its vertex counts — the count survives
in the discovery data the CLI prints at install time, where a number cannot
go stale because nothing keeps it.

`.claude/skills/docdog-specs/specs.index.md` joins the seed set as a legacy
orphan, so an adopter who already has one is told it is no longer shipped
and can delete it. That is the only thing `update` can honestly say about
it: the report's durable half is that a seed deriving from the adopter's
corpus has no drift detector and `update` structurally cannot be one.
