---
id: PROPOSAL-042
title: "The upgrade path — pin the server spec docdog writes, put the only socket in `update`, and let `status` report a verdict it never went to fetch"
collection: notes
status: shipped
date: 2026-08-25
description: "docdog can bring an adopting repo up to the docdog it has (PROPOSAL-041) and cannot help the adopter get that docdog in the first place. Two defects and three absences: the .mcp.json spec docdog itself writes is unpinned, so npx resolves once and caches a self-satisfying caret range that may never re-resolve (FRICTION-044); nothing anywhere reports that a newer version exists; the printed upgrade command cannot be right because docdog never asks how it was installed; and there is no CHANGELOG. Adds a version pin to MCP_SERVER_ENTRY that `docdog update` bumps through the existing seed-manifest comparison, an explicit `docdog update --check` that is the only code path allowed to open a socket, a cached verdict that `docdog status` reports with its age, and install-shape detection from import.meta.url. No background check, no auto-upgrade, and nothing about the user in the request."
severity: n/a
relationships:
  - references: DISC-039
    context: "the discussion that decided all four questions this implements: explicit-only check, pinned spec, per-report consent for the other half, fix-before-publish"
  - references: FRICTION-044
    context: "the defect this exists to fix — the unpinned npx spec docdog writes into every adopter, and the npm link that hides it from the maintainer"
  - references: PROPOSAL-041
    context: "the machinery this reuses whole: .mcp.json#mcpServers.docdog is already a seed item keyed by the hash of the shipped entry, so a pinned spec upgrades through the existing add/update/report outcomes with no new judgment"
  - references: PROPOSAL-037
    context: "its Limits §3 declared registry detection out of scope for status; this keeps that by moving the socket to update and giving status only a cached verdict to read, and the two reports share one Server block"
  - references: FRICTION-018
    context: "the network-restricted sandbox that forbids putting the check anywhere in the index path; every failure mode here is degrade-and-continue for the same reason"
  - references: DP-001
    context: "tier 1 throughout — one GET, two version strings compared, one path inspected — and the tier 3 line it must not cross is installing anything on the user's behalf"
  - references: DP-003
    context: "clause 3's bar, met: the upgrade command has been hand-derived per install shape in conversation, and the version gap was found by hand-running npm view against package.json"
  - references: DD-071
    context: "the publication boundary this release runs through; the npm/origin version gap it left is the observation that opened the thread"
  - references: PROPOSAL-035
    context: "the boundary restated — docdog reports and refuses, the host acts; there is no self-update for the same reason there is no docdog_restart"
---

# PROPOSAL-042: the upgrade path

## Motivation

PROPOSAL-041 solved the last leg of upgrading and none of the others. It
brings an adopting repo up to *the docdog it has* — which presupposes
that the new docdog arrived, by some route docdog itself neither writes
nor observes.

Five legs, and the state before this proposal:

| Leg | Today |
|---|---|
| Know a new version exists | nothing |
| Get it | ambiguous, and possibly impossible — FRICTION-044 |
| Bring the repo up to it | `docdog update` |
| Notice the running server is stale | PROPOSAL-037, unshipped |
| Know what changed | no CHANGELOG |

The one that finished is the one that lives entirely inside the repo,
where docdog already has authority. Every other leg crosses a boundary
docdog does not own — the registry, the package manager, the host's
process lifecycle — and the design below is mostly about crossing them
as little as possible.

## 1. Pin the spec docdog writes

`MCP_SERVER_ENTRY` (`src/engine/seed-set.ts:64`) becomes:

```ts
args: ["-y", `@yasnikoff/docdog@${docdogVersion()}`, "serve"],
```

Three properties, in order of importance:

- **It defeats the npx cache by construction.** npx keys its cache on
  the package spec, so a changed spec is a different cache entry.
  Whatever npx does or does not re-resolve — FRICTION-044 leaves that
  genuinely open — a pinned spec cannot serve the wrong version.
- **The upgrade becomes a reviewable one-line diff** in a tracked file,
  which is the posture of every other docdog write.
