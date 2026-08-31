---
id: RECON-001
title: "DD-050 tier 3 reconciled: the patches convention is a design sketch — its dormant pre-wiring no longer ships"
collection: reconciliations
status: resolved
date: 2026-07-11
description: "Code removed the dormant DD-050 tier-3 pre-wiring: the git.patches config toggle (typed + defaulted, never read), docdog init's .docdog/patches/ directory, and the dd_patches reserved collection entry (SYSTEM_VERTEX_COLLECTIONS is now empty; the dd_ prefix stays protected by the writes guard's prefix check). DD-050's Current-status claim that tier 3 'ships as a config toggle' was amended to match. Old configs carrying git.patches: still load — the key is tolerated and ignored like other v2-era keys. Reviving the patches convention is a new proposal that reintroduces its wiring deliberately."
relationships:
  - reconciles: DD-050
    context: "its Current-status section claimed tier 3 ships as a config toggle (git.patches.enabled); after this cleanup nothing pre-ships — the section carries a dated amendment"
  - references: OQ-26
    context: "the dd_patches scope question, closed obsolete by FEATURE-002 — this record completes what that closure described"
  - references: DISC-024
    context: "the staleness sweep that flagged the vestige as a code-cleanup candidate; the user requested the cleanup immediately after"
  - references: DD-070
    context: "kernel-minimalism rationale — dead pre-wiring for an unbuilt tier is exactly what step 6 removed elsewhere"
---

# RECON-001: DD-050 tier-3 pre-wiring removed

## The drift

DD-050 (git-optional three-tier ladder) said tier 3 "ships as a
config toggle (`git.patches.enabled`), currently off." After the v3
pivot that toggle was pure vestige: typed in `GitConfig`, emitted by
`docdog init` into every fresh config, backing directory created —
and read by nothing. DISC-024's staleness sweep flagged it; the user
asked for the cleanup.

## What was removed

- `GitConfig.patches` type field and its `defaults.ts` block (fresh
  `docdog init` configs no longer carry the key).
- `docdog init`'s `mkdirSync(.docdog/patches/)`.
- The `dd_patches` entry in `SYSTEM_VERTEX_COLLECTIONS` — the list
  is now empty; the `dd_` prefix is still refused for record
  creation by the writes guard's prefix check, which never depended
  on the list.
- The `templates refresh` description/comment that mentioned
  patches templating (deferred since v1, never built).
- This repo's `.docdog/config.yaml` `git.patches:` block.

## What stays true

- **Backwards compatibility:** configs still carrying `git.patches:`
  load fine — the loader tolerates unknown keys (documented in
  `src/types/config.ts` alongside the other v2-era keys).
- **DD-050 tiers 1–2** are untouched and live.
- **The tier-3 idea** (patch proposals in `.docdog/patches/`,
  indexed with edges, overlaid on search) remains a legitimate
  future direction — as a proposal that reintroduces its own
  wiring, not as dormant machinery shipped ahead of need.
