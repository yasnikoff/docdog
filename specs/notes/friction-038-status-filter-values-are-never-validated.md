---
id: FRICTION-038
title: "A status filter naming a value no record carries is accepted in silence — and `--exclude-status` fails *open*, returning the whole corpus as if the filter had run"
collection: notes
status: resolved
fixed_date: 2026-08-27
resolution_approach: fix
description: "`--collection` refuses an unknown name loudly (FRICTION-030, resolved). `--status`, `--exclude-status` and `--where` do not: a value matching nothing is accepted, and the result is presented as an answer. `--status typo` returns `No records match.` (reads as *nothing exists*); `--exclude-status typo` returns all 320 records (reads as *nothing was excludable*). Both exit 0. This matters more on `list` than on `search`, because `list` is the command you reach for precisely when you intend to trust the count."
severity: inconvenient
date: 2026-07-27
source: self-hosting (backlog survey via docdog list)
relationships:
  - references: FRICTION-030
    context: "the same bug in the collection filter, already fixed the way this one should be: validate against what the corpus declares ∪ what the cache holds, refuse with a typed error listing the real values. Its resolution deliberately kept a declared-but-empty collection returning an honest empty — the identical split applies here, and the status vocabulary the concepts records already declare is the analogue of `getVertexCollections`"
  - references: FRICTION-036
    context: "the friction whose fix surfaced this: `docdog list` exists because a filtered result must be trustworthy as a completeness claim, and a silently-ignored filter is the same defect one layer down — the set is wrong and nothing says so"
  - references: PROPOSAL-027
    context: "`--where` shares the shape and is the harder case: a record simply lacking the field is legitimately a non-match, so unlike status there is no closed vocabulary to validate against. FRICTION-030 already named this; it stays out of scope here"
  - references: OBS-012
    context: "the sweep that missed `planned` because it never enumerated the corpus's actual status values. A validating filter turns that class of miss into a refusal that names the values — the enumeration OBS-012 says to do first, done by the tool"
  - references: DP-001
    context: "tier 1 throughout: `SELECT DISTINCT status` is a fact check, not a guess. The forbidden move is the tempting one — inferring that `open` was meant by `opne` and silently correcting it"
---

# FRICTION-038: a status filter is never checked against the corpus

## What I was doing

Re-running the backlog survey through the freshly shipped `docdog list`
(FRICTION-036), asking for the open proposals:

```
docdog list --collection proposals --exclude-status shipped,superseded,rejected
```

It returned **all 37 proposals**, exit 0, with no indication anything had
gone wrong.

## What went wrong — two separate faults, stacked

**1. The shell mangled the argument.** PowerShell parses an unquoted
`shipped,superseded,rejected` as an array expression and hands the child
process a single space-joined argv entry:

```
npx tsx -e "console.log(JSON.stringify(process.argv.slice(2)))" -- a --exclude-status shipped,superseded,rejected
  → ["--exclude-status","shipped superseded rejected"]
```

`splitCsv` finds no comma, so the filter carries one status —
`"shipped superseded rejected"` — which no record has. That part is the
shell's doing, not docdog's. But the worked example in
`.docdog/skills/search.md` used the unquoted form, so the documented
example was silently wrong on the platform this repo is developed on.

**2. Docdog accepted it.** This is the actual friction. A status value
matching nothing is never checked:

```
docdog list --status nonesuch          → "No records match."   exit 0
docdog list --exclude-status nonesuch  → 320 record(s).        exit 0
docdog list --collection nosuchthing   → Error [UNKNOWN_COLLECTION]: … exit 1
```

The collection filter refuses and names the fourteen real collections.
The status filters do not. And note the asymmetry between the two status
failures: `--status` fails **closed** (an empty result reads as *no such
records exist*), while `--exclude-status` fails **open** (the whole corpus
comes back, reading as *nothing matched the exclusion*). The open one is
worse and is the one that bit here, because a larger result set looks like
a successful query — there is no empty screen to make you suspicious.