- **It is offline-deterministic.** The spec names exactly one tarball,
  and once the cache holds it, the server boots with no network at all.

**The bump costs no new machinery.** `init` already records the seed as
`.mcp.json#mcpServers.docdog` (`src/cli/commands/init.ts:134`) — a
*sub-document* seed item, hashed with `stableJson`, so docdog owns its
own entry inside a `.mcp.json` that may hold a dozen other servers.
Change the shipped bytes and PROPOSAL-041's four outcomes already apply:
absent → add, byte-identical to what docdog wrote → update the pin,
edited → report and leave alone, unknown → orphan. A user who pinned it
themselves, or pointed it at a checkout, is reported rather than
overwritten, which is exactly right.

**`@latest` was considered and rejected.** It re-opens the cache
question rather than closing it, and it puts a version resolution on
every server boot — a network call in the startup path of a tool that
must work offline.

## 2. `docdog update --check` — the only socket

```
docdog update --check     # ask the registry, cache the answer, write nothing else
docdog update             # do the file work; ask as well, unless --no-check
```

The request is `GET <registry>/@yasnikoff/docdog/latest`, unauthenticated.
`<registry>` honours `npm_config_registry` when set, so a proxied or
mirrored install asks its own mirror; otherwise `registry.npmjs.org`.

**The request must carry nothing about the user.** No installed version
as a query parameter, no machine identifier, no custom user-agent
describing the corpus. This is not a stylistic preference: the moment
the request describes the sender it stops being a lookup and becomes a
telemetry beacon, and the consent bar that DISC-039 established — a
check is default-on precisely *because* it transmits nothing — no longer
holds. The asymmetry is load-bearing and this is where it is enforced.

**Every failure is degrade-and-continue.** Offline, DNS failure, 404,
timeout (3s), malformed JSON: report one line, exit 0, and let `update`
finish its file work. Nothing about the check may fail a command.
FRICTION-018 is the standing reminder that a network-restricted
environment is a real environment.

The verdict is written to `.docdog/cache/update-check.json`:

```json
{ "checked_at": "2026-08-25T09:14:03Z",
  "installed": "0.4.0",
  "latest": "0.4.1",
  "registry": "https://registry.npmjs.org" }
```

Under `.docdog/cache/` because it is disposable in the exact sense
DD-070 §2 means: losing it costs one re-check.

## 3. `status` reports it and never fetches it

One line inside PROPOSAL-037's `Server` block — the same block, because
"how old is this thing" is one question with two horizons, the process's
and the package's:

```
**Update:** 0.4.1 available (you are on 0.4.0) — checked 3d ago.
**Update:** current as of 3d ago.
**Update:** never checked — run "docdog update --check".
```

`status` opens no socket on any path. That is what preserves
PROPOSAL-037's refusal:

> *"Detecting it means asking the registry, and a `status` that phones
> home is worse than the problem."*

It stays true. The socket moved to the command whose entire job is
upgrading; `status` reads a file.

**Who triggers the check, then?** The agent. The seeded skill carries
the policy — *if the cached verdict is missing or older than a week, run
`docdog update --check`* — which is a judgment about when interruption
is worth it, and therefore DP-001 tier 3, and therefore not code. The
side effect is that docdog has zero background network by construction
rather than by configuration.

## 4. Install-shape detection

The upgrade command depends on how docdog got there, and docdog can read
that off `import.meta.url` — the module actually loaded, not
`process.argv[1]`, which the host controls:

| Path contains | Shape | What to print |
|---|---|---|
| `/_npx/` | npx cache | pin the spec in `.mcp.json`; `docdog update` bumps it |
| the global prefix | global install | `npm i -g @yasnikoff/docdog@latest` |
| `<project>/node_modules/` | project dependency | `npm i -D @yasnikoff/docdog@latest` |
| neither | source or `npm link` | you are the maintainer; nothing to do |

Pure path inspection, tier 1. Its honest limit is the last row: `npm
link` and a source checkout are indistinguishable from each other, and
that is precisely the configuration that hid FRICTION-044 — so the row
says so rather than guessing.

## 5. CHANGELOG

