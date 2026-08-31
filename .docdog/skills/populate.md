---
name: populate
description: Initial agentic pass to extract relationship edges across all indexed sections
---

# Populate

Extract relationship edges from indexed sections to build the graph. Run this
after initial indexing to connect decisions, requirements, principles, and other
sections via typed edges.

## When to use

- After first `docdog index` on a new project — vertices exist but no edges
- After bulk ingestion of new content
- Periodically to catch edges missed in incremental work

## Workflow

### 1. Get graph status

```
docdog_status({})
```

Note which collections have vertices. Focus on the largest collections first.

### 2. Run the mechanical sweep first

```bash
docdog suggest-edges                      # whole corpus
docdog suggest-edges --collection decisions
docdog suggest-edges --id "DD-*" --json   # machine-readable
```

This scans every indexed body for mentions of other known record ids that
have no declared edge yet (read-only — it never writes). It is exhaustive
where reading a sample of records is not. Each suggestion is a *candidate*,
not a fact: the mention might be a rejection ("unlike DD-020"), an example,
or noise.

Sources flagged `[not writable via relate — multi-record file]` are
split/table/script-parsed; record those edges from the citing local record
instead, or edit the file directly.

### 3. Review and accept in bulk (the loop)

For anything past a handful of candidates, drain them through the review
file instead of one `docdog_relate` call each:

```bash
docdog suggest-edges --format review --collection decisions > candidates.yaml
# edit candidates.yaml — see below
docdog suggest-edges --accept-from candidates.yaml --dry-run   # rehearse
docdog suggest-edges --accept-from candidates.yaml             # apply
```

`--format review` emits a flat YAML list of candidates; `--accept-from`
reads that same file back and applies it — kept rows become forward edges in
their source's frontmatter (one write and one reindex per *file*, not per
edge), refused rows become durable rejections. Your edit of that file **is**
the judgment (see step 4). Each row takes exactly one of three moves:

| what you do to the row | what it means |
|---|---|
| write a `context:` | accept — it becomes an edge |
| replace `context:` with `reject: <why>` | refuse it, durably |
| delete it | defer — it comes back on the next sweep |

- **Write a `context:` for every row you keep.** An empty context is
  refused by default — a bare edge is one someone has to come back and
  explain later. (`--allow-empty-context` overrides, but don't.)
- **Fix the `type:`** where `references` undersells the relationship.
- **Write a `reject:` reason whenever you actually judged it.** One
  sentence. It is what a future sweep reads instead of re-deriving your
  reasoning, and an empty one is refused with no override — a reasonless
  rejection is the thing this is here to stop.

Re-running the same file is a no-op, so a large backlog can be drained in
reviewed batches without tracking which batch already landed. Rows whose
source is a multi-record file are omitted from the review document (nothing
can patch their frontmatter) — a footer names them; use `--format yaml` for
a paste-ready fragment.

There is no `--accept-all` and never will be: the tool applies the file you
reviewed, and nothing else. There is no bulk reject either, for the same
reason.

### 3b. What a rejection does afterwards

Rejections live in `.docdog/rejected-edges.yaml`, tracked in git beside the
corpus. Later sweeps stop offering those pairs, and say how many they held
back:

```
6 candidates suppressed by .docdog/rejected-edges.yaml — rerun with --show-rejected to see them.
```

- **`--show-rejected`** puts them back in the report, each with the reason it
  was refused, and lists ledger rows that no longer match any candidate.
- **A rejection expires when the source record's body changes.** The
  candidate returns on the next sweep pre-filled with your old reason and a
  note that the text moved — leave the row alone to re-affirm it, or swap
  `reject:` for `context:` if the new text earned the edge. Appending edges
  to a record does *not* expire its rejections: the key is the body, and
  `relationships:` is frontmatter.
- **To un-reject a pair, delete its row.** That is the whole undo.

Reject the things you judged; delete the rows you are just not judging
today. The ledger is worth having because its reasons are real.

### 4. Judge each candidate

For each suggested `source → target`:

1. `docdog_get` the source and read the sentence around the mention.
2. Confirm the target is really being referenced (not quoted, not rejected).
3. Pick the type — `references` is the suggested default; upgrade it when
   the text says more (see the table below).
4. Record it — in a bulk drain, by writing the type and context into that
   row of the review file; one-off, via `docdog_relate`:

```
docdog_relate({
  from_id: "DD-ARCH-09",
  to_id: "DP-11",
  type: "constrains",
  context: "DP-11 requires halting when saga compensation outcome is uncertain",
  anchor_text: "per DP-11 (Defensive Halting)"
})
```

Refuse freely — a wrong edge is a lie in the graph. Say *why* when you
refuse: a `reject:` reason costs one sentence now and saves the whole
judgment next time, while a deleted row costs nothing now and costs the
judgment again on every future sweep.

### 5. Second pass: semantic references (reading required)

The sweep only finds *literal id mentions*. References by name — "per the
abstraction principle", "as required by provisioning", a glossary term used
by name — need reading. Work through one collection at a time:

```
docdog_search({ query: "*", collection: "decisions", limit: 20 })
docdog_get({ id: "DD-ARCH-09" })
```

Look for semantic references, supersession phrasing, and term usage; verify
each target exists (`docdog_get`) before submitting — don't create dangling
references.

## Relationship type selection guide

| Pattern in text | Type |
|---|---|
| "per DP-11", "as specified in FR-*" | `references` |
| "constrained by", "limited by", "must follow" | `constrains` |
| "implements FR-*", "satisfies requirement" | `implements` |
| "replaces DD-*", "supersedes", "updated from" | `supersedes` |
| Uses a glossary term by name | `uses_term` |
| "see also", "related to", "companion to" | `companion` |
| Applies broadly across many areas | `cross_cutting` |
| "based on Refinement 0068" | `sourced_from` |

## Rules (DD-040)

- **Outbound only.** Link FROM the section you just read TO the target.
- **Only certain edges.** If you're not confident, skip it.
- **One pass per section.** Don't revisit — gaps are expected and filled later.
- **Include anchor_text** when there's a specific phrase you can point to.

## Batch strategy

For a large corpus (300+ sections):
1. Sweep first (`docdog suggest-edges`) and drain the candidate list through
   the review file (`--format review` → edit → `--accept-from`) — filter with
   `--collection` or `--id` to keep each batch reviewable
2. Then the reading pass: decisions first — they reference everything else
3. Then requirements — they reference principles and constraints
4. Skip glossary terms — they'll get `uses_term` edges from the other directions

Report progress: "Sweep: 87 candidates, 61 accepted, 26 skipped. Reading
pass: 15/59 decisions."
