---
id: FRICTION-047
title: "The cache-ignore rule is written by init and recorded nowhere, so update can never put it back"
collection: notes
status: resolved
fixed_date: 2026-08-25
resolution_approach: fix
fix_commit: 756485b
description: "init writes `cache/` into .docdog/.gitignore without recording it in the seed manifest, so the rule is in no seed set: delete it, or adopt docdog before it existed, and every subsequent `docdog update` leaves it missing — and the disposable SQLite cache gets committed."
severity: inconvenient
relationships:
  - references: PROPOSAL-041
    context: "the seed set this member was missing from — its own premise is that init and update walk one collector, and this is a file init wrote that the collector never knew about"
  - references: DD-070
    context: "the reason the rule exists at all: the cache is disposable derived state, so keeping it out of version control is docdog's job and not the adopter's to remember"
  - references: PROPOSAL-044
    context: "the third gap the same review surfaced — that one needed a proposal rather than a patch, because it changes what a skill is rather than which files are tracked"
---

# The cache-ignore rule is written by init and recorded nowhere

## What I was trying to do

Answer a plain question about the upgrade story: what does `docdog init` do to
an adopting repo that `docdog update` cannot maintain? Read `init.ts` against
`collectSeeds` and compare, item by item.

## What went wrong

`ensureGitignoreEntry` in `src/cli/commands/init.ts` writes `cache/` into
`.docdog/.gitignore`, creating the file if needed — and never calls the
`record()` callback that every other seeded write in that action calls. So the
rule has no manifest entry, and `collectSeeds` has no member for it.

The consequence is the exact failure PROPOSAL-041 was built to end. The rule is
in **no** seed set, so `update` classifies nothing, reports nothing and restores
nothing:

- delete the line by hand and it stays deleted forever;
- adopt docdog from a version predating the rule and it never arrives;
- and in both cases `.docdog/cache/index.db` — a rebuildable SQLite file,
  disposable by construction under DD-070 §2 — gets committed to git.

Nothing warns. `docdog index` rebuilds the cache happily whether or not it is
tracked, so the first symptom is a binary in a diff.

This is not a bug anyone reported: it was found by reading, like FRICTION-022.
Which is its own small finding, because the failure is silent on every surface
docdog has.

## Workaround

Re-add the line by hand. There was no docdog command that would do it — `init`
is additive but only reaches the file when it is absent entirely, and re-running
init in an initialized repo to recover one ignore rule is not a workaround
anybody would find.

## What should change

The rule joins the seed set. Not as a whole-file member: `.docdog/.gitignore`
may carry the adopter's own ignores, and a file-level seed would read those as
`diverged` and let `--force` clobber them. It wants the shape `CLAUDE.md` and
`.gitattributes` already use — name the span docdog owns, leave the rest of the
file invisible to the comparison.

## Resolution

Fixed in `756485b`. `src/engine/docdog-gitignore.ts` owns the reader/writer pair,
matching how `claude-md.ts` and `gitattributes.ts` each own their block, and
`collectSeeds` gained the sub-document member `.docdog/.gitignore#cache` in the
`provider` group.

Two properties of the sub-document choice are worth stating, because they are
what makes it safe:

- **`diverged` is unreachable for this member by construction.** `current` is
  either the rule or `null`, and `shipped` is always the rule, so the only
  outcomes are add, unchanged and untracked. There is nothing for `--force` to
  overwrite and no user line it can reach.
- **Authorship is claimed only when init actually wrote**, the same rule
  `.mcp.json` follows. A `cache/` the user typed themselves has no manifest
  entry, so it classifies `untracked` and is reported rather than adopted —
  the conservative reading of "no provenance is the user's" that PROPOSAL-041
  applies everywhere else.

One consequence, recorded so it is not mistaken for a regression: **this repo
has no `.docdog/.gitignore` at all** — the root `.gitignore` ignores
`.docdog/cache/` instead — so the next `docdog update` here creates one. That is
correct rather than special-cased. The rule exists so that it travels with the
`.docdog/` folder, and gating `shipped` on a `git check-ignore` probe would make
the seed set conditional on git state to avoid one duplicate ignore line.
