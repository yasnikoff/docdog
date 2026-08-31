---
id: FRICTION-034
title: The embed store's version check is per-program but its blast radius is per-clone — one bump, and every worktree re-embeds
collection: notes
status: resolved
fixed_date: 2026-08-27
resolution_approach: fix
description: "An EMBED_SCHEMA_VERSION mismatch calls rebuild(), which drops the store's tables in place — and that file is shared by every worktree of the clone. The code comment says 'same contract as the cache', which is the one thing it is not: index.db is per-tree, so a version disagreement costs one tree a reindex, while the store is clone-wide and costs everyone a full re-embed. Two docdog versions against one clone (npm-linked vs source mode — the documented dev workflow) can ping-pong it. Latent only because the constant has never moved off 1; OBS-021 already names the likely first bump. This is DISC-032's insight one level up: liveness is per-tree but the store is not, and so is versioning."
date: 2026-07-20
severity: inconvenient
relationships:
  - references: PROPOSAL-029
    context: the design under review — it gave the store its own version precisely so a cache bump would not cost a re-embed, and that half works; what it did not revisit is that the store's own bump now lands on a file with a clone-wide reach the cache never had
  - references: DISC-032
    context: "the same structural mismatch, recognized and fixed one axis over: liveness is asked per-tree against a store that is not per-tree. Versioning is asked per-program against the same store. gc got the careful treatment, the version path still has the naive one"
  - references: OBS-021
    context: names the most likely first bump — an accessed_at column for real LRU — and already prices it as 'a full re-embed to install the feature that saves storage'; this note is the part of that price nobody costed, which is that it is charged once per working tree, not once
  - references: OBS-015
    context: "the closest thing to evidence: an adopter with 4 live worktrees crossed a schema bump involuntarily via npm link plus a post-merge hook. That one was free because the adoption path carried the vectors across — an EMBED_SCHEMA_VERSION bump has no adoption path, and the same involuntary trigger fires"
  - references: DD-070
    context: §2 is why the answer cannot be a migration, and also why this is time rather than data — the store is derived, so the worst case is CPU; that is what makes a filename-versioned coexistence acceptable where an in-place drop is not
---

> Found while auditing docdog's version-mismatch protections. Latent —
> `EMBED_SCHEMA_VERSION` has been 1 since PROPOSAL-029 shipped, so this has
> never fired. It fires on the first bump, and OBS-021 has already sketched
> what that bump will be.

## What I was doing

Reading `openCache` and `openEmbedStore` side by side. They are deliberately
the same shape: probe the version, and on mismatch drop everything and start
over, because both files hold derived state and DD-070 §2 forbids
migrations. The embed store's comment says so explicitly:

```ts
/**
 * Versioned independently of the cache's SCHEMA_VERSION — that
 * independence is the point (a cache schema change must not cost a
 * re-embed). Mismatch drops and rebuilds, same as the cache: the rows
 * are recomputable, so there are still no migrations (DD-070 §2).
 */
export const EMBED_SCHEMA_VERSION = 1;
```

The first sentence is the PROPOSAL-029 win. The third sentence is where it
goes wrong.

## What went wrong

"Same as the cache" is the one thing it is not, and the difference is the
whole of PROPOSAL-029.

`index.db` lives **inside one working tree**. A version disagreement there
costs that tree a reindex — seconds, and only for whoever disagreed.

`embeddings.db` resolves to the **git common dir**, shared by every worktree
of the clone. That was the point: a fresh worktree cold-indexes in 3s
instead of 604s because it reads the clone's vectors. But `rebuild()` drops
the tables **in place**, in that shared file. So the first process to open
it with a different `EMBED_SCHEMA_VERSION` deletes every worktree's
embeddings, and the other trees find out on their next `docdog index`, as a
full re-embed with no explanation.

The trigger is not exotic — it is the documented dev loop. `.claude/CLAUDE.md`
prescribes two ways to run docdog in this repo:

| Mode | How | |
|---|---|---|
| Installed | `docdog <cmd>` via npm link | one program version |
| Source | `npx tsx src/cli/index.ts <cmd>` | possibly another |

