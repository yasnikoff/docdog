---
id: FRICTION-051
title: "The search skill's `docdog list` section exists only in this repo — the shipped template still teaches search-only retrieval, so no adopter has ever been told enumeration exists"
collection: notes
status: resolved
fixed_date: 2026-08-27
resolution_approach: fix
description: "`.docdog/skills/search.md` gained a 'When *not* to search — enumeration' section when FRICTION-036 shipped `docdog list`; `templates/skills/_common/search.md` did not. The two files have been silently divergent since, so every project that runs `docdog init` or `docdog update` gets a search skill that never mentions the command built specifically for completeness questions — the exact retrieval mistake FRICTION-036 exists to prevent."
severity: inconvenient
date: 2026-08-27
source: self-hosting (found while editing the skill for FRICTION-038)
relationships:
  - references: FRICTION-036
    context: "the friction that shipped `docdog list` and wrote the enumeration guidance into this repo's copy of the skill — the edit that was never made to the template it came from"
  - references: FRICTION-038
    context: "found while correcting this section's now-stale warning about status filters; the diff against the template is what surfaced that the whole section was local"
  - references: PROPOSAL-044
    context: "the maintenance rail this would ride: `update` re-renders seeds from what docdog would write NOW, so a template fix reaches adopters as an ordinary seed refresh — the mechanism exists, the template content is simply behind"
  - references: DP-002
    context: "the principle whose `scope: shipped | user` provenance marker this fix found wrong in both directions — and the check the concepts population can have, since byte equality is the wrong invariant there"
  - references: PROPOSAL-042
    context: the proposal whose `**Upgrades**` bullet this repo's own CLAUDE.md block had never picked up — the drift running template-to-repo, the direction the note did not suspect
---

# FRICTION-051: the enumeration guidance is local-only

## What I was doing

Editing `.docdog/skills/search.md` for FRICTION-038 — its "Quote
multi-value filters" paragraph had become false once the filters started
validating and accumulating. Before editing, diffed it against the
template it is seeded from:

```
diff templates/skills/_common/search.md .docdog/skills/search.md
```

## What went wrong

Twenty-seven lines exist only on the local side. The entire **"When *not*
to search — enumeration"** section — the argument that ranked retrieval
cannot answer a completeness question at any `limit`, the three worked
`docdog list` examples, and the note that it is CLI-only — is absent from
the template.

So the skill an adopter receives still says, in its Tips section, "Search
returns at most 10 results by default. Use `limit` for more." That is
precisely the reasoning FRICTION-036 was filed to correct, and the
correction never left this repo.

