---
id: DD-065
title: "Two-tier content model — published specs on disk + DB, working context in DB only"
collection: decisions
status: superseded
date: 2026-04-13
description: "DD-mirror of EJ-029 under DD-034's artifact-resilience lens. Published specs (decisions, requirements, principles, etc.) live on disk and in Arango with bidirectional sync and are committed to git. Working context (discussions, conversations, drafts) lives in Arango only. Collection-level export policy decides which tier a collection belongs to."
relationships:
  - supersedes: EJ-029
    context: "mirror under DD-034's artifact-resilience lens — softened per DD-066 (memory-layer reframe)"
  - references: DD-050
  - references: DD-058
  - references: DD-066
---

# DD-065: Two-tier content model

**Superseded 2026-07-06 by DD-070** — the two-tier split collapses; there is no DB-only working tier, everything canonical lives on disk.

Docdog recognizes two content tiers, and collections belong to
exactly one of them.

## Published tier (disk + DB, bidirectional)

`decisions`, `requirements`, `principles`, plus any user
collection flagged as published in config.

- Authored on disk as section-per-file markdown (DD-053).
- Indexed into Arango; the indexer is the disk→DB direction.
- Agent updates via `docdog_update` write back to disk on
  export; the export pass is the DB→disk direction.
- Git-committed. Readable by humans, by non-docdog agents, and
  by anything that can read markdown.
- DD-034 applies in full: a vanilla agent must be able to
  reconstruct the content and its relationships from the disk
  representation alone.

## Working-context tier (DB only)

`discussions`, `conversations`, `observations`, drafts, `tasks`
(while in-progress — see DD-069), any collection explicitly
flagged as DB-only.

- Created via MCP tools (`docdog_create`, etc.) — no disk
  authoring path at all.
- Not committed to git. Not readable outside docdog.
- Searchable via MCP tools exactly like published content.
- DD-034 does not apply: these artifacts exist because an
  agent was running at the time they were written.

## Why not one tier or the other

Putting working context on disk turns every discussion into
noise for human readers and an unmaintained artifact in the
repo. Putting published content DB-only breaks git history,
human review, and non-docdog agent access — all of which are
load-bearing under DD-034 and DD-050.

Two tiers, with collections picking a side, is the smallest
model that gives each kind of content its right shape.

## The DD-066 softening

EJ-029 originally wrote an absolute: *"agents always go through
ArangoDB; there is no valid scenario where a docdog skill
should tell an agent to write a file first."* DD-066
(mirroring EJ-030's memory-layer reframe) softens this: user
workflows must remain functional even when docdog isn't
installed. That is the weaker but correct claim — agents use
MCP tools when available, and the artifact layer (which DD-034
makes load-bearing) is the fallback when they aren't.

## Status of the implementation bits

EJ-029 listed four "not yet implemented" items:

- Collection-level `export: true/false` config — still a
  follow-up. The tier split is currently enforced by
  convention + per-collection defaults, not by a config field.
- `docdog_create` / `docdog_update` MCP tools — **shipped**.
- `docdog export` for DB→disk sync — still a follow-up.
- Working-context ingest directly to DB — **shipped** for new
  collections; retrofitting is per-case.

The two shipped pieces are what make DD-065 testable today; the
two follow-ups are what make the disk↔DB story round-trip-safe
at scale.

## DD-034 check

Shape-preserving. DD-034 applies to the published tier in full
— that's where disk readability is load-bearing. The working-
context tier is explicitly out of DD-034's scope: it exists
because docdog exists, and if docdog disappears, the working
context was ephemeral in the first place.
