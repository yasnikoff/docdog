---
id: DISC-031
title: A spawnable docdog agent — every host has the primitive now, and the tool
  allowlist is the only part that won't port
collection: discussions
status: resolved
date: 2026-07-16
retained_privately: docdog-discussions
relationships:
  - references: OBS-014
    context: Its rule — agents judge and write review files, they never write the
      corpus, because per-batch agents cannot see corpus-wide shapes — is what
      scopes this agent to retrieval instead of the 'spec operations' the
      discussion opened with
  - references: OBS-013
    context: "Supplies the economics: 248 tokens vs 123,551 on a real adopted
      corpus; a subagent compounds the win by keeping the rejected hits and
      search noise out of the caller's window entirely"
  - references: OBS-010
    context: The own-corpus half of the token arithmetic — ~143 tokens per hybrid
      answer vs ~6,500 for grep — that makes a retrieval subagent worth its
      spawn cost
  - references: DP-001
    context: An agent is not code, so tier-3 judgment sits legitimately in its body
      — the agent IS the agent+user loop the principle reserves semantics for;
      the proposed serve --read-only rail is tier-1 mechanics, which is why it
      can live in code
  - references: PROPOSAL-019
    context: Introduced the injectable-skill mechanism — template + placeholder
      allowlist + live corpus discovery — that a per-host agent renderer would
      reuse rather than reinvent
  - references: PROPOSAL-020
    context: navigate-specs is the standing precedent for a generic, corpus-free
      portable body; a docdog agent body is the same artifact with a spawn
      contract wrapped around it
  - references: PROPOSAL-033
    context: "serve --root established the family this discussion's serve
      --read-only would join: a server-side flag that constrains what a call may
      touch, enforced in docdog rather than in the host"
  - references: DD-070
    context: The kernel-8 MCP surface is what makes the body portable at all — the
      tool names a docdog agent calls are identical on every host because MCP,
      not the host's agent format, is the universal layer
  - follows_workflow: WF-001
---

# DISC-031: A spawnable docdog agent — every host has the primitive now, and the tool allowlist is the only part that won't port

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-031` for what it
connects to.