This is not a divergence anything reports. There is no `.docdog/.seeded.json`
in this repo (it predates PROPOSAL-041's device), so `docdog update` here has
no recorded bytes to compare against — but even where the manifest exists, it
would classify the local file as **edited** and correctly decline to touch it.
The manifest answers "did you edit this?"; it cannot answer "should the
template have learned from your edit?", which is the direction this drift runs.

## Why it matters

The `search` skill is the retrieval instruction most agents read first, and
this is the one paragraph that tells them when the tool they are holding is
the wrong one. An adopted corpus is also where the failure is most expensive:
OBS-013 measured hybrid 0.694 MRR on a real 9.5 MB adopted corpus against
0.871 here, so recall is *worse* exactly where the guidance is missing.

## Workaround

None needed locally — this repo has the section. Adopters have no signal
that anything is missing, which is what makes this worth a record rather
than a commit.

## What should change

Port the section to `templates/skills/_common/search.md`, adjusting for the
fact that the template is written for a project that may not have this
repo's collections. Then it reaches adopters through `docdog update` as an
ordinary seed refresh (PROPOSAL-044).

Worth asking at the same time, and the reason this is a note rather than a
one-line fix: **what else has drifted?** `search.md` is one of six skills in
`templates/skills/_common/`, and nothing compares a shipped seed against the
repo's own copy of it. A test that diffs the two — or a deliberate decision
that this repo's skills are *allowed* to lead the template, with a named way
to promote an edit — would turn a silent divergence into a visible one.
`tests/unit/skill-seeds.test.ts` already pins packaging facts about this
directory and is the obvious home.


## Resolution (2026-08-27) — ported, and the survey the note asked for

**The port.** The enumeration section is in `templates/skills/_common/search.md`
now, generalized off this corpus: `--status in_progress`, `--collection
decisions --exclude-status "superseded,deprecated"`, `--where area=billing` —
all valid against the vocabulary the shipped collection concepts declare, which
matters more than it used to now that a status filter is checked (FRICTION-038).
The Tips line that started this — "Search returns at most 10 results by default.
Use `limit` for more" — now says what a bigger `limit` is not a substitute for.

**The survey.** `collectSeeds` was run against this repo and every member
compared to its shipped side. 49 members; **the drift ran in both directions**,
which is the finding, because only one direction was suspected:

- `search.md` — this repo ahead of the template. The filed defect.
- `CLAUDE.md#docdog` — this repo a release *behind*: it never picked up the
  `**Upgrades**` bullet PROPOSAL-042 added, so the file an agent reads first in
  the repo that ships `docdog update --check` did not mention it.
- Six `.docdog/concepts/` records behind the template — three `when_not_to_use`
  blocks lost (`part_of`, `references`, `sourced_from`), the relations-registry
  paragraph lost from `collection-concepts`, and two records still saying
  "vertex" and "discussions record" where the template had been generalized.
- Not drift, checked and dismissed: `.mcp.json` (source mode here, deliberate
  and documented), `.docdog/.gitignore#cache` (this repo ignores the cache from
  the root `.gitignore`, line 158), the injectable skills (never installed here).

All of it is fixed. **Neither direction is visible to `docdog update`** — the
manifest asks "did you edit this?" and the answer on both sides is "yes", which
is exactly right for the command and useless as a drift detector.

### What is checked now, and why it is two checks and not one

`tests/unit/seed-drift.test.ts` partitions the seed set and **asserts the
partition is total**: every member is either mirrored or named with a reason, so
a new group — or a new provider seed — fails until someone decides which side it
is on. That is PROPOSAL-026's device pointed at the copies instead of the
shipped set.

**Mirrored** (byte-identical, LF-normalized): `skills`, `scripts`, and
`provider` minus two named exceptions. This settles the question the note left
open in the strict direction: **this repo's skills may not lead the template.**
A skill is generic instruction; a sharper sentence found here belongs upstream,
and the promotion ritual is `cp`. Corpus-specific guidance already has two homes
built for it — `.claude/CLAUDE.md` and the injectable `specs` skill, which is
rendered per corpus by design (PROPOSAL-044).

**Not mirrored:** `.docdog/concepts/`, because byte equality is the *wrong*
invariant there — this project extends its own vocabulary records with
`examples:` and `relationships:` naming records only this corpus has. A test
that demanded equality would have to be deleted or exempted on the first useful
edit, which is how a guard becomes decoration.

### The second defect, found by the same survey

Checking the concepts turned up something the equality question could not have
asked: **DP-002's `scope: shipped | user` provenance marker was wrong in both
directions.** Nine records this project invented — `collection-proposals`,
`collection-questions`, `collection-issues`, `collection-discussions`,
`relation-companion`, `relation-cross-cutting`, `relation-derived-from`,
`relation-extends`, `relation-parent`, `relation-uses-term` — declared
`shipped`; `collection-concepts`, the one record docdog actually ships,
declared `user`. `scope` is a queryable filter (`storage/search.ts`), so
`--scope user` was answering "what did this project add to the vocabulary" with
one wrong record and missing nine right ones.

That is the check the concepts population *can* have, and it needs no
maintenance: the seed set already knows which files docdog ships, so the marker
is derived rather than declared. It is in the same test.

### Cost of the guard

55 assertions, no fixtures, ~20 ms — it reads the same `collectSeeds` the
commands read, so it cannot drift from what docdog actually writes. Verified in
both directions: a line appended to a mirrored skill fails, and a flipped
`scope:` fails.
