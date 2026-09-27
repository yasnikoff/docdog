---
id: PROPOSAL-046
title: "A durable reject surface for suggest-edges — the reviewed file carries two verdicts, and a rejection is keyed to the body it was judged against"
collection: notes
status: shipped
date: 2026-08-28
description: "suggest-edges has an accept surface and no reject surface, so every sweep re-judges the same residue and the residue only grows — 251 live candidates at OBS-014, 474 today. The fix is not a second command but a second verdict on the row that already exists: an agent replaces `context:` with `reject: <reason>` and `--accept-from` records the pair in `.docdog/rejected-edges.yaml`, keyed to the source's `content_hash`. Suppression is counted out loud on every run, reversible by deleting a line, and invalidated the moment the body it was judged against changes — at which point the candidate comes back carrying its old reason, so re-affirming costs a glance instead of a re-derivation. Deleting a row keeps its current meaning (defer), which makes three verdicts out of two keys and no new grammar."
severity: n/a
relationships:
  - references: FRICTION-025
    context: "the friction this closes: the note broke off the mechanical half (--exclude-status, shipped 49357bb) and asked for a discussion to settle the shape of the judged half — this is that shape"
  - references: PROPOSAL-028
    context: "shipped the accept half and named this as the symmetric gap it was deliberately leaving; this extends its review file rather than adding a parallel one, because round-trip symmetry is the property that made that loop work"
  - references: OBS-011
    context: "the skip taxonomy whose five categories are what a rejection reason records — the reasons stop living only in that record's prose and start travelling with the candidate"
  - references: OBS-014
    context: "the drain that measured the cost: 116 individual skips, most of them re-judgments of OBS-011's 86, and a sixth category discovered because nothing carried the first five forward"
  - references: DP-001
    context: "the constraint: recording an agent's rejection is tier 1, suppressing a candidate silently would be tier 3, and the line between them is the visible count and the reversible file"
  - references: DP-003
    context: "clause 3's second instruction — open a proposal when the right shape is not obvious, which is exactly what FRICTION-025 said about itself"
  - references: PROPOSAL-024
    context: "the scanner this suppresses candidates from; its report-don't-decide posture is what a reject ledger must not quietly undo"
  - amends: PROPOSAL-028
    context: "the review file's reject meaning: deleting a row now defers, and refusal is an explicit reject: verdict recorded in a ledger"
---

# PROPOSAL-046: a durable reject surface

## The gap

`docdog suggest-edges` reports every id mention with no declared edge.
An agent judges each one. Accepting is one command (`--accept-from`);
**rejecting is expressed by deleting a row from the review file, and a
deleted row leaves no trace anywhere.**

So the residue is re-judged from scratch every sweep, and it grows:

| sweep | live candidates | individually judged rejections |
|---|---|---|
| OBS-011 (2026-07-11) | 354 | 86 |
| OBS-014 (2026-07-14) | 251 | 116 |
| today (2026-08-28) | **474** | — |

The accept half of a drain is one command. The reject half is the
whole expense, and the expense compounds.

FRICTION-025 shipped the purely mechanical slice of this
(`--exclude-status superseded`, which drops 117 sources no one needs to
look at) and deliberately declined to settle the judged half. This
settles it.

## The shape: one file, two verdicts, three moves

The review document already exists and already **is** the record of the
agent's judgment. It does not need a sibling. It needs a second key.

`--format review` emits, unchanged:

```yaml
  - from: OBS-011
    to: PROPOSAL-018
    type: references
    context: ""
```

The reviewer has three moves, of which only the middle one is new:

| move | meaning | what happens |
|---|---|---|
| fill `context:` | accept | an edge, as today |
| replace `context:` with `reject: "<reason>"` | **reject, durably** | a row in the ledger |
| delete the row | defer | resurfaces next sweep, as today |

Deleting keeps its current meaning on purpose. "I am not judging this
now" is a real answer and the tool should not force it into one of the
other two. What changes is that it stops being the *only* way to say no.

## The ledger

`.docdog/rejected-edges.yaml`, tracked in git, next to the corpus it
describes — not in the cache, which is disposable by construction and
would lose the one artifact this whole proposal exists to preserve.

```yaml
version: 1
rejections:
  - from: OBS-011
    to: PROPOSAL-018
    reason: "anticipated next-free-number — PROPOSAL-018 landed on different content"
    source_hash: "sha256:1f0a…"
```

Four fields, and the interesting one is the last.

**Keyed to `vertices.content_hash`.** That column already exists and is
already exactly right: it is a sha256 over the section's **body**,
LF-normalized, frontmatter excluded. Two consequences fall out of that
one fact, and neither had to be designed:

- **Accepting an edge does not invalidate a rejection.** An accept
  patches the `relationships:` block, which is frontmatter, which is not
  in the hash. A drain that accepts twelve edges from a source keeps
  that source's forty rejections.
