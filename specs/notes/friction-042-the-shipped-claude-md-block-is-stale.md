---
id: FRICTION-042
title: "the CLAUDE.md block docdog seeds is stale — it omits two kernel tools and names v2 config keys"
collection: notes
status: resolved
fixed_date: 2026-08-25
resolution_approach: fix
fix_commit: 9d3c597
description: "CLAUDE_MD_BLOCK_TEMPLATE lists 6 of the kernel 8 MCP tools and describes config as connection/scopes, so docdog update offers adopters a worse block than the one they have."
severity: inconvenient
---

# The shipped CLAUDE.md block is stale

## What I was trying to do

Migrate an adopting repo up to the current docdog with `docdog update`, and
decide, per file, whether to take the shipped version of anything the repo had
diverged from.

## What went wrong

`CLAUDE.md#docdog` came back as diverged. Diffing the adopter's block against
the shipped one showed the divergence runs the wrong way — **the shipped block
is worse than the one already in the repo**:

```diff
-- **MCP tools available** … `docdog_search`, `docdog_get`, `docdog_traverse`, `docdog_relate`, `docdog_create`, `docdog_update`, `docdog_index`, `docdog_status`
+- **MCP tools available** … `docdog_search`, `docdog_get`, `docdog_traverse`, `docdog_relate`, `docdog_index`, `docdog_status`
```

(`-` is the adopter's file, `+` is what docdog ships.)

`CLAUDE_MD_BLOCK_TEMPLATE` (`src/engine/claude-md.ts:6`) is stale in two ways:

1. **It lists 6 of the kernel 8.** `docdog_create` and `docdog_update` are
   missing. They are the two body-bearing writes — the ones with no CLI
   counterpart by design (PROPOSAL-032's standing exception), so the block is
   silent about precisely the two tools an agent cannot discover from `--help`.
2. **It describes config as "connection, scan paths, scopes."** There is no
   connection in v3 (the cache is embedded SQLite; the Arango/Docker era died at
   step 6) and there are no scopes. This repo's own `CLAUDE.md` says
   "scan paths, collections, embedding", which is the correct line — the seed
   never received the correction.

The block is what an agent reads first in an adopting repo, which makes this the
worst place in the corpus to be two tools short.

Nothing errors, and before PROPOSAL-041 nothing surfaced it either: `init` only
writes the block when it is absent, so a stale template was invisible until a
command started *comparing* shipped bytes to disk bytes. `docdog update` made an
existing defect legible — which is what a provenance mechanism is for, but it
means the first thing it offers some adopters is a downgrade.

## Workaround

Do not take the shipped block. In the migrated repo `CLAUDE.md#docdog` was left
reported-and-unwritten, which is `update`'s default and the correct outcome here.

## What should change in docdog

Fix the template to name all eight kernel tools and describe `.docdog/config.yaml`
in v3 terms. That is a content edit, and it is the whole fix — but two things
about it are worth recording:

**The edit changes what every adopter sees on their next `update`.** A repo whose
block is byte-identical to today's shipped bytes classifies as `unchanged`; after
the edit it classifies as `update` and is written automatically, which is exactly
right and worth knowing before the edit lands. A repo like the one that surfaced
this — diverged, because its block is *ahead* of the template — becomes
`diverged` still, and only converges if the fix happens to reproduce their text.

**The general shape is a seed with no test.** `tests/unit/skill-seeds.test.ts`
pins the shipped skill set against the templates directory precisely so a
packaging gap cannot ship silently. The kernel tool list has no such pin, in a
file that names it in prose. A test asserting the block mentions every key of
`BASE_TOOL_DEFINITIONS` would have caught this the day `create`/`update` shipped,
and would catch the next tool too. That is the durable half of this report; the
wording fix is the cheap half.

Worth a sweep at the same time: every other seeded file that names the tool set
or the config keys in prose (`.claude/commands/docdog.md` via
`CLAUDE_PROVIDER_CONTENT`, which does list all eight, and the seeded skills).
The failure mode is "prose about the surface, duplicated across seeds, corrected
in only some of them" — the same shape FEATURE-002's staleness sweep found in
the corpus, now in the templates.


## Resolution (2026-08-25, 9d3c597)

Both halves shipped.

**The content fix.** `CLAUDE_MD_BLOCK_TEMPLATE` now names all eight kernel
tools, describes `.docdog/config.yaml` as scan paths / collections /
embedding, states that files are the source of truth and the cache is
disposable, and carries the delete recipe. As the report predicted, an
adopter whose block is byte-identical to the old shipped bytes will now
classify as `update` and be written automatically; one whose block is ahead
of the template stays `diverged`.

**The durable half** — `tests/unit/seed-prose.test.ts`:

- every *surface summary* seed (`CLAUDE_MD_BLOCK_TEMPLATE`,
  `CLAUDE_PROVIDER_CONTENT`) must name every tool `visibleTools()` returns,
  so a ninth tool cannot ship without landing in both;
- **no seed anywhere** may name a `docdog_*` tool that does not exist, which
  is the check that scales past the two summaries to every template,
  including skills that legitimately mention only the tools they use;
- neither summary may describe config in the v2 words (`connection`,
  `scopes`).

The sweep the report asked for found `CLAUDE_PROVIDER_CONTENT` already
correct. The only thing the new test caught was its own ambiguity —
`{docdog_version}` is a placeholder, not a tool — which the scanner now
strips before matching.
