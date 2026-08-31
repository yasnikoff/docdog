---
id: FRICTION-032
title: "The README's own example record is silently skipped by a fresh `docdog init` — `decisions` is not in the minimal template"
collection: notes
status: resolved
resolution: fixed
resolved_date: 2026-07-20
resolved_in: v0.2.1
description: "First out-of-box test of the published 0.2.0 package: `docdog init` defaults to template `minimal`, which registers only `notes` and `concepts`. The README's example record — and its whole pitch, which is about decisions — uses `collection: decisions`. Such a record is dropped at index time with one warning line among the transformers.js noise, so a new user's first two records never reach search, get or traverse, and the tool reports 10 records indexed as if all were fine."
severity: blocks-work
source: dogfood (v0.2.0 publish smoke test, clean scratch dir, npx -y @yasnikoff/docdog@0.2.0)
relationships:
  - references: DD-070
    context: "the minimal template's collection set is v3 kernel configuration; this friction is about its interaction with the published onboarding script, not about the template being wrong"
  - references: FRICTION-010
    context: "same family — collection-name vocabulary mismatches between shipped defaults and what a user actually writes; F-010 was the .docdog/ path-namespacing half"
  - references: WF-002
    context: "harvested from the dual-track dogfood loop — the first friction produced by the published artifact rather than the working tree"
---

# FRICTION-032: the README's example collection is unregistered at init

## What I was doing

The post-publish smoke test of `@yasnikoff/docdog@0.2.0`, from a clean
scratch directory with no access to the source tree — the closest
available stand-in for a real adopter:

```
npx -y @yasnikoff/docdog@0.2.0 --version   # 0.2.0
npx -y @yasnikoff/docdog@0.2.0 init --name smoke-test
# write two records under specs/, copied in shape from the README
npx -y @yasnikoff/docdog@0.2.0 index
npx -y @yasnikoff/docdog@0.2.0 search "why did we drop the legacy auth flow"
```

The two records used `collection: decisions` — because that is what
the README's example record uses, and because "decisions" is the
noun the entire pitch is built on ("your project's decisions, specs,
and notes").

## What went wrong

Both records were dropped at index time:

```
Cache: unknown collection "decisions" in specs/dd-001-sqlite-over-postgres.md — section skipped.
Cache: unknown collection "decisions" in specs/dd-002-drop-legacy-auth.md — section skipped.
Cache: 10 file(s), 10 reindexed — this run: 10 vertices upserted, 0 embedded (0 reused)
Graph total: 10 record(s), 0 edge(s)
```

The 10 records are the seeded concept vocabulary. **Zero of the user's
own content was indexed.** The search for the README's own example
query returned concept records about the relation vocabulary; the
declared `DD-002 → references → DD-001` edge never existed
(`traverse DD-002` → "No connections found").

`docdog init` defaults to `template: minimal`, and
`src/config/templates.ts` registers exactly `["notes", "concepts"]`
for it. `decisions` belongs to `structured`.

## Why this is severe despite being a one-line config fix

The failure is quiet in the way that matters:

- The warning is one line, printed between the embeddings path and the
  `dtype not specified` transformers.js noise, and **scrolls past above
  a success summary**. The last line a user reads says 10 records
  indexed, 10 embedded — a green result.
- The exit code is 0.
- The symptom a user actually notices is not "my record was skipped",
  it is "**search doesn't find my stuff**" — which reads as the
  retrieval being bad, i.e. as a failure of the one thing the README
  spends its whole length making a measured claim about. The 0.871 MRR
  pitch and this silent drop point the user at opposite conclusions.
- It is hit on the **first record a user writes**, following the
  **README's own example**, on the **default template**.

## Workaround

Either `docdog init --template structured`, or add `decisions` to
`vertex_collections:` in `.docdog/config.yaml` and reindex. Both are
trivial *once you know*; neither is discoverable from the output.

## What should change

Not decided here — this is the friction, not the proposal. The options
seen from the smoke test, cheapest first:

1. **Make the README example honest for the default template** — use
   `collection: notes` in the sample record, or show
   `--template structured` in the quickstart. Docs-only; leaves the
   silent-drop shape intact for every other unregistered name.
2. **Make the skip loud.** A skipped section is user content that did
   not make it — it belongs in the *summary*, not only in a mid-stream
   warning: `10 indexed, 2 SKIPPED (unknown collection "decisions" —
   add it to vertex_collections or use --template structured)`. This
   is the same lesson FRICTION-029/030 already applied to index totals
   and filter validation; the skip path was missed.
3. **Reconsider what `minimal` registers.** `decisions` is arguably
   the single most likely collection a first-time user writes.
   Registering it changes what "minimal" means, so it is a real design
   call, not an obvious fix.

Note that (2) is the one that generalizes — any unregistered name a
user invents hits the same silence, and no docs change covers that.
Whatever is chosen, DP-001 is clean either way: nothing here asks code
to *infer* a collection, only to report a drop it already detects.

## Resolution (2026-07-20, v0.2.1): options 1 and 2, not 3

**Option 2 (the generalizing one) shipped.** `CacheIndexStats` gained
`skippedSections` + `skippedCollections`, and a new exported
`formatSkipSummary()` renders them:

```
  Cache: 10 file(s), 10 reindexed — this run: 10 vertices upserted, …
  Cache: 1 section(s) SKIPPED — not indexed, not searchable.
    Unregistered collection(s): "decisions".
    Fix: add them to vertex_collections in .docdog/config.yaml and reindex,
    or re-run with --create-collections to index them without changing config.
  Graph total: 10 record(s), 0 edge(s)
```

Placed **below the counts and above the graph total** — the last line a
user reads is the one they believe, so the skip has to sit inside that
final glance rather than upstream of it. `formatSkipSummary` is shared
by the CLI and `docdog_index` so the two surfaces cannot drift on the
wording of a message whose entire job is to be noticed; the MCP tool
trims the indent. Silent when nothing was skipped — the quiet case must
stay quiet or the loud case stops reading as loud. Three regression
tests pin all three states (skips aggregate across distinct names /
clean run reports nothing / `--create-collections` reports nothing).

**Option 1 shipped too**, as documentation rather than a rename: the
README quickstart now shows `--template structured` with an inline note
about what `minimal` registers, and the sample record carries a pointer
to `vertex_collections`. Verified from a clean scratch dir — the
documented path indexes 19 records with zero skips and returns the
record at rank 1 (vector 0.656 / bm25 11.74).

**Option 3 was declined.** Changing what `minimal` registers would make
the template's name a lie, and it treats one collection name
(`decisions`) as special — which is the inference DP-001 keeps out of
code. The generalizing fix is the report, not a better guess.

Note what this does *not* claim: the underlying behavior is unchanged.
An unregistered collection is still skipped, still by design. What
changed is that the user is now told, in the place they were already
looking, with the two commands that fix it.
