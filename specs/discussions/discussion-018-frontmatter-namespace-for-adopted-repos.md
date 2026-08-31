---
id: DISC-018
title: Namespace docdog frontmatter under a `docdog:` key for adopted repos
collection: discussions
status: open
date: 2026-04-14
retained_privately: docdog-discussions
relationships:
  - references: DP-001
    context: namespacing is a pure-mechanics concern (Tier 1) — no inference, just a
      reserved key
  - references: DD-034
    context: artifact-resilience reframe — adopted repos are exactly the case where
      docdog must not rewrite host-tool metadata
  - references: DISC-019
    context: if DISC-019's DB-first flip had landed, this migration scope would have
      collapsed to nested-always everywhere
  - references: PROPOSAL-018
    context: anticipated the first real file-schema migration arriving alongside
      P-018's workflow primitives
---

# DISC-018: Namespace docdog frontmatter under a `docdog:` key for adopted repos

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-018` for what it
connects to.
