---
id: FRICTION-024
title: "suggest-edges has no accept surface — every bulk drain gets hand-scripted, now three times over"
collection: notes
status: resolved
resolution: feature
description: "`docdog suggest-edges` reports candidates and stops. Accepting them in bulk means one `docdog_relate` call per edge or hand-editing frontmatter, so every drain so far has been an ad-hoc script: OBS-003's throwaway tsx (131 edges), OBS-011's relateFileFirst driver (271 edges), and now the orchestrator's frontmatter editor (50 edges, against a 3,947-candidate backlog). The same missing surface has been rebuilt three times by two different corpora — the strongest standing case for a `--accept-from <reviewed-file>` batch applier."
severity: inconvenient
source: external-dogfood (host-project orchestrator, PLAN-DOCDOG-001)
harvested_from: specs/investigations/docdog-adoption/feedback-2026-07-12-day0-eval-misses.md
relationships:
  - references: PROPOSAL-028
    context: "the proposal this friction forced — `suggest-edges --accept-from`, written 2026-07-13 and shipped 2026-07-14; this note closed with it"
  - references: PROPOSAL-024
    context: "the v3 resurrection that deliberately shipped suggest-edges read-only; this friction is the accumulated evidence that the accept half is the missing piece, not a nice-to-have"
  - references: PROPOSAL-010
    context: the original related-but-not-declared proposal — the suggest half has now been validated three times over
  - references: OBS-003
    context: "first hand-scripted drain (131 edges, throwaway tsx script) — recorded at the time as a win, but the script was the tell"
  - references: OBS-011
    context: "second hand-scripted drain (271 edges via a relateFileFirst driver) — on docdog's own corpus, by docdog's own author, which is the point"
  - references: DP-001
    context: "a batch applier is tier-1 mechanics: the judgment (which candidates are real, with what context) lives in the reviewed file the agent authored; the tool only applies it"
  - references: WF-002
    context: harvested from the external dogfood track — surfaced by the day-0 eval, whose one hybrid miss is a reverse-reference question that only edges can answer
  - references: FRICTION-012
    context: "the write order a batch applier must inherit from OBS-011's driver: forward edge only, never the inverse — the convention FRICTION-012 forced into the relate skill"
  - references: DP-003
    context: DP-003 clause 3 is what turned three hand-scripts into a command, on its second instantiation — an escape hatch reached for repeatedly is a toolbelt gap
---

# FRICTION-024: suggest-edges has no bulk-accept surface

## What they were doing

Draining reviewed edge candidates on the orchestrator corpus, so that
reverse-reference questions ("which architecture specs reference
FR-PROV-01?" — the day-0 eval's single hybrid miss, Q05) become
answerable by `docdog_traverse … direction=inbound`. Search cannot
fake that question; only edges answer it.

## What went wrong

Nothing broke. The tool just stops halfway. `docdog suggest-edges`
reports candidates and exits; accepting 50 reviewed ones meant 50
`docdog_relate` calls or hand-editing frontmatter — they scripted the
latter. The corpus-wide backlog is **3,947 candidates**. At that
scale, "write a script each time" is the whole job.

## Why this one is different from a normal wish-list item

The same missing surface has now been hand-built **three times**:

| when | who | how | edges |
|---|---|---|---|
| 2026-04-12 (OBS-003) | docdog, own corpus | throwaway tsx script | 131 |
| 2026-07-11 (OBS-011) | docdog, own corpus | `relateFileFirst` driver | 271 |
| 2026-07-12 | orchestrator adoption | frontmatter editor script | 50 (of 3,947) |

Two independent corpora, two different authors, three ad-hoc
re-implementations of the identical mechanical step. OBS-003 recorded
its script as part of a *win* and moved on; that script was the tell,
and we missed it twice.

## What should change

`docdog suggest-edges --accept-from <reviewed-file>` (or equivalent):
consume an agent-reviewed candidate list — the same shape
`suggest-edges` emits, minus the rejected rows, plus a `context` per
kept row — and apply each as a forward edge in the source file's
`relationships:` block, then reindex.

**DP-001 check (it passes).** The semantic decision — which candidates
are real relationships, and what the context sentence says — stays
entirely with the agent, and the reviewed file *is* the written record
of that judgment. The tool would only apply a list a human/agent
already signed off on: read a file, write frontmatter, reindex. That
is tier-1 mechanics, and it is the same division of labor
`suggest-edges` already respects on the read side (PROPOSAL-024
shipped it read-only precisely to keep the judgment out of the code).

The prior art is already written: OBS-011's driver knows the correct
write order (forward edge only, never the inverse — FRICTION-012),
and the reviewed-list format is whatever the last three scripts each
reinvented. This is a proposal waiting to be typed up, and the
orchestrator's 3,947-candidate backlog is the forcing function.

## Proposed (2026-07-13)

Typed up as **PROPOSAL-028** — `--format review` emits a flat YAML
candidate list, `--accept-from <file>` applies it (one write and one
reindex per source file, idempotent on re-run, empty context refused by
default). This note stays open until that ships.

## Resolved (2026-07-14)

PROPOSAL-028 shipped: `docdog suggest-edges --format review > f.yaml`
→ edit → `--accept-from f.yaml`. The fourth drain will not be a script.

The three that were: OBS-003's throwaway tsx, OBS-011's `relateFileFirst`
driver, and the orchestrator's frontmatter editor. All three also paid a
cost nobody had named — they applied edges *one at a time*, so OBS-011's
271 edges across 92 files cost 271 full reindexes. The command groups by
source file: one write, one reindex, per file.

DP-003 clause 3 is what turned three scripts into a command, and it did so
on its second instantiation. The clause earns its keep.
