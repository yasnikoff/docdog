---
id: OQ-40
title: Disk ⇔ ArangoDB sync story
collection: questions
status: resolved
related:
  - EJ-030
  - OQ-31
relationships:
  - references: EJ-030
    context: the question is scoped to its two-tier model — where content lives across disk and DB
  - references: OQ-31
  - references: OQ-39
  - references: DISC-020
    context: "DISC-020's one-tier edge collapse resolves this question: every edge materializes into the source vertex's frontmatter block, overturning the 'edges are always DB-only' conclusion below. The disk⇔DB flow is no longer asymmetric for edges."
  - references: DISC-019
    context: the DB-first flip whose analysis overturned this note's edges-are-DB-only assumption
description: "Flow between disk and DB is fundamentally asymmetric. Disk→DB (indexer) is full. DB→disk (export) is partial: agent enrichment stays in DB, new vertices may export per OQ-31, edges are always DB-only. Implication: DB-only content needs separate backup story. RESOLVED 2026-07-01 by DISC-020 — the one-tier edge collapse materializes every edge into frontmatter, closing the asymmetry for edges; the substrate is git-committed round-trippable markdown."
---

# OQ-40: Disk ⇔ ArangoDB sync story

How does content flow between disk and DB in the EJ-030 model? The flow is
fundamentally asymmetric:

**Disk → DB (indexer):** Full. Every parser reads files and produces vertices.
Built and working.

**DB → Disk (export):** Partial. Three write scenarios:

1. **Agent-authored enrichment** (description via `docdog_update`): stays in DB.
   Never syncs back. Multi-section source files stay minimal. (OQ-39 Option 4.)

2. **Agent-authored new vertices** (via `docdog_create`): stays in DB for working
   collections (notes, refinements, tasks). For "published" collections (decisions,
   requirements), should there be an export to disk? Depends on OQ-31 (collection
   export policy).

3. **Graph edges** (via `docdog_relate`): always DB-only. Edges don't have a disk
   representation. Not a loss — edges are the point of the graph.

**Implication for "backup":** If disk + git is your backup story, then DB-only
content isn't backed up. Options:
- Accept: DB-only is ephemeral. Backup by dumping ArangoDB separately.
- Export on demand: `docdog export` writes DB content to disk for commit.
- Dual-write: working context lives in DB; published content is always mirrored
  to disk.

**Status:** the read path is built. The write path (export) is unbuilt and depends
on OQ-31. Practical answer for migration: use the indexer for specs
(disk-first), accept that agent enrichment stays in DB, and build export later if
needed.

## Resolution (2026-07-01, DISC-020)

The asymmetry framed above — specifically the claim that **"graph edges are
always DB-only; edges don't have a disk representation"** — is overturned by
DISC-020's **one-tier edge collapse**. Under the DB-first flip (DISC-019) with a
git-committed substrate, every edge-writing path (including `docdog_relate`)
materializes the edge into the source vertex's `relationships:` frontmatter block
at full fidelity. Edges therefore *do* have a disk representation, and the
disk⇔DB flow is no longer asymmetric for them.

What remains true from this note: the flow is asymmetric only during **bootstrap**
(fresh clone: disk→DB is the sole direction until the DB exists — DISC-019 OQ 2),
and the committed artifact is deliberately readable markdown, not a DB dump
(DISC-020 fork 3). The "separate backup story" concern dissolves: git *is* the
backup, because the export is lossless and round-trippable.
