---
id: FRICTION-046
title: "Changing embed.dtype does not invalidate the index, so the README's own advice leaves a silently mixed vector space"
collection: notes
status: resolved
fixed_date: 2026-08-27
resolution_approach: fix
description: "Setting `embed.dtype: q8` and running `docdog index` re-embedded 29 of 1,134 records: the full-rebuild guard compares `config.embed.model` against `meta.embed_model`, and dtype is not part of that comparison, so every file whose content hash was unchanged kept its fp32 vector. The embed store is correct — FRICTION-033 put dtype in the recipe key — but the index never asks it, because unchanged files are skipped before `resolveEmbeddings` is reached. The result is a cache holding two quantizations at once, with no warning, from following a documented instruction."
severity: inconvenient
relationships:
  - references: FRICTION-033
    context: "the fix this one is the missing half of — it made the embed STORE's key a recipe (model@cap#dtype) so old-recipe vectors stop matching instead of being served beside new ones; the index's own invalidation guard was never brought along, so it still compares the bare model and the store's correctness is never consulted for a skipped file"
  - references: OBS-022
    context: "the measurement that shipped `embed.dtype` as a user-facing opt-in, which is what turns a latent gap into a reachable one: cap changes arrive with a new docdog version, but dtype is a line a user writes in their own config"
  - references: OBS-023
    context: "found while setting up the adopted-corpus q8 arm it recommends running — the index reported 29 embedded of 1,134 and the arm was invalid, which is the only reason this surfaced at all"
---

# FRICTION-046: a dtype switch leaves half the vectors behind

## What I was doing

Setting up a q8-vs-fp32 arm on an adopted 1,134-record corpus — the
measurement OBS-022 explicitly deferred to a weaker-hybrid regime.
Wrote `embed: {dtype: q8}` into `.docdog/config.local.yaml`, ran
`docdog index`, expected a full re-embed.

## What happened

```
Cache: 628 file(s), 29 reindexed — this run: 29 vertices upserted,
0 removed, 0 edges, 29 embedded (0 reused)
```

Twenty-nine of 1,134 records got q8 vectors. The other 1,105 kept the
fp32 vectors they already had. No warning, exit 0.

Had I not been watching the count because I needed a clean arm, the
eval would have run against a corpus embedded in **two quantizations
at once** and reported the result as a q8 measurement.

## Why

`indexer.ts` decides on a full rebuild here:

```ts
const priorModel = getMeta(db, META_KEYS.embedModel);
const modelChanged = priorModel !== null && priorModel !== config.embed.model;
const fullRebuild = full || handle.rebuilt || modelChanged;
```

`config.embed.model` is the **bare model**. It did not change — only
`dtype` did. So no full rebuild, and every file whose content hash was
unchanged is skipped at the file level, before `resolveEmbeddings` is
ever called. The embed store's recipe key is therefore never consulted
for those files: it is correct and unreachable.

The comment above that guard states the invariant it no longer holds:

> A model switch invalidates every stored chunk embedding; the
> `(content_hash, model)` cache misses cleanly, so a full pass is both
> necessary and sufficient.

The cache is keyed on `(content_hash, recipe)` since FRICTION-033.
The guard was not updated with it. `embedRecipe` names three inputs —
model, cap, dtype — and exactly one of them invalidates the index.

Worth naming why this survived review: FRICTION-033's own comment says
`meta.embed_model` "still records the bare model, because that check
answers a different question ('did the model change?') and its answer
is what gets shown to a user." That is a sound reason for the
*displayed* value and it was silently taken as a reason for the
*compared* value too. One field is doing two jobs with one of them
wrong.

## Why it is worse than a stale cache

The README tells users to do this:

> **Smaller model on a constrained connection.** […] set it in
> `.docdog/config.yaml`: `embed: {dtype: q8}` […] fp32 and q8
> embeddings are cached separately, so switching back and forth never
> re-embeds content already seen at either.

That last sentence is true of the store and misleading about the
index. A user following it gets no re-embed, no warning, and a vector
space where a record's neighbours were computed under a different
quantization than its own vector. Retrieval still returns results —
that is the problem. Nothing surfaces.

The cap has the same hole, and is safer only by accident: changing
`MAX_EMBED_CHARS` is a code change, so it arrives with a new docdog
version that a user installs rather than a line they write.

## Workaround

`docdog index --full` after any dtype change. It re-embeds everything
at the new recipe.

## What should change

Compare the **recipe**, not the model. The displayed value can stay
the bare model; the compared value should be
`embedRecipe(model, MAX_EMBED_CHARS, dtype)`, stored under its own
meta key so the two jobs stop sharing a field. Then a dtype switch, a
cap change, and a model switch all invalidate identically, the log
line says which input moved, and `--full` stops being load-bearing
knowledge.

That is pure mechanics — comparing two strings docdog already computes
— so it is DP-001 tier 1 with no judgment in it. The one design
question worth asking in the fix is whether a recipe change should
force a rebuild silently or report first, given that a full re-embed
of a large corpus is minutes of CPU: the honest default is probably to
do it and say so on one line, the same way a model switch already
does.

## Resolution (2026-08-27)

The guard compares the recipe now, which was the whole recommendation.

`META_KEYS.embedRecipe` is a second meta key holding
`embedRecipe(model, MAX_EMBED_CHARS, dtype)`, and the full-rebuild
comparison reads it. `embed_model` stays and still carries the bare model,
because that is what `status` displays — the two jobs are separate fields
now, which is the actual defect: one field doing both is how a correct
store key went unconsulted for months.

All three inputs invalidate identically, so the cap loses its accidental
safety too — it never needed it, but "safe because changing it requires
shipping a release" was a property of npm rather than of docdog.

The rebuild line names the input that moved rather than printing two
recipe strings side by side (`describeRecipeChange`, beside `embedRecipe`
in `embed-health.ts` where its inputs are defined). A user reading a full
reindex they did not ask for wants the word `dtype`; a diff they have to
perform themselves is a worse answer than the old silence pretended to be.

**The upgrade path is the part with a decision in it.** A cache written
before this carries `embed_model` and no `embed_recipe`, and reading that
absence as "unchanged" would leave every project this bug already reached
sitting in the mixed state permanently — the fix would protect only
projects that had not hit it. The absent value is therefore synthesized as
what such a cache implies (bare model, current cap, no dtype), so the
first run after upgrading heals a dtype user and is a no-op for everyone
else. Verified on this repo: 355 files, 0 reindexed.

**`--full` stops being load-bearing knowledge**, and the README's promise
survives intact — a rebuild is not a re-embed. The store keeps a row per
recipe it has seen, so q8 → fp32 → q8 reindexes each time and re-embeds
none of it; that property belongs to FRICTION-033's keying and this fix
does not spend it. Pinned by a test that switches back and asserts
`embedReused`, alongside one that asserts the pre-recipe cache heals.
