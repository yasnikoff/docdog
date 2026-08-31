---
id: PROPOSAL-044
title: "Injectable skills become seed-set members — one renderer for install and update, a timestamp deleted, and specs absorbs navigate-specs"
collection: notes
status: shipped
date: 2026-08-25
description: "The injectable skills are the only thing docdog writes into an adopting repo that `docdog update` cannot maintain, and the reason turns out to be much smaller than the comment in collectSeeds claims: of five placeholders across three templates, one is corpus-derived, and the thing actually blocking the manifest is `generated_at` — a timestamp docdog writes about itself, which guarantees every re-render differs from every previous one. Delete it, give collectSeeds the installer's own renderer as the shipped side, and all three become ordinary seeds with PROPOSAL-041's four outcomes: update refreshes what you did not edit, reports what you did. init can then seed them, which closes the reach half — today an adopter is never told that docdog-feedback exists. Merges specs and navigate-specs into one skill along the seam the code already shows (a placeholder whose only job is to point one at the other) and keeps feedback standalone, because a skill's description is its trigger and the rare skill is the one that most needs its own."
severity: n/a
relationships:
  - references: PROPOSAL-041
    context: "the seed manifest whose four outcomes this extends to a population it was told it could not cover; the 'one collector, two commands' shape is copied exactly, with skill install and update as the two callers of one renderer"
  - references: PROPOSAL-020
    context: "the three-skill factoring this partly reverses — its 'why three skills, not one' argument rests on a premise (regeneration is a manual per-repo act worth minimizing) that update removes; surfaced and argued rather than ignored, per the principles-review rule"
  - references: PROPOSAL-019
    context: "the mechanism being changed, and the source of the one constraint kept verbatim: id-prefix discovery stays empirical, because an id_pattern field on collection meta has now been refused twice"
  - references: PROPOSAL-043
    context: "the skill whose reach this fixes — the feedback channel currently arrives only if the adopter reads the README, because init writes no injectable skill and nothing in the CLAUDE.md block mentions that they exist"
  - references: PROPOSAL-042
    context: "the delivery half: update is where an adopter meets a new docdog, so a skill that update cannot touch cannot be delivered by the upgrade path this release shipped"
  - references: FRICTION-043
    context: "the precedent that nearly misled this design — its lesson is not 'no corpus state in a skill' but 'no corpus state with no refresh path'; the flat index had no recomputation and no reader, the prefix roster gets both here"
  - references: FRICTION-040
    context: "the installed shape every skill must keep — <target>/docdog-<name>/SKILL.md — and the reason the docdog- prefix survives the merge: it is the only namespace a project-level skill has"
  - references: DP-001
    context: "the tier walk: every step here is literal substitution, set membership and string comparison, and the one judgment in the area — whether an edited skill should be overwritten — stays where PROPOSAL-041 put it, behind a named --force"
  - references: DD-070
    context: "the architecture the skills were quietly violating: files are the source of truth and the cache is disposable, but a skill file rendered from the cache and never re-rendered is cache state promoted to a tracked file"
  - references: FRICTION-036
    context: "docdog list, the exhaustive-enumeration surface a skill points an agent at instead of embedding a per-record snapshot"
---

# PROPOSAL-044: the injectable skills become seeds

## Motivation

`docdog update` maintains every file docdog writes into an adopting
repo — skills, scripts, vocabulary, provider wiring, the pinned MCP
entry — with one exception. The injectable skills under
`.claude/skills/docdog-*/` are outside the seed set, and `collectSeeds`
says why:

> Their content is *generated per corpus* by `docdog skill install`
> reading the host's cache, so there are no shipped bytes to compare
> against — re-running the install is the only thing that can refresh
> them.

Two things are wrong with that sentence. The first is scale: it
describes three files, and it is true of a fraction of one. The second
is the inference: "no shipped bytes" conflates *shipped* with *fixed*.
The manifest needs to know what docdog **would write now**, and for a
corpus-derived file docdog can compute that on demand — by running the
same discovery the installer runs.

The consequence is not theoretical. `docdog update` is the surface an
adopter meets a new docdog through (PROPOSAL-042). A skill it cannot
touch cannot be upgraded, and the skill most affected is the one
shipped last: an adopter's `docdog-feedback` will keep whatever
procedure it was installed with, forever, silently.