`CHANGELOG.md` at the root, and **added to `files:` in package.json** —
npm's always-included set is package.json, README and LICENSE, so a
changelog ships only if it is named. Without it `--check` can report
that something changed and never what, which is the difference between
a prompt and a nag.

One section per version, and the section leads with whether the upgrade
needs an action (`docdog update`, a reindex, a server restart) rather
than with the feature list. That ordering is the whole point: the reader
is mid-upgrade, not shopping.

## Principles

- **DP-001 — tier 1, with the tier 3 line drawn at installation.** One
  GET, two semver strings compared, one path inspected, one JSON file
  written. What it must never do is *act*: no self-update, no `npm
  install` on the user's behalf, no rewriting a pin the user edited, no
  refusing to run while behind. PROPOSAL-035 drew this boundary for
  writes and PROPOSAL-037 for process lifecycle; this is the third
  instantiation, and the reason is the same each time — the host owns
  its own machine.
- **DP-002 — untouched.** No vocabulary, no collections, no meaning.
- **DP-003 — clause 3, met.** The upgrade command has been derived by
  hand per install shape in conversation, and the version gap that
  opened DISC-039 was found by hand-running `npm view` against
  `package.json`. That is the escape hatch being used for mechanics.

## Limits, stated rather than discovered

1. **The check answers "what is on the dist-tag", not "is your version
   still supported".** Yanked versions, deprecations and security
   advisories are outside it. `npm audit` exists and is the user's tool.
2. **A pinned spec goes stale in a repo nobody upgrades.** That is the
   trade accepted: a stale pin that works beats an unpinned spec that
   may silently serve a version nobody chose. The cached verdict is what
   makes the staleness visible.
3. **`--check` cannot see a private mirror's tag policy.** It reads
   whatever `latest` means on the configured registry, which on a mirror
   may lag by design.
4. **Nothing here detects a *downgrade*** — an adopter pinned to 0.3.0
   while 0.4.0 is installed globally is a version disagreement the
   report will describe but not adjudicate.

## Cost

No schema bump, no cache-format change, no config key, kernel 8
untouched. `MCP_SERVER_ENTRY` gains a template string; `update` gains a
flag, a fetch and a JSON write; `status` gains a line it reads from
disk; one new module for the registry call and the shape detection.
Tests: pin written at init, pin bumped by update when untouched, pin
reported when edited, check offline degrades to exit 0, cached verdict
rendered in all three states, and each install shape resolved from a
synthetic path.

## Shipped (2026-08-25)

All five parts, with four things the design did not settle:

1. **`--offline`, not `--no-check`.** Declaring both `--check` and
   `--no-check` on one commander command makes `check` default to *true*,
   which destroys the "check and stop" meaning `--check` was given here. The
   suppressing flag is named for what it guarantees instead of for the flag it
   negates, which is the better name anyway.
2. **The Update line is on the CLI's `docdog status` too**, not only inside
   PROPOSAL-037's Server block. The Server block is MCP-only because a fresh
   CLI process cannot be stale — but the registry verdict is a property of the
   *installation*, not of a session, so PROPOSAL-032's parity rule applies to
   it. Confining it to MCP would have hidden it from the surface that can act
   on it.
3. **`--dry-run` performs no check.** The cached verdict is a write, and a dry
   run writes nothing. It renders whatever was already cached.
4. **`installShape` reports "global" for any `node_modules/` that is not the
   project's own** — a global prefix, a workspace root, a parent directory's
   install. They upgrade identically, so splitting them would be a distinction
   with no different advice behind it.

The pin cost exactly what §1 predicted: `MCP_SERVER_ENTRY` became
`mcpServerEntry(version)` and nothing else changed, because
`.mcp.json#mcpServers.docdog` was already a hashed sub-document seed.

Tests: 24 for the upgrade module (the request describes nothing about its
sender; offline / 404 / no-version / malformed JSON each resolve rather than
throw; the shape table; the four report states) plus two pinning the shipped
MCP entry. Suite 533 → 559.

Not built, and still must not be: any form of self-update. `docdog` names the
command; the host runs it.
