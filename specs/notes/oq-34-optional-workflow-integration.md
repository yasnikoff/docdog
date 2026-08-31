---
id: OQ-34
title: "How does docdog express 'optional workflow integration'?"
collection: questions
status: leaning
related: [EJ-030]
relationships:
  - references: EJ-030
    context: its user-skills-work-without-docdog bar is why optional integration needs a defined pattern
description: "User skills that are NOT docdog defaults must work without docdog. Pattern for 'call MCP tool if available, fall back otherwise' is undefined. Leaning: convention in skill markdown. Agent reads the skill and branches based on tool availability."
---

# OQ-34: How does docdog express "optional workflow integration"?

User skills that are NOT docdog default skills must work without docdog (EJ-030).
Pattern for "call MCP tool if available, fall back otherwise" is undefined.

**Options:**
- Probe-before-call: skill calls a `docdog_ping` or `docdog_status` first, branches.
- Try-catch at skill level: call the tool, catch errors, fall back. MCP errors are
  generic, so discrimination is hard.
- Environment signal: `DOCDOG_AVAILABLE=1` env var set by the agent runtime before
  spawning skills. Cleanest but requires runtime support.
- Convention in skill markdown: a prose pattern ("If docdog is available, do X;
  otherwise do Y"). The agent reads the skill and branches.

**Leaning:** convention in markdown is the simplest and lowest-friction. The agent
can reason about "available" via the tool list it has. No infra needed.
