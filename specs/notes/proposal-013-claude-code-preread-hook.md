---
id: PROPOSAL-013
title: "Claude Code pre-Read hook — force docdog_search before spec-file Reads"
collection: proposals
status: rejected
date: 2026-04-12
related: [OBS-003, DP-001]
relationships:
  - sourced_from: OBS-003
    context: "OBS-003 §Open questions #3 — the retrieval habit problem"
  - references: DP-001
    context: the hook is mechanical — path-glob trigger, fixed query, zero inference
  - references: FR-001
    context: FR-001 compliance argued — a forcing function inverts the usual opt-in default; detector sketched
  - references: DP-003
    context: DP-003 check — makes retrieval-first a default without touching the escape hatch
  - discussed_in: DISC-030
    context: The review thread that declined this proposal — carries the full rationale and the two parked hook variants
description: "REJECTED 2026-07-15 (DISC-030): the hook API does cooperate, but the hook triggers on the very event whose absence is the problem — an agent that bypasses docdog bypasses Read too — and every query-constructing variant is DP-001 tier-3 inference. Original: ship a Claude Code hook that intercepts Read tool calls targeting scan_paths and automatically runs `docdog search` on the file's path before Claude sees the content, converting docdog from an opt-in retrieval layer into a forced-consumption one."
---

# PROPOSAL-013: Pre-Read hook

> **Status note (2026-07-15, DISC-030): REJECTED.** Reviewed in full and
> declined. The open question below is *answered* — Claude Code's hook API
> does support this — but the design fails for reasons the API was never
> the source of. In short: it fires on the event whose absence is the
> problem, the query it builds is a filename, and every variant that
> constructs a query on the agent's behalf is DP-001 tier-3 inference. Full
> rationale in `## Rejected` at the bottom; the discussion is DISC-030.

## Motivation

OBS-003 named the single biggest gap in docdog's self-hosting story:
**the assistant shipped a full retrieval layer and never used it**.
Shipping more commands doesn't fix this — the issue is muscle
memory. `git log` is shorter than `docdog recent --since HEAD~5`,
so `git log` wins every time.

The only durable fix is a forcing function. Claude Code supports
hooks; docdog ships its own hook config as part of `docdog init`
for the Claude provider. This proposal wires them together.

## Specification

### The hook

Claude Code hooks can run before a tool call. The hook:

1. **Trigger:** the agent calls `Read` with `file_path` matching any
   configured `scan_paths` prefix (default `specs/`).
2. **Action:** run `docdog search "<basename-without-extension>"
   --limit 3 --format text` and print the result to stdout.
3. **Effect:** Claude sees the search result as tool output before
   the Read tool runs, gets the graph's view of the file's
   neighborhood alongside the raw content.

The hook is **additive**, not blocking. Read still runs; docdog's
output is extra context.

### `docdog init` writes the hook config

Today `docdog init` writes a Claude-specific `.claude/CLAUDE.md`
block. It should also write a hook entry into
`.claude/settings.local.json` (or whatever Claude Code's hook
config file is) under a clearly-named key:

```json
{
  "hooks": {
    "preToolUse": [
      {
        "match": { "tool": "Read", "fileGlob": "specs/**/*.md" },
        "command": "docdog search $(basename -s .md {{file_path}}) --limit 3"
      }
    ]
  }
}
```

Exact shape depends on Claude Code's hook API; the proposal is the
intent, not the syntax.

### Opt-out

Respects FR-001: opt-in by default is wrong here because the whole
point is a forcing function. But the hook **must be easy to
disable** via a single config flag (`features.claude_preread_hook:
false`) for users who find it noisy.

### When the hook fires and when it stays quiet

- **Fires:** `Read` on `specs/**/*.md` or any path under a configured
  `scan_paths` entry
- **Quiet:** `Read` on source code, `Read` on `.claude/`,
  `.docdog/`, tests, or any path outside `scan_paths`

### What the agent sees

Claude sees tool output like:

```
[docdog pre-Read hint for proposal-003-relationships-frontmatter-block.md]
  [PROPOSAL-003] `relationships:` frontmatter block — design spec (score 0.892)
  [PROPOSAL-006] Meta collections reshape (score 0.724)
  [DISC-004] Designing the `relationships:` frontmatter block (score 0.681)
```

Three lines, cheap to scan, gives the agent the neighborhood before
it reads the full file. If the agent decides the neighboring specs
are more relevant than the target file, it can Read those instead.

## DP-001 / DP-002 / DP-003 compliance

- **DP-001:** mechanical. The hook fires on a path-glob match, runs
  a fixed search query built from the filename, prints the result.
  Zero inference. ✅
- **DP-002:** N/A.
- **DP-003:** turns an escape-hatch workflow (agent remembers to
  query docdog) into a first-class default. Direct AQL and raw Read
  still work. ✅

## Not in scope

- **Blocking the Read** if the agent doesn't follow up on hints —
  that's inference and coercion.
