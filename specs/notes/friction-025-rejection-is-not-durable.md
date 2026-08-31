---
id: FRICTION-025
title: "Rejection is not durable — every sweep re-judges the same residue, and the residue only grows"
collection: notes
status: resolved
fixed_date: 2026-08-28
resolution_approach: fix
description: "suggest-edges now has an accept surface (PROPOSAL-028) but no reject surface. A skipped candidate is recorded nowhere, so every future sweep re-surfaces it and the agent must re-derive the same judgment from taxonomy prose. The re-judged residue was 86 at OBS-011, 116 at OBS-014, and it grows with the corpus — the cost of a sweep is now dominated by re-litigating decisions already made."
severity: inconvenient
source: self-hosting (OBS-014 drain)
relationships:
  - references: OBS-014
    context: "the drain that surfaced it: 116 of 251 live candidates skipped, most of them re-judgments of decisions OBS-011 had already made and written down in prose only"
  - references: OBS-011
    context: "the first triage, whose 86 skips are the standing baseline — it predicted the residue would reappear by design and made itself the answer, which works exactly as long as someone reads it"
  - references: PROPOSAL-028
    context: "shipped the accept half of the loop; this is the symmetric gap it deliberately left, and the drain is the first evidence of what that gap costs"
  - references: DP-001
    context: "the constraint any fix must clear: a rejection list is data an agent authored (Tier 1), but a scanner that silently suppresses candidates is deciding what the agent gets to see — the line is visibility, not storage"
  - references: PROPOSAL-046
    context: "the shape this note declined to settle, settled and shipped — the review row grows a second verdict rather than the loop growing a second file, and a rejection is keyed to the source body it was judged against"
---

# FRICTION-025: rejection is not durable

## What I was doing

Draining the corpus-wide suggest-edges backlog (OBS-014) with the new
`--accept-from` applier.

## What went wrong

Nothing broke — but of 251 live candidates, **116 were skipped, and
most of them were skips OBS-011 had already made on 2026-07-11.** The
tool has no memory of a rejection. It cannot: a skip is expressed by
*deleting a row from the review file*, and a deleted row leaves no
trace anywhere.

So every sweep re-surfaces the entire residue, and an agent must
re-derive each judgment from the taxonomy prose in OBS-011 — which
only works as long as someone finds and reads that record. OBS-011 saw
this coming and made itself "the standing answer to why." That is a
documentation fix for a data problem, and the numbers show it not
holding:

| sweep | individually skipped | re-judged from prose |
|---|---|---|
| OBS-011 (2026-07-11) | 86 | — |
| OBS-014 (2026-07-14) | 116 | most of the 86 |

The residue grows with the corpus, and it is *permanent* by
construction: an anticipated next-free-number that landed on different
content will never become an edge, and a batch task whose targets are
file paths will never surface anything but its range endpoints. Those
candidates are not pending work. They are answered questions being
asked again.

The cost is now real: the accept half of a sweep is cheap (one
command), and the reject half is the entire expense.

## Workaround

Re-judge them. OBS-014 spent seven parallel agents doing so, and the
prune of superseded sources (117 candidates) still ran as a scratch
script against the cache, exactly as OBS-011's did — the *second* time
that same jq-shaped step has been hand-rolled.

## What should change

A reject surface, symmetric with the accept one. The shape is not
obvious and this note deliberately does not settle it — but the
constraints are clear:

- **A rejection is data the agent authored**, so recording it is Tier 1
  (DP-001). Storing it is not the risk.
- **Suppressing a candidate silently is not.** A scanner that hides
  what it once suggested is deciding what the agent is allowed to see,
  and a rejection recorded today may be wrong tomorrow — the source
  text can change under it. Any suppression must be visible, reversible,
  and keyed to something that invalidates it when the text moves (a
  content hash of the source, say).
- **The superseded-source prune is a separate, purely mechanical want**
  — `--exclude-status superseded` mirrors search's existing filter
  vocabulary, and OBS-011 already flagged it. It would have removed 117
  of the 138 standing-rule prunes here without any judgment at all.
  That half is cheap and should probably go first.

Two hand-rolled prunes across two sweeps is the DP-003 clause-3 signal
starting to blink. It is not yet three.

## Partial resolution (2026-07-21) — the mechanical half only

**Stays open.** The core ask — a durable, content-hash-keyed *reject* surface
symmetric with the accept one — is unbuilt and still wants a discussion to
settle its shape (visible, reversible, invalidated when the source text moves).
What shipped is the "separate, purely mechanical want" this note broke out: the
superseded-source prune.

**What shipped (commit `49357bb`):** `docdog suggest-edges` gained
`--status` / `--exclude-status`, mirroring `search`'s filter vocabulary
clause-for-clause (`SuggestOptions.status` / `.excludeStatus` in
`src/storage/suggest.ts`; the two flags in
`src/cli/commands/suggest-edges.ts`, echoed into the `--format review` header).
`--exclude-status superseded` drops superseded sources at the SQL layer with no
judgment. Measured on this corpus: **440 → 323 mentions (143 → 89 sources)** —
the pruned **117** matches OBS-014's "117 superseded-source" standing-rule
prune exactly. That is the jq-shaped step OBS-011 and OBS-014 each hand-rolled,
now a flag. Tests: a self-contained status-filter fixture in
`storage-suggest.test.ts` (no filter → all; exclude superseded → the rest;
allowlist current → only current).

