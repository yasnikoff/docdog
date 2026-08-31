---
id: PROPOSAL-036
title: "Suggest a retrieval subagent, don't ship one — docdog describes the agent, the using side creates it"
collection: proposals
status: shipped
date: 2026-07-16
description: "Docdog carries a short section in navigate-specs telling an agent to suggest a read-only retrieval subagent to the user, and describing what it should be; creating the agent file is the host's job. The per-host renderer is declined — the host matrix is not docdog's to track."
relationships:
  - discussed_in: DISC-031
    context: "the discussion that produced this proposal, including the host survey showing four of five agent formats are the same markdown+frontmatter file and the body is the portable part"
  - references: PROPOSAL-020
    context: "the home and the precedent — navigate-specs is the generic corpus-free injectable skill that evolves with docdog itself, which is exactly the lifecycle a suggestion about docdog's own tools needs"
  - references: PROPOSAL-019
    context: "the machinery this rides — template + per-skill placeholder allowlist; the added section introduces no new placeholders, so the allowlist enforced in both directions stays green"
  - references: OBS-014
    context: "scopes the suggested agent — its never-write-the-corpus rule, and the finding behind it that per-batch agents cannot see corpus-wide shapes, is restated in the skill as the read-only constraint"
  - references: OBS-013
    context: "the economics the suggestion argues from — 248 tokens vs 123,551 on a real adopted corpus; the section states the shape of that win without citing this project's internal record ids"
  - references: DP-001
    context: "tier 2 — a suggestion the user can decline is a visible default with an override; creating agent files in the user's host config unasked would be deciding for them, and the section says suggest, don't create"
  - references: DD-070
    context: "why the body ports and the wrapper doesn't — the kernel 8 are MCP tools with identical names on every host, so the instructions need no per-host rewriting even though the frontmatter around them does"
  - references: OQ-47
    context: "the open question the shipped section can only gesture at — it tells the user the agent should answer with ids and be cheap to check, which is the floor any contract must clear, not the contract itself"
  - references: PROPOSAL-035
    context: "the rail this cannot supply — where a host cannot restrict tools per agent the read-only scope is prose, and a server-side refusal is the only thing that makes it real; the skill says so rather than pretending otherwise"
---

# PROPOSAL-036: Suggest a retrieval subagent, don't ship one

## What changed from the first draft

The first draft of this proposal (2026-07-16, same day) proposed a
portable agent body **plus** a per-host renderer:
`docdog agent install docdog-retrieval --host claude|cursor|gemini|opencode|codex|generic`.
It carried its own strongest objection — *is the host matrix docdog's
job at all?* — and gated the renderer on answering it.

It was answered, by the user, against the renderer:

> ok, it is the using side's job to create the agents. i think a short
> instruction about suggesting the user to do so will be nice to have

That is the better answer, and it collapses the proposal. What is left
is one section in a skill.

## Why declining the renderer is right

- **Every host already has an agent-authoring flow.** Cursor's is
  literally "ask the agent to write the file." An agent that can read
  `navigate-specs` can write its own host's agent definition — it knows
  its host's format, and docdog never has to.
- **The host matrix is a standing maintenance debt against an asset
  that doesn't rot.** DISC-031 exists *because* a six-month-old read of
  this landscape was wrong in three places: Codex went from "no
  subagents" to GA, Cursor shipped them in 2.4, and the tool-restriction
  story turned out to diverge exactly where it mattered. Five renderers
  would rot on that same clock. The description of a good retrieval
  agent does not rot at all.
- **It is not docdog's business.** Docdog's claim on the world is the
  corpus and the retrieval over it. Where an agent definition lives on
  disk is the host's.
- **The knowledge docdog uniquely has is small and portable.** Not "how
  do I write a Cursor agent" — the host's agent knows that. It is: what
  the read tools are called, why the agent must not write, and what a
  useful return looks like. That fits in a section.

## What ships

A section in `templates/injectable-skills/navigate-specs.md`,
**"Worth suggesting: a retrieval subagent"**, placed after the MCP/CLI
cheat sheet — the suggestion is only meaningful when docdog is actually
running against the corpus, which is what that Path-B section
establishes.

It tells an agent to **suggest, not create** (DP-001 tier 2: the user
can decline, and where their host's agent files live is theirs), and it
describes three things:

1. **Read-only** — `docdog_search`/`get`/`traverse`/`status`, never
   `create`/`update`/`relate`, because a subagent sees one slice and
   cannot see the corpus-wide shape a write needs. It says plainly that
   where a host cannot restrict tools per agent, the instructions are
   the only rail — rather than implying a safety that isn't there.
2. **Answer with ids, not prose** — the OQ-47 floor.
3. **Cheap to check** — every claim carries an id the caller can
   `docdog_get`, because the caller cannot see the sub's work. OBS-014's
   validator lesson, restated generically.

`navigate-specs` is the right home: it is the generic, corpus-free
skill that "evolves with docdog itself" and is regenerated when
docdog's conventions change (PROPOSAL-020). A fact about docdog's own
tools belongs on that lifecycle, not in a per-repo skill.

The section states the token argument's *shape* without citing OBS-010
or OBS-013 — injectable skills ship to other people's repos, where this
project's record ids mean nothing.

## Constraints honored

- **No new placeholders.** `navigate-specs`'s allowlist is exactly
  `docdog_version` and `generated_at` (PROPOSAL-019 enforces it in both
  directions, and a template referencing anything else is a hard error).
  The section is static prose.
- **Describes only what exists.** The section does **not** mention
  `docdog serve --read-only` — PROPOSAL-035 is unratified, and an
  injectable skill that ships to adopters must not document a flag that
  isn't there. If PROPOSAL-035 ships, this section gains one line.

## What this does not settle

- **OQ-47 (the return contract)** stays open. The section gives the
  floor — ids, one line each, name the misses — not a contract. If
  OQ-47 resolves into a real shape, this section is where it lands, and
  `docdog skill install navigate-specs --force` is how adopters get it.
- **PROPOSAL-035** stays open and is unaffected by this decision. It
  was always the stronger of the two and never depended on a renderer:
  the Cursor finding (no configuration reads without also writing) is
  about hosts, not about who authors the file. Declining to ship agents
  makes the server-side rail *more* important, not less — docdog can no
  longer even attempt to constrain the agent through a definition it
  writes.