- **Editing the prose does.** The mention now sits in text nobody
  judged, so the judgment expires. That is FRICTION-025's stated
  requirement — *invalidated when the source text moves* — and it costs
  a column lookup.

**No timestamp.** The file is tracked, so `git blame` answers "when",
and a date field on a row invites the one semantics that would be wrong
here: a rejection does not expire with time, it expires when the text
changes. Better not to offer the hook.

## Behavior

**Fresh rejection** (hash matches): the candidate is suppressed from the
report, and the run says so — `12 candidate(s) suppressed by
.docdog/rejected-edges.yaml (--show-rejected to list them)`. Never
silent, on any run, in any format.

**Stale rejection** (hash differs): the candidate comes back — **carrying
its old reason**. In the review document it is emitted pre-filled:

```yaml
  # previously rejected, and OBS-011's body has changed since —
  # keep the row to re-affirm, or swap reject: for context: to accept
  - from: OBS-011
    to: PROPOSAL-018
    type: references
    reject: "anticipated next-free-number — PROPOSAL-018 landed on different content"
```

Leaving the row alone re-affirms it and refreshes the hash. This is what
makes the coarse key affordable: invalidation is per *body*, so a typo
fix in OBS-011 expires all nineteen of its rejections at once — but
re-affirming nineteen pre-filled rows is a glance, not a re-derivation,
which is the entire cost FRICTION-025 measured.

**Reversal** is deleting a line from a YAML file.

**`--json` reports everything**, suppressed rows included, each carrying
its `rejected: { reason, stale }` marker. The machine surface is where a
consumer most needs to see the ledger's effect, and hiding rows from it
while calling the suppression visible would be a contradiction.

## Guards

- **An empty reason is refused**, and there is no flag to override —
  unlike `--allow-empty-context`, which has a defensible use (accept
  now, contextualize later). The reason **is** the artifact here; an
  empty one recreates precisely the problem this closes.
- **A row carrying both a non-empty `context` and a `reject` is refused**
  — one row, one verdict. An empty `context: ""` alongside a `reject:`
  is tolerated, because it carries no information and is what the
  emitter itself wrote.
- **`type:` is required to accept and ignored to reject.** A rejection is
  keyed on the pair: the scanner only ever suggests `references`, and
  "this mention is not an edge" says nothing about which type it would
  have been.
- **A reject row whose source is not in the cache is skipped and
  reported**, not stored — there is no body to key it to. Same posture
  as `source_not_found` on the accept side.
- **`--dry-run` writes neither edges nor ledger.**

## Every failure re-asks

The failure modes were checked for direction, and they all point the
same way:

- `docdog renumber DD-050 DD-090` does not rewrite the ledger, so its
  rows go orphaned → the candidate is **not** suppressed → re-offered.
- A record is deleted, a mention removed, an edge declared by hand → the
  row matches nothing → inert.
- The cache is rebuilt from scratch → hashes recompute identically →
  suppression survives, because the key is content, not row identity.

There is no reachable state in which a rejection hides a candidate it
was not judged against. Orphaned rows are reported under
`--show-rejected` and never reaped: reclaiming them is the user's call
and a dead row costs one line.

## Design principles walk

**DP-001 — agent-first mechanics.**

- *Tier 1 (pure mechanics):* reading a file of agent-authored pairs,
  set-differencing them against the scan, comparing two hashes. Every
  operation here is one of those three.
- *Tier 2 (visible default with override):* suppression is on by default
  with `--show-rejected` to see through it, and the count is printed on
  every run whether or not you asked. Compare `--exclude-status`, which
  is the same posture one layer out.
- *Tier 3 (forbidden, and named so it stays forbidden):* inferring that a
  candidate should be rejected; scoring confidence; a
  `--reject-all-remaining` flag; deriving a rejection from a pattern
  ("everything under `.docdog/skills/`"). The last one is the tempting
  case and the answer is that **a filter and a rejection are different
  claims**: `--exclude-status superseded` says *do not scan this source*,
  a ledger row says *this pair was judged*. Conflating them would let a
  rule stand in for a judgment, which is the exact substitution DP-001
  exists to prevent.

**DP-003 — comprehensive toolbelt.** Clause 2's promise: the reject half
of the loop's most common operation has no command, so a drain reaches
for prose and parallel subagents instead. Clause 3's second instruction —
*open a proposal if the right shape isn't obvious* — is what FRICTION-025
said about itself in as many words.

**DP-002 — concepts carry meaning.** Not engaged. The ledger holds no
vocabulary; a rejection names a pair and a sentence.

## What this is not

- **Not a second command.** `--reject-from` would fork the review file
  into two documents an agent has to keep in step, and PROPOSAL-028's
  finding is that round-trip symmetry — what the tool emits is exactly
  what it eats — is what makes the loop survive a real drain.
- **Not a cache table.** The cache is disposable and the ledger is
  judgment.
- **Not garbage-collected.** Report orphans, reap nothing.
- **Not an expiry.** Rejections expire on text movement, never on time.
