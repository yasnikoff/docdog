---
id: FRICTION-041
title: "docdog update writes the .gitattributes merge block but never registers the driver"
collection: notes
status: resolved
fixed_date: 2026-08-25
resolution_approach: fix
fix_commit: 9d3c597
description: "update adds the merge=docdog block init writes, but only init runs git config, so an adopting repo ends up naming a driver git cannot find."
severity: inconvenient
---

# `docdog update` writes the .gitattributes block without registering the driver

## What I was trying to do

Migrate a repo that adopted docdog on 2026-07-13 up to the current docdog
(FRICTION-040's skill layout plus everything else shipped since), using the
`docdog update` PROPOSAL-041 built for exactly this.

## What went wrong

`update` reported `.gitattributes#docdog` as an `add` and wrote it — correctly,
because the block is a seed-set member and the repo predates PROPOSAL-030. But
the block is only half of the merge driver. The other half is two `git config`
keys, and `git config --get merge.docdog.driver` in that repo returned nothing.

The asymmetry is in the code. `installMergeDriver` (`src/cli/commands/init.ts:238`)
does both halves:

```ts
injectGitattributesBlock(join(projectRoot, ".gitattributes"), block);
record(".gitattributes#docdog", block);
gitConfigSet(projectRoot, `merge.${MERGE_DRIVER_NAME}.name`, …);
gitConfigSet(projectRoot, `merge.${MERGE_DRIVER_NAME}.driver`, …);
```

`update` reaches the block through `gitattributesBlockItem` in
`src/engine/seed-set.ts:218`, whose `write` is `injectGitattributesBlock` alone.
The seed set is a set of **file and block contents**; `.git/config` is neither,
so it is not a member and nothing else in `update` fills the gap.

The result is the one failure direction PROPOSAL-030 explicitly ruled out. Its
guarantee was that a clone which never ran `docdog init` gets git's default text
merge — "exactly today's behavior … the only direction an optional feature may
fail in." A repo that runs `update` instead lands somewhere worse than either
end state: `.gitattributes` now claims `merge=docdog` on every scan path, and
git has no such driver. Git falls back and warns per path on any conflicting
merge, so the cost is noise plus a false claim in a tracked file, not data loss.

It is silent at write time. `update` prints `added .gitattributes#docdog` and
says nothing about the config, so the adopter has no reason to check.

## Workaround

Run the two commands `init` would have run:

```
git config merge.docdog.name "docdog frontmatter-aware merge"
git config merge.docdog.driver "docdog merge-driver %O %A %B %L %P"
```

Done by hand in the adopting repo. `docdog init` re-run would also do it — it is
additive and would skip every present file — but that is a large hammer for two
config keys, and nothing tells the user it is the right hammer.

## What should change in docdog

`update` should call the same `installMergeDriver` half that `init` does,
whenever the `.gitattributes` block is in `willWrite` **or** already current: the
block being present and the driver being absent is the broken state, and it is
reachable by more paths than this one (a fresh clone of a repo whose
`.gitattributes` is committed has the block and no config, since `.git/config`
is not tracked — that case is arguably the common one).

Two shapes, and the difference matters:

1. **Register when writing the block.** Smallest change, closes this report,
   leaves the fresh-clone case open.
2. **Report the driver's registration state on every run, register when
   absent.** Registration is pure mechanics on docdog's own config namespace
   (DP-001 tier 1) and `init` already does it unconditionally, so doing it in
   `update` introduces no new judgment. The reporting half is what makes the
   fresh-clone case visible.

Shape 2 is preferred and stays inside `update`'s stated posture — write what is
provably docdog's, report the rest — because `merge.docdog.*` is entirely
docdog's namespace. It cannot clobber a user's choice the way a seeded file can,
which is precisely why it never needed the manifest.

Related: the check belongs next to the drift report `docdog index` already emits
for the block, so the two facts about the merge driver are not reported by two
different commands.


## Resolution (2026-08-25, 9d3c597)

Shape 2, as preferred above. `src/engine/merge-driver.ts` now owns both
halves of the driver — the config keys, their values, the state read, the
registration and the manual commands — and `init` delegates to it rather
than open-coding the two `gitConfigSet` calls.

`docdog update` reconciles on **every** run: if the `.gitattributes` block
exists (already on disk, or written this run) and `.git/config` does not
define the driver, it registers it and says so. That covers the reported
path and the fresh-clone path the report named as probably the common one —
a tracked `.gitattributes` arrives with the block, `.git/config` never does.
`--dry-run` reports and writes nothing.

Three details the design did not state and the code had to settle:

1. **Half-registered reads as unregistered.** `merge.docdog.driver` without
   `merge.docdog.name` is what a hand-fix produces when only the second
   command is pasted, and it is still broken. `registerMergeDriver` returns
   true only when both keys land.
2. **"Unset" and "no git" are different reports**, so `gitConfigGet` gained a
   sibling `gitAvailable` rather than overloading a null. Outside a
   repository the command reports and continues — the tier-1 rail holds.
3. **The report is silent when there is no block.** Nothing to say about a
   feature the repo never opted into.
