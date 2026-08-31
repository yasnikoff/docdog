---
id: FRICTION-033
title: The embed key covers the content but not the recipe that consumes it — changing the cap silently mixes two vintages of vector
collection: notes
status: resolved
resolution: fixed
description: The embed store is keyed (content_hash, model), where content_hash is taken over the FULL record body and embedInput truncates at MAX_EMBED_CHARS afterwards. So the cap — an input to the embedding function exactly as the model is — is absent from the key. Change it and every unchanged record returns its vector from the old recipe while edited records get the new one, producing a corpus of mixed vintages that nothing can detect. CLAUDE.md carries the remedy as a human rule ('if changed, drop the embed store') in a codebase that mechanically versions everything else. OBS-019 ran exactly this experiment and was immune only because its harness keyed on sha256(the embedded text) — the correct key, arrived at independently.
date: 2026-07-20
severity: inconvenient
relationships:
  - references: OBS-021
    context: the measurement that reads the key as (content_hash, model) and reasons carefully about what grows it, without noticing that the second half of the recipe is missing from it — the growth analysis is unaffected, the key analysis is where this note attaches
  - references: FRICTION-031
    context: the note that put the cap on the record; this is the same constant seen from the storage side rather than the retrieval side — that one asks what truncation costs, this one asks what happens when the number changes
  - references: OBS-019
    context: "the one run that has ever changed the cap, and the reason this is filed as exposure rather than damage: its harness keyed on sha256(the embedded text), which is byte-identical to what the design emits, so it measured cleanly — the correct key, arrived at independently by the eval and never fed back into production"
  - references: OBS-017
    context: a second recipe change with identical exposure — prepending the description alters the embedded text while leaving content_hash untouched, so if that design had shipped it would have hit this the same way; the bug is not about the cap, it is about every input the key does not name
  - references: DD-051
    context: the decision that established content-hash keying for embeddings; nothing in it is wrong — the hash correctly identifies the content, it just never claimed to identify the function applied to it
  - references: PROPOSAL-029
    context: "what makes the mixture durable rather than transient: rows now survive in a file no SCHEMA_VERSION bump drops, so a stale-recipe vector persists across every rebuild that would once have cleared it"
  - references: DP-001
    context: tier 1 throughout — composing a key from values the config already holds is arithmetic; nothing here infers anything or decides what a user meant
---

> Found by reading `storage/embed-store.ts` and `storage/indexer.ts` during a
> review of docdog's program/data version-mismatch protections, not by a
> failure. Nothing is currently broken — `MAX_EMBED_CHARS` has not moved since
> v3 step 3. This records the trap before someone moves it.

## What I was doing

Auditing every place docdog detects that its code and its data disagree:
`SCHEMA_VERSION` on `index.db`, `EMBED_SCHEMA_VERSION` on `embeddings.db`,
and the `meta.embed_model` check in the indexer. The first two are careful
work — mismatch drops and rebuilds on the write path, refuses with an
actionable error on the read path, and `!==` catches downgrades as well as
upgrades. The model check is better still: a model switch is caught in
`meta`, logged, and forces a full reindex, and the store's key contains
`model`, so even without that check the lookups would miss cleanly.

Then I asked what else is an input to the embedding function.

## What went wrong

The store's key is `(content_hash, model)`. `content_hash` is taken over the
**full** LF-normalized body. Truncation happens afterwards:

```ts
// storage/indexer.ts — resolveEmbeddings
const hit = store.get(s.contentHash, model);        // full-body hash
if (hit) { blobs[i] = hit; reused++; }
else { misses.push({ index: i, text: embedInput(s.content), hash: s.hash }); }
//                          ^ truncated here          ^ stored under the untruncated hash
```

`embedInput` slices at `MAX_EMBED_CHARS`; `s.contentHash` passes through
untouched and is what the vector is filed under. So the cap is an input to
the function that produced the vector, and it is not in the key.

Change the cap and:

- every record whose content did **not** change returns its old vector,
  computed under the old cap;
- every record that was edited since gets re-embedded under the new one.

The corpus ends up holding two vintages of vector, in a ratio determined by
edit history, with no version anywhere that could detect it. Search returns
confident results the whole time. This is the same failure shape
FRICTION-028 and FRICTION-019 already cost this project — well-formed
output, nothing reported — arriving through a third door.

The general statement is the useful one: **the key identifies the content
but not the recipe.** `model` is an input and is in the key. `cap` is an
input and is not. Any future change to what gets embedded inherits the same
hole — OBS-017's prepend-the-description design is the worked example, and
it was two measurements away from shipping.

## What I used instead

Nothing — no fix is needed today. The current mitigation is a sentence in
`.claude/CLAUDE.md`:

> `MAX_EMBED_CHARS = 8000` … if changed, drop the embed store (the key is
> computed on the full body).

which is correct, load-bearing, and a manual invariant in the one subsystem
that otherwise versions everything mechanically. It survives exactly as long
as the next person to touch the constant reads that file first.

