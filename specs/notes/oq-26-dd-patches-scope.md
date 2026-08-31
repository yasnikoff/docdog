---
id: OQ-26
title: "Re-assess `dd_patches` scope — skill patches vs git patches"
collection: questions
status: obsolete
related: [EJ-014]
relationships:
  - references: EJ-014
  - references: DD-070
    context: §3 killed `dd_patches` with the v2 schema at v3 step 6, and neither patch mechanism was ever built — no scope left to arbitrate
  - references: DD-050
    context: the current-form tier-3 clause that `dd_patches` was created to serve — the git-patches half of the conflation this question flagged
  - references: RECON-001
    context: the reconciliation that finished this closure — it removed the dormant `git.patches` vestige and squared DD-050's tier-3 clause with the removal
description: "OBSOLETE — dd_patches died with the v2 schema at the v3 pivot (DD-070 §3) and neither patch mechanism was built, so the naming-conflation question is moot. The dormant git.patches vestige (config block, init's .docdog/patches/ dir, the dd_patches reservation) was removed the same day — RECON-001 reconciles DD-050's tier-3 clause. Original question: does dd_patches cover git patches, skill patches, or both?"
---

# OQ-26: Re-assess `dd_patches` scope — skill patches vs git patches

**Status note (2026-07-11, FEATURE-002):** obsolete — `dd_patches`
died at v3 step 6 (DD-070 §3) and neither git patches nor skill
patches were ever built, so there is no scope left to arbitrate.
The dormant vestige in shipped code (`git.patches` typed and
defaulted, `docdog init` creating `.docdog/patches/`, the
`dd_patches` reservation in SYSTEM_VERTEX_COLLECTIONS) was removed
the same day at the user's request — RECON-001 reconciles DD-050's
tier-3 clause with the removal.

`dd_patches` was added as a system collection for EJ-014 tier 3 (git workflow:
task branches propose changes to specs). But "patches" also covers skill patches
(like accelerator-mini patches in docs-internal — modifying skill definitions
for project-specific workflows). These are different things:

- Git patches: proposed content changes, overlaid on canonical search results
- Skill patches: modifications to skill behavior, applied at init/build time

Both use the word "patches" but may need different collections or different
mechanisms entirely. Don't conflate them yet — assess when building either feature.
