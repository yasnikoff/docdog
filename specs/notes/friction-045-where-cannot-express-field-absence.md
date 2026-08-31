---
id: FRICTION-045
title: "`--where` is equality-only and a missing field never matches, so the question 'which records lack this attribute' cannot be asked at all"
collection: notes
status: resolved
fixed_date: 2026-08-27
resolution_approach: fix
description: "PROPOSAL-027's where filter matches a field against a scalar, and records lacking the field never match — by design and correctly. The consequence is that absence is not a predicate: once a convention writes an attribute onto some records, 'which ones do not have it yet' is unaskable through search or list, and the workaround is to write an explicit sentinel value onto every record that would otherwise be silent. Surfaced by the upstream_issue backlink in PROPOSAL-043, where the unanswerable question is the operationally important one."
severity: inconvenient
relationships:
  - references: PROPOSAL-027
    context: "the feature this is a limit of — generic frontmatter attributes with an equality where filter over json_extract"
  - references: PROPOSAL-043
    context: "the surfacing case: upstream_issue marks a reported friction, and 'which frictions are still unreported' is the query the channel actually needs"
  - references: FRICTION-036
    context: "the same shape of gap one level up — ranked retrieval could not express a completeness question either, and the answer was a separate exhaustive command rather than a bigger limit"
  - references: DP-001
    context: "why the fix must stay mechanical: a predicate vocabulary is arithmetic, while inferring that an absent field means 'not yet' rather than 'not applicable' is judgment and belongs to the caller"
  - references: FRICTION-049
    context: "the sibling defect on the same filter, and the boundary this one was pinned as: 049 refused the container comparison and explicitly left absence alone as a different question"
  - references: FRICTION-038
    context: "the precedent the fix deliberately does NOT follow — an unknown status is refused, an unknown field name is not, because a field nothing carries is the normal first state of a convention rather than a typo"
  - references: DD-058
    context: "the worked analogue for a defaulted field: --lacks status separates the records that are `current` because someone wrote it from the ones that are current because the indexer filled it in"
---

# `--where` cannot express field absence

## What I was trying to do

Design the backlink half of the feedback channel (PROPOSAL-043): a
reported friction records `upstream_issue: <url>` on its own record, so
that *"did I already report this?"* is answerable offline from the
reporter's own corpus.

The moment that field exists, the operationally important question is
its complement — **which open frictions have not been reported yet** —
because that is the list a reporter or maintainer actually works from.

## What went wrong

`--where` matches a top-level frontmatter field against a scalar, and a
record lacking the field never matches. Both halves are correct in
isolation: equality is unambiguous, and silently treating a missing
field as a match would be worse than useless.

Together they mean **absence is not expressible**. There is no
`--where-absent`, no `!=` that a missing field satisfies, and no null
comparison — `--where upstream_issue=null` compares against the string.
So the corpus can answer "which are reported" and cannot answer "which
are not", even though the second set is exactly the first set's
complement within a collection the tool can already enumerate.

Working the complement out by hand is possible — `docdog list
--collection notes --status open --json` minus `docdog list --where
upstream_issue=... --json` — but the second call needs a value, and the
values are all distinct URLs. There is no single query to subtract.

## Workaround

Write the sentinel explicitly: `upstream_issue: none` on every record
that has not been reported, so the absent state becomes a present value.
It works, and it is the wrong shape — it makes every record pay for a
convention that concerns a minority of them, it goes stale the moment
someone forgets, and it means a record's silence has two meanings
(never reported / predates the convention) that the sentinel cannot
distinguish.

## What should change in docdog

The mechanical fix is a predicate vocabulary rather than a bigger
filter: `--where <field>` meaning *present* and `--where !<field>`
meaning *absent*, resolved with `json_extract(...) IS NULL`. That stays
tier 1 — it is arithmetic over the same column the equality filter
already reads.

What must **not** happen is code deciding what an absent field means. An
absent `upstream_issue` might mean not yet reported, or not worth
reporting, or written before the convention existed; distinguishing
those is the caller's judgment, and the filter's job ends at handing
over the set.

Worth noting the precedent: FRICTION-036 was this same shape one level
up — a completeness question ranked retrieval could not express — and it
was answered by giving the exhaustive question its own surface rather
than by stretching the ranked one. Whether presence deserves the same
treatment or is genuinely just a missing operator is the design question
for a proposal.

## Resolution (2026-08-27) — two flags, and the property they had to have

**What shipped.** `--has <field>` and `--lacks <field>` on `docdog search` and
`docdog list` (comma-separated and repeatable, like `--status`), and `has` /
`lacks` on `docdog_search`. `json_extract(frontmatter_json, '$.f') IS NOT NULL`
and `IS NULL` in `vertexFilters` — the same column the equality filter already
reads, which is what keeps it tier 1.

