---
id: FRICTION-054
title: "A corpus split across two repositories reports on every index run whichever way it is configured, and the repair it names cannot be performed"
collection: notes
status: open
description: "DD-073's split gives the private project 344 cross-visibility leak warnings, because its records point at a corpus reached by an external scan path. Scanning only itself would give it 344 dangling targets instead. PROPOSAL-047 folds `ignored` and `outside the worktree` into one state on the grounds that the consequence is identical; this is the case where it is not."
severity: inconvenient
relationships:
  - references: PROPOSAL-047
    context: "the guard this reports against — specifically its three-state model, which folds `gitignored` and `outside the worktree` into one `out-of-clone` state"
  - references: DD-073
    context: "the split that produced this: two repositories holding one corpus, which is the arrangement neither report was designed for"
  - references: DP-001
    context: "the reason the obvious fix is wrong — a config key declaring a scan path trusted would be exactly the declared visibility PROPOSAL-047 refused, and a marker that can disagree with reality is a decoration"
  - references: FRICTION-052
    context: the precedent that rules out the obvious fix — a config key declaring a scan path trusted would be a marker that can disagree with reality, which is what that friction closed
  - references: DP-003
    context: clause 3 as the standard held to rather than met — one instance is a note, and a second corpus configured this way is what would make the fourth visibility state a design question
---

# FRICTION-054: a two-repo corpus reports either way

## What I was trying to do

Execute DD-073's split: the 41 full discussion records in a private
sibling repository, stubs with the same ids in this one. The private
project's `scan_paths` reach back into this repo so that indexing it
yields the whole corpus — 362 records, 1918 edges, exactly what this
repo held before the split.

That part works.

## What went wrong

`docdog index` in the private project reports **344 cross-visibility
leaks**, one collapsed line, every run:

```
Cache: 344 edge(s) point from a tracked record to one that will not be
in a clone — the target's id is published and the edge dangles for
everyone else: DISC-001 --[references]--> FRICTION-006
(discussions/discussion-001-indexer-collection-move.md ->
../docdog/specs/notes/friction-006-indexer-collection-move.md);
+341 more. Record the relationship on the other side instead.
```

Every statement in it is true. The private repo's records are tracked;
the docdog repo's records are outside its working tree; a clone of the
private repo alone would hold 344 dangling edges.

**And the named repair cannot be performed.** "Record the relationship
on the other side instead" means moving these edges onto the docdog
records — where they would point at the stubs, which is a *different
relationship* (the stub is not the record) and would move 344 edges
that belong to the discussions onto records that did not assert them.

## The part that makes it structural

Configuring around it does not help, it only changes which report
fires. If the private project scans **only its own 41 records**, the
344 leaks become **344 dangling targets** — the same edges, reported
by the other whole-corpus post-pass, for the opposite reason.

There is no arrangement of a corpus split across two repositories in
which neither check fires. One of them is always right.

## What I used instead

Nothing. The line is accepted and documented in DD-073 and in the
private repo's README. It is one collapsed line in a project indexed
rarely, which is the only reason it is `inconvenient` rather than
worse — and it is worth saying that **this is the same shape DD-073
used to reject the alternative design**. That design would have put
117 standing warnings in *this* repo, the one used daily. The split
did not eliminate the warning; it moved it somewhere it competes with
less. That is a weaker win than it looked while choosing.

## What should change in docdog

Not suppression, and not a config key. **A scan path declared trusted
would be exactly the declared visibility PROPOSAL-047 refused** — a
marker that can disagree with reality reads as a guarantee and is a
decoration (FRICTION-052's shape).

The observation worth keeping is narrower and is about the three-state
model itself. `visibility.ts` folds two conditions into `out-of-clone`
and says why:

> ignored **or** outside the working tree — one state, since the
> reasons differ and the consequence does not

**This is the case where the consequence differs too.** A gitignored
file is private by intent: an edge to it really does leak an id and
really does dangle. A file reached by an **external `scan_paths`
entry** is something else — the project has *declared in its own
config* that this corpus is part of it. The declaration is not a
visibility claim (it cannot lie about what a clone contains) but it is
evidence about intent that the ignored case does not have.

So the shape to consider, if this recurs, is **a fourth state derived
from configuration rather than declared by a marker**: a target
outside the worktree but inside a declared external scan path is
reported *differently* — named as a split corpus rather than as a
leak — because the two need different sentences, not because one needs
silencing.

Held, not proposed. This is the first instance, and PROPOSAL-047
shipped four days ago; a second corpus configured this way is the
evidence that would make it a design question rather than a note
(DP-003 clause 3).
