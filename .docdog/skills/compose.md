---
name: compose
description: Decide where a long document divides into separate records, and execute that decision with docdog split's plan file
---

# Compose

Splitting a document into child records is **your** decision. The tool can
measure the document, propose boundaries, validate what you choose, and write
the files and edges — it cannot decide where the ideas divide, because that is
inference about meaning and docdog's code does not enter that category
(DP-001 tier 3).

The plan file is how you tell it what you decided, and it is the only thing
that executes a split.

```
docdog split specs/foo.md                     # look first: structure + sizes
docdog split specs/foo.md --format plan > plan.yaml
#   or pre-populate the boundaries with a selector instead of descent's guess:
#   docdog split specs/foo.md --format plan --depth 3 > plan.yaml
#   docdog split specs/foo.md --format plan --on "## DD-" > plan.yaml
#   edit plan.yaml — move boundaries, delete entries to merge, write titles
#   and a real description for every child
docdog split --apply-plan plan.yaml
docdog index
```

## Before you plan: is this document plural?

**The central test** — *is the tail a different idea, or the same idea in more
detail?* Long is not the defect. Plural is.

- A decision with ten sections is **one** decision. DD-070 has a Rationale, a
  Principle walk and a Supersession pass; none of them is a separate record,
  and splitting it would produce ten records that only make sense together.
- A file holding six unrelated design decisions under six headings is **six**
  records that were filed in one place.

**"Leave it alone" is a real answer and you must be willing to reach it.**
A skill that always finds a split would be wrong on most narrative records.
Two reasons it is genuinely often right to do nothing:

- Being over the embed cap is **not** a defect on its own. OBS-019 measured
  that truncated records retrieve *well* — the prefix is often a *better*
  vector than the whole document, because these records open with framing and
  close with detail. Do not split a record to get it under the cap.
- Descent's suggested depth answers "what breaks this into pieces that fit".
  That is a size fact. It is deliberately printed as advisory and it is not a
  recommendation about meaning.

## Editing the plan

The plan's `sections:` list is emitted pre-populated with empty descriptions —
at descent's suggested depth, or at every heading your `--on` / `--depth`
selector matched if you gave one. Treat it as candidates, not as an answer,
whichever produced it. A selector is a nomination too: `--on "## DD-"` claims
that every matching heading begins a separate idea, and checking that claim is
what you are here for. It saves you typing, not judgment.

- **`output:` says what comes out.** It defaults to `records` when the source
  declares an `id:` — the composition case this skill is about, the one that
  mints `part_of`. `output: files` is the ingest shape instead: sibling files,
  no edges, source retired. If the header says `files` on a record you meant to
  compose, the source has no id and is not yet a parent (DD-072).
- **Boundaries partition the document.** Each entry owns everything from its
  heading to the next entry's heading. So **deleting an entry merges** that
  section into the one above it, and everything before the first entry stays
  with the parent.
- **`heading:` must be a heading the tool emitted**, identified by its outline
  ordinal. Inventing one is a hard error — the validator lives outside you on
  purpose (OBS-014). You cannot split mid-prose; if a section should divide
  somewhere with no heading, add the heading to the source first, re-emit the
  plan, then split.
- **`at:` is checked against the ordinal.** A mismatch means the source changed
  under the plan; re-emit rather than hand-fix.
- **Write a description for every child.** An empty one is refused, because a
  description-free record is indexed by fts5 and has nothing to say for itself.
  Say what the child *is*, not that it came from a split.
- **Child ids derive from the parent** (`DD-070-01`) unless you override them.
  Derived is traceable and collision-free without consulting a next-free-id
  that goes stale within a session. If a child later earns a first-class id,
  `docdog renumber` is the promotion path.

## The parent

`--apply-plan` leaves the parent's frontmatter and everything before the first
boundary in place, and appends a list of its parts. The children declare
`part_of` the parent; the parent declares nothing back (DD-072) — the roster is
prose, and traverse reads inbound for free.

**Leave the parent real framing prose, not just the list of sections.** A
parent reduced to a table of contents is about everything its children are
about and contains none of it, which makes it a distractor in every search that
should have returned a child. It cannot be un-indexed to dodge this — every
inbound `part_of` edge would dangle. If the parent has nothing to say once its
sections are gone, that is evidence the split was wrong.

## Discipline

- **Git first.** Commit before you apply. A wrong split costs one record and a
  revert, and that cheapness is the reason this ships unmeasured.
- **One record at a time. Never a corpus sweep.** There is no batch mode over
  unreviewed plans and there never will be.
- **Record what you did** — which record, which boundaries, and the reasoning
  that made it plural. Ten lines. That is the difference between a feature that
  is unmeasured and one that is unmeasurable: if a retrieval suite is ever
  built for composition, it needs a population of splits and a before-state.
- **Read the coverage line.** Apply says whether `scan_paths` reaches the
  children. If it does not, they are written and invisible — indexing will not
  complain, because nothing looks there. Fix it in the config, or re-run with
  `--update-config`.
- **Reindex after applying**, then check the parent and one child with
  `docdog get`.
