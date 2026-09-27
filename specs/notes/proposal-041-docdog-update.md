---
id: PROPOSAL-041
title: "`docdog update` — bring an adopting repo up to the docdog it now has, by recording what was seeded instead of guessing which edits are the user's"
collection: notes
status: shipped
date: 2026-07-30
description: "Upgrading an adopting repo is currently impossible with the commands that exist: `docdog init` is additive-only (it never touches a file that is present) and `docdog templates refresh` is update-only (it never adds a file that is absent), so a repo seeded before a skill shipped can run both, in either order, and still not receive it. The half that does write clobbers user edits, because it has no way to tell a shipped file from an edited one. Adds a seed manifest — path → content hash of the shipped bytes at write time — which turns 'did the user edit this?' from inference into a comparison, and with it four mechanical outcomes: add what is absent, update what is untouched, report what diverged, report what is orphaned. Never delete, never merge, no --force-all. Absorbs `templates refresh`."
severity: n/a
relationships:
  - references: DP-001
    context: "the principle that shapes the whole design: copying a shipped file is tier 1, but merging a shipped change into a file the user edited is tier 3 — the manifest exists to move the common case out of the second category rather than to license code to judge"
  - references: DP-003
    context: "clause 3, the toolbelt gap test: the upgrade has been performed by hand — copying compose.md into an adopting repo — and the concepts half has never been performed at all"
  - references: PROPOSAL-030
    context: "the precedent this copies its posture from: init generates .gitattributes, index reports drift and never rewrites it — docdog's existing answer to shipped scaffolding going stale"
  - references: PROPOSAL-025
    context: "seeded collection concepts; the population that silently never updates, because init skips what exists and templates refresh only walks what is already on disk"
  - references: PROPOSAL-026
    context: "seeded relation vocabulary, same gap: a relation type shipped after an adopter's init reaches them by no path at all"
  - references: PROPOSAL-032
    context: "surface parity runs MCP→CLI only, so a CLI-only command needs no MCP counterpart; recorded here so the absence is a decision rather than an oversight"
  - references: PROPOSAL-037
    context: "the same instinct one layer down — the server reporting its own vintage; this reports the repo's"
  - references: FRICTION-040
    context: "the trigger, and the first orphan: the flat .claude/skills/specs.md that the SKILL.md layout fix leaves behind, which nothing can currently clean up"
  - references: OBS-015
    context: "why this is invisible in the dogfood setup — the orchestrator received PROPOSAL-029 without anyone running an upgrade, because global docdog is an npm link; a registry-installed adopter has the opposite experience"
  - references: DD-070
    context: "§2's no-migrations rail scopes this: the cache and the embed store already have the correct upgrade mechanism (bump, drop, rebuild) and stay out of scope"
  - amends: PROPOSAL-019
    context: "§2's emit-once, target-owned output: update now maintains the injectable skills an adopter has not edited"
---

# `docdog update`

## The gap, stated exactly

Two commands write docdog's shipped scaffolding into an adopting repo, and
between them **neither can complete an upgrade**.

`docdog init` is **additive only**. `copyTemplateFiles` in
`src/cli/commands/init.ts`:

```ts
for (const file of files) {
  const destPath = join(destDir, file);
  if (existsSync(destPath)) continue;
  ...
}
```

That is deliberate and correct for what it was built for — PROPOSAL-025/026's
repair semantics, where deleting a seeded concept and re-running init brings it
back. It means init will never update a file that is present.

`docdog templates refresh` is **update only**. It builds a filename → source map
from the package, then iterates *the destination*:

```ts
const destFiles = readdirSync(skillsDest).filter((f) => f.endsWith(".md"));
for (const file of destFiles) {
  const sourcePath = sourceByFilename.get(file);
  if (!sourcePath) continue;
  ...
}
```

Walking the destination means a file that is not already there is not
considered. It will never add.

So an adopting repo seeded before `compose.md` shipped can run **both commands,
in either order**, and still not have `compose.md`. That is not hypothetical:
it is what the orchestrator's `.docdog/skills/` is missing today, and the
workaround was a hand copy of one file. The seeded concepts of PROPOSAL-025/026
have the identical hole and a worse blast radius — ship a new relation type and
**no existing adopter receives it by any path**.

## The half that does write, clobbers

`templates refresh` resolves the shipped template against the config, compares
it to the bytes on disk, and overwrites on any difference. No diff, no prompt,
no record of provenance. It cannot distinguish *"docdog changed this file"* from
*"the user changed this file"* because it has no idea what the file looked like
when it was written. This repo currently has an uncommitted edit to
`.docdog/skills/search.md`; `docdog templates refresh` would eat it silently.

It is also mis-shelved. Nested under `templates`, it reads as an operation on
*record* templates, which is what `docdog templates` otherwise means.

## The design

### The seed manifest is the whole idea

`.docdog/.seeded.json` — a map from repo-relative path to the **content hash of
the shipped bytes at the moment docdog wrote them**, plus the docdog version
that wrote them.

