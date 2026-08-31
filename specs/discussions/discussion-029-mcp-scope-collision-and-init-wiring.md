---
id: DISC-029
title: Scope collision and init's .mcp.json — measured, and the machine-scope
  mode that fell out of it
collection: discussions
status: resolved
date: 2026-07-14
retained_privately: docdog-discussions
relationships:
  - references: PROPOSAL-033
    context: this discussion answers both of the proposal's open questions and adds
      the no-.mcp.json machine-scope mode it did not anticipate
  - references: DP-001
    context: the rejected option — init sniffing the client's global config for an
      existing registration and skipping the file — is judgment reaching into
      another tool's state, the wrong side of the tier-3 line
  - references: DD-048
    context: init writing .mcp.json is already a Claude-Code-specific act inside a
      provider-neutral design; that tension is why teaching init MORE about the
      client was refused
---

# DISC-029: Scope collision and init's .mcp.json — measured, and the machine-scope mode that fell out of it

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-029` for what it
connects to.
