---
id: FRICTION-050
title: "`scope` is refused inside `where` and has no dedicated parameter on any read surface, so a field you can set is a field you cannot filter by"
collection: notes
status: resolved
fixed_date: 2026-08-27
resolution_approach: fix
description: "`WHERE_DEDICATED_PARAMS` refuses `where.scope` with \"use the dedicated scope parameter\", and `vertexFilters` implements the filter in full including DD-058's COALESCE default. But no read surface exposes it: not CLI `search`, not CLI `list`, not `docdog_search`. The dedicated parameter the error names exists only on the WRITE tools — `docdog_create` and `docdog_update` both take `scope` — so the message is right about the vocabulary and wrong about the surface, and the one path to the working implementation is the one it closes."
severity: inconvenient
relationships:
  - references: PROPOSAL-027
    context: "the reserved-key guard is its work — one syntax path per filter is the right rule, and it holds for collection and status because both have the dedicated parameter it promises; scope is the entry where the promise has no referent on the reading side"
  - references: PROPOSAL-032
    context: "surface parity, stated as every MCP tool having a CLI counterpart wherever the shell can express its inputs — this is the same principle one level down, between a filter the storage layer implements and the surfaces that can reach it, and a string option is exactly the kind of input a shell expresses fine"
  - references: DD-058
    context: "the default this filter already honours — absent scope means shared, encoded as COALESCE(json_extract(...), 'shared') in vertexFilters, so the semantics were settled before the parameter went missing"
  - references: FRICTION-049
    context: "filed the same hour from the same guard, and the mirror case: there a malformed filter produces output, here a well-formed one produces an error naming a parameter that is not there — both leave the caller unable to tell a limit from a mistake"
  - references: FRICTION-038
    context: "the roster precedent — `docdog status` ships a filter's vocabulary so it is learnable before it is typed; scope needs that more than status does, having no refusal to learn from"
  - references: DP-001
    context: "why the scope filter stays unvalidated where collection and status refuse: DD-058 declares an open vocabulary, so calling an unused value a typo would be judgment (tier 3) rather than the set membership the other two do"
---

# FRICTION-050: a filter with an implementation and no door

## What happened

```
$ docdog search "anything" --where scope=shared
Error [SEARCH_ERROR]: Error: where.scope is not allowed — use the dedicated "scope" parameter.
```

There is no dedicated `scope` parameter to use.

- CLI `search` options: `--collection`, `--status`,
  `--exclude-status`, `--where`, `--limit`, `--json`.
- CLI `list` options: `--collection`, `--status`,
  `--exclude-status`, `--where`, `--limit`, `--json`.
- `docdog_search` schema properties: `query`, `collection`, `status`,
  `exclude_status`, `where`, `limit`.

None of them names scope.

## Why the message is not simply wrong

`scope` **is** a first-class field with dedicated parameters — on the
writes. `docdog_create` takes `scope: "Visibility scope (omit for the
default: shared)"`; `docdog_update` takes `scope: "Updated scope"`.
So the reserved-key guard is stating a true fact about the corpus
vocabulary. What it does not know is which surface the caller is on.

You can set scope on a record and you cannot ask for records by it.

And the filter is not missing — `vertexFilters` implements it,
including the DD-058 default that makes an absent scope mean `shared`:

```sql
AND COALESCE(json_extract(v.frontmatter_json, '$.scope'), 'shared') = ?
```

That COALESCE is the tell. It is careful work about a semantic
question that was settled and then made unreachable. `SearchOptions`
declares `scope?: string`, `listRecords` accepts it through the shared
filter subset, and nothing on any read surface can populate it.

Worth noting *why* this is invisible in normal use: it fails only for
a caller who reaches for `where` because the obvious parameter is
absent — which is to say, only for someone who already found the gap.
Everyone else concludes scope is not filterable and stops.

## Workaround

Fall back to `docdog list --json` and filter the output, or query the
cache directly. Both give up ranking, and the second gives up the
supported surface.

## What should change

Add `scope` to the read surfaces, since the implementation is already
there and the semantics are already decided:

- CLI `search` and CLI `list`: `--scope <name>`, passed straight
  through to the existing option.
- `docdog_search`: one schema property.

That is three lines of plumbing to an implemented filter, and it makes
the reserved-key error true on every surface rather than only on the
writes.

The alternative — dropping `scope` from `WHERE_DEDICATED_PARAMS` so
`--where scope=shared` just works — is smaller but wrong. It would
route one field through the generic path while `collection` and
`status` keep dedicated ones, and it would silently lose the DD-058
default: `json_extract` alone returns NULL for a record with no scope,
so a bare `--where scope=shared` would miss exactly the records the
COALESCE exists to include. The generic filter cannot express that
default, which is the substantive reason scope belongs in the reserved
set in the first place.

