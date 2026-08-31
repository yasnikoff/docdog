---
id: FRICTION-036
title: "No way to enumerate every record matching a structured filter — search ranks by query recall, so 'list all open frictions' has no trustworthy docdog answer"
collection: notes
status: resolved
fixed_date: 2026-07-27
resolution_approach: feature
fix_commit: f998e67
description: "WF-006 step 1 is 'survey open frictions', but docdog's only query surface is hybrid search, which is ranked retrieval: results are ordered by relevance to a text query and capped at --limit, with no query that matches every record carrying status: open. --status and --where filter the ranked set; they do not turn search into an exhaustive list. So enumerating a predicate (all status=open, all severity=blocks-work) cannot be done through docdog with any guarantee of completeness — the answer is only as complete as the query's recall. In this session docdog returned the correct 5 open frictions, but the only way to KNOW it was complete was a filesystem grep cross-check, which is the bypass WF-006 says to log."
date: 2026-07-20
severity: inconvenient
relationships:
  - references: WF-006
    context: "the workflow whose step 1 ('survey open frictions with status: open') hits this every time it runs — it even anticipates the bypass ('if docdog cannot express the query, bypass to the filesystem and log the gap'), which is this record"
  - references: OBS-012
    context: "the nearest prior sighting: a staleness sweep missed the `planned` status because a scoped grep did not enumerate the corpus's actual status values first. Same root — there is no exhaustive-list surface — seen from the sweep side rather than the survey side; its lesson ('enumerate first') presumes a way to enumerate that this friction says is missing"
  - references: FRICTION-030
    context: "adjacent failure of the same query surface: there, a collection filter naming an unknown collection silently returned zero; here, a filter over a real predicate silently returns an unknown-completeness subset. Both are 'a filtered search result reads as authoritative when it is not' — F-030 fixed the typo case by refusing loudly; the enumeration case has no equivalent"
  - references: DP-001
    context: "a `docdog list --collection/--status/--where` that returns every matching record in a stable order is tier-1 mechanics — a SELECT with a WHERE, no ranking, no judgment. The absence is not a principle constraint, just an unbuilt surface; the ranked search deliberately is not it"
  - references: PROPOSAL-027
    context: "added the --where equality filter this friction wants to build on: the filter predicate already exists and is already wired into search's SQL. What is missing is a command that applies it WITHOUT a relevance query and returns the full matching set rather than a ranked top-N"
---

> Found during a WF-006 friction-resolve survey (this session), at step 1.
> Not a failure — docdog returned the right answer — but a completeness I
> could only confirm by leaving docdog, which is the bypass the workflow
> asks to be recorded.

## What I was doing

Surveying the open friction backlog to present the WF-006 menu. The step is
"query docdog for frictions with `status: open`."

## What went wrong

There is no docdog query that enumerates a predicate. The surface is
`docdog search <query>` — hybrid retrieval, ranked by relevance to the text
query and returned up to `--limit`. `--status` and `--where` (PROPOSAL-027)
narrow that ranked set, but they ride on top of a text query; they do not
convert search into an exhaustive list.

I ran `docdog search "friction" --status open` and three `--where severity=…`
passes. They agreed on 5 frictions. But "agree" is not "complete": the result
is only as complete as the word "friction" matching every open friction's
body, and a record can carry `status: open` while ranking below the limit — or
below any given query's recall — for a query it is semantically distant from.
An empty query (`docdog search ""`) does not rescue this: it returns an
arbitrary ranked set, not the corpus.

So to *know* the survey was complete I ran a filesystem grep over
`specs/notes/friction-*.md` for `status: open`. It matched the same 5 — which
confirms docdog was right *this time* and confirms nothing about next time.
That grep is the WF-006 bypass, logged here.

## What I used instead

`grep -l "^status: open" specs/notes/friction-*.md` — an exhaustive predicate
scan, which is exactly the query docdog cannot express.

## What should change in docdog

A non-ranked list command:

```
docdog list --collection notes --status open
docdog list --where severity=blocks-work
```

Semantics: apply the same vertex filters `search` already builds
(`vertexFilters` in `storage/search.ts`, including PROPOSAL-027's `--where`),
skip both retrieval legs, and return **every** matching record in a stable
order (id, or file path) — no relevance, no cap unless asked. It is tier-1
mechanics (DP-001): a `SELECT … WHERE … ORDER BY id`, no judgment. The filter
predicate is already written and already tested; what is missing is a caller
that runs it without a query and without truncation.

This also gives OBS-012's "enumerate the corpus's actual values first" an
actual command to lean on, and closes the completeness gap WF-006 currently
patches with a filesystem detour every single survey.

Scope note: the MCP side wants the same — `docdog_search` cannot be trusted to
enumerate for an agent any more than the CLI can for a human. A `docdog_list`
kernel tool is the parallel, but adding a ninth kernel tool is a surface
decision for a proposal, not a friction; this record asks for the CLI list and
flags the MCP parallel.

## Resolved 2026-07-27 — `docdog list`

Built as specified above, with the MCP parallel still deferred to a proposal.
`listRecords` lives in `storage/search.ts` rather than a sibling module so it
shares `vertexFilters` with `search` instead of importing a copy — two
implementations of one predicate drift, and the drift is invisible until a
record is missing from a list someone trusted (the argument that keeps
`findUnusedRows` shared between `status` and `gc`). Order is `collection, id`;
no body and no preview, since enumeration is the cheap half of enumerate-then-
`get`; unknown collection refuses exactly as search does, which matters more
here because a silent empty reads as *nothing exists*. The CLI filter parsers
moved to `src/cli/filters.ts` for the same reason the predicate is shared: a
`--where` that coerced differently between the two commands would mean one
thing when you rank and another when you enumerate.

**What picked this friction off the backlog was the friction itself.** Asked
"what is the next open proposal to implement", answering it required leaving
docdog twice: `docdog_search` with a status filter returned **3 of the 6**
matching records, and enumerating the corpus's distinct status values had no
docdog expression at all. Then the grep over-reported, because two proposals
carry example frontmatter in their bodies — caught only by a second check.
Three bypasses inside one question, which is DP-003 clause 3 firing on the
record that predicted it.

Verified against the real corpus: `docdog list --collection notes --status open
--where severity=inconvenient` reproduces exactly the four frictions the grep
found, and the question that started it (`--collection proposals
--exclude-status shipped,superseded,rejected`) now returns the single honest
answer where search returned half of one.

**And its first real run corrected the survey that motivated it.** The
grep-based backlog scan run minutes earlier reported 4 open frictions and 4
open questions. `docdog list --status open` returns **11** — the four missing
records are open *discussions* (DISC-013/016/018/026), which the grep could
not have found because it chose its own file set (`friction-*.md`, `oq-*.md`)
before asking the question. That is this friction's exact failure mode reached
by a different road: not query recall this time but glob scope, both of them a
completeness claim made by deciding in advance where to look. The command has
no such choice to make.

Two things surfaced in passing and were fixed with it: three proposals carried
`status: implemented`, which is not in the proposals collection's declared
status vocabulary (proposed/planned/accepted/shipped/rejected/superseded) —
flipped to `shipped`, the drift OBS-012 warns about, now visible in one command
instead of a grep. And this file and OBS-022 both ended with a stray
`</content>` line, a create-time artifact that had been sitting in the corpus
as body text.

WF-006 step 1 no longer anticipates the bypass; it names `docdog list`.
