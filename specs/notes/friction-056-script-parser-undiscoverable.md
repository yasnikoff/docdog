---
id: FRICTION-056
title: "The escape hatch that answers a declined adoption is documented once, at the bottom of one skill, under a heading about foreign file formats"
collection: notes
status: open
date: 2026-09-25
description: "`parser: script` already solves the sub-file-record case that issue #1 declined adoption over, and the reporter never found it: it appears in exactly one adopter-visible place — the last section of the `ingest` skill — framed as `custom formats → project scripts (table-based glossaries, CSV exports, Confluence dumps)`, which a reader with a markdown problem does not read as addressed to them. The README does not mention parsers at all."
severity: inconvenient
upstream_issue: https://github.com/yasnikoff/docdog/issues/1
relationships:
  - references: DISC-042
    context: "the triage that found this — the reporter had already found the split parser and diagnosed its heading-shape correctly, which is what makes the miss diagnostic rather than careless"
  - references: DD-064
    context: "the decision that put custom formats in project scripts; it is sound, and this is entirely about where the decision is written down for someone who needs it"
  - references: DD-067
    context: "the parser system this is the escape hatch of — four parsers ship and one of them is reachable only from a paragraph about Confluence dumps"
  - references: FRICTION-051
    context: "the seed-drift rule this fix has to obey: the `ingest` skill is a mirror of templates/skills/, so the edit goes in the template and is copied down, never the other way"
  - references: FRICTION-043
    context: "the precedent for what NOT to do here — a docs fix that put corpus state into a seed with no invalidation path; the fix for this one is prose, not generated content"
  - references: PROPOSAL-044
    context: "the injectable skills `update` now maintains, which is what makes a template edit actually reach an adopting repo rather than only new ones"
  - follows_workflow: WF-007
    context: "surfaced at step 2 of the first external triage — the row the workflow calls `not a defect, docdog behaved as designed` and tells you to ask whether the docs failed instead"
---

# FRICTION-056: the escape hatch nobody can find

## What was being attempted

Issue #1 — an adopter with 261 `D-<AREA>-<n>` rows inside a 7,391-line
file, whose record unit is a top-level list item rather than a heading —
**declined adoption** and wrote roughly a thousand lines of local reader
instead.

`parser: script` answers their case completely, at 0.4.0, with no docdog
change: a project-supplied parser at index time, returning
`ParsedSection[]`, which for their row shape is about forty lines. They
would have got sub-file records, text-derived ids, per-row embeddings and
id-bearing hits.

## What went wrong

They never found it, and the reason is not carelessness. They had already
found the **split** parser, read it correctly, and diagnosed the exact
limitation ("a heading-path splitter gets 12 records where there are
261"). A reader that engaged is the strongest possible test of whether a
feature is discoverable, and it failed.

`parser: script` appears in exactly one place an adopter sees: the last
section of the `ingest` skill, under

> **Custom formats → project scripts**
>
> For formats that don't fit `split` or `add` (table-based glossaries,
> CSV exports, Confluence dumps), write a project script…

Their corpus is markdown. Nobody whose problem is *markdown whose record
unit is not a heading* reads a list of foreign file formats and sees
themselves in it. The framing does not say what the escape hatch is for;
it says what file types it imagines.

Elsewhere: `README.md` mentions no parsers at all — not `split`, not
`table`, not `script`, not `split_on`. Every other reference is in the
corpus (DD-067, EJ-031, FRICTION-021/023, PROPOSAL-034), which an
adopter has no reason to read and, before adopting, cannot search.

## Workaround

None was found by the reporter; they built their own indexer. The
workaround exists only in hindsight and only because triage read the
source.

## What should change in docdog

1. **Reframe the `ingest` skill section by capability, not by file type.**
   The question it should answer is *"my records are not one-per-file and
   not heading-delimited — what now?"* The glossary/CSV/Confluence list is
   examples, not the definition. Via `templates/skills/_common/ingest.md`
   and copied down (FRICTION-051), so adopters get it through
   `docdog update`.
2. **The README says docdog reads more than one-file-one-record.** Four
   parsers exist; the front door mentions zero. This is the half that
   reaches someone *deciding whether to adopt*, which is when issue #1 was
   lost.
3. Keep it prose. FRICTION-043 is the warning against fixing a docs
   problem with generated content that has no invalidation path.

Not in scope here: whether `split_on` should gain a node-anchored pattern
so the script is unnecessary (PROPOSAL-048). That is a separate decision,
and this record is true whichever way it goes — the escape hatch will
always be the answer for *some* corpus, and it will always need to be
findable.
