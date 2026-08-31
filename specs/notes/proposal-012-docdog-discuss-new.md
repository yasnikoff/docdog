---
id: PROPOSAL-012
title: "`docdog discuss new` — scaffold discussion records"
collection: proposals
status: superseded
date: 2026-04-12
related:
  - DISC-003
  - OBS-001
relationships:
  - discussed_in: DISC-003
  - sourced_from: OBS-001
    context: "#8 on the wish list"
  - references: DP-001
    context: pure scaffolding — next-id lookup plus file write, defaults overridable via flags
  - references: DP-002
  - references: DP-003
  - references: PROPOSAL-011
description: "SUPERSEDED at the v3 pivot: command trees died (DD-070 §3); discussion capture runs through WF-001 with docdog_create or a plain file write + reindex, and the capture reliability the command was meant to buy is carried by the workflow artifact instead. Original v2 pitch: a scaffolding command emitting discussion-NNN files with next-id lookup and a body template."
---

# PROPOSAL-012: `docdog discuss new`

**Status note (2026-07-11, FEATURE-002):** superseded — the
`discuss` command tree died at v3 step 6 (DD-070 §3). Capture is
governed by WF-001 (discussion capture workflow); the mechanical
write is `docdog_create` or a hand-written file + `docdog index`.
DISC-024 itself was captured that way.

## Motivation

The project CLAUDE.md describes a discussion-capture workflow: when
reasoning/design conversations end, write a
`specs/notes/discussion-NNN-<slug>.md` record with specific
frontmatter (id, title, collection, status, date, participants,
description). Sequential ids, correct format, and ritualized
structure.

Writing that by hand means:
1. Look up the next free DISC-NNN (`ls specs/notes/discussion-*.md`)
2. Hand-type frontmatter from memory
3. Risk typos in required fields
4. Skip the step entirely when friction is too high

v1 docdog had a `discuss` command that automated this. v2 removed it
when the overall CLI was reshaped, and the workflow is now
documentation-only. This proposal adds back just the scaffolding
piece, minimal surface.

## Specification

```
docdog discuss new <title> [options]

Options:
  --slug <slug>         Override auto-generated slug
  --participants <list> Comma-separated (default: user,assistant)
  --open                Don't mark status=resolved (default: resolved)
```

### Behavior

1. Resolve the next DISC-NNN by scanning `specs/notes/discussion-*.md`
   for the highest existing id. Increment.
2. Generate slug: lowercased title with non-alphanumerics → `-`.
3. Write `specs/notes/discussion-<NNN>-<slug>.md` with frontmatter:
   ```yaml
   ---
   id: DISC-NNN
   title: "<title>"
   collection: discussions
   status: resolved   # or "open" if --open
   date: <today>
   participants: [<list>]
   description: "TODO: one-sentence summary"
   ---
   ```
4. Print the created path for the agent to edit.

### Intentionally minimal

No body templating, no auto-commit, no frontmatter prompts. The
scaffold is just enough to remove the "what's next id + correct
frontmatter keys" friction. Body content is author-supplied.

## DP-001 / DP-002 / DP-003 compliance

- **DP-001:** pure scaffolding (next-id lookup + file write). Tier 2
  visible defaults (default status, default participants) are
  overridable via flags. ✅
- **DP-002:** N/A.
- **DP-003:** first-class command for a repeated operation that
  currently requires manual file creation. ✅

## Estimated effort

Very small.

- CLI command (~30 LOC)
- Next-id resolver (~20 LOC)
- Integration test (~40 LOC): next-id increment, slug generation,
  frontmatter correctness, --open flag

**Total:** ~50 LOC + ~40 LOC tests.

## Not in scope

- Writing bodies / transcript ingestion
- Auto-committing
- Prompting for description / participants (stays scriptable)
- Extending to other collection types — if it works for discussions,
  a follow-up proposal can generalize to `docdog scaffold <collection>`

## Status

Proposed. Smallest surface on the wish list after PROPOSAL-011.