The query this note was filed from, on this corpus:

```
$ docdog list --collection notes --status open --lacks upstream_issue
… 10 record(s).
```

### The design decision is the partition, not the operator

The operator is one line of SQL. What had to be settled is that **`--has X` and
`--lacks X` are exact complements**, because the entire use of the feature is
working a complement — and a record that fell in neither set would silently
under-report the very list you asked for, which is the failure this note
describes one level down.

That decides the one genuinely ambiguous case. A field written with no value
(`upstream_issue:`, which YAML reads as null) counts as **absent**.
`json_extract` returns SQL NULL for a missing path and for an explicit null
alike; `json_type` could separate them, and separating them would leave records
in neither set. So the rule is mechanical and the note says so: this is not a
claim about what an empty declaration meant. `tests/unit/storage-list.test.ts`
asserts `has + lacks == total` over four fields including one declared empty and
one nothing carries, and the assertion fails if `IS NULL` is swapped for
anything cleverer.

### An unknown field name is not refused, and that is the interesting call

Every other filter on this surface refuses a value the corpus does not know:
`--collection` since FRICTION-030, `--status` / `--exclude-status` since
FRICTION-038, whose ruling was explicitly that an exclusion naming nothing
**fails open** — the whole corpus, looking like a query that worked. `--lacks
nonesuch` returns the whole corpus and looks exactly like that.

It is still not refused, because the analogy breaks on what the vocabulary
*is*. A status nothing carries is a typo, since the vocabulary already exists
and the record set is what defines it. A **field** nothing carries is the
normal first state of a convention — and `--lacks upstream_issue` returning
every open friction on the day the field is invented is the correct answer, and
the first query anyone runs. Refusing it would make the filter useless at
precisely the moment it is needed. This one is pinned too, in both directions.

There is no `docdog status` roster of field names to compensate, and the
reason is the same asymmetry that made one necessary for `--scope`
(FRICTION-050): a scope is invisible, because 319 records inherit a default
they never write, so nothing but a roster could teach the vocabulary. A field
name is written in the record that carries it. Reading one record shows you
`severity`; reading the proposal that invents `upstream_issue` shows you that.

### What it reaches that nothing else could

- **A convention's blind spot.** Of 109 `resolved` records, 34 carry a
  `fixed_date` and 75 do not — a convention that reached a third of the cohort
  it was written for, which was not previously a question anyone could put to
  the corpus. (The frontmatter roster behind it is worth a look on its own:
  `fixed_date` 34, `fix_commit` 14, `commit_hash` 16, and a tail of
  `shipped_date` 3, `resolved_date` 3, `shipped_at` 2, `resolved_in` 1,
  `resolved_by` 1. Whether that is drift or distinction is judgment, and the
  filter's job ends at handing over the sets.)
- **A defaulted column's provenance.** `status` defaults to `current` at index
  time, so `--status current` — 114 records — cannot separate the 16 that never
  wrote one from the 98 that chose it. `--status current --lacks status` is
  exactly those 16. The
  filters read frontmatter; the columns are derived; the gap between them is
  now askable. Same shape as DD-058's scope default one filter over.
- **A list field.** FRICTION-049 refuses `--where tags=logging` because
  equality cannot match a member. Presence never compares, so `--has tags` is
  answerable and is now the only question about a list field the corpus can
  answer at all.

### Two smaller things the change carried

`has` and `lacks` are **not** reserved `where` keys and never will be — they
take a field *name* rather than replacing one, so no refusal points at them and
the FRICTION-050 sweep would not have covered them. They are, however, a filter
added to three read surfaces at once, which is the exact failure that friction
pinned, so `tests/unit/dedicated-params.test.ts` gained a second describe that
walks both flags across CLI `search`, CLI `list` and `docdog_search`.

And the MCP handler's array parameters were **cast, not checked**: `status:
"open"` (a bare string) reached `.map` on a string and crashed the handler
rather than saying what was wrong. `has` and `lacks` arrive with the same
shape, so all four are checked now and refuse by name.

### What was not built

- **No membership.** `--where tags=logging` still refuses; FRICTION-049's
  ruling stands, and `json_each` is still a convention someone chooses.
- **No third bucket for an explicitly empty field.** See the partition above.
- **No `--where !field` spelling.** The note proposed it; a bare `!` is history
  expansion in interactive bash, and more decisively there is no JSON spelling
  of *present* inside a `where` object, so a `where`-only design could not have
  reached `docdog_search` with both halves. Two named parameters carry the same
  filter identically on every surface.
