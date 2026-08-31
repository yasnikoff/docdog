---
id: FRICTION-028
title: "A malformed relationship entry silently becomes a phantom edge and drops every real one"
collection: notes
status: resolved
resolution: fixed
description: "RESOLVED — writing `- type: X / target: Y` instead of `- X: Y` parsed as a well-formed edge to a record named 'X', dropping five real edges with zero warnings. Fixed three ways: the shape is refused at parse time, and `docdog index` now warns on unregistered relation types and dangling targets."
severity: inconvenient
relationships:
  - references: PROPOSAL-003
    context: "the type-as-key relationships design this friction is a consequence of — the extractor is spec-correct; the spec's forward-compat tolerance for unknown sibling keys is what swallows the error"
  - references: DP-001
    context: "every fix proposed here is tier 1-2 mechanics (a warning against a declared registry, a typo guard), but the corpus has already rejected one code-side relation warning under DP-001 — that tension is the open question"
  - references: DISC-028
    context: "hit while writing this discussion's records — the dogfooding instance that surfaced it"
---

# FRICTION-028: A malformed relationship entry becomes a phantom edge, silently

## What I was doing

Authoring two records by hand (DISC-028, PROPOSAL-033), each with a
five-entry `relationships:` block, then `docdog index`.

## What went wrong

I wrote the block in the wrong shape — the plausible-looking one:

```yaml
relationships:
  - type: relates_to      # WRONG
    target: DD-070
    context: "…"
```

The correct shape is type-as-key (PROPOSAL-003 §1):

```yaml
relationships:
  - references: DD-070    # RIGHT — the key IS the relation type
    context: "…"
```

`docdog index` reported **`11 edges`** and **no warnings**. Traverse then
found nothing:

```
$ docdog traverse PROPOSAL-033 --depth 1
No connections found from PROPOSAL-033.
```

The cache explains it:

```sql
select from_id, to_id, type from edges where from_id='DISC-028';
-- DISC-028 | relates_to | type
```

**One dangling edge to a record named `relates_to`, of type `type`. All
five real edges gone.** Both records, same failure. The `11 edges` in the
index summary counted them as successes.

## Why it's silent — the mechanism

`extractRelationships` (`src/engine/relationships/extract.ts`) takes the
**first non-metadata key** as the relation type and its value as the
target id; `context` / `anchor_text` / `role` are the only reserved
metadata keys, and *unknown sibling keys are tolerated and dropped for
forward-compat* (its own header comment, line 8).

So `{type: "relates_to", target: "DD-070", context: "…"}` parses as:
type = `type` (first non-metadata key), target = `relates_to` (a
non-empty string — passes the only validation there is), and `target:
DD-070` is discarded as an unknown metadata key. Every check in the
extractor passes. There is no warning to emit, by construction.

Three separate safety nets are absent:

1. **No registry check at index time.** The extractor is deliberately
   registry-free ("no registry lookup, no target resolution" — its
   header). `RelationsRegistry` resolves unknown types to `known: false`,
   but nothing turns that into an index-time warning. A type literally
   named `type` sailed through.
2. **No target shape check.** `relates_to` does not look like an id under
   any convention this corpus uses, and nothing said so.
3. **No dangling-target check.** The edge points at a record that does not
   exist. Docdog is a two-pass indexer, so this is knowable after pass 2.

## Workaround

Rewrite the block in the correct shape, reindex, verify with `traverse`.
Total cost ~10 minutes, and only because I happened to run `traverse` to
check my own work. An agent that trusted the `11 edges` summary would
have committed a record with **zero usable edges** and never known.

## Why the severity taxonomy understates this

It is `inconvenient` by the letter — nothing blocked, I recovered fast.
But the failure is **silent and the damage is invisible**: DD-034 holds
that retrieval depends on the relationships block more than on the prose,
and this drops the whole block while reporting success. The exposure is
hand-authored and agent-authored files — which is exactly how this corpus
is written, and how `docdog_create` callers supplying their own
frontmatter would write it too.

Same family as FRICTION-019 (malformed frontmatter silently swallowed):
the corpus loses structure and nothing says a word.

## What should change

All mechanical, no judgment — DP-001 tier 1-2:

1. **Warn when an entry contains a `target:` key.** Nothing in the schema
   uses it, so its presence means the author reached for the type/target
   shape. Dead cheap, catches exactly this mistake, zero false positives.
