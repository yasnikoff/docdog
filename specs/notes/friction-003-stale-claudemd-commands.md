---
id: FRICTION-003
title: "Project CLAUDE.md references commands removed in v2 (discuss, status, decisions, -p flag)"
collection: issues
status: resolved
fixed_date: 2026-04-14
description: "The project .claude/CLAUDE.md file documents docdog CLI commands that no longer exist in v2: 'docdog status', 'discuss create/resolve/list', 'decisions list', and the '-p <project>' flag. Agents following CLAUDE.md will hit 'unknown command' errors."
severity: blocks-work
---

> **Resolved 2026-04-14**: `.claude/CLAUDE.md` was rewritten for v2. It now
> enumerates the actual CLI surface and explicitly states "there is no `-p`
> flag, no `status`, no `discuss`, no `decisions` subcommand." Friction
> capture path is `specs/notes/friction-NNN-*.md` + `docdog index`.

# Friction: CLAUDE.md documents commands that don't exist in v2

## What happened

The project `.claude/CLAUDE.md` instructs agents to:

- `npm run cli -- -p docdog discuss create ...`
- `npm run cli -- -p docdog discuss resolve ...`
- `npm run cli -- -p docdog discuss list`
- `npm run cli -- -p docdog decisions list`
- `docdog status`
- Use `-p docdog` with all CLI commands

None of these work in v2. Actual commands: `init`, `index`, `serve`, `search`,
`gc`, `infra`, `templates`, `migrate`, `add`, `split`, `run`. No `-p` flag.
No `discuss`. No `status`. No `decisions`.

The "Auto-Detect Issues" section tells agents to file discussions via
`discuss create` — but the whole feature was removed.

## Expected

CLAUDE.md should match shipped CLI. Either:
- Restore the discuss/status/decisions commands in v2, or
- Update CLAUDE.md to describe the v2 workflow (file notes directly? open
  GitHub issues? something else)

## Impact

Any agent reading CLAUDE.md as its instruction set will try to run
nonexistent commands and fail. This session hit it immediately when trying
to "auto-file a discussion" per the existing instructions — had to write
notes files manually instead.

## Workaround (used in this session)

Write markdown directly to `specs/notes/friction-*.md` with proper frontmatter,
then `docdog index`.

Surfaced: 2026-04-12 during self-hosting Phase 2.
