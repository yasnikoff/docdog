---
id: DISC-030
title: PROPOSAL-013 reviewed and declined — a hook cannot construct the query
collection: discussions
status: resolved
date: 2026-07-15
retained_privately: docdog-discussions
relationships:
  - references: OBS-003
    context: The motivating record — its 'I shipped a retrieval layer and never used
      it' finding is what PROPOSAL-013 was written to fix; this review argues
      the fix cannot work by construction
  - references: DISC-021
    context: "Priced the cold-start cost this review holds against the hook: the
      warm embedder lives in serve, so every CLI search invocation pays an ONNX
      model load"
  - references: PROPOSAL-033
    context: Rejected teaching init to sniff the client's global config as a DD-048
      coupling strain; PROPOSAL-013's init-writes-a-hook-config is the deeper
      form of the same coupling
  - references: FRICTION-025
    context: Its lesson — rejection is not durable, un-recorded skips get re-derived
      every sweep — is why the two parked variants are written down rather than
      dropped
  - references: DP-001
    context: "The decline turns on tier 3: constructing a retrieval query from a
      filename or a prompt fragment is inferring intent, not mechanics"
  - references: OBS-010
    context: Supplies the token arithmetic — ~143 median tokens per hybrid answer vs
      ~6,500 for the grep baseline — that makes the per-Read injection tax
      comparable to the failure mode it prevents
  - follows_workflow: WF-001
---

# DISC-030: PROPOSAL-013 reviewed and declined — a hook cannot construct the query

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-030` for what it
connects to.
