---
id: PROPOSAL-033
title: "One MCP server per machine — a per-call project root, with cwd as the free default"
collection: proposals
status: shipped
date: 2026-07-14
description: "Unbind the MCP server from a single repo: resolve the project per call from an optional root path, defaulting to the server's cwd, so one machine-scope server serves every repo a developer works in."
relationships:
  - discussed_in: DISC-028
    context: "the discussion that produced this proposal, including the cwd probe that showed registration scope does not affect the spawn cwd"
  - references: DD-070
    context: "stays inside DD-070's per-repo cache model — this selects which repo's cache a call opens; it does not merge caches or federate ids"
  - references: DP-001
    context: "tier 1 for the explicit root path and tier 2 for the cwd-derived default; the tier-3 line this proposal must never cross is inferring the project from an id prefix or searching every known project"
  - references: PROPOSAL-032
    context: "parity holds without a CLI --root: the shell expresses root selection as the working directory, which is what cd already is, so the CLI stays cwd-routed"
  - references: OBS-015
    context: "OBS-015 already measured one global docdog binary serving two repos, and is also the standing warning that one binary for all repos means version skew lands everywhere at once"
---

# PROPOSAL-033: One MCP server per machine

## Motivation

A developer works across several repos at once — related or not. Docdog's
MCP server cannot follow them: `serve` resolves the project **once at
boot** from its process cwd (`src/cli/commands/serve.ts:10`) and hands a
fixed `projectRoot` to every handler. The tools mean whichever repo
spawned the server, for the life of the session.

