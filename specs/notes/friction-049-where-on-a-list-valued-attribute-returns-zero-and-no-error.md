---
id: FRICTION-049
title: "`--where` against a list-valued attribute returns zero results and no error, which is indistinguishable from a correct empty answer"
collection: notes
status: resolved
fixed_date: 2026-08-27
resolution_approach: fix
description: "A list-valued frontmatter field is stored as a JSON array and `json_extract` returns it as the array's text, so an equality filter against a member can never match: `--where topics=logging` on a corpus whose records carry `topics: [logging]` prints \"No results found.\" and exits 0. The same silence covers `tags`, `triggers`, `related`, and docdog's own `participants` and `examples`. Every other bad input to this filter is refused at parse time — a reserved key, a non-identifier key, a non-scalar value — so the one failure that survives to produce output is the one that looks like data."
severity: inconvenient
relationships:
  - references: PROPOSAL-027
    context: "the feature this is a limit of — the equality filter over json_extract, whose value guard checks the type of the ARGUMENT (string/number/boolean) and never the type of the stored field, which is where the mismatch actually lives"
  - references: FRICTION-045
    context: "its sibling and the reason to file this separately: both make an unanswerable question return zero, but that one is about a field being ABSENT and this one about a field being present and holding a container — different causes, same indistinguishable output, and a fix for either leaves the other standing"
  - references: DP-001
    context: "the line the fix runs along: refusing a container is tier 1 (compare two json_type values), while deciding that `topics=logging` means membership rather than equality is a convention someone has to choose, which makes it tier 2 and a documented default rather than something code may infer"
  - references: FRICTION-038
    context: "the guard this one is now built beside — same refuse-rather-than-mislead argument, one filter over, and the same shape: a corpus-reading assert called from both `search` and `listRecords` so the two surfaces cannot disagree"
  - references: FRICTION-030
    context: "the first refusal in this family — an unknown collection name — and the precedent that an empty result must not be the answer to a malformed query"
---

# FRICTION-049: an equality filter against a list is silent, not wrong

## What I was doing

Answering whether the `--where` syntax generalizes to attributes a
project invents for itself. It does — an adopted corpus carries
`term`, `category`, `priority`, `deferred-since`, `source-task`,
`last-reviewed`, `harvested` and more, none of which docdog knows
anything about, and all of which filter correctly.

Then I tried one of its list-valued fields.

## What happened

```
$ docdog search "anything" --where topics=logging
No results found.
```

Exit 0. No warning. The records exist and carry the value:

```
default:specs/upstream-context/goals/implementation-plan.md
  json_extract(frontmatter_json, '$.topics') => "[\"goals/implementation-plan\"]"
```

`json_extract` returns the array as its JSON *text*, so the comparison
is `'["goals/implementation-plan"]' = 'logging'` — false for every
record, forever, including the ones the caller was looking for.

The affected fields are the natural ones. In the adopted corpus:
`topics` (32), `triggers` (87), `related` (60). In this corpus:
`relationships` (295), `related` (103), `participants` (34),
`examples` (8). `tags` is not in either corpus yet and is the field
most likely to be invented next.

## Why this one is worse than a missing feature

`vertexFilters` already refuses bad input rather than misleading:

- a reserved key (`collection`, `status`, `scope`) throws with the
  dedicated parameter named;
- a key that is not a top-level identifier throws with the regex
  quoted;
- a value that is not a string, number or boolean throws.

Three guards, all of which fail loudly. The container mismatch slips
between them because **every guard checks the argument and none checks
the stored field.** `--where topics=logging` passes all three — the
key is an identifier, the value is a string — and the mismatch only
exists once it meets a record.

So the established behaviour of this exact function is "refuse rather
than mislead", and this is the single path that returns output
instead. An empty result set is a legitimate answer to a well-formed
query, which is precisely why it must not also be the answer to a
malformed one.

## Workaround

None through the filter. The question has to be asked another way:
put the value in a scalar field alongside the list, or fall back to
`docdog search` on the term and filter by reading.

## What should change

Two shapes, and they are not alternatives — the first is the floor.

