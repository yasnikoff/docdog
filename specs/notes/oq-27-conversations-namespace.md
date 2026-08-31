---
id: OQ-27
title: "Conversation history — system or user namespace?"
collection: questions
status: obsolete
description: "OBSOLETE — the planned machinery (dd_conversations system collection, docdog_capture MCP tool, auto-capture config) died at the v3 pivot: no system collections, no capture tool in the kernel 8. The value it chased shipped in a different shape: agent-authored, user-confirmed session summaries are exactly WF-001's discussion capture into DISC-NNN records. A first-class transcript store would be a new v3 question. Original plan: hybrid dd_conversations with agent-authored summaries at session end."
relationships:
  - references: DD-070
    context: the pivot that killed this plan's machinery — system collections are gone and the kernel 8 has no `docdog_capture` tool
  - references: WF-001
    context: "where the core insight survived: agent-authored summary, user-confirmed at session end is exactly WF-001's discussion-capture loop, with DISC records as the session memory"
---

# OQ-27: Conversation history — system or user namespace?

**Status note (2026-07-11, FEATURE-002):** obsolete — the machinery
this plan depends on (`dd_conversations` system collection,
`docdog_capture` MCP tool, capture config) died at the v3 pivot
(DD-070): system collections are gone and the kernel 8 has no
capture tool. The core insight survived by other means: "agent
evaluates the session, proposes a structured summary, user
confirms" is precisely WF-001's discussion-capture loop, and the
DISC-NNN corpus is the searchable, graph-connected session memory
this question wanted. If raw-transcript capture becomes a real
need, it is a new question against the v3 architecture.

**Idea:** Automatically capture AI conversation transcripts as append-only
documents in a dedicated collection. With vector search and relationship edges,
this enables "let's talk about patches" → relevant past discussions surface
immediately. Always enabled, universal, no user action needed.

**Arguments for system namespace (`dd_conversations`):**
- Predefined behavior — docdog controls the append-only lifecycle, indexing,
  and edge extraction. Users shouldn't modify conversation records.
- Universal — every project benefits, not project-specific content.
- Consistent schema (timestamp, participants, topic, content chunks).
- System can guarantee integrity (append-only, no edits, no deletes).

**Arguments for user namespace (`conversations`):**
- Contains user-generated content (their words, their decisions).
- Users may want to control retention, privacy, export.
- Mixing user content into system namespace blurs the contract.
- Users might want custom conversation types (design sessions, reviews, etc.).

**Possible resolution: hybrid.**
System collection `dd_conversations` with strict append-only semantics that
docdog enforces. But expose user controls: retention policy in config,
export command, opt-out flag. The `dd_` prefix means "docdog manages the
lifecycle" not "users can't see or control it."

**Capture mechanism: agent-authored summaries, not raw transcripts.**
At session end, the agent evaluates whether the conversation produced decisions,
design insights, or context worth preserving. If yes, proposes a structured summary
via `docdog_capture` MCP tool and asks user for confirmation. If the session was
purely mechanical, skips silently (or says "nothing to capture" per verbosity config).

The agent has full context and can extract key decisions + references to specs
discussed. A raw transcript dump would be noisy; a structured summary with edges
to referenced vertices is the actual value.

```yaml
conversations:
  enabled: true
  auto_capture: true     # agent proposes captures at session end
  retention_days: 0      # 0 = keep forever (default — no surprise data loss)
```

**UX examples:**
- "This session produced decisions worth capturing. Save summary?" → user confirms
- "Nothing significant to the project this session — skipping capture."
- First-time: includes help message about disabling via config

**Planned.** Depends on `docdog_capture` MCP tool + `dd_conversations` collection.

This could be the most valuable feature docdog offers — turning ephemeral
AI chat into searchable, graph-connected institutional memory. Worth getting
the design right before building.