And the reach half is worse than the refresh half. **`docdog init`
installs no injectable skill at all.** It writes a `CLAUDE.md` block
that says *"Skills in `.docdog/skills/`"* — a different directory, a
different population — and nothing anywhere tells an adopter that
`docdog-navigate-specs` or `docdog-feedback` exist. The feedback
channel reaches a second user only if they read the README.

## The measurement

Every placeholder in every injectable-skill template:

| Template | Placeholders |
|---|---|
| `navigate-specs.md` | `docdog_version`, `generated_at` |
| `feedback.md` | `docdog_version`, `generated_at` |
| `specs.md` | + `id_prefixes`, `file_conventions`, `navigate_specs_path` |

Of the five distinct names: `docdog_version` is known at update time.
`navigate_specs_path` is a constant computed from the registry.
`file_conventions` is derived from **config**, which is the same class
as the `{{config:*}}` expansion `collectSeeds` already runs over
`.docdog/skills/*` — precisely the reason those *are* manageable.

So the corpus-derived surface across the whole population is
**`id_prefixes`, in one of three files**. Two of the three skills are
unmanageable solely because of a timestamp.

`generated_at` is also the thing that makes the manifest unusable even
where nothing else would. The manifest records the bytes written; the
seed set re-renders to get the shipped side; a fresh timestamp makes
those differ on every run, forever. Every `docdog update` would rewrite
every skill and produce a diff that says nothing happened. It is not a
casualty of this design — it is the blocker.

## What ships

1. **`generated_at` is deleted** from all templates and from every
   `allowedPlaceholders` list. The "to regenerate, run…" footer already
   tells a reader how the file came to exist, and `docdog_version`
   already says which docdog wrote it. A timestamp answers a question
   nobody asked at a cost that blocks the feature.

2. **One renderer, two callers.** The render path in
   `skill-install.ts` — profile lookup, discovery, allowlist check,
   substitution — is factored so `collectSeeds` can call it to produce
   the `shipped` side of a `SeedItem`. This is PROPOSAL-041's own shape
   (`init` and `update` reading one collector) applied one level in:
   the gap it fixed existed because two commands walked two different
   sets, and re-introducing that split here would reproduce it.

3. **The injectable skills join the seed set** as a `skills-injectable`
   group, at `.claude/skills/docdog-<name>/SKILL.md`. All four outcomes
   then apply unchanged: add what is absent, update what is byte-identical
   to what docdog wrote, report what you edited, report what is orphaned.

4. **`docdog init` seeds them.** Which closes the reach half, and makes
   `docdog skill install` what it should have been — the command for
   installing to a non-default target, or re-emitting on demand — rather
   than the only path to a file most adopters never learn about.

5. **`specs` absorbs `navigate-specs`.** One skill, `docdog-specs`.
   `docdog-feedback` stays standalone. See below.

6. **`.claude/skills/docdog-navigate-specs/SKILL.md` joins the
   enumerated legacy list** (`shipped: null`), so an adopter who has one
   is told it no longer ships and is never silently deleted.

## Design details that are not obvious

**The corpus-derived item needs a cache, and may not have one.**
`update` is corpus-independent today; discovery reads
`.docdog/cache/index.db`. When the cache is absent or unreadable, the
merged `specs` item is **skipped and reported** — "cannot refresh, no
cache; run `docdog index`" — never written with an empty roster, which
would destroy a good file in the name of updating it. Every other seed
in the run proceeds; this follows `update`'s existing posture that a
failure is a value and the file work finishes.

**At `init` there is no corpus yet.** A fresh project has no index, so
the prefix roster renders as an explicit "none discovered yet — run
`docdog index`, then `docdog update`" line rather than as an empty
table. The static ninety-five percent of the skill is useful
immediately; the roster fills in on the first update.

**Refresh becomes a feature, not just a repair.** Once the shipped side
is computed live, an unedited `docdog-specs` is *re-rendered as the
corpus grows* — a new collection appears in the roster on the next
`update`. That is the invalidation path FRICTION-043's flat index never
had, and it is why the same reasoning does not condemn this one.

