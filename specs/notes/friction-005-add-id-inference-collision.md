---
id: FRICTION-005
title: "docdog add infers id from first dash-segment of filename, causing collisions"
collection: issues
status: resolved
fixed_date: 2026-04-14
description: "When stamping frontmatter on files like 2026-04-10-intent-clarification.md, docdog add sets id to '2026' — just the first dash-separated token. Four date-prefixed files all got id='2026', colliding on the primary key."
severity: inconvenient
relationships:
  - references: DP-001
    context: "motivating example for the agent-first-mechanics principle — inference belongs in the agent loop, not in docdog's code"
  - amends: DD-064
    context: "the add section: filename-derived ids collided on date prefixes, so add sets an id only from an explicit --id"
---

# Friction: `docdog add` id inference collides on date-prefixed filenames

## What happened

Ran `docdog add` on four notes files:

```
specs/notes/2026-04-10-context-discovery-case-study.md
specs/notes/2026-04-10-intent-clarification.md
specs/notes/2026-04-11-edge-schema-analysis.md
specs/notes/2026-04-11-first-attempt-review.md
```

All four ended up with:

```yaml
---
id: "2026"
title: ...
collection: issues
---
```

Same id on every file. Whatever logic extracts an id from the filename only
took the first `-`-delimited segment. With date-prefixed filenames
(`YYYY-MM-DD-slug`), that's always the year.

## Expected

Either:
- Use the full filename stem as id (minus `.md`): `2026-04-10-intent-clarification`
- Detect date prefix and use the remainder as slug: `intent-clarification`
- Refuse to stamp a duplicate id that's already in use

## Impact

Inconvenient. Indexing four files with the same primary key would either
fail or silently overwrite. I had to hand-fix each id before indexing.

## Workaround

Manually edit each frontmatter `id:` after `docdog add`. Tedious.

Surfaced: 2026-04-12 during self-hosting Phase 3.

## Resolution (2026-04-14) — DP-001 path

Filename-based id inference removed entirely. `extractIdFromFilename`
deleted. `docdog add` now has a `--id <value>` flag that stamps a
single explicit id onto a single file, and refuses with a clear error
if `--id` is passed together with a source that resolves to multiple
files. When `--id` is omitted, no id is stamped — the agent/user
supplies one explicitly or edits frontmatter after.

Rationale: inference here is a Tier-3 DP-001 violation ("guessing
intent") and the concrete damage was exactly what DP-001 predicts —
silent collisions on a plausible-looking naming scheme. The fix
honors the principle instead of patching around it.

New tests: `stamps --id onto a single file`, `refuses --id when the
source matches more than one file`, `does not infer id from
date-prefixed filenames`. The existing "0068-layered-architecture"
test was updated to expect no id.