Worth recording that the one run which *did* change the cap never depended
on it. OBS-019 §method notes its harness filled a cache keyed on
`sha256(text)` where the text is byte-identical to what the design emits —
i.e. it keyed on the embed input rather than the record body. That is the
correct key. The eval arrived at it independently, used it, and the insight
never made it back into the production store.

## What should change in docdog

Fold the recipe into the key, rather than versioning the file that holds it.

The cheapest shape is to make the key's second column an **embed recipe
id** — `${model}@${cap}` today, extended if the embedded text ever changes
shape — computed in one place beside `embedInput`. Properties:

- **No schema change and no version bump.** The column is already `TEXT`.
- **Old rows stop matching and age out** through the ordinary `gc` sweep;
  they are unused by definition once the recipe moves.
- **Reverting is free.** Flip the cap back and the old vectors are hits
  again — exactly the behaviour flipping the model back already has, which
  is the argument that this is the same kind of thing.
- **Tier 1** (DP-001): concatenating two config values.

The alternative — store the cap in the embed store's `meta` and rebuild on
mismatch — is one line shorter and strictly worse: it drops the whole store,
including every row the change does not affect, which is precisely the cost
PROPOSAL-029 exists to stop paying. A cap change is not a schema change. It
is a new point in the same keyspace, and the key should say so.

Neither shape fixes vectors already written under a recipe that has since
moved; there is no such vector today, which is why this is worth doing now
rather than after the first cap change.

## Resolution (2026-07-20)

Shipped as proposed: `embedRecipe(model, cap)` → `` `${model}@${cap}` ``, in
`storage/indexer.ts` beside `embedInput` so the recipe and the truncation it
names are adjacent. `resolveEmbeddings` keys the store by it. The store's
column keeps the name `model` — renaming it is a schema change, a schema
change bumps `EMBED_SCHEMA_VERSION`, and that drops the whole file, so the
rename would cost a full re-embed to improve a comment. The value is opaque
to the store; the handle's parameters are `recipe`. 408 tests (+4).

**One claim above is wrong, and the implementation is what showed it.** The
bullet promising old rows "age out through the ordinary `gc` sweep" is false,
and it contradicts the bullet two lines below it. `findUnusedRows` filters on
`content_hash` alone — deliberately, so a live record keeps its rows under
every model and switching back reuses them. A superseded *recipe*'s rows
inherit exactly that treatment: their content is still live, so gc never
touches them.

The two properties cannot both hold. **"Reverting is free" and "the old
vintage ages out" are the same mechanism read in opposite directions**, and
the design has to pick one. It picks reverting-is-free, which is the right
half: it makes a cap change as cheap to undo as a model change, which was the
whole argument that the two are the same kind of thing. The price is a
permanent stratum in a grow-only store after any recipe change — OBS-021's
growth model, one term wider. That is now stated where it is enforced rather
than promised where it was assumed.

**A cost the note did not price: the transition itself.** Existing rows carry
bare model names, so every one of them misses once. Nothing recovers them
without a migration over rows whose recipe is a fact about history rather than
about the row — DD-070 §2 forbids it, and it would be permanent machinery for
a one-time saving. Taken deliberately, and taken *now* for the reason the note
gave for acting early, one step further than it went: the installed base is
this repo plus one adopter (OBS-015), and publication has not happened. The
same fix after publication bills every user instead of two of us.

**Measured, because the first estimate of it was wrong.** I wrote that the
transition is "paid at the moment it ships". It is not — it is paid *lazily*,
and the smoke test said so immediately: the first `docdog index` after the
change re-embedded **1 record of 314**. The file-hash fast path (DD-050 tier 1)
returns before `resolveEmbeddings` is ever called, so an unchanged file never
asks the store anything and cannot miss. The stale rows are reached only by
work that would have re-embedded anyway. Full cost therefore lands only on
`index --full` or a fresh worktree, where it measured **1,058s / 313 re-embeds**
on this corpus — the same order as PROPOSAL-029's 604s baseline, on a corpus
that has since grown.

That distinction matters beyond the bookkeeping: it is the difference between
a change that bills every user on upgrade and one that bills only those who
were going to pay anyway. It was available from a ten-second smoke test and I
asserted the opposite from the code. **The incremental path's own optimization
was the mitigation, and reading `resolveEmbeddings` could not show it, because
the reason lies in the caller that decides not to call it.**

Three facts are pinned by tests rather than left in prose: the superseded row
survives and misses, a pre-recipe store re-embeds, and the recipe moves with
the cap and with the model but not otherwise.

**One consequence is disclosed, not fixed — FRICTION-035.** Keying by recipe
creates a row that is unreachable while its content is still live, and
`findUnusedRows` — which filters on content alone, deliberately, since that is
what makes reverting free — counts such a row as *used*. Measured here right
after the change: 704 rows, 390 of them unreachable, `status` reporting 77
(11%) unused. The number is true to its definition and misleading to a reader,
which is a way for a metric to rot without anyone editing it.
