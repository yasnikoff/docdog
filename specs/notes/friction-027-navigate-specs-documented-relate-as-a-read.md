---
id: FRICTION-027
title: "The shipped navigate-specs skill documented docdog_relate as a path query, so an agent following it would call a write expecting a read"
collection: notes
status: resolved
resolution: patch
description: "`templates/injectable-skills/navigate-specs.md` — the skill docdog installs into *other people's* repos — listed `docdog_relate A B` in its tool table as \"Shortest typed path between two vertices\". It is a write: it patches A's `relationships:` frontmatter. An agent reading the skill to answer \"how is A connected to B\" would have called it and silently added a bogus edge to the corpus it was only trying to read. Found while adding the CLI column to that table for PROPOSAL-032; fixed in the same commit. The class of bug is what has no guard: the skill's tool table is prose, and nothing checks it against the tool surface it describes."
severity: inconvenient
source: self-host (found while editing the skill for PROPOSAL-032, not by an agent hitting it)
relationships:
  - references: PROPOSAL-032
    context: "the pass that found it — writing the MCP and shell columns of the same operation side by side is what exposed the row, which is an argument for the parity table beyond the parity itself"
  - references: PROPOSAL-019
    context: "the mechanism that gives this its blast radius: injectable skills are rendered into adopters' repos, so a wrong row in the template is a wrong row in every corpus that ran `docdog skill install`"
  - references: DD-043
    context: "what relate actually does, and why the wrong description is a write and not merely a misnomer — edges are born in the `relationships:` block, so a relate call is a file patch"
  - references: DP-001
    context: "the fix is tier 1 (correct a false sentence), but the *durable* fix is not: keeping a hand-written tool table honest against the tool surface wants a mechanism, and inventing one that guesses intent from a description would be tier 3"
  - references: WF-002
    context: "dogfooding caught it, but only incidentally — nobody was using the skill; it was found by editing it for another reason, which is the weakest way to find a bug in a shipped artifact"
---

# FRICTION-027: `navigate-specs` documented a write as a read

## What I was doing

Adding the CLI column to `navigate-specs`'s "Path B" tool table for
PROPOSAL-032 — the skill's accelerator cheat sheet was MCP-only, and
parity meant it should name both surfaces.

## What was wrong

The table had shipped this row:

| Tool | Use for |
|---|---|
| `docdog_relate A B` | Shortest typed path between two vertices. |

`docdog_relate` does not query anything. It **writes**: it patches
`A`'s `relationships:` frontmatter block with a new outbound edge and
reindexes the file (DD-043 — edges are born only in frontmatter).

So an agent that read this skill, wanted to know how `DD-070` connects
to `DP-001`, and did what the skill told it, would have **added a
fabricated edge** — with whatever type and context it invented to fill
the required arguments — to a record it was only trying to read. In
someone else's corpus. The tool would have reported success, because
the call *is* valid; only its meaning was wrong.

The correct row for that question was already sitting two lines above
it: `docdog_traverse`.

## Why it lasted

Nothing checks the skill's tool table against the tool surface it
describes. It is prose, written once, and the tools moved. The
`{{docdog_version}}` stamp at the bottom of the skill exists precisely
to admit that the file can fall behind — but it can only tell a reader
the skill *might* be stale, not that a specific row is false.

It was found by editing the file for an unrelated reason. No agent
reported it, and no test could have: `skill-install`'s tests check
placeholder allowlists and rendering, not whether the sentences are
true.

## Blast radius

`docdog skill install navigate-specs` renders this template into a host
repo. This repo has no rendered copy (only the template), so the damage
here is nil — but any corpus that installed the skill carries the wrong
row until it re-runs the install. Worth checking on the external
dogfood track.

Rated `inconvenient` rather than `blocks-work` because it stops nobody
— which undersells it. The failure mode is not a blocked agent, it is a
*silently wrong write into a corpus*, which is the one outcome docdog's
whole design is arranged to prevent. The severity vocabulary has no word
for "cheap to hit, quiet, and corrupting."

## Fixed

`fc5536d` (PROPOSAL-032). The row now reads:

| record an edge | `docdog_relate A B` | `docdog relate A B --type … --context …` | **A write.** Adds an outbound edge to A's `relationships:` block — it does not query for a path. Use it when you have *learned* that A relates to B. |

## What should change in docdog

The one-line fix is done; the class of bug is not addressed. Options,
none of them free:

1. **Generate the tool table** from the same registry the MCP server
   builds its tool list from. Tier-1 mechanical, kills the drift at the
   source, and costs a build step in the skill renderer. This is the
   real answer.
2. **Test the table** — assert every `docdog_*` name it mentions exists,
   and that rows describing a write are marked as writes. Catches the
   name half cheaply; cannot catch a false *description*, which is the
   half that actually bit.
3. **Nothing.** Accept prose drift in skills and rely on the version
   stamp. Defensible for tone and examples. Not defensible for a table
   that tells an agent which calls mutate the corpus.

Option 1 is a proposal, not a patch — filed here rather than drafted,
because the write/read distinction is the part that must survive
whatever mechanism gets built, and that is a design question about how
the skill knows a tool's *shape*, not just its name.
