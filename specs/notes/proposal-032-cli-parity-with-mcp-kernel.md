---
id: PROPOSAL-032
title: "CLI parity with the MCP kernel — the CLI as a complete fallback surface"
collection: proposals
status: shipped
date: 2026-07-14
description: "Every MCP kernel tool should have a CLI counterpart wherever the shell can express its inputs, so the CLI is a complete fallback rather than a partial one. Ships the read trio — `docdog get`, `docdog status`, `docdog traverse` — plus `docdog relate`, all thin adapters over the same `src/storage/*` functions the MCP handlers already wrap. Writes with a markdown body (`create`, `update`) take the `--file`/stdin path or stay on MCP; that is where the 'wherever possible' caveat bites. A DD-070 §4 amendment: the CLI list grows, the MCP kernel 8 is untouched."
relationships:
  - discussed_in: DISC-021
    context: "the discussion that surfaced this artifact and left it undrafted — its verdict was 'keep both; the surfaced artifact is CLI read-parity so the CLI is a complete fallback — a DD-070 §4 amendment, not yet drafted'. This is that draft, generalized from read-parity to parity-where-expressible"
  - references: DD-070
    context: "§4 amendment — the CLI list grows by get/status/traverse/relate; the MCP kernel 8 is untouched, exactly as PROPOSAL-024's suggest-edges amendment left it"
  - references: PROPOSAL-024
    context: "the precedent this follows — a command pruned at v3 step 6 returning through a proposal rather than a quiet re-add, with the amendment stated in DD-070's own edges"
  - references: PROPOSAL-008
    context: "the superseded `docdog traverse` CLI, resurrected here on the same footing suggest-edges was — the v3 pruning killed it for surface economy, not because it was wrong"
  - references: DP-003
    context: "clause 2's promise sharpened — the toolbelt must be comprehensive on each surface a caller can actually reach, not merely in aggregate across both; a shell-only caller today has no escape hatch short of raw SQL"
  - references: DP-001
    context: "tier walk: a CLI command wrapping an existing storage function is a second thin adapter over the same Tier-1 mechanics the MCP handler already wraps — no new decision enters code"
  - references: DD-048
    context: "MCP-as-primary-interface is upheld, not reversed — this makes the CLI a complete fallback, not a replacement; the skills that carry docdog knowledge gain a shell path for MCP-less clients"
  - references: PROPOSAL-019
    context: "injectable skills are the existing no-MCP integration mode, and today they can only tell a shell-only agent to search and index — parity is what makes that mode whole"
---

# PROPOSAL-032: CLI parity with the MCP kernel

## Motivation

The two surfaces are asymmetric, and the asymmetry is an artifact of
how v3 pruned rather than a considered split.

| MCP kernel 8 | CLI counterpart |
|---|---|
| `docdog_search` | `docdog search` ✅ |
| `docdog_index` | `docdog index` ✅ |
| `docdog_get` | — |
| `docdog_status` | — |
| `docdog_traverse` | — (PROPOSAL-008, superseded) |
| `docdog_relate` | — |
| `docdog_create` | — |
| `docdog_update` | — |

DD-070 §3 pruned the CLI counterparts at v3 step 6 for surface
economy — the same sweep that killed `infra`, `migrate`, and the
workflow interpreter. That sweep was right about the commands that
died with their subsystems. It was incidental about these: `get`,
`traverse`, and `relate` didn't die because the operation stopped
existing, they died because the MCP tool covered it and the CLI
entry was one more thing to maintain.

The cost only becomes visible once you notice what a **shell-only
caller** can do today: search and index. That's it. To read a record
by id it must either start an MCP server or open the SQLite cache
and write SQL — and DP-003's escape hatch was meant for the
uncommon case, not for `get`.

DISC-021 reached this conclusion from the opposite direction. It set
out to examine whether MCP should be deleted in favor of the CLI,
concluded **keep both**, and named the artifact that would make the
answer honest: *CLI read-parity, so the CLI is a complete fallback.*
It has sat open and undrafted since 2026-07-11.

