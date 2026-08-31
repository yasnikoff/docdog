---
id: PROPOSAL-035
title: "docdog serve --read-only — the write rail belongs in the server, not in five host frontmatter dialects"
collection: proposals
status: shipped
date: 2026-07-16
description: "Refuse docdog_create/update/relate at the server behind an explicit flag, so a retrieval-scoped agent's read-only-ness is enforced by docdog rather than by whichever host spawned it — the only mechanism that works on all five hosts, and on Cursor the only one that works at all. Shipped 2026-07-16: writes hidden from the tool list and refused on call, index allowed, status reports the mode."
relationships:
  - discussed_in: DISC-031
    context: "the discussion that produced this proposal, including the host survey that found per-agent MCP tool restriction is the one part of an agent definition that does not port"
  - references: PROPOSAL-033
    context: "the family this joins and the mechanism it reuses — serve --root established a server-side flag constraining what a call may touch, resolved once at boot and applied to every handler; --read-only is the same shape at the same seam"
  - references: OBS-014
    context: "supplies the rule the flag mechanizes — agents judge and write review files, they never write the corpus; today that rule lives only in prose and is enforced by the operator remembering it"
  - references: DP-001
    context: "tier 1 throughout — a flag refusing a named tool is pure mechanics, no inference; the tier-3 line this must never cross is deciding which writes are 'safe enough' to allow through"
  - references: DD-070
    context: "constrains the kernel 8 without changing it — the tools, their schemas and their names are untouched; three of them gain a refusal path under an explicit opt-in flag"
  - references: PROPOSAL-032
    context: "surface parity is not owed here — the flag governs a long-lived server process, and the CLI has no equivalent long-lived session to constrain; each CLI write is already a separate deliberate invocation"
  - references: DP-003
    context: "the evidence clause — this is not a 3x-workaround resurrection; the case is that on one major host the alternative does not exist, not that it is inconvenient"
---

# PROPOSAL-035: `docdog serve --read-only`

## Motivation

DISC-031 set out to scope a spawnable `docdog-retrieval` agent — a
subagent another agent delegates corpus questions to, so the search
noise never touches the caller's context. OBS-014 fixes its scope:
**agents must never write the corpus**, because per-batch agents cannot
see corpus-wide shapes and central reconciliation is not optional.

So the agent must be read-only. The question is who enforces that.

The obvious answer is the host's agent definition — every host has a
tool restriction mechanism, so declare `docdog_search`, `docdog_get`,
`docdog_traverse`, `docdog_status` and stop. The host survey in
DISC-031 says that answer fails:

| Host | Per-agent tool restriction |
|---|---|
| Claude Code | `tools:` allowlist |
| Gemini CLI | `tools:` allowlist, `mcp_<server>_*` wildcards |
| opencode | `permissions` block |
| Codex | per-agent `mcp_servers` + `sandbox_mode` |
| Cursor | **none** |

Four mechanisms, four dialects — tolerable; a renderer emits each.
Cursor is the problem, and it is worse than "no allowlist."

## The Cursor case — both settings fail

Cursor documents that "subagents inherit all tools from the parent,
including MCP tools from configured servers," and offers exactly one
control, `readonly`. A Cursor staff member, replying to the open
feature request for per-tool subagent control, states it plainly:

> custom subagents inherit all MCP tools from the parent, and the only
> way to restrict it is the `readonly` flag, which blocks MCP entirely
> with no per-tool control.

Read that against the two settings:

- **`readonly: false`** — the agent inherits `docdog_create`,
  `docdog_update` and `docdog_relate`. It can write the corpus. The
  OBS-014 rail is prose, and prose is what a persuasive parent prompt
  overrides.
- **`readonly: true`** — MCP is blocked *entirely*. `docdog_search`
  and `docdog_traverse` go with it. The retrieval agent has no
  retrieval.

**There is no Cursor configuration in which the agent can read the
corpus but not write it.** The artifact is not merely unsafe there —
it is unbuildable. That is not a gap in the agent's design; it is a
gap in the host, acknowledged by its vendor as an open request with no
timeline.

Note one unresolved contradiction, flagged because the argument leans
on it: Cursor's *docs* describe `readonly` as restricting write
permissions ("no file edits, no state-changing shell commands") and
say nothing about MCP; the *staff reply* says it blocks MCP entirely.
The staff statement is more specific and more recent, and the proposal
follows it — but it is unverified empirically. See §Risks.

## Proposal

Add `--read-only` to `docdog serve`. When set, the three body-bearing
and edge-bearing writes — `docdog_create`, `docdog_update`,
`docdog_relate` — refuse every call with a distinct, explicit error.
`docdog_index` is a judgment call, treated in §Open below. Reads are
untouched.

```
docdog serve --read-only
```

The rail moves out of the host and into docdog. What this buys:

- **It is the only mechanism that works everywhere.** One rail in
  docdog's code, not five in five formats. On Cursor it converts an
  impossible configuration into a working one: leave `readonly: false`
  so MCP flows, and point the agent at a read-only server. Cursor's
  all-or-nothing flag stops being load-bearing.
- **It cannot be talked out of.** A tool allowlist in frontmatter is
  enforced by the host; instructions in a body are enforced by the
  model's cooperation. A server-side refusal is enforced by neither. An
  agent cannot prompt its way past a process that will not do the
  thing. This is the substantive difference between a rail and a
  request, and OBS-014's rule deserves a rail.
- **It survives the host matrix churn.** DISC-031's whole finding is
  that the host landscape moved under a six-month-old read. A rail in
  docdog does not care which way Cursor jumps next.