2. **Warn when the relation type is not in the registry.** This is the
   general fix — it catches every typo'd or invented type, not just this
   shape. Wrinkle to design around: the registry is cache-derived, so on a
   cold `--full` rebuild it may be empty mid-index; the check belongs in a
   post-pass, after the concept records are in.
3. **Warn on a dangling target after pass 2.** Broader value than this
   bug; needs a decision about intentionally-forward edges.

## The tension to resolve first

FRICTION-012's resolution **rejected a code-side inverse-form warning**
under DP-001 / DISC-023. That precedent is about relation *semantics*
(is `superseded_by` the wrong direction?) — a judgment call, correctly
kept out of code. The warnings proposed here are typo checks against a
**declared** registry and a schema key that does not exist: mechanical,
not semantic. I believe they fall on the allowed side of the same line,
but the line has been drawn once already and whoever picks this up should
say so explicitly rather than assume it.

---

# Resolution (2026-07-14) — all three shipped

**The DP-001 tension, settled explicitly** (as this record asked for, rather
than assumed): all three checks are on the allowed side, and the line is
*"who decides?"*, not *"how clever is the check?"*. FRICTION-012's rejected
warning asked code to judge whether an edge's **direction** was semantically
right — a question with no mechanical answer. These three ask whether a key is
in a fixed forbidden set, whether a type is in a **declared** registry, and
whether an id has a row. Facts, all three, and every one of them stays
**advisory**: the corpus is never blocked, and nothing is auto-repaired.

### 1. The shape is refused, not reinterpreted (`extract.ts`)

`type` and `target` are now **forbidden keys**. An entry carrying either is
skipped with `entry_uses_type_target_shape`, naming the correct shape. It is
refused rather than *repaired* into the edge the author obviously meant —
guessing intent is tier 3, and a cache that silently corrects the file would
diverge from the markdown that DD-070 makes the source of truth. The file is
wrong; the file gets fixed.

Zero false positives by construction: `target` is in no schema, and no
relation type is named `type`. That is what buys the right to refuse outright
instead of merely warning. PROPOSAL-003's forward-compat tolerance for unknown
sibling keys is **untouched** — `- references: X` + `weight: 3` still parses
clean. A bug fix does not get to quietly amend a spec clause.

### 2 + 3. Corpus-wide post-pass (`storage/edge-health.ts`)

Unregistered relation types and dangling targets are both properties of the
*whole* corpus — one needs the registry, the other needs every id — so they run
after indexing, gated on `!pathScoped`, exactly like `recordContestedIds`. That
gate matters: without it every `docdog_relate` (a one-file reindex) would
report defects in files it never touched. Empty registry ⇒ no opinion, so a
corpus with no concept records isn't buried in noise.

**Warnings only — deliberately not persisted.** Contested ids earned a table
because the losing record is *invisible*: no query reaches it, so a scrolled-past
warning was its only trace. A bad edge is not invisible — it is in the
frontmatter the author is looking at, and `traverse` shows it. The warning fires
when it can be acted on. No `SCHEMA_VERSION` bump.

### Rejected: a target *shape* check

The mechanism section above wanted one ("`relates_to` doesn't look like an id").
It would need to know this corpus's id conventions — `DD-070`, `SPEC-004`,
`CONCEPT-RELATION-BLOCKS` — and inferring an id *pattern* is tier 3. The
dangling check is the mechanical form of the same question: not *does this look
like an id*, but *does a record with this id exist*. That is a fact, and it
strictly dominates the pattern guess.

### Measured before shipping, on this corpus (1,444 edges)

- **Unregistered types: 0.** All 13 types in use are registered — so the check
  is zero-noise here, and would have caught `type` the moment it appeared.
- **Dangling targets: 3** — and they are *not* the bug this record is about.
  They are a finding of their own (below).

349 tests (+10). The friction that produced this record now fails loudly at the
entry, and would be caught again by the dangling check if it somehow got past.

## What the dangling check found on its first real run

Three edges in PROPOSAL-019/020/021, all `sourced_from: "orchestrator sidecar
planning — …"` — a **prose sentence where an id belongs**, pointing at an
external planning session that is not, and never was, a record in this corpus.

They are not typos. They are docdog having **no way to express provenance to
something outside the corpus**, and an author reaching for the nearest thing
that would hold the sentence. That is a design gap, so these three are left
alone pending a decision rather than quietly deleted — deleting the edge would
delete its `context:`, which is the actual provenance. Recorded here so the
next sweep does not "fix" them by reflex.

**Follow-on question, not answered here:** should a relation be allowed an
external, non-record target? Or should provenance-to-the-outside-world be prose,
and these three edges become prose?
