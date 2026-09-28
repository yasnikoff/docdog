---
id: OQ-48
title: "An adopted corpus already has a graph in its frontmatter, under its own key names — does docdog learn to read it, or does the corpus get rewritten?"
collection: questions
status: open
date: 2026-09-25
description: "DD-043 says edges are born only in a `relationships:` block with the type as the key. An adopting corpus that already maintains a graph — issue #1's 509 log entries carry `adds: [D-LANG-15]` and `amends: [D-GRAPH-13]` as bare top-level frontmatter keys — has every edge docdog wants and none that docdog can see. Two answers: the adopter rewrites their frontmatter, or scan entries gain a key map. The question is which, and the sharper question underneath is whether a mapping table is configuration or is docdog learning to guess."
relationships:
  - references: DISC-042
    context: "the discussion that surfaced this, as the ask hiding inside issue #1's ask 3 — the rows can become records and the graph still does not arrive"
  - references: DD-043
    context: "the constraint this asks about: edges are born only in a `relationships:` block, which is what makes an existing graph in other keys invisible"
  - references: DD-070
    context: "the invariant any answer must respect — markdown files are the source of truth, so a mapping may not become a place where edges live that the file does not state"
  - references: DP-001
    context: "the line to walk: an author-declared key map is tier 2, and anything that infers which frontmatter keys look like edges is tier 3"
  - references: PROPOSAL-048
    context: "the sibling piece from the same report, deliberately kept separate — a mapping table designed as an afterthought to a matcher is how it gets designed badly"
  - references: DISC-018
    context: "the earlier question about frontmatter namespacing for adopted repos, which is the same seam approached from the other side"
  - references: PROPOSAL-024
    context: "the existing answer for a corpus whose edges are NOT declared — suggest-edges reads id mentions and proposes; the case here is different, because these edges ARE declared, just not in docdog's spelling"
  - references: DD-058
    context: "the precedent for a field that means two things at once, and the warning against adding another — a key map is exactly the kind of indirection that makes a record's frontmatter stop meaning what it says"
  - references: FRICTION-061
    context: "the third answer, found 2026-09-27: the adopter's own parser script can emit the edges, so neither the corpus nor docdog's config has to change"
  - references: OQ-49
    context: "the sibling question issue #4 raised: where an edge goes that nobody has written down yet, when its record lives inside another file"
---

# OQ-48: someone else's graph, in someone else's key names

## The question

Issue #1's corpus maintains a relationship graph by hand today. A log
entry declares it in its own frontmatter:

```yaml
---
date: 2026-08-30
title: "A definition is a statement: := is its sign […]"
status: built
topics: [expr, workbench, selection, elements]
adds: [D-LANG-15]
amends: [D-GRAPH-13, D-LANG-14]
---
```

Every edge docdog would want is already there, written by hand,
maintained for months. Docdog reads none of it. **DD-043: edges are born
only in a `relationships:` block**, type-as-key, with the type registered
in `.docdog/concepts/`. There is no frontmatter-key → relation-type
mapping anywhere in `src/`.

So even if every one of their 261 decision rows becomes a first-class
record (PROPOSAL-048), *"what amended this decision, and when"* stays a
grep. Which was ask 3 of the report, and the half most likely to be
mistaken for already-handled.

## The two answers

**A. The adopter rewrites their frontmatter.**

```yaml
relationships:
  - adds: D-LANG-15
  - amends: D-GRAPH-13
```

plus two concept records registering `adds` and `amends`. Mechanical,
scriptable, ~509 files, one commit.

This is more defensible than it first sounds. Issue #1's no-reformat
constraint is explicitly about *prose history* — "amended in place, with
the old wording preserved in the entry that changed it" — which is a rule
about bodies. Frontmatter is metadata the project already generates and
already validates with a test. Rewriting a key there is not the
destructive bulk reshape they refused.

