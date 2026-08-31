---
id: STATUS-ORCH-MIGRATION-2026-04-13
title: "Where we stand on the orchestrator migration — parked 2026-04-13"
collection: notes
status: obsolete
date: 2026-04-13
description: "OBSOLETE — the v2 migration track this snapshot points into (DISC-014 sidecar plan, PROPOSAL-020/021 steps) died at the v3 pivot; the current adoption effort is PLAN-DOCDOG-001 (specs/plans/2026-07-11-docdog-adoption.md in the orchestrator repo, binding decisions D1–D6, not yet executed). Do not resume from here. Original snapshot: three of six planned steps landed 2026-04-13, then parked."
relationships:
  - references: DISC-014
  - references: PROPOSAL-019
  - references: PROPOSAL-020
  - references: PROPOSAL-021
  - references: DD-070
    context: the v3 pivot that killed the v2 plan this snapshot tracks — PROPOSAL-021 is superseded and the sidecar/three-skill migration steps were replaced wholesale
---

# Orchestrator migration status — parked 2026-04-13

**Status note (2026-07-11, FEATURE-002):** obsolete. The v2 plan
this snapshot tracks died with the v3 pivot (DD-070) — PROPOSAL-021
is superseded and the sidecar/three-skill migration steps were
replaced wholesale by **PLAN-DOCDOG-001**, written 2026-07-11 into
the orchestrator repo at `specs/plans/2026-07-11-docdog-adoption.md`
(binding decisions D1–D6; not yet executed). Do not resume from this
file — it remains only as the record of where the v2 track stopped.

Ask this file first with a prompt like **"where do we stand with
orchestrator migration?"** — it is the single pointer into the
DISC-014 / PROPOSAL-020 / PROPOSAL-021 work thread.

## Why parked

- The host-project orchestrator repo is currently busy with its own
  work; day-1 contact (step E below) would land on top of active
  changes.
- Further orchestrator-skill amendments are already planned; better
  to let those settle before the docdog side tries to consume them.
- Larger docdog refactors are planned upstream that may touch
  paths the remaining steps (E, F) would build on.

No blocker on the docdog side — the work is pausable at this
boundary because each completed step is independently reviewable.

## Locked six-step plan (from the follow-up prompt that opened this session)

| Step | What | Where | State |
|---|---|---|---|
| **A** | Amend PROPOSAL-020 §5 — make `/backport` generic (zero per-repo placeholders, agent reads `.docdog/config.yaml backport.*` at run time) | docdog repo, doc-only | ✅ done — commit `5044e04` |
| **B** | Write PROPOSAL-021 — sync_policy field + indexer skip + `docdog export` bridge | docdog repo, doc-only | ✅ done — commit `b5e2bab` |
| **C** | PROPOSAL-020 commit 1 — hand-author `/navigate-specs` template, refactor `skill-install.ts` to per-skill placeholder profiles + per-skill discovery, refine `/specs` to cross-reference, tests, self-smoke | docdog repo, code | ✅ done — commit `1d676aa` |
| **D** | PROPOSAL-021 implementation — `sync_policy` field on `dd_collection_meta`, indexer skip at three soft-delete sweep sites, `docdog export <collection>` command, round-trip tests | docdog repo, code | ✅ done — commit `1b961a1` (332/333 green; self-smoke exported live `principles/` cleanly) |
| **E** | Orchestrator day-1 contact — install skills, author `.docdog/` side, migrate legacy `BACKPORT-039/040/041` via the task-folder-from-git-history recipe in DISC-014 §pinned-decisions-4. Author `.docdog/observations/obs-001-orchestrator-backport-flow.md` as the operational truth for how the orchestrator's backport flow actually works today (sourced from every skill under `.claude/skills/` that mentions BACKPORT — architect, coder, enhance-spec, api-designer, finalize-task, ingest-exchange) | `../<host-project>/orchestrator/<host-project>-orchestrator/`, **not this repo** | ⏸ blocked on orchestrator repo settling |
| **F** | PROPOSAL-020 commit 3 — generic `/backport` skill template + `backport:` config block schema in `src/types/config.ts`. Must land **after** E so the orchestrator-side workflow exists for the skill prose to reference a real live config block | docdog repo, code | ⏸ blocked on E |

Steps A / B / C / D are in this repo (all shipped). E is in the
orchestrator repo. F is back in this repo but must land after E.
The remaining blockers are purely on the orchestrator side.

## What each completed commit changed

### `5044e04` — PROPOSAL-020 §5 amendment (step A)

Rewrote the `/backport` placeholder profile in PROPOSAL-020 from
three per-repo placeholders (`backport_workflow_id`,
`backport_script_name`, `routing_table`) to zero. Same shape as
`/navigate-specs`. The skill body points at the live
`.docdog/config.yaml backport.*` block and instructs the agent to
read it at run time. Also updated §2 (placeholder table + discovery
list), §6 (commit-3 description), §9 (DP-001 rows). Reason: baking
routing into the skill coupled it to one workflow per installation
and forced re-install on routing changes.

### `b5e2bab` — PROPOSAL-021 written (step B)

New proposal document `specs/notes/proposal-021-sync-policy-and-export-bridge.md`.
Three pieces, one commit when implemented:

1. **`sync_policy?: "mirror" | "archive"`** field on
   `CollectionMetaEntry` in `src/arango/meta.ts`. Default `mirror`
   (current behavior, zero migration). Tier-2 visible default per
   DP-001. Opt-in per collection via `docdog collections update
   <name> --sync-policy archive`.
2. **Indexer skip at three soft-delete sweep sites** in
   `src/engine/indexer.ts`:
   - `sweepMissingFiles` (FRICTION-009 ghost sweep) ~line 241
   - Full-rebuild pre-delete ~line 84
   - `reconcileFile` section-level soft-delete ~line 484
   Each site checks the collection's sync_policy and skips archived
   collections. ~40 LOC total.
