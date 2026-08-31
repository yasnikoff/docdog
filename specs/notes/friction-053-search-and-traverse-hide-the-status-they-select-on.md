---
id: FRICTION-053
title: "The two surfaces that choose records for you were the two that would not say whether a record is still live"
collection: notes
status: resolved
fixed_date: 2026-08-30
resolution_approach: fix
description: "docdog list and get print a record's status; search and traverse did not, on either the CLI or MCP half — so 71 of 360 records wrote their status into the body by hand."
severity: inconvenient
relationships:
  - references: OBS-027
    context: "the measurement that located this and sized it — 71 hand-written banners, and the ranking remedy it ruled out on the way"
  - references: DISC-041
    context: "the discussion whose staleness axis this closes; the axis turned out to be one rendering gap and three refusals"
  - references: FRICTION-050
    context: "the same shape and the same fix — a capability present on one read surface and missing on another, with no test able to see the gap, so the pin walks every surface"
  - references: DP-003
    context: "clause 3 at 71 instantiations: writing the status into the body is the escape hatch, and the toolbelt gap is that no ranked surface would show the field"
  - references: DD-058
    context: the default that makes the scope/status asymmetry correct — every record inherits `shared`, so suppressing it is honest where suppressing status would not be
  - references: WF-003
    context: the workflow a banner cleanup would have to run through, and part of why it was not done — 71 records is a batch rewrite, not a side effect of a rendering fix
---

# FRICTION-053: the ranked surfaces hid the field they rank over

## What I was trying to do

Answer DISC-041's Axis 2 claim that "retrieval is staleness-blind" with
a measurement rather than an anecdote (OBS-027).

## What went wrong

Walking every read surface to see which disclose `status`:

| surface | shows status |
|---|---|
| `docdog list` | yes — `DD-034  [decisions]  current  …` |
| `docdog get` | yes — `Status:     superseded` |
| `docdog_get` (MCP) | yes — `**Status:** superseded` |
| `docdog search` | **no** — `[decisions] (vector=…, bm25=…)` |
| `docdog_search` (MCP) | **no** — `(decisions, scope:…)` |
| `docdog traverse` | **no** — `(depth 1)` |
| `docdog_traverse` (MCP) | **no** — `(depth 1)` |

**Exactly backwards.** The surfaces where you already name the record
tell you its state; the surface that *chooses* records for you and the
surface that *walks* to records you never named do not.

`traverse` is the worse of the two. It hands back neighbours the caller
did not ask for, out of a graph holding 1,898 edges and 62 stale
records, and says nothing about any of them. Its `--json` projection was
worse still — it listed `id`, `title`, `collection`, `source_file` and
dropped `status` entirely, so a machine consumer could not recover the
field at any depth.

The data was never missing. `SearchResult.status` exists;
`TraversalResult.vertex` is a full `CacheVertex`. Every renderer had the
field in hand and left it out.

## What I used instead — 71 times, without noticing

The corpus routed around it by writing status into the **body**:

```
EJ-030   **Superseded 2026-04-13** — see DD-066 for the current framing…
WF-004   **Status note (2026-08-27): deprecated — do not follow this.**
OQ-18    **Status note (2026-07-11, FEATURE-002):** resolved by DD-070…
```

61 of 62 stale records, plus 10 `shipped`/`resolved`/`rejected` ones —
**71 of 360, 19.7% of the corpus**. It works, because the body is what
`search` previews. It is also a second copy of a frontmatter field,
maintained by memory, free to disagree with what it copies. `DD-052` is
already the omission: superseded, no banner, and nothing can tell.

DP-003 clause 3 sets three hand-rollings as the signal for a toolbelt
gap. This one ran to seventy-one because each instance looked like
writing a sentence rather than working around a tool.

## Resolution (2026-08-30)

Render the field on all four surfaces. No schema change, no query
change, no new option — the fix is four lines and the reasoning around
them.

```
─── EJ-030 — Docdog is a memory layer … [decisions] superseded (vector=0.685, bm25=4.45)
─── DD-066 — Docdog is a memory layer … [decisions] current    (vector=0.650, bm25=4.56)
→ [DD-034] Ejection resilience lives in artifacts, not in skills (current, depth 1)
```

`traverse --json` gained `status` in its projection.

### Always on, not only when stale

Matching `list` and `get`. A surface that prints status only when it is
exceptional makes silence mean two things — *current*, and *this
renderer predates the fix* — which is the ambiguity that let the
omission stand this long. The MCP search header keeps suppressing
`scope` at its DD-058 default, and the asymmetry is the point: 323 of
360 records inherit `shared` without writing it, so printing it is
noise. No status is inherited that way.

### What was NOT done

**Nothing in the ranker.** The tempting next step — penalize stale
records, or exclude them by default — was measured and refused. Stale
records occupy 15.0% of top-5 slots against a 17.2% share of the
corpus, so there is no bias to correct, and on `q02` the superseded
record is the better answer. OBS-027 carries the numbers and the three
other refusals with them.

**No banner cleanup.** Removing 71 hand-written banners is a corpus
rewrite (WF-003 territory) and it is not obviously right: a banner
often says *what superseded this and why*, which a status field cannot.
What is now redundant is the bare `**Superseded**` prefix, not the
sentence after it.

### The pin

`tests/unit/status-disclosure.test.ts` walks the surfaces rather than
asserting a line, in FRICTION-050's shape — the invariant is that
*every* read surface says whether a record is live, so a fifth one
fails here.

The two search surfaces are reached through exported formatters
(`formatSearchHit`, `formatHitHeader`) because they cannot otherwise
run without loading the real ONNX embedder, which the suite never does.
Exporting the thing the invariant is about, instead of asserting on a
literal, is what `WHERE_DEDICATED_PARAMS` did for FRICTION-050.

Tests 851 → 858, files 50 → 51.
