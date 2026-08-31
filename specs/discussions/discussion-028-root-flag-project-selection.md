---
id: DISC-028
title: A developer works across several repos — one MCP server per machine, and
  how a project gets selected
collection: discussions
status: resolved
date: 2026-07-14
retained_privately: docdog-discussions
relationships:
  - references: DD-070
    context: DD-070 fixes the per-repo cache model this discussion works within — a
      root selector picks which repo's cache to open, it does not federate
      caches
  - references: PROPOSAL-032
    context: "surface parity survives without a CLI --root: the shell expresses the
      root selection as cwd, which is what cd already is"
  - references: DP-001
    context: an explicit user-supplied root path is tier-1 mechanics and a
      cwd-derived default is tier-2; inferring the project from an id prefix or
      searching every known project would be tier-3
  - references: DP-003
    context: the shell-wrapper cwd workaround is a clause-1 escape hatch; the
      evidence question it raised was overtaken — the case for the feature is
      the multi-repo developer, not the count of workarounds
  - references: OBS-015
    context: OBS-015 is the standing evidence that one global docdog binary already
      serves two repos — cwd routing works, which is why the gap is narrow
      rather than architectural
---

# DISC-028: A developer works across several repos — one MCP server per machine, and how a project gets selected

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-028` for what it
connects to.
