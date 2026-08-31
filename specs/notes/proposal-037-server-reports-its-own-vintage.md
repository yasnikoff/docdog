---
id: PROPOSAL-037
title: "docdog_status reports the server's own vintage — two signals, because neither the version nor the mtime can see the other's staleness"
collection: proposals
status: shipped
date: 2026-07-27
description: "A long-lived docdog serve runs the code it loaded at boot, and an agent has no way to learn that — it just gets subtly old behavior. Add a Server block to docdog_status reporting boot time and a stale verdict from two independent signals: the package version captured at boot vs the one on disk (catches an update), and the newest mtime under the loaded code root vs boot (catches a source edit). Neither covers the other's case, because npm preserves publish mtimes on extract, so an updated package's files can carry timestamps older than the running server's boot. Disclosure only — it never restarts, never refuses, and points the agent at the CLI, which is current by construction."
relationships:
  - discussed_in: DISC-033
    context: "the discussion that produced it — after the reload command was refused, the residue was that an agent cannot detect the one staleness that remains (code), which is what this reports rather than fixes"
  - references: PROPOSAL-035
    context: "the seam and the precedent: it made status report read-only mode 'so an agent can say it is read-only instead of learning it by having a write refused'; this is the identical move for a second server-scope property, at the same StatusOptions boundary"
  - references: PROPOSAL-032
    context: "supplies the required stated reason for a parity exception — docdog status is a fresh process every invocation, so 'is the server stale' is not a question the CLI can be asked; the block lives outside collectStatus and the CLI prints nothing"
  - references: PROPOSAL-033
    context: "the boot-resolution pattern this rides: defaultRoot is resolved once at boot and threaded to every handler, and bootedAt/bootedVersion join readOnly on exactly that path"
  - references: FRICTION-037
    context: "the motivating trap in its sharpest form — a user who updates docdog specifically to get that fix will exercise it through a server that predates it and conclude the fix does not work; the config half is now mechanical, so code staleness is the whole of what is left"
  - references: DISC-021
    context: "its verdict that a live serve runs old code until restarted is the condition this makes visible; the tradeoff stands unchanged, but it stops being silent"
  - references: DP-001
    context: "tier 1 while it stays disclosure — stamping a timestamp and comparing two strings is arithmetic; it becomes tier 3 the moment it decides on the agent's behalf, which is why refusing calls and auto-restarting are named as forbidden rather than deferred"
  - references: DP-003
    context: "the clause-3 objection answered: reaching for the CLI when the server is behind is not escape-hatch use, because PROPOSAL-032 made the CLI a first-class parallel surface; clause 3 would fire on raw SQLite against index.db, not on a supported command"
---

# PROPOSAL-037: the server reports its own vintage

## Motivation

FRICTION-037 removed config staleness: a `docdog serve` now reads
`.docdog/config.yaml` per call, so declaring a collection takes effect
immediately. What survives is **code** staleness — the server runs
whatever it loaded at boot — and DISC-021 already recorded that as the
CLI's one structural advantage over MCP.

Nothing about that tradeoff is wrong. What is wrong is that it is
**silent**. An agent talking to a server three versions behind gets old
behavior with no signal, and the failure looks like a docdog bug rather
than a stale process.

The sharpest instantiation is FRICTION-037 itself: a user updates docdog
*to get that fix*, exercises it through a server spawned before the
update, sees the old refusal, and concludes the fix does not work. The
fix that removes the need to restart is invisible until you restart.

## The two signals

Boot-time facts get compared against disk-time facts. It takes two
comparisons, because each is blind exactly where the other works.

**Signal A — version.** `src/cli/index.ts:36` already does the right
thing by accident:

```ts
const { version } = createRequire(import.meta.url)("../../package.json");
```

Module scope, so it evaluates once at process start: that const *is*
"the version this process loaded". Status re-reads `package.json` at
call time and compares. Different → stale, and it can name the vintage
(`booted 0.2.1, disk has 0.2.2`).

**Signal B — mtime.** From `import.meta.url` (the module actually
loaded — not `process.argv[1]`, which the host controls), walk up to the
`src/` or `dist/` segment and take the newest mtime in that tree,
skipping *nested* `node_modules/` and `.git/`. Newer than boot → stale.

### Why both

| | source mode (`npx tsx src/…`) | installed (`npm i` / `npm link`) |
|---|---|---|
| **version compare** | blind — the version is constant across every edit | **catches it** |
| **mtime vs boot** | **catches it** — you write the files now | blind — see below |