**3. And the obvious workaround is also silently wrong.** Repeating the
flag does not accumulate; last one wins:

```
docdog list --collection proposals --exclude-status shipped --exclude-status superseded
  → 25 record(s)     (only `superseded` excluded)
docdog list --collection proposals --exclude-status "shipped,superseded"
  → 2 record(s)
```

So an agent that hits fault 1, guesses that repeating the flag is the way
to pass multiple values, and gets a plausible number back has been wrong
twice without a single diagnostic. `--where` is the only repeatable option
(`collectRepeatable` in `src/cli/filters.ts`); `--status` and
`--exclude-status` take a CSV string, and nothing says so at the point of
failure. This is shared with `search` and `suggest-edges`, which use the
same parsers.

## Why it matters more here than in search

FRICTION-030 argued that a silent empty is "the worst of the three
possible behaviours" for a *ranked* result. For `list` it is worse still.
Search results are understood as a sample — you read them knowing recall
is imperfect. `docdog list` exists specifically so a filtered set can be
treated as **exhaustive and authoritative**; that is its whole reason for
existing (FRICTION-036). A filter that quietly doesn't apply turns the one
command built to make completeness claims into the one command most likely
to make a false one.

WF-006 step 1 now instructs an agent to survey the backlog with
`docdog list --status open`. One typo in that status and the workflow
reports an empty backlog, in a voice that sounds authoritative because the
command was chosen for its authority.

## Workaround

Quote CSV values, and cross-check any surprising count against
`docdog list --json | ConvertFrom-Json | Group-Object status` — which is
also the only way to learn what statuses the corpus actually uses.

## What should change (DP-001 tier 1)

Mirror FRICTION-030's resolution exactly, since the argument is identical
and the split it landed on is the right one:

1. **Validate `--status` / `--exclude-status` values** against the
   corpus's declared status vocabulary (the `status_vocabulary` blocks in
   `.docdog/concepts/` collection records) **∪** `SELECT DISTINCT status`
   from the cache. A value in neither is refused with a typed error naming
   the valid values. `SELECT DISTINCT status` is a fact check; no
   inference, and explicitly **no** fuzzy correction of near-misses —
   guessing that `opne` meant `open` is precisely the tier-3 move
   FRICTION-030 refused when it declined to build an alias map.
2. **A declared-but-unused status must still pass** and return an honest
   empty, for the same reason FRICTION-030 kept declared-but-empty
   collections working: a vocabulary value nothing uses yet is not a typo.
   Note that this makes the fix the first thing in v3 `src/` to *consume*
   the status_vocabulary blocks, which have shipped as data-only since
   PROPOSAL-026 — that is a small surface decision worth stating out loud
   rather than sliding in, since it gives an advisory registry teeth.
   Falling back to cache-distinct alone is the weaker option that avoids
   it, at the cost of refusing a legitimately-unused declared value.
3. **Say that the values are comma-separated** in the flag description on
   all three commands, and consider accepting repeated flags additively so
   the natural guess stops being wrong. Whichever way that lands, it must
   not stay silent.

Fixing (3) alone would have prevented this session's confusion; fixing (1)
is what stops the next one, whatever shape it arrives in.

## Fixed on filing (docs only)

`.docdog/skills/search.md` now quotes its CSV example and states both traps
— that the flag is not repeatable and that a non-matching value is accepted
in silence. That is the recurrence guard, not the fix; the code half above
is untouched and this note stays open for it.


## Resolution (2026-08-27) — all three items, plus the roster

Fixed as filed: mirror FRICTION-030's split, one column over.

