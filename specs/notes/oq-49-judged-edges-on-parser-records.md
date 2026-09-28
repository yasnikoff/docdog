---
id: OQ-49
title: "An edge someone decides, between two records that live inside other files, has nowhere to be written — is there a home for it, or is that the price of not splitting the file?"
collection: questions
status: open
date: 2026-09-27
description: "Split-parsed and script-parsed records refuse the write tools (DD-068 as amended by DD-070), because their file is the author's prose and docdog does not write into it. Edges a parser can DERIVE have a home — the parser emits them (FRICTION-061). Edges someone JUDGES — an accepted suggest-edges row, a pairs verdict — do not: they can be recorded only from a record that has its own file. On issue #4's corpus 1,627 of suggest-edges' sources are parser records, and both ends of most of its pairs candidates are. Issue #4 proposes a sidecar edge file; the question is whether that is a second place edges are born, and whether DD-068's 'split the file on disk' is still the honest answer."
upstream_issue: https://github.com/yasnikoff/docdog/issues/4
relationships:
  - references: DD-068
    context: "the decision whose v3 amendment makes this a question: multi-section files keep minimal metadata, full stop, and rich metadata means one file per section"
  - references: DD-043
    context: "edges are born in a relationships block in the record's own file; a sidecar is a second birthplace, which is what has to be argued for"
  - references: DD-070
    context: "a sidecar is still a tracked markdown-or-yaml file, so it does not break files-as-truth — it breaks 'the record's file says what the record is'"
  - references: FRICTION-061
    context: "the half of issue #4 that was already answerable: derived edges belong in the parser script, which is why this question is only about judged ones"
  - references: PROPOSAL-046
    context: "the precedent that a tracked ledger beside the corpus is acceptable when it holds judgments rather than facts — rejected-edges.yaml is exactly a sidecar of decided pairs"
  - references: PROPOSAL-049
    context: "pair-verdicts.yaml, the second such ledger; an accepted relation verdict between two parser records is the concrete case that has no destination today"
  - references: OQ-48
    context: "the sibling question from the same adopter — how docdog reads a graph a corpus already states — where this one is about a graph the corpus has not stated yet"
---

# OQ-49: where does a decided edge between two parser records go?

## The situation

A record a parser carves out of a larger file — a split heading, a script
row, a log section — has no file of its own. docdog will not write into the
author's prose (DD-068, hardened by DD-070: no DB-only store, so the write
tools refuse these records rather than keep enrichment somewhere
disposable).

That leaves two kinds of edge on such a record:

- **Derived**: the corpus already states it in its own spelling (a key, a
  citation form). The parser emits it. Answered — FRICTION-061.
- **Decided**: nobody wrote it down; a reviewer judges it. `suggest-edges
  --accept-from` and `pairs --accept-from` exist to record exactly these,
  and both write into the source record's `relationships:` block. For a
  parser record there is no block to write.

The workaround today is to record the edge from the other end, which works
only when the other end has its own file. On issue #4's corpus that is
rarely true: decision rows, log sections and backlog items are the three
populations, and two of them are parser records.

## The answers on the table

**A. It is the price, and DD-068 already names the exit.** A corpus that
wants decided edges on a unit splits that unit into files. Honest and
already true; it is also "reformat your corpus", which the first issue from
this adopter declined in principle.

**B. A tracked sidecar of edges** (the issue's proposal):
`.docdog/edges.yaml`, rows of `(from, type, to, context)`, merged into the
cache at index time. Precedent exists — `rejected-edges.yaml` and
`pair-verdicts.yaml` are tracked ledgers of judgments beside the corpus. The
cost is a second birthplace for edges (DD-043), and a record's file no
longer says everything about the record. It would need its own answers for
`renumber`, the merge driver, and edge-health's dangling-target check.

**C. The sidecar is scoped to records that cannot hold edges**: refused for
any `from` that has its own file, so there is still exactly one place any
given record's outbound edges live. Smaller than B, same machinery.

## What would settle it

The PROPOSAL-028 standard again: a second corpus with the same shape, or
this adopter reaching for it after FRICTION-061's route has taken the
derived edges out of the count.

**Re-measured 2026-09-28** on `yasnikoff/complexpoint-docdog-evidence@06980bf`,
with the adopter's log parser emitting every edge the log states (amends,
adds, part_of, citation references): `suggest-edges` fell only from 3,288
to **3,125** undeclared mentions, still **1,543** of them from parser
records. The derived route barely moves this number, because what
suggest-edges reports is row-id mentions (`D-ARCH-18` in prose). Those
need a judgment docdog refuses to make on the author's behalf: is a
mention a relationship? A script *could* emit every mention as
`references`. That is the adopter's call to make in their own code, not a
reason for docdog to stop asking. So the remainder is real, and it is this
question's population.