- **Auto-summarizing** spec content — Read already returns the full
  file; docdog's job is to show neighbors, not to replace.
- **Hooks for other tools** (Grep, Bash) — narrow the surface first;
  broaden if the Read hook changes behavior.
- **Other providers** — this is Claude Code specific. Cursor /
  Copilot integrations are separate proposals.

## Estimated effort

Small for the hook itself, medium for the init-time wiring.

- `docdog init` hook config writer (~30 LOC)
- Documentation in `.claude/CLAUDE.md` template (~20 lines)
- Integration test that fakes the hook shell command and verifies
  docdog search output is what the hook would inject (~50 LOC)
- FR-001 detector: "does this project enable claude_preread_hook?"
  (~20 LOC)

**Total:** ~100 LOC + ~50 LOC tests.

## Open question

Does Claude Code's actual hook API support per-tool, per-glob
pre-hooks with arbitrary shell commands? If not, the hook needs to
be implemented as a wrapper script that Claude Code invokes as the
Read tool itself, which is more invasive. Investigate before
implementation.

## Status

~~Proposed. High-leverage if Claude Code's hook API cooperates.
Biggest risk is the API shape. Ship probing the API first, then
implement the writer.~~ **Superseded by `## Rejected` below.**

## Rejected (2026-07-15, DISC-030)

### The open question is answered — and it didn't matter

The API cooperates, but the mechanism sketched above is fiction on three
counts. The `matcher` matches **tool name only** — no `fileGlob`, no
`{{file_path}}` templating — so path filtering happens inside the hook,
which must parse a JSON envelope from stdin. On PreToolUse, **exit-0 stdout
does not reach the model** (unlike `UserPromptSubmit`/`SessionStart`);
non-blocking injection requires JSON output with
`hookSpecificOutput.additionalContext`. And hooks are **synchronous** —
they block the tool call while running. The ~30 LOC estimate dies with the
sketch: this needs a real cross-platform executable, because `basename -s
.md` and `jq` don't exist on Windows.

### Why it was declined anyway

**It conditions on the event whose absence is the problem.** OBS-003's
failure was reaching for `git log`, `grep`, and `curl` instead of docdog —
and in none of those moments was a spec file Read. An agent that bypasses
docdog bypasses `Read` too, or Reads only *after* a grep already located
the file, at which point retrieval has already succeeded by other means.
The hook is silent in exactly the failure case it exists to fix, and fires
when the agent has already found the right document.

**Context pollution.** The query is the basename, so hybrid search
self-matches — one of three slots systematically returns the file already
in context. The highest-signal input, *why* the agent opened the file, is
what a Read hook structurally cannot see. Volume scales with file-touching
rather than information need: a WF-003 batch rewrite touches 39 files
(OBS-014) doing mechanical frontmatter surgery, and hooks fire for
subagents, so OBS-014's seven parallel triage agents multiply it. At
OBS-010's ~143 median tokens per answer, that batch injects ~4–8k tokens
nobody asked for — against a ~6,500-token grep-walk baseline. A forcing
function that costs what the failure mode costs is a tax, and mostly-noise
injections train the agent to skim past the docdog block.

**Landmines.** Having `init` write into `.claude/settings*.json` is a
deeper form of the coupling PROPOSAL-033 rejected days earlier, and the
file choice traps either way: `settings.local.json` is gitignored so the
forcing function doesn't travel; `settings.json` is tracked so docdog
mutates another tool's committed file. A hook is arbitrary shell on every
matching tool call, so installing one by default at init needs loud consent
— the §Opt-out section above waves this off by conflating forcing the
*agent* with forcing the *user*. And DISC-021 already priced the runtime
cost: the warm embedder lives in `serve`, so a hook (CLI path only) pays an
ONNX cold start synchronously before every spec Read.

**The DP-001 grade above is wrong.** "Zero inference ✅" doesn't hold —
deriving a semantic query from a filename *is* an inference, and cutting to
three results is a judgment. Tier 2 at best.

### The generalized finding

The `UserPromptSubmit` inversion floated during the review (fire at task
start; use the user's prompt as the query) died to a one-line objection:
user prompts are **deictic**. *"Write the ui for this feature"* — the
referent of *this feature* lives twenty turns back in the conversation, not
in the prompt string, and a hook only sees the string.

**Every hook variant that must construct a query is guessing intent from
something that is not a query** — a filename, a prompt fragment, a tool
argument. That is inference dressed as mechanics, and it fails hardest when
the agent's need is most context-dependent. OBS-003 named a *habit* gap;
a mechanism that guesses is not a fix for a habit gap.

**The constraint any future proposal in this space must clear: do not build
a mechanism that constructs a retrieval query on the agent's behalf.**

Two variants that pass that test are parked with reasons in DISC-030 — a
bypass nudge on Grep, and (if a Read hook is ever revisited, **this** is the
shape, not a search) an inbound-edge hint, since forward-edge-only storage
means a record's inbound edges are the one thing its own bytes cannot show.
