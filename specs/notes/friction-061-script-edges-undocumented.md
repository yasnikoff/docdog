---
id: FRICTION-061
title: "A parser script can emit a record's edges, and nothing says so — so an adopter asks for a config language to express a graph their script could already declare"
collection: notes
status: resolved
fixed_date: 2026-09-27
resolution_approach: docs
date: 2026-09-27
description: "RESOLVED 2026-09-27 (docs). The indexer extracts edges from each parsed section's `frontmatter.relationships`, and a `parser: script` builds that frontmatter itself — so a script can derive `amends:` keys, `source:` fields and prose citations into typed edges on split records, with no file rewritten, and `pairs` settles on them. The ingest skill said only that the write tools refuse script records and to 'relate to them from other records'. Issues #3 and #4 each proposed a new config mechanism for something that was one field away. Verified in a scratch project before writing: amends, part_of and citation-derived references all traverse, and adding their types to pairs.edges.settle removes the pairs."
severity: inconvenient
upstream_issue: https://github.com/yasnikoff/docdog/issues/3
evidence: yasnikoff/complexpoint-docdog-evidence@06980bf
relationships:
  - references: FRICTION-062
    context: "what the derived edges could not settle once measured on the adopter's corpus — an edge on an entry's head does not reach its sections"
  - references: FRICTION-056
    context: "the same failure a second time: the escape hatch that answers the report exists and is documented where a motivated reader does not find it — 056 was the script parser itself, this is what the script's output can carry"
  - references: OQ-48
    context: "gains a third answer from this: neither rewriting the corpus nor a key map in docdog's config, but the mapping written in the adopter's own parser script"
  - references: DD-064
    context: "the decision this applies — custom formats live in project scripts, and a corpus's own citation and key spellings are a custom format"
  - references: DD-043
    context: "not bent by this: edges are still born in a relationships block, the block is simply produced by the parser rather than typed into the file"
  - references: DD-067
    context: "the parser contract whose frontmatter field makes it work"
---

# FRICTION-061: script-emitted edges were a capability nobody was told about

## What happened

Issues #3 and #4 asked for two new config mechanisms:

- `edges_from_frontmatter: {amends: amends, source: sourced_from}` — so the
  corpus's own `amends:`/`adds:`/`source:` keys become edges (#3, 494 + 63
  of the pairs candidates are joined this way);
- `citations: [{pattern, id}]` — so a `(slug, §7)` citation in prose resolves
  to the record `slug§7` (#4; 365 pairs candidates are joined this way, and
  suggest-edges sees none of them).

Both corpora already index through a `parser: script`. The indexer calls
`extractRelationships(s.frontmatter)` for every section a parser returns
(storage/indexer.ts), and a script sets `frontmatter` freely. So the script
that already reads `amends:` to build its records can emit
`relationships: [{ amends: "D-GRAPH-13" }]` on the same record, and the
script that already splits sections can scan each for `(slug, §N)` and emit
`references` edges.

Verified on a scratch project before this was written: a script emitting
`amends`, `part_of` and citation-derived `references` edges produced all of
them, `traverse` walked them in both directions, the unregistered `amends`
type was warned about like any other, and `pairs` with
`edges.settle: [supersedes, references, part_of]` dropped the pairs they
join.

Then on the adopter's real corpus (the evidence snapshot, 5,415 records):
their own `logsec.js` extended by ~30 lines derived 622 `amends`/`adds`,
4,117 `part_of` and 117 citation `references` edges, zero dangling, with
every vector reused (the script changes edges, not content). What those
edges do and do not settle in `pairs` is FRICTION-062.

## What was wrong

The ingest skill's script-parser section ended: *"the write tools refuse
them — relate to them from other records, and edit the file itself."* True,
and it steers a reader to believe a script record can only ever be an edge
*target*. The report asked for a mapping language because the docs implied
one was missing.

## Fix

`templates/skills/_common/ingest.md` (mirrored to `.docdog/skills/`) now
says a section's `frontmatter.relationships` becomes its edges, with the
three shapes above, the registration rule, that `projectRoot` lets a script
resolve a citation by title, and that these edges settle `pairs`. It also
separates the two kinds of edge a script record can have: one the script can
*derive* belongs in the script; one someone has to *decide* is OQ-49.

## What this does not settle

Whether docdog should *also* grow a declarative map is still OQ-48 — a
script is code an adopter maintains, a map is config. This record says
only that the question was being asked without knowing the cheaper answer.
