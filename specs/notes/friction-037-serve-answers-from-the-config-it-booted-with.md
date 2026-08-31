---
id: FRICTION-037
title: "a running docdog serve answers from the config it read at boot, so a newly declared collection or scan path is invisible until the server is restarted"
collection: notes
status: resolved
date: 2026-07-27
fixed_date: 2026-07-27
resolution_approach: patch
fix_commit: ecd9f8d
severity: inconvenient
description: "ProjectResolver memoized loadConfig per project root for the life of the process and never invalidated it. A docdog serve outlives the config it booted with, so declaring a collection — a config edit — left the server refusing docdog_create with `Unknown collection: X. Declare it in vertex_collections config.`, which is an instruction to do the thing the user had just done. Hit in the field in the orchestrator repo on a real 49-record migration; the agent worked around it by restarting and recorded the cause in its commit message. Fixed by deleting the memo: config is read per call, which is two small readFileSync on a path that already opens SQLite."
relationships:
  - references: PROPOSAL-033
    context: "the design this patches: per-call project resolution introduced the resolver and its per-root memo, correctly treating a config as cheap-but-not-free — the staleness is the cost of that memo, not of the machine-scope design, which is otherwise untouched"
  - references: DISC-033
    context: "the discussion that diagnosed this and rejected the reload command the user first proposed, on the grounds that the thing cached costs microseconds and a reload verb makes correctness depend on remembering it"
  - references: DISC-021
    context: "already recorded staleness as the CLI's one structural advantage over MCP — a live serve runs old code until restarted; this is the strictly narrower config half of that claim, and unlike the code half it is mechanically fixable"
  - references: FRICTION-033
    context: "the same shape one subsystem over: a correctness property that depended on a human remembering a step (drop the embed store when the cap changes) became mechanical (the recipe id). Here the remembered step would have been calling reload; deleting the memo removes the step instead of documenting it"
  - references: DP-001
    context: "tier 1 — re-reading a file the user edited is pure mechanics. The pre-fix behavior is the closer call: an invisible default with no override, which is tier 2 at best"
  - references: OBS-013
    context: "the adopted 9.5MB corpus this was found in; the same external dogfood that produced FRICTION-017..024, still the only place where docdog is driven by agents that did not build it"
---

> Found in the external dogfood (the orchestrator repo), not here. The agent
> that hit it wrote the cause into its commit message and moved on, which is
> both the good news and the finding — see *The feedback channel* below.

## What I was trying to do

Declare a new collection while an MCP session was live. In the orchestrator
repo the concrete task was replacing a 77 KB `specs/TODO.md` with an indexed
`specs/todo/` collection — 49 records, a new scan path, a new entry in
`vertex_collections`.

That is a two-file change to `.docdog/config.yaml` and nothing else. There is
no command to run, because declaring a collection *is* editing the config.

## What went wrong

The running `docdog serve` kept answering from the config it had read at boot.
`docdog index` from the CLI — a fresh process — indexed the new collection
correctly, so the corpus was fine; the MCP server simply could not see it.

The failure the agent would have got from `docdog_create` is the sharp one
(`storage/writes.ts:375`):

```
Unknown collection: todo. Declare it in vertex_collections config.
```

The user had declared it. The error is true of the config the server is holding
and false of the config on disk, and it instructs you to repeat the edit you
already made. `docdog_index` fails more quietly: `storage/indexer.ts:250` skips
every section in the undeclared collection with a warning, so the records exist
on disk and are absent from the cache.

## Cause

`src/mcp/project-resolver.ts` memoized the resolved project — config included —
in a `Map` keyed by project root, with no invalidation:

```ts
private open(projectRoot: string): ResolvedProject {
  const cached = this.opened.get(projectRoot);
  if (cached) return cached;
  const resolved = { projectRoot, config: loadConfig(projectRoot) };
  this.opened.set(projectRoot, resolved);
  return resolved;
}
```

The comment above it read *"Configs are cheap but not free; a developer has a
handful of repos, not thousands."* That is the whole bug in one sentence: it
is an optimization sized for a cost that does not exist. `loadConfig` is two
`readFileSync` of a ~1–3 KB YAML plus a deep merge; every call it guards
already opens a SQLite handle, and a search call runs an ONNX forward pass.

This was the MCP server's only piece of state that outlived a call. Everything
else was already per-call and therefore already fresh: the cache handle
(`openCacheRead` inside each handler), the relations registry
(`loadRegistryFromCache(handle.db)` in `tools/traverse.ts`), and the tool list
(static, no config in it). The embedder's pipeline memo is process-lifetime but
keyed by `model::dtype`, so a config change re-loads rather than lies.

## Workaround used

Restart the MCP server. The orchestrator agent did exactly that and left the
note in commit `04856871`:

> *Note: a running `docdog serve` caches config in memory and did NOT pick up
> the new scan path — the CLI (`docdog index`) did. Restart the MCP server to
> see the todo collection through it.*

## What changed in docdog

The memo is gone; `open()` calls `loadConfig` every time. Consistency within a
call is unaffected — a handler resolves once at the top and passes the config
down — so only the window *between* calls closes. A config edit racing a call
now yields a YAML parse error rather than half a config, which is the same
choice `ROOT_NOT_A_PROJECT` makes: loud beats plausibly-wrong.

The alternative the user first proposed, a `docdog_reload` command, was
rejected in DISC-033. Three tests replace the one that asserted the old
behavior (`tests/unit/mcp-project-resolver.test.ts`): a collection added
between two calls is visible to the second, likewise a scan path, and each call
gets its own config object so an in-flight mutation cannot leak forward.

**Not fixed, and not fixable this way: stale code.** A live `docdog serve` runs
whatever was loaded at boot, which is why CLAUDE.md tells you to smoke-test
handlers with a tsx scratch script rather than the connected server. No config
reload touches that.

## The feedback channel

The orchestrator's adoption plan routes docdog friction into dated
`feedback-YYYY-MM-DD-<slug>.md` notes under
`specs/investigations/docdog-adoption/`, which docdog-side sessions harvest.
This one did not go there. It went into a commit message, because the agent hit
it mid-task, worked around it in seconds, and the workaround felt too small to
file — the note is a parenthetical at the end of a commit about something else.

That is worth knowing about the channel: it catches friction that *stops* an
agent, and leaks friction that merely taxes one. This finding reached docdog
only because a human happened to watch it happen and said so.
