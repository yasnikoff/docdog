---
id: PROPOSAL-026
title: "Seed collection concept records at init — the collections half of the shipped-defaults clause"
collection: proposals
status: shipped
date: 2026-07-11
description: "docdog init also seeds one collection concept record per template-shipped collection from templates/concepts/collections/, driven mechanically by the template's collections list. Completes DP-002's shipped-defaults clause; PROPOSAL-025 did the relations half."
relationships:
  - discussed_in: DISC-023
    context: the same thread — the follow-up half was named there and approved in-session right after the relations half shipped
  - extends: PROPOSAL-025
    context: its named not-in-scope follow-up — same seeding rail, now covering collection records; also moves collection-concepts.md onto the new collections rail
  - implements: DP-002
    context: the collections half of the shipped-defaults clause ("every shipped user-facing collection")
  - supersedes: PROPOSAL-006
    context: replaces the v2 meta-collections reshape's collections half — dd_collection_meta rows become seeded concept records
  - references: PROPOSAL-015
    context: the template's collections list is the source of truth that drives which records seed — no second list to drift
  - references: PROPOSAL-016
    context: source of the status_vocabulary blocks the tasks/features/workflows/reconciliations/decisions seeds carry
  - references: FRICTION-012
    context: the failure class the vocabulary blocks address — agents wording statuses against an unregistered vocabulary
  - references: DP-001
    context: DP walk-through — visible, editable, deletable seed files are Tier 2 under the deliberate-exceptions clause, and deriving the copy set from `tmpl.collections` is a Tier 1 lookup
  - references: DP-003
    context: DP walk-through — the escape hatch is the seed files themselves, so no new CLI surface is needed
---

# PROPOSAL-026: Seed collection concept records at init

## Motivation

PROPOSAL-025 restored DP-002's shipped-defaults clause for relation
types but deliberately left the other half out of scope: a fresh
project's shipped *collections* still carry no concept records, so
`docdog search "where do decisions go"` has nothing to match and an
agent must guess collection semantics from names — precisely what
DP-002 forbids. Same clause, same mechanism, done as its own change
so each stays reviewable.

## Specification

### 1. One directory, driven by the template's collections list

New `templates/concepts/collections/` holds one
`collection-<name>.md` per collection any template ships — 15 files:
`notes`, `concepts` (moved here from `_common/`, since every template
ships it), `decisions`, `requirements`, `principles`, `guidelines`,
`terms`, `domain`, `constraints`, `integrations`, `features`,
`tasks`, `workflows`, `reconciliations`, `conversations`.

`seedConcepts` copies exactly the files matching `tmpl.collections`
(skip-if-exists, verbatim — same repair semantics as PROPOSAL-025).
The template's collections list is the source of truth: adding a
collection to a template automatically seeds its record, and there is
no second list to keep in sync (Tier 1 — a deterministic map from the
declared list to files).

Seeded counts per template: minimal 10 (8 relations + notes +
concepts), structured 18, workflows 26.

### 2. Content

Ported from this repo's live records with repo-specific `examples`
ids and relationships blocks stripped (a fresh corpus has no DD-001
to point at). Each record carries `description` (required),
`when_to_use`, `when_not_to_use` where an adjacent collection
competes, and `scope: shipped`.

Five seeds keep their PROPOSAL-016 `status_vocabulary` blocks
(decisions, features, tasks, workflows, reconciliations). Honest
note: nothing in v3 code consumes the field — the v2 consistency
check died at step 6. It ships as agent-readable data, which is the
half that matters (FRICTION-012's collision was an agent wording ACs
against a vocabulary it never saw; a searchable block is the fix
available today). If a v3 warning surface returns, these records are
already its data source.

### 3. Enforcement lives in tests, not runtime

A missing seed for a template-shipped collection is a docdog
packaging bug (DP-002 calls this class an error), but init stays
mechanical — no runtime consistency pass. The invariant is pinned by
a unit test: every name in every template's `collections` must have a
file in `templates/concepts/collections/`.

## DP walk-through

Same verdicts as PROPOSAL-025: visible, editable, deletable files =
Tier 2 (DP-001, deliberate-exceptions clause); implements DP-002's
shipped-defaults clause for collections, every seed carrying the
required `description`; DP-003's escape hatch is the files
themselves. The one new mechanism — deriving the copy set from
`tmpl.collections` — is a pure lookup, Tier 1.

## Not in scope

Unchanged from PROPOSAL-025: no seed refresh on template evolution,
no runtime vocabulary validation, no seeding for user collections
(this repo's observations/discussions/issues/proposals/questions
records stay hand-authored — they are user namespace).

## Status

Shipped, same day (2026-07-11), extending PROPOSAL-025's commit:

- `templates/concepts/collections/` — 15 records (14 new ports +
  `collection-concepts.md` moved from `_common/`, which now holds
  only the 8 core relations).
- `src/cli/commands/init.ts` — `seedConcepts` gains the
  per-collection copy loop over `tmpl.collections`.
- `tests/unit/init-concept-seeds.test.ts` — counts updated
  (10/18/26), structured-template case added, and the
  every-shipped-collection-has-a-seed invariant test.

Suite green; scratch-dir smoke shows minimal seeding 10, structured
18, workflows 26; `docdog index` on this repo unaffected
(templates/ is not scanned).