**PROPOSAL-020 §10 forbids auto-regeneration on `docdog index`, and
that is untouched.** The write here happens when someone runs `update`,
lands in tracked files, and passes through git review — which is the
property that clause was protecting. `index` still writes nothing into
`.claude/`.

**Ejection survives intact.** PROPOSAL-020's central requirement is
that the skills stay standalone and useful when docdog is removed. The
prefix roster stays *embedded in the file*, which is what makes that
true. An earlier draft of this design replaced it with a live
`docdog list` lookup, on FRICTION-043's precedent; that would have
traded the ejection property for a problem this proposal solves
another way, and it is rejected here for the record.

## Why not one `docdog` skill

The idea that prompted this — collapse all three into a single
`docdog` skill and make the others arguments — narrows the *count* of
unmanageable files without changing the *class*. One file that the
manifest cannot hash is still a file the manifest cannot hash.

It also costs something real. **A skill's `description` is its
routing mechanism.** Three skills are three independent triggers a
model matches against; `docdog-feedback`'s *"use when docdog itself
misbehaves, not when a record is wrong"* is what makes the feedback
channel fire without the user knowing the skill exists — exactly the
reach problem this proposal is about. Folded into one description,
that trigger competes with "navigate the specs corpus" inside one
sentence, and a broad description fires indiscriminately or not at all.

Argument-style dispatch (`/docdog feedback`) helps only
*user*-invocation. These skills are mostly model-invoked, and an
argument someone has to type is a strictly worse trigger than a
description a model matches.

## Why `specs` and `navigate-specs` merge anyway

The code shows the seam. `navigate_specs_path` exists for one purpose:
so the `specs` skill can tell an agent to go read the other file. Two
files, one topic, with a pointer between them.

PROPOSAL-020 argued the opposite, and its argument must be answered
rather than skipped:

> Collapsing them produces inevitable rot — when docdog adds a new edge
> type, a single-skill design forces every per-repo `/specs`
> regeneration to re-encode the new convention; the factored design only
> requires regenerating `/navigate-specs`.

That is sound, and its premise is what this proposal removes.
Regeneration was a **manual per-repo act**, so minimizing how often it
was needed was worth a factoring. Once `update` re-renders both from one
renderer in one run, "only regenerating navigate-specs" saves nothing:
the same command refreshes both, at the same moment, whichever changed.
The factoring was buying a scarcity that no longer exists.

One cost is real and worth naming: a host repo can no longer take the
generic conventions *without* the per-corpus facts. That is a
plausible want for a repo with no corpus yet — and it is now served
by the "none discovered yet" roster instead of by a second skill.

`docdog-feedback` does not merge. It is a different topic at a
different moment, it is already fully static, and it is the one whose
trigger matters most because it is the one nobody goes looking for.

## What must never be built

- **Regeneration on `index`.** PROPOSAL-020 §10, restated: writes into
  a host repo's `.claude/` happen when someone asks for them.
- **`--force-all` for skills.** The `--accept-all` analogue, per file,
  exactly as PROPOSAL-041 refused it. Overwriting a skill the user
  edited is their judgment.
- **An `id_pattern` field on collection meta.** Refused by
  PROPOSAL-019 and again by PROPOSAL-020 §10; empirical discovery still
  wins, and this proposal removes the last reason to want it (that
  discovery output could not be maintained).
- **Silently writing an empty roster** when the cache is missing. A
  skipped item with a reason beats a file that is technically current
  and factually empty.

## Principles

- **DP-001.** Tier 1 throughout: profile lookup, literal substitution,
  set membership on the allowlist, string comparison against a hash. The
  one judgment in the area — whether docdog's version of an edited file
  should replace the user's — is untouched and stays behind `--force`,
  named per file. Nothing new lands in tier 2 or tier 3.
- **DP-002 — untouched.** No new collection, no new relation type. The
  seed group is a report-grouping label, not vocabulary.
- **DD-070.** This is the architecture argument, stated plainly: a skill
  rendered from the cache and then never re-rendered is cache state
  promoted into a tracked file with no way back. Making `update` own it
  puts the derived thing back on the derived side of the line.

## Cost

