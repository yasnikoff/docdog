---
id: FRICTION-048
title: "update seeds concept records without saying whether any scan path indexes them"
collection: notes
status: resolved
fixed_date: 2026-08-25
resolution_approach: fix
fix_commit: 756485b
description: "init warns when no scan path covers .docdog/concepts/; update performs the same writes and says nothing, so it can report `added` for a vocabulary record that search, get and traverse cannot see — the check already existed and was simply never called from the second command."
severity: inconvenient
relationships:
  - references: PROPOSAL-039
    context: "the posture copied here — apply always reports whether scan_paths reaches the children, because that failure is otherwise silent: the writes succeed, index says nothing, and the records are in no corpus"
  - references: PROPOSAL-025
    context: "the seeding whose reach is at stake, and the source of init's existing warning — the shipped relation and collection vocabulary lives in records, so an unindexed .docdog/concepts/ is a vocabulary that exists on disk and nowhere else"
  - references: PROPOSAL-041
    context: "the command that gained the gap: update writes the same concepts group init does, having inherited the writes without the warning that accompanied them"
  - references: PROPOSAL-044
    context: "the third gap the same review surfaced — that one needed a proposal rather than a patch, because it changes what a skill is rather than which files are tracked"
---

# `update` seeds concept records without saying whether anything indexes them

## What I was trying to do

The same audit that produced FRICTION-047: read `init.ts` against
`collectSeeds`, item by item, and find what one command does that the other
cannot.

## What went wrong

`docdog init` ends its concept seeding with a check:

```ts
if (!scanPathsCoverConcepts(projectConfig.scan_paths ?? [])) {
  console.log('  Note: ".docdog/concepts/" is not in scan_paths — seeded concept records will not be indexed.');
}
```

`docdog update` writes the **same** `concepts` group — the population
`seed-set.ts` describes in its own comment as *"the population with the worst
blast radius"* — and never makes that check. `update.ts` does not import the
predicate at all.

So an adopter can run `docdog update`, watch it print

```
  added         .docdog/concepts/collection-decisions.md
```

and have that record be invisible to `docdog search`, `docdog get` and
`docdog traverse`, with nothing anywhere saying so. `docdog index` does not
complain either: a file outside every scan path is not an error, it is simply
not a file docdog looks at.

This is precisely the failure PROPOSAL-039 named for a different command —
the writes succeed, the index is silent, and the records the tool just created
are in no corpus. `split --apply-plan` reports it. `update` did not.

The check existed, was tested, and was one import away. That is the part worth
recording: the gap was not a missing capability but a capability wired to one
of its two call sites.

## Workaround

Notice it yourself. In practice that means running `docdog search` for a
collection record after an update and being suspicious when nothing comes back
— which requires already knowing the failure mode exists.

## What should change

`update` reports the same fact `init` reports. Report only, never fix:
`.docdog/config.yaml` is the user's file, and `missingConfigKeys` in the same
command already states that reasoning for the neighbouring case.

## Resolution

Fixed in `756485b`.

`scanPathsCoverConcepts` moved to `src/engine/scan-reach.ts` — both commands
need it, and a CLI command importing from another CLI command is the wrong
dependency direction. `update` gained `conceptsIndexed(plan, config)` and reports
it in both the human report and `--json`.

Three decisions inside it:

- **Tri-state, not a boolean.** The JSON field is
  `conceptsIndexed: boolean | null`, `null` when the concepts population is not
  in play. A plain boolean, or an inverted `conceptsUnindexed` flag, would force
  a consumer to read "this project has no concept records" as "the concept
  records are reachable" — two different facts collapsing onto one value.
- **In play means present or pending**: `group === "concepts" && (current !== null
  || outcome === "add")`. An uncovered but empty `.docdog/concepts/` says nothing,
  because a project with no vocabulary records has no claim to make about where
  they would be indexed.
- **Reported under `--dry-run` too.** The warning is a fact about the project's
  state, not about the writes this invocation performs, so suppressing it on a
  preview would hide it at exactly the moment someone is deciding whether to run
  the command for real.

One thing the fix surfaced on the way: there were **no CLI-level tests for
`docdog update` at all**. `tests/unit/seed-update.test.ts` exercises the engine
(`planUpdate` / `applyUpdate`) and never touches `src/cli/commands/update.ts`.
`tests/unit/update-concepts-reach.test.ts` drives the real command through
commander in a temp cwd, which is what lets it pin the JSON key name — an
engine-level test structurally cannot.