## The rule

> **Every MCP kernel tool has a CLI counterpart wherever the shell
> can express its inputs.**

The qualifier is load-bearing and is not an escape hatch for
laziness — it names exactly one real obstacle, argued in §"Where
parity stops" below.

The rule is a *standing* commitment, not a one-time catch-up: a new
MCP tool ships with its CLI counterpart, or with a stated reason why
the shell can't express it.

## What ships

All four are thin adapters over storage functions that already
exist — the MCP handlers are themselves thin adapters over the same
functions, which is the structural fact that makes this cheap. No
storage code changes.

### `docdog get <id>`

Wraps `getVertexById` (`src/storage/vertices.ts`). Prints
frontmatter + body; `--json` for the raw record.

```
docdog get DD-070 [--json]
```

### `docdog status`

Wraps the same cache/config inspection `src/mcp/tools/status.ts`
does — corpus counts, cache freshness, embed-store path. This is
the command an agent runs first in an unfamiliar repo, and today it
can only be reached over MCP.

```
docdog status [--json]
```

### `docdog traverse <id>`

Wraps `traverse` (`src/storage/traverse.ts`). Restores PROPOSAL-008's
command on PROPOSAL-024's footing.

```
docdog traverse DD-070 [--depth 1..3] [--direction outbound|inbound|any] [--json]
```

Depth stays clamped to 3, matching `src/mcp/tools/traverse.ts`.

### `docdog relate <from> <to>`

Wraps `relateFileFirst` (`src/storage/writes.ts`). Every input is a
short scalar — two ids, a type, a one-line context — so the shell
expresses it without friction. This is a **write**, and it is
included precisely because it fails the caveat test below: nothing
about it resists quoting.

```
docdog relate DD-070 DP-001 --type references --context "tier walk" [--anchor-text "…"]
```

Registered-type validation, forward-edge-only, and the frontmatter
surgery all come from the storage function unchanged.

## Where parity stops

`docdog_create` and `docdog_update` take a **markdown body** — the
one input the shell genuinely resists. Multi-line content with
backticks, `$`, and quotes is exactly what shell quoting mangles,
and DISC-021 named structured writes as MCP's real operational
advantage over the CLI.

Two honest options, and this proposal deliberately does **not**
choose between them yet:

1. **`--file` / stdin.** `docdog create --path specs/notes/x.md
   --collection notes --title "…" --file body.md` (or `-` for
   stdin) sidesteps quoting entirely. Cheap, and it is how every
   other CLI solves this.
2. **Leave them MCP-only.** Accept that the two body-bearing writes
   are the surface where MCP earns its keep, and say so in DD-070 §4
   rather than leaving it implicit.

Either way the rule above is satisfied — option 1 because the shell
*can* express the input once the body moves to a file, option 2
because the reason is stated rather than incidental. What is not
acceptable is the current state: the gap exists and nothing says why.

**Recommendation:** ship the four commands above first, then decide
`create`/`update` against real usage. If the read trio lands and
nobody reaches for `create` from a shell, option 2 is the answer and
we have evidence for it. That is DP-003 clause 3 run forward instead
of backward.

## DP-001 walk

- **Tier 1 (pure mechanics) — all four.** Each command is a second
  adapter over a storage function whose behavior is already fixed:
  `getVertexById`, `traverse`, `relateFileFirst`, and the status
  inspection. The decision content is zero; the code is argument
  parsing and rendering.
- **No Tier 2.** No new defaults are introduced. `--depth` and
  `--direction` inherit the MCP tool's existing defaults (1, `any`)
  rather than inventing CLI-specific ones — divergent defaults across
  two surfaces onto one engine would itself be a smell.
- **No Tier 3.** Nothing infers, guesses, or categorizes.

The DP-001 risk in a parity proposal is not the commands — it's the
temptation to make the CLI *smarter* than the MCP tool to compensate
for the shell (guessing an id from a partial string, inferring a
relation type from context). None of that is proposed. Two thin
adapters, one engine, identical semantics.

## Estimated effort