The installed-mode blindness of mtime is not a theory. **npm preserves
the tarball's mtimes on extract**, measured in this repo:

```
node_modules/yaml/package.json            2026-04-05 12:10
node_modules/better-sqlite3/package.json  2026-07-09 10:26
node_modules/                             2026-07-13 01:22   ← install time
```

Those are publish times, differing per package and predating the
install. So `npm update` mid-session lands newer code carrying *older*
timestamps than the running server's boot, and an mtime rule reports
"current" at the exact moment it is wrong — a signal that reads as
reassurance. Hence: run both, OR the verdicts, report which fired. Not a
mode branch; each is simply silent where it cannot see.

## The report

A `Server` block on `docdog_status`, printed on every path including the
no-cache one, and identical regardless of which `root` the call steered
to — it describes the process, not the corpus, exactly as the read-only
mode line does.

```
**Server:** source mode — E:\projects\docdog\src\cli\index.ts
Booted 2026-07-27 09:12:04Z (3h 41m ago), version 0.2.1.
**STALE:** 4 files under src/ changed since boot; newest is
src/mcp/project-resolver.ts at 09:44:12Z. This server is running the code
as it was at boot. Restarting it is the host's action, not docdog's —
until then `npx tsx src/cli/index.ts <cmd>` is current by construction.
```

Installed mode, updated underneath:

```
**STALE:** booted version 0.2.1, on disk 0.2.2.
```

Current: one line — `Booted 2026-07-27 09:12:04Z (3h 41m ago) · current`.

The closing sentence is load-bearing. The report's whole value is that
an agent can route around the problem **alone**, without a human
noticing first, and the route already exists.

## Where it lives

`StatusOptions` in `src/mcp/tools/status.ts`, beside `readOnly`, whose
docstring already states this proposal's parity reasoning verbatim:

> *"MCP-only: the flag governs a long-lived server, and the `docdog
> status` CLI has no such session to describe — which is why it lives
> here and not in the shared `collectStatus`."*

Second instantiation of that seam. `docdog status` on the CLI prints
nothing new: it is a fresh process every invocation, so "is the server
stale" is not a question it can be asked — PROPOSAL-032's stated reason,
supplied.

## Principles

- **DP-001 — tier 1**, and conditionally so. Stamping a timestamp and
  comparing two strings is arithmetic. It stays tier 1 *only while it is
  disclosure*. Refusing calls while stale, restarting anything, or
  advising which surface the agent should have used for the task at hand
  are tier 3, and are forbidden below rather than deferred.
- **DP-002** — untouched. No vocabulary, no concept records, no meaning.
- **DP-003 — the objection worth answering.** Clause 3 says repeated
  escape-hatch use signals a toolbelt gap, so "just use the CLI" looks
  like something to file rather than advertise. It is not: PROPOSAL-032
  made the CLI a first-class parallel surface, so `npx tsx
  src/cli/index.ts search` is *using* the toolbelt. Clause 3 would fire
  on agents dropping to raw SQLite against `index.db`. This keeps
  clause 2's promise at the moment it is needed.

## Limits, stated rather than discovered

1. **Over-reports by design.** Editing a file the server never imports
   marks it stale; so does a `git checkout` that rewrites mtimes. The
   safe direction — it says "restart" slightly more often than strictly
   necessary, never less.
2. **Blind to dependency changes.** A change under `node_modules/` that
   docdog imports is outside both signals.
3. **npx-cached servers cannot be seen at all.** `npx -y
   @yasnikoff/docdog serve` runs from the npx cache; publishing a new
   version changes nothing on that machine, so no local signal exists.
   Detecting it means asking the registry, and a `status` that phones
   home is worse than the problem. Out of scope — and in proportion,
   since nobody expects a running process to track a registry.

## What it must never grow into

No `docdog_restart`, no self-reexec, no refusing calls while stale.
Process lifecycle belongs to the host that spawned the server — the same
boundary PROPOSAL-035 drew when it refused docdog's writes rather than
the filesystem's, on the grounds that sandboxing is the host's job.

## Cost

No schema bump, no config key, no cache change, kernel 8 untouched. Two
fields threaded from `startMcpServer` through `StatusOptions`, one
function in `tools/status.ts`, ~40 lines. Tests: current, stale-by-mtime,
stale-by-version, and one asserting the CLI's `status` output is
unchanged.