3. **`docdog export <collection> [--target <dir>] [--force]`** — new
   command that materializes non-soft-deleted vertices back to disk
   as markdown files (frontmatter + body), one per vertex,
   round-trippable with `docdog index`. Target is relative-to-CWD
   (same rail as `docdog skill install`). Slug derivation is a
   single literal rule; collisions hard-error. ~120 LOC + tests.

The proposal names the ejection trap explicitly: archive makes
Arango load-bearing for that collection's content between exports.
Mitigation is the export command used as periodic discipline (before
risky ops, before upgrades, on a schedule). The discipline is the
user's to adopt, not docdog's to enforce.

Estimated effort: ~190 LOC core + ~220 LOC tests. Landing as one
commit because the three pieces are interdependent.

### `1d676aa` — PROPOSAL-020 commit 1 (step C)

Implementation of the three-skill factoring half of PROPOSAL-020.

Files changed:

- `src/engine/skill-install.ts` — major refactor. `REGISTERED_INJECTABLE_SKILLS`
  is now `Record<string, SkillProfile>` where each profile declares
  `templateRel`, `allowedPlaceholders`, `hasIndex`, and a `discover`
  function. Split `discoverCorpus` into `discoverSpecs` (corpus-aware,
  Arango-touching) and `discoverNavigateSpecs` (corpus-agnostic,
  returns only version + timestamp). `skillInstall` routes via the
  profile; skills with `hasIndex: false` write only the outer file.
  New defensive allowlist checks: `assertTemplatePlaceholdersInAllowlist`
  rejects a template referencing a `{{name}}` outside the skill's
  set; `assertSubstitutionsInAllowlist` rejects a discovery function
  returning keys outside the set. Both are tier-1 mechanical.
- `src/cli/commands/skill.ts` — `formatResult` + `projectionJson`
  updated to surface the skill name and hide the index lines when
  the skill has no index. `Object.keys(REGISTERED_INJECTABLE_SKILLS)`
  still works on the new record shape.
- `templates/injectable-skills/navigate-specs.md` — new hand-authored
  template. ~150 lines of prose covering: frontmatter conventions,
  relationship encoding + common edge types, Path A (grep + git
  history retrieval recipe for completed task content), Path B (MCP
  tool cheat sheet when docdog is present), version footer. This is
  the single docdog-version-coupled piece; regenerating it is the
  only action when docdog's conventions evolve.
- `templates/injectable-skills/specs.md` — refined. Cross-references
  `navigate-specs.md` at the top, dropped the inline relationship-
  following material that now lives in the generic skill. Smaller
  scope, same shape.
- Unit test — new `describe` block checking registry shape:
  both skills registered, navigate-specs allowlist is exactly
  `[docdog_version, generated_at]`, specs allowlist is a strict
  superset, no leaked `routing_table` / `backport_workflow_id` in
  specs.
- Integration test — new `navigate-specs` e2e test (single-file
  write, no companion index, version + timestamp substituted) and
  a rogue-template test (template references a placeholder from
  another skill's profile → allowlist hard-errors).

**Test state after commit C:** 314/315 green (1 pre-existing skip),
up from 311/312.

**Self-smoke against this repo:**
- `docdog skill install navigate-specs --target .skill-smoke`
  writes a single file with version `0.2.0` and a live timestamp,
  no companion index.
- `docdog skill install specs --target .skill-smoke --force`
  discovers 188 index entries across 14 id prefixes (DD-, EJ-,
  DISC-, FEATURE-, FRICTION-, OBS-, DP-, API-IMPROVEMENT-,
  PROPOSAL-, OQ-, FR-, TASK-, WF-).

## What still needs to happen when unpausing

The follow-up prompt from the session-opening brief is still
accurate for steps E / F. Key reminders when resuming:

- **Step E ordering and constraints.** Happens in
  `../<host-project>/orchestrator/<host-project>-orchestrator/`, **not**
  this repo. Before starting, reconfirm with the user — the
  orchestrator-side work crosses repo boundaries. The
  `.docdog/observations/obs-001-orchestrator-backport-flow.md`
  authoring is the anchor artifact; DISC-014 §3 has the raw
  material. Legacy BACKPORT-039/040/041 migration uses the
  task-folder-from-git-history recipe pinned in DISC-014.
- **Step F must land after E.** The generic `/backport` skill prose
  references the live `.docdog/config.yaml backport.*` block by
  name, so the block has to exist somewhere before the skill is
  authored.
- **Not in scope when unpausing** (deferred, do not expand scope):
  workflow ids with slugs, auto-regeneration of injected skills on
  `docdog index`, `id_pattern` field on `dd_collection_meta`, task
  README generation workflow, `specs/architect-architecture.md`
  monolith migration, `extends:` relation-type registration.

## Head pointer at park time

- Branch: `v2`
- Head commit: `1b961a1` — "feat: PROPOSAL-021 — sync_policy
  field + indexer archive skip + docdog export"
- Tests: 332 passed, 1 skipped (pre-existing)
- Clean working tree (except whatever the next session finds)

## Discoverability

This note is indexed under `specs/notes/` and carries id
`STATUS-ORCH-MIGRATION-2026-04-13`. Retrieval paths:

- `docdog_get STATUS-ORCH-MIGRATION-2026-04-13`
- `docdog_search "orchestrator migration status"`
- `docdog_search "where do we stand with orchestrator migration"`
- `rg "STATUS-ORCH-MIGRATION" specs/`

When resuming, read **this file → DISC-014 → PROPOSAL-020 → PROPOSAL-021**
in that order, then pick up at step E (which happens in the
orchestrator repo, not this one).