Three templates edited (one deleted placeholder, two files merged into
one). A render function extracted and given a second caller. One new
seed group and its report lines. One `init` call site. One legacy
orphan entry. Tests: the seed-set pin gains the new group, the merged
skill gains the assertions the two skills had, and the no-cache path
needs one — it is the branch that fails invisibly.

No schema change, no cache change, no new command, no new flag.

## Open

- **Registry key for the merged skill.** `specs` is the incumbent and
  keeps working; `navigate-specs` becomes an unknown name. The existing
  error already lists the valid names, so the failure is legible — but
  whether it should say more than "unknown" is worth deciding when the
  code is written, not here.
- **Whether `skill install` keeps a `--target` at all** once `init` and
  `update` own the default path. Left alone in this proposal: removing a
  working flag is a separate argument with its own evidence bar.

## Shipped (2026-08-25)

Built as designed, 589 tests / 44 files. `renderInjectableSkill` in
`skill-install.ts` is the seam; `init`, `update` and `skill install` are its
three callers. `collectSeeds` gained a `skills-injectable` group and both
skills; `.claude/skills/docdog-navigate-specs/SKILL.md` joined the enumerated
legacy list. Verified end to end on this repo and on a fresh temp project:
with a cache, both skills are ordinary `add`s; without one, `feedback` is
added and `specs` is reported under **Not refreshed on this run** with the
reason and the two commands that fix it.

Six things the code decided that the design did not.

1. **`collectSeeds` returns `{items, unavailable}`.** The design said the
   no-cache member is "skipped and reported" without saying through what. A
   new `SeedOutcome` was the obvious move and is wrong: every outcome is a
   function of (shipped, current, recorded), and an unrenderable member has
   **no shipped side at all**, so it cannot be classified rather than
   classifying oddly. `shipped: null` would have said "docdog no longer ships
   this" — false, and an invitation to delete a good file.

2. **Discovery is synchronous now.** Nothing in it was ever actually async —
   better-sqlite3 reads and string formatting behind an `async` keyword. Left
   alone, it would have forced `collectSeeds` and `planUpdate` async to reach
   a promise that always resolved immediately.

3. **`skill install` no longer throws when there is no cache.** It used to
   fail with an actionable error; it now writes the file with the roster
   reading *"not read yet"* and prints the same advice. Changed because `init`
   writes that identical file in that identical state on every fresh project,
   and an explicit command being stricter than the automatic one is
   incoherent. The gap stays visible in the artifact rather than only in a
   console line, which is the better of the two places for it.

4. **The default target is one constant.** The CLI held its own
   `".claude/skills/"` literal; `init` and `update` write to
   `DEFAULT_SKILL_TARGET`. A drift between them would have put a second copy
   of every skill in a directory nothing maintains.

5. **FRICTION-043 left a reference behind, and the merge caught it.** The
   deleted flat index was still recommended *in the other skill*:
   `navigate-specs` told an agent to `rg "^ID-HERE " specs.index.md` as a
   cheaper lookup. The emitter went; the instruction pointing at its output
   did not, because it lived in a file the friction was not about. Gone now.

6. **The merged skill gained a rule neither half had.** Relationship encoding
   is one of the sections that moved across, and the merged text states the
   forward-edge-only rule — one relationship, one edge, in the direction the
   source asserts, because traversal reads inbound for free (FRICTION-012,
   sharpened by OBS-014). It was in `.docdog/skills/relate.md` for projects
   that run docdog and in no skill docdog installs *elsewhere*, which is
   backwards: the adopter's agent is the one most likely to invent a
   reciprocal.

**The two open questions, answered.** The merged skill keeps the registry key
`specs`; `navigate-specs` is now an unknown name, and the existing error
already lists what is valid, so no special case was added for it. `--target`
stays: removing a working flag is a separate argument with its own evidence
bar, and it is the only way to install outside `.claude/skills/`.

**Not done, and deliberately:** `docdog update` still does not know that a
*template* changed between versions in a way that makes an edited skill worth
re-reading. That is the `diverged` case, it is reported, and deciding for the
user is DP-001 tier 3 — but a diff between the recorded bytes and what ships
now would help them decide, and nothing offers one.