```json
{
  "version": 1,
  "entries": {
    ".docdog/skills/search.md":  { "hash": "…", "docdog": "0.2.1" },
    ".docdog/concepts/relation-supersedes.md": { "hash": "…", "docdog": "0.2.1" }
  }
}
```

Hashes are taken over **LF-normalized** content, for the reason
`engine/discovery.ts` already normalizes: under `core.autocrlf` a worktree's
bytes differ from the trunk's, and an EOL-sensitive key would report every file
as user-modified on Windows.

This is the load-bearing part of the proposal, and it is worth being explicit
about why. Without it, "is this file yours or mine?" is inference, and inference
about the user's intent is exactly what DP-001 forbids code from doing — which
is why the existing command resolves it by guessing, and guesses destructively.
With it, the question is a hash comparison. **The manifest does not give docdog
permission to judge; it removes the need to.**

### Four outcomes, all mechanical

| On disk | Manifest | Ships now | Action |
|---|---|---|---|
| absent | — | yes | **add** |
| present | hash matches | changed | **update** — shipped moved, user did not |
| present | hash differs | anything | **report** — the user owns this file |
| present | any | no longer shipped | **report as orphan** |
| absent | present | yes | **add** (restores init's repair semantics) |

A file with no manifest entry at all — every file in every repo seeded before
this ships — is treated as **user-owned and reported**, never overwritten. That
is the conservative direction, and it means adoption of the manifest is
incremental: entries appear as files are added or explicitly accepted, and the
first `update` in an old repo is mostly a report. It is the only safe default,
because the alternative — assuming an unrecorded file is pristine — reintroduces
the clobber on exactly the repos that have been running longest.

### Default posture: write the adds, report the rest

The posture is copied from PROPOSAL-030's `.gitattributes` handling, which is
docdog's existing answer to this class of problem: **init generates it, index
reports drift, and nothing ever rewrites it.**

`docdog update` with no flags:

- **writes** rows 1 and 5 — files docdog ships that the repo does not have
- **writes** row 2 — files docdog ships that the repo has, unmodified
- **reports** rows 3 and 4, with the path and what it would have done

Adding a file the repo does not have cannot destroy anything, and requiring a
second command for it would recreate the friction this proposal exists to
remove. Updating a file that is byte-identical to what docdog wrote is not
overwriting the user's work by construction.

`--dry-run` reports everything and writes nothing. There is **no `--force-all`**
and there must never be one: it is the `--accept-all` analogue that PROPOSAL-028
refused, and the decision it would automate — *"my edits to this file matter
less than the shipped version"* — is DP-001 tier 3, per file. `--force <path>`
takes the divergent file the user names, because then the judgment happened
outside the code, which is the whole shape.

### What is in scope

Everything in an adopting repo that docdog authored:

- `.docdog/skills/` — seeded skills (the `compose.md` case)
- `.docdog/concepts/` — seeded collection and relation vocabulary
- `.claude/skills/docdog-*/` — the injectable skills, including the orphaned
  flat `specs.md` that FRICTION-040's layout fix leaves behind
- `.claude/commands/docdog.md` and the CLAUDE.md block — both currently written
  **unconditionally** by init, which is the same clobber in a different file
- `.gitattributes` merge-driver wiring — already drift-reported by `index`;
  `update` is where the fix belongs
- `.mcp.json` server entry
- `.docdog/config.yaml` — **report only**, new keys named and never written;
  config is the user's file and a default that appears silently is worse than
  one that is announced

### What is out of scope, and why

- **The cache and the embed store.** They already have the right upgrade
  mechanism: a version bump drops and rebuilds. DD-070 §2 forbids migrations,
  and nothing here should soften that.
- **Deleting anything.** Orphans are reported. Files plus git are the archive;
  removal is the user's call and a tier-3 one.
- **Merging.** Not a three-way merge, not a conflict-marker write. If the user's
  file and the shipped file both moved, docdog reports both paths and stops.
  Choosing there is judgment, exactly as it is in PROPOSAL-030's driver, which
  merges only the case that is provably a set union and conflicts loudly on
  everything else.
- **The corpus.** `update` touches scaffolding, never records.

### `templates refresh` is absorbed, not aliased

It is half of this command with a destructive default and a misleading name.
v3 step 6's precedent is deletion rather than compatibility shims, and keeping
both would be the parallel-path shape this project has repeatedly refused.
`docdog templates` keeps its record-template operations.

## Principle walk

- **DP-001 — agent-first mechanics.** The design is tier 1 throughout: hash
  comparison, file copy, report. The one place judgment appears — a file that
  diverged from what was shipped — is routed out of the code to the user, and
  the flag that acts on it (`--force <path>`) requires them to name the file. The
  manifest is what makes this possible; without it every write is a guess. The
  refused features are named so they are not rediscovered as good ideas:
  `--force-all`, auto-merge, auto-delete.
- **DP-002 — concepts carry their own meaning.** Directly served. The seeded
  concept records are the population most damaged by the current gap: docdog's
  vocabulary lives in records, so a vocabulary addition that cannot reach an
  adopter is a principle that silently stops holding in their repo.
- **DP-003 — comprehensive toolbelt with escape hatch.** Clause 3's test: the
  escape hatch has been used. `compose.md` was hand-copied into an adopting repo
  this week, and the `.claude/skills/` orphan from FRICTION-040 has no
  non-manual remedy at all. This is at two instantiations, not three — recorded
  honestly. The counterweight is that the third case, seeded concepts, cannot
  produce an instantiation because nobody has noticed the vocabulary is stale.
- **DP-004 — a record is one retrievable idea.** Not engaged; no records are
  written.
- **Surface parity (PROPOSAL-032).** Parity runs MCP→CLI: a new *MCP* tool ships
  with its CLI counterpart. There is no reverse obligation, and `update` should
  not become a ninth kernel tool — it mutates the host repo's scaffolding, which
  is host-level work, and the kernel 8 is a contract that gets harder to change
  with every adopter. CLI-only, deliberately.

## Open questions — how the build answered them

1. **Does `update` also install what `init` would have wired but the repo never
   had?** *Yes.* An absent member of the seed set is row 1: an add, and adds are
   the half that cannot destroy anything. A repo that predates the merge driver
   gets its `.gitattributes` block. The stated risk — a repo that removed the
   wiring on purpose — is real and is priced: the file comes back, once, and the
   user deletes it again, at which point it stays gone until the next `update`.
   The alternative (remembering deletions) is state about intent, and that is the
   category this design exists to stay out of.
2. **Does the manifest get committed?** *Yes* — nothing gitignores it, and
   `.docdog/.gitignore` still names only `cache/`. It describes the repo's
   docdog-authored files, so it belongs in git beside them; uncommitted, every
   collaborator's first `update` would be a full report of files they never
   touched.
3. **Version-aware reporting.** *Surfaced, not compared.* An update prints
   `(was seeded at 0.2.1)`, and a diverged file prints the version it was seeded
   at, but no branch anywhere reads the version — the hash decides. A version
   comparison would be a second, weaker source of truth for a question the hash
   already answers exactly.
4. **Does `init` start writing the manifest before `update` exists?** Moot:
   both shipped together. `init` records every file it writes and *merges* into
   an existing manifest rather than replacing it, so a second init cannot erase
   the provenance of files the first one wrote.

## What the build changed from the design

- **`init` stopped clobbering `.claude/commands/docdog.md`.** The proposal
  listed it as in scope for `update` and said nothing about `init`, which wrote
  it unconditionally on every run. Once the manifest exists the fix is three
  lines and it is the same fix: a copy that differs from what docdog recorded
  writing is the user's, and init now says so and moves on. The two
  marker-delimited blocks (CLAUDE.md, `.gitattributes`) keep init's
  unconditional injection, because a block replacement is scoped to docdog's own
  span and PROPOSAL-030 wants a re-init to re-derive the patterns from
  `scan_paths`.
- **`--force` grew a third answer.** Beyond "applied" and "no such path", there
  is *named-but-inert*: `--force` on an orphan, which is reported as doing
  nothing rather than silently doing nothing. `--force` on a path docdog does
  not seed is an error, not a no-op, because it is a typo.
- **Manifest pruning is gated on disk.** An entry for a path that is neither
  shipped nor present is dropped, so the manifest does not grow across template
  changes — but a file still on disk keeps its entry even when the seed set no
  longer collects it (a project that switched templates). Forgetting docdog
  wrote it would silently demote it to user-owned, which is the one direction
  this design must not drift.
- **`templates` went with `refresh`.** The proposal said `docdog templates`
  keeps its record-template operations. It had none — `refresh` was its only
  subcommand — so the command was removed rather than left as an empty node.

## What shipped

`src/engine/seed-manifest.ts` (manifest I/O, LF-normalized hashing, the pure
six-way classification), `src/engine/seed-set.ts` (the collector: seeded skills,
scripts, concepts, the four provider-wiring members, and the legacy flat-skill
paths as orphans), `src/engine/seed-update.ts` (plan + apply), the
`docdog update` CLI, `init` recording what it seeds, `templates.ts` deleted,
and 35 tests across `tests/unit/seed-manifest.test.ts` and
`tests/unit/seed-update.test.ts`.

## What ships (as designed, before the build)

1. `src/engine/seed-manifest.ts` — read/write the manifest, LF-normalized
   hashing, and the four-way classification as a pure function over
   (disk state, manifest, shipped set). Unit-testable without touching a repo.
2. `init` writes manifest entries for everything it seeds.
3. `docdog update` — the CLI, defaulting to add + update-unmodified + report;
   `--dry-run`, `--force <path>`, `--json`.
4. `templates refresh` deleted, its skill-refresh behavior subsumed.
5. Tests: the four outcomes; the no-entry file is never overwritten; an
   orphan is reported and not deleted; `--dry-run` writes nothing; a CRLF
   worktree does not report every file as modified.