## Why this is tier-1 mechanics (DP-001)

A flag that makes three named tools return an error is pure mechanics.
There is no inference: the operator states the constraint, the server
applies it literally, and a refused call is refused visibly rather
than silently degraded.

The tier-3 line, recorded here so it is never crossed: the server must
never decide **which** writes are safe. No "allow relate but not
create," no "allow writes to notes but not decisions," no heuristic
about whether a given write looks reconciliation-shaped. Those are
judgment (DP-001 tier 3) and they belong to the agent+user loop. The
flag is binary, and the whole point is that its meaning is legible from
its name.

## Sketch

`serve --root` (PROPOSAL-033) already established the seam: `serve`
resolves configuration once at boot and hands it to every handler. A
read-only flag rides the same path — a boolean on the server context,
checked at the top of the three write handlers.

```
create/update/relate handler:
  if (ctx.readOnly) throw new DocdogError("SERVER_READ_ONLY", …)
```

The error should name the flag, so an agent that hits it reports
something actionable to its caller rather than "the tool failed."
Precedent: `ROOT_NOT_A_PROJECT` (PROPOSAL-033) is a hard error that
never falls back, for the same reason — acting on the wrong corpus,
or writing when writes were forbidden, is worse than failing loudly.

## Risks and objections

- **Building a rail for an agent that does not exist yet.** Fair.
  Mitigation: the flag is independently useful the moment any docdog
  MCP server is exposed to something whose writes are not wanted — a
  CI reader, a shared machine-scope server (PROPOSAL-033) whose callers
  are not all trusted, a demo. It does not depend on PROPOSAL-036
  shipping. This is the reason to take it first.
- **The Cursor claim is second-hand.** The docs and the staff reply
  disagree (§The Cursor case). If `readonly: true` in fact leaves MCP
  reads working, then Cursor has a native read-only path and this
  proposal loses its sharpest argument — but keeps the portability one
  and the unbypassable-rail one, which stand on their own. **Verify
  before implementing**; the check is cheap and the answer changes only
  the motivation section, not the design.
- **Two servers on one machine.** A developer wanting both a writable
  session and a read-only agent server runs two processes, which
  PROPOSAL-033 made cheaper but not free (two ONNX loads). Parked: a
  per-call read-only assertion would avoid it, but a constraint the
  *caller* supplies is a constraint the caller can omit — which is not
  a rail at all.

## What it refuses, and what it does not — the limitation

**`--read-only` refuses docdog's write tools. It is not a filesystem
sandbox.** An agent that holds ordinary file-write tools can still edit
a spec's markdown by hand, and docdog cannot stop it — the files are the
source of truth (DD-070), which is exactly what makes them reachable
without docdog.

This was not visible when the proposal was written and is recorded
because it bounds the claim honestly:

- On a host with a tool allowlist, the flag is belt-and-braces and the
  point is moot.
- On Cursor specifically, the combination this proposal enables —
  `readonly: false` so MCP flows, plus a read-only server — leaves the
  agent able to edit files directly. The rail is a real reduction, not
  a seal: it removes the path the tool surface *invites* (a casual
  `docdog_relate` mid-sweep, which is precisely OBS-014's failure) and
  leaves only a deliberate hand-edit that the agent's instructions
  forbid.
- Sandboxing the filesystem is the host's job (Cursor's
  `readonly: true`, Codex's `sandbox_mode`). Docdog's job is its own
  surface. The two compose; neither substitutes for the other.

The refusal message deliberately does **not** mention hand-editing as an
alternative, even though it is the honest CLI answer for a human. Telling
a refused agent where the side door is defeats the rail. It says: report
the change you intended to your caller.

## Resolved (was Open)

- **`docdog_index` is allowed.** It writes the cache, never the corpus,
  and the cache is disposable derived state rebuilt from disk on demand
  (DD-070). The rail exists to protect the markdown; refusing this would
  cost a read-only agent correctness — stale answers after an edit it
  did not make — to protect nothing. Recorded at the declaration site so
  the reasoning is where the next reader looks.
- **`docdog_status` reports the mode.** An agent that can see it is
  read-only states it to its caller instead of discovering it by
  refusal. Reported on *every* path including the no-cache one: the mode
  is a property of the server, not the cache, and a read-only server with
  a missing cache still refuses writes. (The unit test found that gap —
  the first draft only added the line to the success path.)

## Shipped — 2026-07-16

Two mechanisms, because either alone is insufficient:

1. **Hidden from `tools/list`.** A caller cannot attempt what it cannot
   see, and three unusable schemas stop costing context in an agent that
   could never have used them — which is on-thesis for the whole
   retrieval-agent idea.
2. **Refused on call.** A client with a cached tool list, or one calling
   blind, still reaches the handler and gets `SERVER_READ_ONLY` naming
   the flag — not "Unknown tool". Checked before project resolution: the
   refusal does not depend on which corpus was named, and a bad `root`
   must not mask it.

The write set is **derived from the tool definitions** rather than kept
as a list beside them. Every tool declares `write: true|false`, so adding
one forces the author to answer the question instead of defaulting into
writable — a parallel list is a thing that drifts, and drifting *open* is
the failure that matters. `write` is internal metadata and is stripped
before the definitions reach the wire.

Verified beyond the unit tests by driving a real `serve --read-only` over
stdio JSON-RPC: the writes are absent from `tools/list`, a blind
`docdog_create` is refused and writes nothing, `docdog_status` states the
mode, and a default server still lists all eight and reports no mode.
369 tests.