Both point at the same clone, therefore the same store. Across a bump they
disagree, and alternating between them **ping-pongs**: each invocation finds
the other's version, drops the store, and re-embeds the corpus. Neither ever
reports why, because from inside each process this is an ordinary cold
store. OBS-015 records the involuntary version of the same trigger on an
adopter's repo — npm link plus a post-merge reindex hook, 4 live worktrees —
and it was free there only because the v2→v3 path had an adoption step that
carried the vectors out before the drop. An `EMBED_SCHEMA_VERSION` bump has
no such step.

This is exactly DISC-032's shape, one axis over. That discussion found the
sweep asking a **per-tree** question (what content is live here?) about a
store that is not per-tree, and fixed it by unioning every worktree's answer.
Versioning asks a **per-program** question about the same store, and still
answers it as though the store belonged to the asker.

## What I used instead

Nothing to work around — it has not fired. Recorded so the first bump is not
also the first discovery.

## What should change in docdog

The store cannot refuse to open (callers need it), and it cannot migrate
(DD-070 §2). But dropping in place is not the only remaining option:

**Version the file name, not the file contents** — `embeddings-v2.db`
alongside `embeddings.db`. Then:

- two program versions **coexist** instead of clobbering each other, which
  is what the dual-mode dev loop actually needs;
- **rollback is free** — going back to the old docdog finds its own store
  intact, so the ping-pong becomes two warm stores rather than two cold ones;
- the cost becomes **disk**, not repeated CPU, and disk is sweepable —
  `gc` can drop stores whose version is no longer current;
- it fits what the store already is. A grow-only, union-mergeable,
  first-writer-wins set is an odd thing to protect with a destructive
  whole-file reset; keeping old vintages side by side is the same idea
  applied to time.

If that is more than the problem deserves, the floor is to **state the cost
where it is paid**: when `rebuild()` fires on a `shared` store, log that N
rows written by a different docdog version are being dropped and that every
working tree of the clone will re-embed. DD-070 §2 makes this time rather
than data, and gc.ts already sets the precedent for reporting a cost rather
than gating on it — "the cost of being wrong, stated rather than guarded
against". The same sentence belongs here.

Either way the code comment should stop saying "same as the cache". That
sentence is what let the difference stay invisible.

## Resolution (2026-08-27)

Took the file-name option, and kept the floor as well — they are not
alternatives once you notice that one path is left where docdog does not
own the name.

**`embedStoreFileName(version)`** puts the schema version in the name from
v2 onward, applied to the two paths docdog resolves itself (git common
dir, project cache dir). Vintages coexist, so the dev loop's two docdog
versions stop clobbering each other, rollback finds its own store intact,
and the repeated CPU becomes one-time disk.

**Version 1 keeps the bare name, permanently.** Renaming it to
`embeddings-v1.db` would orphan every store in existence and charge its
owner the full re-embed this scheme exists to avoid — paying the cost once
to install the mechanism for not paying it. The bare name simply *is* v1's
name; the suffix starts where the harm does.

**An explicit `embed.cache_path` is left exactly as written**, which is
what keeps the in-place rebuild alive rather than making it dead code:
writing to a file the user did not name is a worse surprise than the
disclosure. So the floor ships too — the handle carries `priorVersion` and
`dropped`, and `docdog index` says how many vectors of whose vintage it
deleted, that the file is read by every working tree of the clone, and
that DD-070 §2 makes this time rather than data. That is `gc.ts`'s "cost of
being wrong, stated rather than guarded against", one file over.

**Two things deliberately not built.**

*An adoption path across a bump.* A bump means the schema changed — that
is what makes it a bump — so there is nothing generic to carry across.
The v1→v2 rows are still on disk under the old name if a future bump turns
out to be additive enough to read them.

*A flag to delete old vintages.* `gc` **reports** them — path, version,
size — and stops there. A vintage is one whole file whose path is printed,
so `rm` reaches it; `--prune-recipes` had to be built only because its
stratum lives *inside* the current file and no shell command can. Keeping
the vintage is the property the scheme buys, and spending it should read as
a decision rather than as hygiene.

And the comment stopped saying "same as the cache". That sentence is what
let the difference stay invisible for a year, so it is now the thing the
constant's doc comment argues against at length.

Unlocked, incidentally: `EMBED_SCHEMA_VERSION` can move. OBS-021's
`last_used_at` column for real LRU has been priced as "a full re-embed to
install the feature that saves storage" — it is still a re-embed, but it is
no longer one that lands on every worktree by surprise and cannot be
undone by reinstalling the old version.