It also keeps DD-070 exactly true: the file says what the edge is, in the
spelling docdog reads, and nothing sits between the file and its meaning.

**B. Scan entries gain a key map.**

```yaml
scan_paths:
  - path: spec/log/
    relation_keys:
      adds: adds
      amends: amends
```

Author-declared, so DP-001 tier 2 at worst. Costs the adopter one config
block instead of 509 file edits, and — the real argument — it is the
difference between adopting docdog *over* your corpus and adopting it
*by converting* your corpus. Every conversion is a decision that cannot
be undone by uninstalling.

## What makes it a question rather than a preference

Three things, and they are why this is not being folded into
PROPOSAL-048:

1. **A map is indirection over the one thing DD-070 says is canonical.**
   After a key map, a record's frontmatter no longer states its edges in
   terms anyone can read without also reading `config.yaml`. That is a
   real loss and it is the same shape as every declaration-that-can-
   disagree-with-reality this corpus has ruled against (FRICTION-052,
   PROPOSAL-047's derive-from-git argument).

2. **Where does it stop?** `adds: [X]` maps cleanly. What about a key
   whose value is a string rather than a list, a key whose values are
   file paths rather than ids, a key that means an edge only when some
   other field has some value? Each is one more line of config and one
   more step toward a mapping language. The enum discipline PROPOSAL-048
   proposes for node types is the analogue, and it needs its own version
   here.

3. **It may be answering a question the corpus has already answered
   differently.** PROPOSAL-024's `suggest-edges` exists for a corpus
   whose edges are not declared: it reads id mentions and proposes them
   for review. The case here is genuinely different — these edges *are*
   declared, just not in docdog's spelling, so proposing them for
   human review is asking someone to re-affirm 509 decisions they already
   made. But the two mechanisms should be reconciled deliberately rather
   than shipped alongside each other.

## What would settle it

Not an argument. One more adopted corpus. If a second project shows up
with a declared graph under its own key names, B is a feature; if issue
#1 is the only one, A is a migration script and docdog stays smaller.
That is PROPOSAL-028's standard — three real hand-rollings, not three
plausible ones — and this currently has one.

Cheap interim: write the conversion script for issue #1's corpus, offer
it, and see whether the objection that comes back is *"that is too much
work"* or *"I will not convert my corpus to suit a tool"*. Those point at
different answers, and the report does not distinguish them.

## 2026-09-27 — the probe came back, and a third answer was already shipped

Issue #3 is the reporter's answer to the interim probe, unprompted:
*"Rewriting ~600 files' front matter just to feed `pairs` is possible, but
the fields are already there."* That is the "too much work" reading, not the
"I will not convert" one — and the count grew: 494 pairs candidates are
joined by `amends:`/`adds:`, and a second key surfaced, a backlog item's
`source: <slug> §N`, whose value is a string carrying a section (63 more).
That second key is point 2 above arriving on schedule: the first real map
already needs a value grammar, not just a key rename.

**C. The adopter's parser script emits the edges.** Found while triaging
the issue (FRICTION-061): the indexer reads each parsed section's
`frontmatter.relationships`, and this corpus's log is already indexed by a
`parser: script` that parses exactly those frontmatter keys to build its
records. Two lines in that script turn `amends: [X]` into
`{ amends: X }` — verified on a scratch project, edges traverse and settle
`pairs`. Nothing in the corpus changes, nothing in docdog's config grows,
and the value grammar (`<slug> §N` → `<slug>§N`) is the adopter's code,
where DD-064 says a custom format belongs. Backlog items are default-parsed
today, so `source:` needs that directory on a script too.

C does not close the question. It carries objection 1 in a different
place — the edge is stated in neither the file nor docdog's config, but in
code — and it asks every adopter with a declared graph to write a parser.
What it changes is the evidence standard: B is now a convenience over a
working route rather than the only route, and the "second corpus" test
should ask whether that corpus found C adequate, not whether it had a graph.