## Resolution (2026-08-27) — the door was three lines; the reason it stayed shut was that nothing could see it was missing

### What shipped

`--scope <name>` on CLI `search` and CLI `list`, and a `scope` property on
`docdog_search`. No storage change was needed: `vertexFilters` already
implemented the filter and `SearchOptions.scope` already declared it. The
filter this repo could not reach was reaching 37 of its own records —
DP-002's `scope: shipped | user` provenance markers on `.docdog/concepts/`,
which `tests/unit/seed-drift.test.ts` had already described in prose as
something you *ask* for:

```
$ docdog list --scope user | tail -1
11 record(s).
$ docdog list --scope shipped | tail -1
26 record(s).
$ docdog list --scope shared | tail -1
319 record(s).
```

The third line is DD-058's default doing its job: those 319 records declare
no scope at all.

### Three things the fix needed that "three lines of plumbing" did not cover

**1. The refusal is a promise, so make the promise checkable.**
`WHERE_DEDICATED_PARAMS` is exported now, and
`tests/unit/dedicated-params.test.ts` walks it against every read surface —
each reserved key must have its flag on `search` and `list` and its property
on `docdog_search`. The invariant is *every* reserved key has a door, not
*scope has a door*: adding a name to that set without adding its parameter
now fails a test rather than shipping an error message that lies. That is
the defect's actual shape. The literal three lines would have closed this
instance and left the mechanism that produced it intact.

**2. A filter nothing can refuse must be learnable somewhere else.**
`docdog status` rosters `Records by scope` beside its collection and status
rosters. This is not the convenience the other two are. `--collection` and
`--status` teach you their vocabulary *by refusing you* (FRICTION-030,
FRICTION-038); scope cannot, because DD-058 makes it a free string with no
enum and no registration, so an unused value has to return an honest empty.
A wrong guess and a right guess with no matches are the same screen. The
roster is the only path from "scope is filterable" to "these are its values"
— and on this corpus the values are `shipped` and `user`, which nobody
guesses.

It prints only when the corpus has more than one scope. On a corpus that
declares none, DD-058's default makes `shared: 356` a line about a filter
with one possible value. `--json` carries it unconditionally.

**3. The default has two spellings and they had already diverged.**
`scopeExpr` is now the single SQL expression, shared by the filter and the
roster on the lesson `findUnusedRows` carries between `status` and `gc`
(OBS-021) — a roster computed off a different default would advertise a
value the filter cannot return. Writing it once surfaced a live mismatch:
`scopeOf`, the JS half that decides what every result *reports*, treats an
explicit `scope: ""` as absent, and the SQL did not. Such a record was
reported as `shared` and not returned by `--scope shared`. Unreachable while
no read surface could ask; `NULLIF` closes it, and a test pins it.

### The refusal itself was rendering wrong

The message this note quotes was a plain `Error`, so both CLI commands fell
to their generic branch:

```
Error [LIST_ERROR]: Error: where.scope is not allowed — use the dedicated "scope" parameter.
  Cache missing or stale? Run "docdog index" first.
```

A doubled prefix, and a remedy pointing at the cache for a fact about the
argument — which is precisely what the comment above that catch says not to
do, quoting FRICTION-030. The `where` guards simply never reached the branch
where it was true. All three are `SearchError`s now
(`WHERE_RESERVED_KEY`, `WHERE_INVALID_KEY`, `WHERE_INVALID_VALUE`, beside
FRICTION-049's `WHERE_NOT_SCALAR`):

```
Error [WHERE_RESERVED_KEY]: where.scope is not allowed — use the dedicated "scope" parameter.
```

### What was not built

**No scope validation.** DD-058 says it plainly: free string, no enum, no
central registration. `--scope private` on a corpus with no private records
is a question with an honest answer, and there is no declaration surface —
the `status_vocabulary:` blocks that let FRICTION-038 keep a
declared-but-unused status returning an empty have no scope analogue — so a
`SELECT DISTINCT` check would refuse legitimate values by construction.
Inventing a vocabulary to validate against is DP-001 tier 3. This is the
same boundary FRICTION-049 drew against FRICTION-045: an absent value is an
honest empty.

**Not the alternative this note rejected.** Dropping `scope` from
`WHERE_DEDICATED_PARAMS` would have routed one field through the generic
path while its siblings kept dedicated ones, and silently lost the DD-058
default — bare `json_extract` returns NULL for a record with no scope, so
`--where scope=shared` would miss exactly the 319 records the COALESCE
exists to include. That argument stands as written.

**Nothing about scope in `list` or `search` output.** Both already carry it
in `--json`; the MCP search rendering already prints a non-shared scope.
Echoing a value you just filtered on is noise.