Today's only answer is a second server per repo — N processes, N ONNX
model loads, N `.mcp.json` files, and a launcher that must honor a `cwd`
key (which is why `docs/cowork-mcp-setup.md` already ships a shell-wrapper
fallback for launchers that don't).

The unit of work is the developer's machine, not the repo. The server
should be registered once at user scope and told, per call, which project
to act on.

## Non-goals

- **Not a daemon.** An MCP stdio server is spawned by the client per
  session. "One per machine" means *registered once at user scope*
  (`~/.claude.json`), like the filesystem and github servers — not a
  resident process holding state across projects. A machine-global
  process would drag back exactly the always-on shape DD-070 deleted.
- **Not federation.** Ids stay project-local, caches stay per-repo,
  `relate` and `traverse` still cannot cross a corpus boundary. This lets
  one agent talk to two graphs; it does not make them one graph.

## Design

### 1. The root is resolved per call, not per boot

Each of the kernel 8 gains an optional `root` parameter: an absolute path
to a docdog project, or to any directory inside one (the existing walk-up
applies). Resolution order for every call:

1. explicit `root` argument, if given;
2. else the server's **default root** — `findProjectRoot()` from the
   process cwd, resolved once at boot, and allowed to be `null`;
3. else **error** `ROOT_REQUIRED`, naming the cwd that failed to resolve.

The default comes from the server's process cwd, which is fixed at spawn.
It is a boot-time default with a per-call override, not a per-call cwd
sniff.

### 2. Single-repo users pay nothing

Measured, not assumed (DISC-028): a **user-scope** stdio MCP server is
spawned with the directory the client was launched from — registration
scope does not affect the spawn cwd. Launched from `E:\projects\docdog`,
a user-scope server's cwd is `E:\projects\docdog` and walk-up resolves it;
launched from a directory with no docdog project, cwd resolves to `null`.

So the rule is: **`root` is optional inside a docdog project and mandatory
outside it.** The single-repo developer — who is ~every future user —
never passes it, and sees no behavior change at all.

### 3. A bad explicit root is a hard error, never a fallback

If `root` is given and contains no `.docdog/config.yaml`, the call fails.
It must **not** fall back to the default root. Silently operating on the
wrong corpus is the worst failure this feature can produce, and it would
be indistinguishable from success.

### 4. Paths, not names — no registry

The selector is a filesystem path. A name (`"orchestrator"`) would need a
machine-global registry mapping names to paths: mutable global state that
goes stale, that must be repaired, and that v3 deliberately does not have.
A path needs nothing — walk up, find the config, open the cache. Pure
mechanics.

### 5. Every response names the project it acted on

Cheap, and it closes the one new failure mode this creates. An agent that
is silently in the wrong corpus cannot tell; a response header (project
name + resolved root) makes it obvious in the transcript.

### 6. `serve --root <path>` pins a default

For a launcher that cannot control cwd, and for the existing per-repo
mode. Sets the default root explicitly instead of deriving it from cwd.
Every existing `.mcp.json` keeps working with no change.

### 7. The CLI does not change

`cd` is already the project switch, and the shell expresses root selection
as the working directory. No `--root` on the CLI commands. PROPOSAL-032's
parity commitment is satisfied by cwd.

## Why this is DP-001-clean

- **Tier 1** — an explicit path supplied by the caller. Zero inference.
- **Tier 2** — the cwd-derived default: visible, documented, overridable,
  and it errors loudly rather than guessing when it can't resolve.

**The tier-3 line, recorded here the way PROPOSAL-028 recorded
`--accept-all`.** With one project, `docdog_get("DD-070")` is
unambiguous. With N it is not, and both tempting fixes are **forbidden
and must never be built**:

- searching every known project and merging the results;
- inferring the project from an id prefix, a title match, or recency.

A call acts on exactly one project or it errors. There is no "all
projects" mode.

## Implementation sketch

The seam already exists: no handler closes over a root. Every one is
`handleX(config, projectRoot, args)` (`src/mcp/server.ts:211-225`), and
`startMcpServer` merely resolves the pair once and passes it down. The
change is confined to the MCP layer:

1. `serve` no longer requires a project: `findProjectRoot()` may return
   `null` and the server still starts.
2. `startMcpServer` takes a `defaultRoot: string | null` instead of a
   `{config, projectRoot}` pair.
3. A `ProjectResolver` holds a lazy `Map<root, {config, cache}>` — open a
   root's config and cache on first use, keep them for the process
   lifetime (or a small LRU; a developer has a handful of repos, not
   hundreds).
4. The `CallToolRequest` switch resolves the root from `args.root ??
   defaultRoot` and throws `ROOT_REQUIRED` on `null`.
5. Tool schemas gain the optional `root` property.

The storage layer does not move. `docdog_create`'s repo-relative path
becomes relative to the *resolved* root, which is the same rule it has
today.

**The one real win beyond convenience:** the ONNX embedder loads
in-process. One server across N repos loads the model once instead of N
times.

## Costs

- **Version skew.** One machine-scope server means one docdog version for
  every repo on the box; per-repo `.mcp.json` (`npx -y @yasnikoff/docdog`)
  could pin. This repo's setup already lost that property — OBS-015 is the
  record of a `dist/` rebuild here silently upgrading the orchestrator's
  schema — but for external users it is a genuine regression. It fails
  loudly at least: the cache refuses to open on `SCHEMA_VERSION` mismatch.
- **Staleness on rebuild hits everything.** A running `serve` keeps
  executing old code until restarted; machine-scope means one stale server
  affects every repo's session, not one.
- **A new wrong-corpus failure mode**, mitigated by §3 and §5.

## Shipped — what implementation changed

Implemented 2026-07-14. New `src/mcp/project-resolver.ts` owns resolution;
`src/mcp/server.ts` resolves per call and injects `root` into all 8 tool
schemas; `serve` gained `--root` and now starts with **no** project. 11 new
tests (339 total). Three departures from the design above:

1. **§5 narrowed — the project footer appears only when the caller passed an
   explicit `root`.** Naming the project on *every* response contradicted the
   promise that single-repo callers see no change: with no `root` there is
   exactly one project the call could have meant, so the line is noise. With
   a `root`, it is the check that catches "I meant the other repo". Steered
   calls get `_(project: <name> — <root>)_`; unsteered calls are byte-for-byte
   what they were.
2. **`root` must be absolute.** Resolving a relative path against the server's
   cwd would smuggle the very coupling this removes back in, and the caller's
   cwd is not the server's. `ROOT_NOT_ABSOLUTE`.
3. **Skill resources stay bound to the default project.** MCP resource reads
   have no argument to carry a root, so a rootless server exposes no skills
   rather than guessing. Named, not silent.

Errors are codes, not prose: `ROOT_REQUIRED`, `ROOT_NOT_ABSOLUTE`,
`ROOT_NOT_FOUND`, `ROOT_NOT_A_PROJECT`, `ROOT_NOT_A_STRING`.

**Verified end-to-end**, not just by unit test: a server spawned with its cwd
in `C:\Users\admin` (not a docdog project) answered `docdog_search` for the
docdog corpus and for a second, freshly-initialized project in one session —
each response naming its project — and refused `ROOT_REQUIRED` (no root),
`ROOT_NOT_A_PROJECT` (root outside a project), and `ROOT_NOT_ABSOLUTE`.

Q3 below dissolved: handlers already open and close their cache per call, so
the resolver caches only configs. An unbounded map over a developer's handful
of repos needs no eviction.

## Open questions — both closed by DISC-029

Measured the same day, by probe rather than argument.

1. **Name collision — clean shadowing.** A server named `docdog` registered at
   *both* project and user scope: the project entry spawns and the user one
   does not; in a directory with no project `.mcp.json`, the user one spawns.
   Exactly one server ever runs. No duplicate tools, no merged surface.
   Machine-scope registration is safe, and it is now the documented multi-repo
   path — not an informed opt-in.

   The consequence this proposal missed: in a repo where `init` ran, the
   project entry **shadows** the machine-scope server. That is benign, because
   the shadowing server is itself a docdog server and takes `root` too — it
   still reaches sideways into other projects.

2. **`init` keeps writing `.mcp.json`.** Dropping it would break zero-config
   onboarding for the single-repo adopter to serve the multi-repo one, and
   keeping it costs nothing now that shadowing is known-benign. It is a
   deletable file — tier-2 visible default, opt out by deleting. Rejected:
   teaching `init` to sniff the client's global config for an existing
   registration (judgment about another tool's state, and it deepens a
   coupling DD-048 already strains).

## The better setup this proposal did not anticipate

Registering at user scope **and wiring no `.mcp.json` at all** beats both
configurations described above: `cd` into any docdog project and the
user-scope server spawns with that repo as its cwd, so walk-up makes the
default root automatically correct. You never type `root` for the repo you are
standing in — only to reach sideways into another one. One registration, zero
per-repo files, zero arguments in the common case. No code required; see
`docs/cowork-mcp-setup.md`.

## Residual cost

`init` writes `npx -y @yasnikoff/docdog serve` — the *published* package — so
existing projects gain `root` only once this ships to the registry. Ordinary
versioning, but it bounds who the machine-scope story is real for today.
