---
id: NOTE-2026-04-10-context-discovery
title: "2026-04-10 — Context Discovery Case Study: Saga + DP-11"
collection: notes
description: "Case study of agent context-discovery pain in a real task (TASK-052 saga pattern), motivating parts of docdog's search/graph design."
---

# 2026-04-10 — Context Discovery Case Study: Saga + DP-11

## The Problem

Agents in the Orchestrator repo struggle to find relevant context in the specs volume.
User raised this as a pain point for the ejection plan. We investigated a live example
to understand the problem concretely.

## The Case: TASK-052 Provisioning Workflow

TASK-052 is designing the core provisioning workflow using the saga pattern (try/catch
compensation). The agent's `questions-to-resolve.md` explicitly asks: *"Is saga the
right approach — see upstream context about infrastructural and operational errors in
the workflows."*

### What the agent needed to find

Three related decisions from upstream-context that together answer the question:

1. **DD-ARCH-09** — Saga pattern (try/catch) is the default compensation approach.
   **Answer: yes, saga is correct.**
2. **DD-ARCH-19** — Steps return discriminated unions for business outcomes (including
   "unknown"). Exceptions reserved for infrastructure errors. Temporal retries exceptions;
   business outcomes pass through to workflow logic.
3. **DP-11** — When compensation outcome is uncertain (step returns "unknown"), the
   workflow must halt → preserve → free safe resources → notify human. No speculative
   automated recovery.

DD-ARCH-19 and DP-11 are companion decisions from the same refinement session (0068).
Together they mean: saga is right, but it's a *conditional* saga — compensate what's
clearly compensable, halt on uncertainty.

### What actually happened

- **requirements-analyst**: Found DP-11 correctly. The requirements doc includes
  "If `createGameServer` returns unknown status → halt, preserve state, notify admin"
  and `ProvisionResult.status` includes `'halted'`. Good work.
- **pick-task-context.md**: Describes a flat saga — "On cancellation: execute saga
  compensation in reverse order." The DP-11 nuance is absent.
- **architect-architecture.md** (from earlier tasks): Adopted DD-ARCH-19 (business
  outcomes pattern) but **DP-11 is completely absent** — zero mentions.
- **questions-to-resolve.md**: Agent flagged the tension but couldn't resolve it.

### Root causes of the discovery failure

1. **Topic index maps files to IDs, not concepts to answers.** An agent asking "is saga
   right for all errors?" needs DP-11 + DD-ARCH-19 + DD-ARCH-09. The topic index says
   "DD-ARCH-19 is in error-handling.md" but the agent doesn't know to look for DD-ARCH-19.
   The query is conceptual ("saga + error handling nuance"), not ID-based.

2. **DP-11 is cross-cutting but not tagged on workflows.** DP-11 applies to every
   workflow but lives only in `design/principles.md` — a large file with 14+ principles.
   It's not tagged on the provisioning topic, the workflow topic, or anywhere an agent
   designing a specific workflow would naturally look.

3. **Sibling decisions separated during adoption.** DD-ARCH-19 and DP-11 were created
   together in refinement 0068. The architect spec adopted DD-ARCH-19 but dropped DP-11.
   A manual propagation gap — the kind that happens when context is consumed file-by-file
   rather than conceptually.

4. **Volume problem.** `architect-architecture.md` is ~3000 lines.
   `design/decisions/architecture.md` in upstream-context is massive. Reading these
   end-to-end to answer a specific conceptual question is token-expensive and unreliable.

## Implications for Ejection Plan

### Evidence for external tooling

A vector search for "saga compensation uncertain error" would surface DP-11, DD-ARCH-19,
and the relevant DD-ARCH-09 sections together — exactly the conceptual cluster the agent
needed. The file-level topic index cannot do this.

### Two-tier maintenance model validated

- **Tagging existing concepts on focused work (easy):** The requirements-analyst, working
  on provisioning with full task context, successfully found DP-11. Focused context = good
  discovery.
- **Propagating cross-cutting concerns across all specs (hard):** DP-11 applies to every
  workflow but was missed by the architect spec written for an earlier task. Retroactive
  propagation is the hard problem.

### What would have helped the agent

1. **Semantic search:** "What constraints apply to saga compensation?" → surfaces DP-11.
2. **Cross-cutting concern registry:** A lightweight index of principles/decisions that
   apply to ALL workflows, checked automatically when any workflow task starts.
3. **Companion decision linking:** DD-ARCH-19 and DP-11 should be linked so adopting one
   surfaces the other.

### What the topic index can't do (and shouldn't try to)

The topic index is good at: "which files discuss FR-PROV-01?" (ID-based lookup).
The topic index is bad at: "what principles constrain how I handle errors in a workflow?"
(conceptual query across multiple IDs and files).

Trying to make the topic index answer conceptual queries would require exhaustive
cross-referencing — tag every principle on every file it might apply to. That's the
tag-explosion problem the user identified.

## Investigation Meta-Notes

### What was easy (tracing in docs-internal)
- Grep for "saga" across refinements gave the full thread quickly
- Refinement files are excellent breadcrumbs — each references predecessors
- The chain 0024 → 0050 → 0051 → 0065 → 0068 was traceable in minutes

### What was hard (tracing across repos)
- Finding whether DP-11 made it into the Orchestrator's own specs required searching
  a 3000-line file and confirming absence (proving a negative)
- Connecting the requirements-analyst's correct finding (DP-11) with the architect's
  omission required reading multiple task artifacts across git history
- TASK-051 artifacts were already deleted from the worktree (finalized) — had to use
  git log to find the promoted artifacts commit

### Time and token cost
This investigation required ~15 tool calls across two repos, reading portions of 8+
files, and grep searches with multiple patterns. A human with the project in their head
would have said "check DP-11" in seconds. The gap between "information exists" and
"information is discoverable" is the core problem.