Small. Four command files following the established
`registerXCommand(program)` pattern (`src/cli/commands/*.ts`,
registered in `src/cli/index.ts`), each ~40–60 LOC of parsing +
rendering, plus `--json` on each.

- `src/cli/commands/get.ts`, `status.ts`, `traverse.ts`, `relate.ts`
- registration in `src/cli/index.ts` (4 lines)
- CLI integration tests per command
- `CLAUDE.md` + `README` CLI list updated; DD-070 §4 amended by edge,
  as PROPOSAL-024 did

**Total:** ~200 LOC + tests. No storage changes, no schema change, no
reindex, no MCP change.

## Not in scope

- **Changing the MCP kernel 8.** It is untouched. This is additive on
  the CLI side only.
- **Making the CLI the primary interface.** DD-048 stands — MCP is
  primary, the CLI becomes a complete fallback. "Fallback" is a
  promise about coverage, not a demotion of MCP.
- **A general query CLI.** Parity means one command per kernel tool,
  not a shell-side query language.
- **`create` / `update`** — deferred pending the §"Where parity
  stops" decision.

## Status

Shipped, same day as proposed (2026-07-14). Landed in one commit:

- `src/storage/status.ts` — **new**. `collectStatus` + `formatEmbedStore`.
  `status` was the one kernel tool with no engine function to wrap (its
  stats were inlined in the MCP handler), so the CLI counterpart had
  nowhere to attach. Extracting it made both surfaces adapters over one
  engine — the proposal's own thesis, applied to itself.
- `src/mcp/tools/status.ts` — rewritten as the markdown-rendering
  adapter over `collectStatus`. Output text unchanged.
- `src/cli/commands/{get,status,traverse,relate}.ts` — the four
  commands; registered in `src/cli/index.ts`.
- `tests/unit/storage-status.test.ts` — the new engine function. The
  four commands are adapters over storage functions with existing
  coverage (`getVertexById`, `traverse`, `relateFileFirst`), so no
  commander-level tests were added; they were verified end-to-end
  against this repo instead.

`docdog relate` was dogfooded on its own amendment: the DD-070 §4
edge recording this proposal was written with the command the
proposal ships.

**`create` / `update` remain MCP-only**, per §"Where parity stops" —
deferred pending usage evidence, not forgotten. The rule they are
measured against is now stated in DD-070 §4, so the gap is explicit
rather than incidental, which was the actual complaint.

### The surfacing pass (same day)

Four commands that no document mentions are four commands nobody
runs. Shipping the code was the smaller half:

- **`README.md`** — the CLI list had drifted further than this
  proposal: it was also missing `suggest-edges` (PROPOSAL-024/028,
  shipped 2026-07-11). It now carries all of them, states the parity
  rule, and names the `create`/`update` exception with its reason —
  the same sentence DD-070 §4 now carries, so a reader hits it on
  either surface.
- **`templates/injectable-skills/navigate-specs.md`** — the payoff
  this proposal claimed via PROPOSAL-019, now actually collected. Its
  "Path B — accelerators when docdog is present" was MCP-only, so an
  agent without MCP was told to fall back to grep even when `docdog`
  was sitting on its PATH. Path B is now a two-column table, MCP and
  shell side by side, with one row per operation and the `create` /
  `update` exception spelled out. **This is what made PROPOSAL-019's
  no-MCP mode whole** — the skill could previously only tell a
  shell-only agent to search and index, which is exactly the gap the
  motivation section describes, reappearing one layer up.
- **A correctness bug, found while editing it.** That table
  documented `docdog_relate A B` as *"shortest typed path between two
  vertices"*. It is a **write** — it patches A's frontmatter. An agent
  following the skill would have called a write tool expecting a
  read. Fixed, and marked as a write in both columns. Worth naming
  because it is the failure mode a parity table *prevents*: the row
  is wrong in the same way on both surfaces, and writing them out
  next to each other is what exposed it.
- **`skills/_common/ingest.md`** (template + installed) — "verify
  with `docdog_status` via MCP" now names the CLI command too.
