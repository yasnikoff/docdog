---
id: OQ-45
title: "Should setting `outdated: true` also remove the on-disk file?"
collection: questions
status: obsolete
date: 2026-04-13
description: "OBSOLETE — the machinery this question arbitrates (outdated flag semantics, gc TTL windows, PROPOSAL-018 scope) died at the v3 pivot: retirement in v3 IS deleting the file + reindex (DD-070), with git history as the archive (DD-039). The retirement pass it anticipated never ran — EJ records stay on disk per DD-071. Original question: should flipping outdated: true also remove the on-disk file?"
relationships:
  - references: DISC-012
  - references: PROPOSAL-017
  - references: DD-034
    context: the tension — a stale on-disk file fails the vanilla-agent test until GC runs
  - references: DD-039
    context: git-history-as-archive is the backstop that makes delete-on-flag feasible at all
  - references: DD-049
    context: the TTL safety-net posture the three options are weighed against
  - references: EJ-013
    context: paired origin of the soft-delete safety net
  - references: DD-044
    context: layer-separation argument against conflating flag-set with file-delete
  - references: DD-046
    context: layer-separation argument against conflating flag-set with file-delete
  - references: DP-001
    context: option ranking by DP-001 cleanliness — mechanical separation vs the user's instinct
  - references: DD-070
    context: the pivot that collapsed the two layers this question kept apart — with disk canonical and the cache disposable, retirement *is* delete the file plus reindex (option 1 by architecture)
  - references: DD-071
    context: the publication boundary that keeps EJ records on disk, so PROPOSAL-017's retirement pass — this question's first concrete caller — was dropped
---

# OQ-45: Should `outdated: true` also clean up the disk file?

**Status note (2026-07-11, FEATURE-002):** obsolete — PROPOSAL-018,
where the resolution was meant to land, was superseded at the v3
pivot, and DD-070 collapsed the two layers this question kept
separate: with disk canonical and the cache disposable, retirement
*is* `delete the file + docdog index` — effectively option 1 below,
arrived at by architecture rather than decision, with DD-039's git
history as the recovery path. The PROPOSAL-017 retirement pass that
would have first exercised this (the "TASK-005" named below — never
created; the id was later reused by FEATURE-002) was dropped: EJ
records stay on disk per DD-071.

## The question

DISC-012 landed `outdated: bool` as a manual-first frontmatter
flag meaning *"no one should read this as a current source; it
is on the path to GC."* The GC / TTL piece is an explicit
follow-up in DISC-012 §1 ("scope for the initial change").

Open question: when the retirement pass flips `outdated: true`
on an artifact, should that single action **also remove the
on-disk markdown file**, or does removal stay a separate GC
step on its own timer?

## Why it might be "yes"

- **One step, one intention.** The human / agent setting the
  flag knows they want the file gone. A second TTL-delayed step
  adds latency between intent and effect for no user benefit.
- **The file is the noise.** DD-034 says a vanilla agent should
  be able to read `specs/` and find current framing. A
  still-on-disk `outdated: true` file fails that test until the
  GC eventually runs — the artifact is literally the noise DD-034
  wants removed.
- **Git is the archive.** DD-039 already makes git history the
  backstop for historical framing. If a retired record needs to
  be recovered, `git log -- specs/decisions/ej-NNN.md` always
  works. The TTL window adds nothing git doesn't already give
  us.
- **Simpler mental model for PROPOSAL-017's retirement pass.**
  TASK-005 becomes "walk the retired set, delete the files, one
  commit." No two-phase dance.

## Why it might be "no"

- **DD-049 soft delete philosophy.** The whole TTL window exists
  as a safety net — "cheap recovery if the indexer crashes
  mid-reindex" (DD-049 / EJ-013). Deleting immediately on flag-
  set collapses that window for the on-disk layer.
- **The flag is on the vertex, the file is separate.** In the
  current model `outdated` describes the indexed vertex. The
  on-disk file is the source-of-truth; flipping a flag on the
  vertex and deleting the source in one action conflates two
  layers that have been deliberately kept separate (DD-044,
  DD-046).
- **Agent composability.** If `outdated: true` also deletes the
  file, then any agent that flips the flag is also taking a
  destructive filesystem action — which means the flag can't
  safely be set from a "just the frontmatter" workflow. That
  couples surface to side-effect.

## Shape of a resolution

Three plausible designs:

1. **Coupled.** `outdated: true` → file deleted in the same
   commit that flips the flag. Simplest; matches the "one step,
   one intention" framing.
2. **Decoupled with a short window.** Flag flip and file deletion
   are separate steps, but the default TTL is short (hours, not
   days) so the window exists for crash-recovery but not for
   user recovery. The user recovers via git.
3. **Opt-in coupled.** `docdog gc --outdated` or a retirement-pass
   workflow removes files whose `outdated: true` has been set.
   Flipping the flag is a pure frontmatter operation; cleanup is
   a deliberate second step. Matches current DD-049 posture.

Option 3 is the most DP-001-clean (mechanical separation,
explicit user action) but option 1 is what the user's
instinct is pointing at. Probably worth talking through before
PROPOSAL-018 writes the `outdated` semantics down, because
option 1 changes the frontmatter primitive's contract in a way
options 2 and 3 don't.

## Related

- DISC-012 — defined `outdated: bool`; left GC integration as
  follow-up. This question refines *what* that integration does.
- DD-049 — opaque keys + soft delete (the TTL window concept
  this question would collapse or preserve).
- DD-039 — git history as archive (the backstop that makes
  option 1 feasible at all).
- PROPOSAL-017 — the refactor whose retirement pass (TASK-005)
  is the first concrete caller of whatever we decide here.
- PROPOSAL-018 (not yet written) — where the resolution
  belongs once we have one.