**What is explicitly NOT resolved:** rejection is still not durable. A skip is
still expressed by deleting a row and leaves no trace; the residue of genuinely
judged rejections (third-party mentions, path-enumeration endpoints, answered
next-free-numbers) will still re-surface every sweep. `--exclude-status` removes
the one slice of that residue that never needed a human — it does not record a
single human decision. The DP-003 clause-3 count for the *reject surface* is
unchanged by this.

**Next:** open a DISC for the durable reject surface (the shape this note
declined to settle), which is the design-track item the triage that produced
this partial fix routed away from the quick-wins path.

## Resolution (2026-08-28) — PROPOSAL-046

**Closed.** The judged half now has a surface, and it is not a second
command: `--format review` still emits one row per candidate, and the
reviewer either writes a `context:` (accept), replaces it with a
`reject: <why>` (refuse, durably), or deletes the row (defer — the old
meaning, kept). `--accept-from` applies both verdicts in one pass:
edges into the sources' frontmatter, rejections into
`.docdog/rejected-edges.yaml`, tracked in git.

### What the note asked for, and what answers it

The note named three constraints. Each maps to one mechanism:

| constraint | mechanism |
|---|---|
| storing a rejection is Tier 1 | a flat YAML ledger of `(from, to, reason, source_hash)` |
| suppression must be **visible** | a count printed on every human-readable run, `--show-rejected` to see through it, and `--json` carrying every suppressed row with its `rejected` marker |
| suppression must be **reversible** | delete the row; the whole undo |
| it must be **invalidated when the source text moves** | `source_hash` is `vertices.content_hash` |

The fourth is the one worth reading twice. `content_hash` was already a
sha256 over the section's **body** — LF-normalized, frontmatter
excluded — and both halves turn out to be load-bearing. Frontmatter is
outside it, so **accepting an edge cannot invalidate a rejection on the
same source**; without that, a drain would expire its own judgments as
it ran and the feature would appear to work exactly once. Body is
inside it, so editing the prose does expire them, which is precisely
what was asked. Nothing had to be designed for either.

### The measurement that says the documentation fix did not hold

OBS-011 named six skips by id and made itself "the standing answer to
why." Every one of the six was still a live candidate on 2026-08-28 —
48 days and two full drains later:

```
DISC-021 -> PROPOSAL-024   LIVE
OBS-003  -> PROPOSAL-013   LIVE
OBS-003  -> PROPOSAL-014   LIVE
OBS-010  -> PROPOSAL-024   LIVE
DISC-012 -> PROPOSAL-018   LIVE
OQ-45    -> PROPOSAL-018   LIVE
```

And the residue kept growing, as the note predicted: **251 live
candidates at OBS-014, 474 today** (591 raw, 474 after
`--exclude-status superseded`). Those six are now the ledger's first
rows, transcribed from OBS-011's own taxonomy rather than re-judged.
The reasons stop living in one record's prose and start travelling with
the candidate.

### What the re-affirm loop costs, and why the coarse key is affordable

Invalidation is per *body*, so a typo fix in OBS-011 expires all
nineteen of its rejections at once. That is deliberate, and it is only
affordable because **a stale rejection comes back carrying its reason**:
the review document re-emits it pre-filled with `reject:` and a note
that the text moved, so leaving the row alone re-affirms it and
refreshes the hash. Re-affirming is a glance; re-deriving was the entire
cost this note measured.

### Two decisions made against the grain, and one bug the corpus found

- **A reason is mandatory with no override.** `--allow-empty-context`
  exists because "accept now, contextualize later" is a real state. The
  reason has no analogue: an empty one recreates exactly this friction,
  written down.
- **A filter is not a rejection, and must never become one.**
  `--exclude-status superseded` — this note's own partial fix — says
  *do not scan this source*. A ledger row says *this pair was judged*.
  A `--reject-matching <pattern>` flag would let a rule stand in for a
  judgment, and it is the DP-001 tier-3 line for this feature.
- **Orphans can only be counted on a whole-corpus scan.** Found by
  running the shipped tool on this repo: under `--id "OBS-003"` every
  ledger row about another source "matches no candidate" and was
  reported as dead, so the report was loudest exactly when it was least
  true. It is gated on an unfiltered scan now. Suppression counts stay
  correct under a filter because they are per-candidate; this was not.

### What is deliberately still not built

- **No reaping.** An orphaned row is reported and never removed: which
  of the four ways it went orphaned (mention deleted, edge declared,
  record removed, id renumbered) is not in the data, and a dead row
  costs one line.
- **`docdog renumber` does not rewrite the ledger.** Checked for
  direction rather than fixed: a stale `from`/`to` makes the row match
  nothing, so the candidate is **re-offered**. Every failure mode here
  re-asks; none hides.
- **No `docdog status` roster of the ledger.** The count already prints
  on every sweep, which is where the number is actionable.

Tests: `tests/unit/storage-rejections.test.ts` (24), pinning the
partition of the three states, the survives-an-accept property, the
expires-on-body-change property, and the empty-reason and
two-verdict refusals. Suite 784 → **808**.