**1. The check.** `loadStatusVocabulary` (`src/storage/status-vocabulary.ts`)
returns `present` (`SELECT DISTINCT COALESCE(status,'current')`, with counts)
∪ `declared` (the `status_vocabulary:` keys on every `concepts` row).
`assertKnownStatuses` in `storage/search.ts` sits beside
`assertKnownCollection` and is called by `search()`, `listRecords()` and
`suggestEdges()` — so the CLI, `docdog list`, `docdog suggest-edges` and the
`docdog_search` MCP tool all refuse from one implementation. The error is
`SearchError` code **`UNKNOWN_STATUS`**, whose existence is why `SearchError`
now has a code union rather than a single literal.

Both halves of the union earn their place, and this corpus demonstrates each:
`obsolete` is carried by 7 records and declared by no concept (a registry is
advisory — DISC-023; the corpus is not), while `archived`, `draft`,
`wont_fix`, `abandoned`, `blocked`, `deferred`, `in_progress` and `planned` are
declared and unused. Cache-distinct alone would refuse the second set; declared
alone would refuse the first.

**2. Every unknown value at once**, so a CSV with two typos costs one round
trip, and **no fuzzy correction** — `opne` is refused, never read as `open`.
That is the alias map FRICTION-030 declined, and the tier-3 line here.

**3. The list flags accumulate.** `--status` / `--exclude-status` (and
suggest-edges' `--collection`) are `collectRepeatable` + `splitCsvAll` now, so
the two spellings mean the same thing and the natural guess stopped being
wrong. The flag descriptions say comma-separated *and* repeatable, and name
the refusal.

**The message carries the asymmetry**, because it is the part a reader cannot
see for themselves: an allowlist matching nothing "returns an empty result,
which reads as *no such records exist*"; an exclusion matching nothing
"returns the whole corpus, which reads as a query that worked". And a rejected
value containing whitespace gets one extra sentence naming the PowerShell
array-expression trap — a fact about the input, not a repair of it. Splitting
on the space would be the same tier-3 move as the alias map.

### Two decisions the note did not make

**Corpus-wide, not per collection.** Validating `--collection notes --status
shipped` against *notes'* declared vocabulary would be stricter and wrong:
"are there any" is a question the tool can answer, and answering it with a
refusal is arguing instead of answering. The typo worth catching is a value
nothing in the whole corpus knows.

**`docdog status` gained a `Records by status` roster** — the fourth item,
added because item 1 alone leaves discovery running through the refusal. The
collection counts are what make `--collection` guessable; `--status` had no
equivalent, which is why this note's own Workaround section had to reach for
`list --json | Group-Object status`. Both surfaces render it from the same
`formatStatusVocabulary`, declared-but-unused tail included.

### The surface decision, stated rather than slid in

This is **the first thing in v3 `src/` to consume `status_vocabulary`**, which
has shipped as data-only since PROPOSAL-026. It gives an advisory registry
teeth — but only in the permissive direction: declaring a status never
*requires* anything, a value in use validates whether or not it is declared,
and a project with no concept records at all validates fine against `present`
alone. The registry can only ever *widen* what is accepted, never narrow it.
That is what keeps DISC-023's "advisory" true.

### Verification

The filed command, verbatim and unquoted, on this corpus:

```
Error [UNKNOWN_STATUS]: the exclude-status blocklist names 1 value(s) no record
carries and no collection concept declares: "shipped superseded rejected".
In use: accepted, analyzed, current, … . Declared but unused: abandoned,
archived, … . An exclusion matching nothing returns the whole corpus, which
reads as a query that worked. "shipped superseded rejected" contains
whitespace — quote comma-separated values (--status "a,b"), since some shells
join an unquoted list into one argument.
```

Quoted and repeated-flag spellings now return the same set. 688 tests across
45 files (+20), `tests/unit/status-vocabulary.test.ts`.

### Left alone deliberately

- **`--where`** — out of scope as the note says, because a record legitimately
  lacking a field is a non-match and there is no closed vocabulary to check
  against. That cluster is FRICTION-045 / 049 / 050.
- **suggest-edges' `--collection`** is now repeatable but still unvalidated;
  FRICTION-030's refusal never reached that command. Same class, different
  filter, and it fails closed.