**Refuse it (DP-001 tier 1).** At query time the stored type is
knowable: `json_type(frontmatter_json, '$.key')` returns `array` or
`object`. A filter whose target is a container can throw the way the
other three guards do, naming the field and its type. That is
comparing two strings docdog already has, no judgment in it, and it
converts a silent wrong answer into a loud one.

**Or match membership (DP-001 tier 2).** `EXISTS (SELECT 1 FROM
json_each(frontmatter_json, '$.key') WHERE value = ?)` makes
`--where topics=logging` mean *logging is one of the topics*, which is
almost certainly what anyone typing it wants. But "equality against a
list means membership" is a convention someone chooses and documents,
not a fact code may infer, so it belongs in a proposal with the rule
stated rather than in a bug fix.

If only one ships, it should be the refusal. A tool that cannot answer
a question is fine; a tool that answers it wrongly and confidently is
the thing this corpus keeps writing observations about.

## Resolution (2026-08-27) — the floor shipped; membership was left to a proposal

The refusal is in. `assertScalarWhereTargets` in `storage/search.ts` asks the
corpus what it actually stores under each `where` key —
`json_type(frontmatter_json, '$.key')`, tallied over the vertices table — and
refuses with `WHERE_NOT_SCALAR` when any of them is an `array` or an `object`:

```
$ docdog list --where related=DD-070
Error [WHERE_NOT_SCALAR]: this filter targets a field this corpus stores as a
container: where.related (array in 103 record(s)). An equality filter compares
against the field's JSON text, so it can never match a member and would return
an empty result — indistinguishable from "no such records exist". Equality
against a list is not membership. Filter on a scalar field, or search for the
value and narrow by reading.
```

Exit 1, on `search` and on `list`, on the CLI and through `docdog_search`.

**The count is in the message because it is the part that cannot be guessed.**
`array in 103 record(s)` says both that the field is real and that the filter
was about to be silent about a hundred records, which is the fact the empty
result was hiding.

### Three decisions worth keeping

**It fires on *any* container row, not only when the field is a container
everywhere.** The mixed case — a list in 32 records, a string in 4 — is the
worse one, not the milder one: the filter answers for the 4 and stays silent
about the 32, and a plausible number is harder to distrust than a zero. The
message names that case explicitly when it sees it.

**Membership was not built.** `EXISTS (SELECT 1 FROM json_each(...) WHERE
value = ?)` is one line and is probably the right long-term semantics, but
"equality against a list means membership" is a convention someone chooses.
Shipping it inside a bug fix would make the tier-2 default arrive as a side
effect of closing a tier-1 defect, unstated and untested against anyone's
expectation. It wants a proposal that says the rule out loud.

**The check runs after `vertexFilters`, deliberately.** That call holds the
three guards decidable from the argument alone — a reserved key, a
non-identifier key, a non-scalar value — and an argument someone typed wrong
should be reported before a mismatch with the corpus. `--where tags={nested:
true}` still says "value must be a string, number, or boolean" rather than
lecturing about arrays.

### Why this guard had to read the corpus

It is the third check on the same argument and the first that could not be
written where the other three are. Those read the *call*; this one reads the
*store*. `--where topics=logging` is well-formed in every way visible without
opening the cache — identifier key, string value — and the mismatch only comes
into existence when it meets a record. That is exactly why it slipped through
a function whose established behaviour is to refuse rather than mislead, and
why it was the single path through this filter that returned output instead of
an error.

### What is pinned

`tests/unit/storage-search.test.ts` gains two fixtures — a pure-list `tags` and
a `topics` that is a list in one record and a scalar in another — and five
cases: the container refusal names the field and its type, the mixed case says
so, two offending keys come back in one refusal, an argument-shape error still
wins, and **a key the corpus has never seen is left alone**. That last one is
the boundary with FRICTION-045: absence is a different defect, and a guard that
swept it up here would have closed it by accident and wrongly.
`tests/unit/storage-list.test.ts` pins the same refusal on the enumeration
surface, where an empty answer is a completeness claim.

### What is not fixed

FRICTION-045 stands untouched: a record lacking the field still never matches,
so "which records do not carry this attribute" remains unaskable. And a field
this corpus happens to store as a scalar everywhere while another corpus stores
it as a list is, correctly, refused there and allowed here — the check is a
statement about the data, not about the schema, because there is no schema.
