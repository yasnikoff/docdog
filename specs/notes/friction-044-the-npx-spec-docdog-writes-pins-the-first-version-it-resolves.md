---
id: FRICTION-044
title: "npx does not strand an adopter on a cached version — the founding evidence was an entry nobody had re-run, and the maintainer's machine could observe the adopter's path all along"
collection: notes
status: resolved
fixed_date: 2026-08-30
resolution_approach: fix
description: "Filed on the claim that an unpinned npx spec can serve one version forever. Measured on docdog's own published package under npm 11.8.0: npx re-resolves every run and upgrades the entry, reproducibly and even offline. The cited stale entry was last written one day before the next release existed. The pin (PROPOSAL-042) stays, on determinism rather than rescue."
severity: blocks-work
relationships:
  - references: DISC-039
    context: "the thread that found it while designing the upgrade story, and the decision it produced"
  - references: PROPOSAL-042
    context: "the fix — pin the spec docdog writes, so the version served is never whatever npx happens to have cached"
  - references: FRICTION-017
    context: "the same failure at the acquisition stage: an adopter unable to obtain docdog from the source docdog advertises; this is the upgrade-stage instance"
  - references: PROPOSAL-041
    context: "the command whose promise this defeats — update brings the repo up to the installed docdog, which is worth nothing if the installed docdog can never change"
  - references: OBS-015
    context: "the earlier record of the same blind spot, from the other side: the orchestrator crossed a schema bump nobody chose to install because global docdog is an npm link, so upgrade behaviour has never been observed honestly here"
  - references: OBS-019
    context: "the same error one domain over, and the one this record should have been checked against — a static snapshot cannot distinguish two causes, so measure the mechanism rather than inferring it from the artefact"
---

# The npx spec docdog writes can pin the first version it resolves

**Status of the claim, up front.** The mechanism is measured. Docdog's
own instance of it is *not* confirmed, and the confirming experiment
cannot be run on this machine. Filed at `blocks-work` because if it does
hold, an adopter can never receive a fix, and because the fix
(PROPOSAL-042) is cheap enough that waiting for proof is the more
expensive option.

## What I was trying to do

Design the upgrade story for a second user on another machine
(DISC-039): establish how they learn a new version exists and how they
get it. The first question was the simplest one — *when docdog publishes
0.4.0, what does an existing adopter's MCP server run tomorrow?*

## What went wrong

`docdog init` writes this into `.mcp.json`
(`src/engine/seed-set.ts:64`):

```json
{ "type": "stdio", "command": "npx", "args": ["-y", "@yasnikoff/docdog", "serve"] }
```

npx caches per package spec under `_npx/<hash>/` and writes the
**resolved** version into that directory's `package.json` as a caret
range. The range is therefore satisfied by the very version that
produced it, and the entry has no reason to re-resolve. Read out of this
machine's npx cache:

```
@mermaid-js/mermaid-cli   range ^11.12.0   installed 11.12.0   registry 11.16.0
```

Four minor versions behind, with no mechanism anywhere to notice.

Docdog's case may differ: on 0.x a caret is tighter, so `^0.2.1` excludes
`0.3.0` and a minor bump might force a re-resolve where mermaid's never
had to. That is exactly the uncertainty worth removing before publishing
— and it is the uncertainty the second fault prevents removing.

## The second fault: the maintainer cannot see it

Attempted twice:

```
$ npx -y @yasnikoff/docdog --version
0.3.0                                      # from file:E:/projects/docdog
```

npx prefers an existing global install, and this repo is `npm link`ed
per CONTRIBUTING's dev loop. Running from a directory outside the repo
changed nothing — the link is global. So the distribution surface docdog
writes into every adopter's `.mcp.json` is, on the machine where docdog
is developed, **structurally unobservable**: every probe answers with the
working tree.

That is the "works here" trap in its purest form, and it is a second
instance of the blind spot OBS-015 already recorded from the other
direction — the orchestrator crossed a schema bump nobody chose to
install, precisely because global docdog is a link rather than an
install.

## Workaround

None applied yet. For an adopter already stranded, the manual escape is
`npx clear-npx-cache`, deleting the `_npx/<hash>` directory, or editing
`.mcp.json` to name a version — all of which require knowing the problem
exists, which is the part that is missing.

## What should change in docdog

1. **Pin the spec docdog writes** — PROPOSAL-042 §1. A changed spec
   string is a different npx cache entry, so a pinned version cannot
   serve the wrong one regardless of how npx resolves. It costs no new
   machinery: `.mcp.json#mcpServers.docdog` is already a seed item
   hashed by `stableJson`, so `docdog update` bumps an untouched pin and
   reports an edited one through PROPOSAL-041's existing outcomes.
2. **Run the experiment on a machine without the link** — the second
   user's, or a container — and record the answer. It decides whether
   the pin is a convenience or the only thing that works, and it is two
   commands.
3. **Treat "the maintainer's machine cannot observe the adopter's
   path" as the standing hazard it is.** It has now produced two
   records; the pattern is that anything mediated by `npm link` needs an
   external witness, not a local check.

## Status note (2026-08-25, PROPOSAL-042 shipped in 1b72c81)

**Item 1 shipped.** `docdog init` writes
`npx -y @yasnikoff/docdog@<version> serve`, `docdog update` bumps an
untouched pin through PROPOSAL-041's existing outcomes and reports an
edited one, and `init` now names the version it pinned — plus, when the
pinning copy is a source checkout, that the version may never have been
published (which is the pin's one regression, and the only case where
the old unpinned spec would have started something).

**This record stays open on items 2 and 3, which the fix does not
touch.** The pin is sound whatever npx does, because a changed spec
string is a different cache entry — that is an argument, not a
measurement. What is still unmeasured is the original claim: whether
docdog's own `0.x` caret can strand an adopter on a version npx already
cached. It decides nothing about the pin and everything about how
urgently existing adopters must run `docdog update`, and it remains two
commands on a machine without the link.

Closing this on item 1 alone would record the unobservable half as
answered, which is the specific error item 3 exists to name.

## Resolution (2026-08-30) — items 2 and 3, measured

**The claim does not reproduce, the founding evidence was misread, and
the machine could see it the whole time.** Every number below is from
this machine, npm **11.8.0**, Windows.

### The experiment was runnable here after all

Item 3 said the adopter's path is *structurally unobservable* because
`npm link` shadows registry resolution. It is not structural. It is two
environment variables:

```
npm_config_cache=<tmp>/cache  npm_config_prefix=<tmp>/prefix  npx -y @yasnikoff/docdog --version
```

An isolated prefix hides the global link; an isolated cache gives a
clean `_npx/`. The probe then reaches the registry like anyone else's.
The default probe was shadowed; the machine was not.

**The record was right that a local check was not enough, and wrong
about why.** "Cannot be observed" and "was not observed" are different
findings, and only the second one was true.

### The probe this record specified would have lied

Run in isolation, `npx -y @yasnikoff/docdog --version` prints **0.2.0**
while the package it installed is **0.2.1**:

```
node_modules/@yasnikoff/docdog/package.json   0.2.1
--version                                     0.2.0
dist/cli/index.js                             version("0.2.0")   ← hardcoded
```

The published 0.2.1 hardcodes its version string; the working tree reads
it from `package.json` (`.version(version)`), which is why the bug is
invisible here. So item 2's two commands would have shown an adopter
apparently stuck one version back, and confirmed this record's
hypothesis **spuriously**. The reliable probe is the installed
`package.json`, never `--version` — for any tool that might have this
bug, which you cannot know in advance.

### npx re-resolves every run

Reconstructed the exact state an adopter holds the day after a release —
same unpinned spec hash, range `^0.2.0`, 0.2.0 installed, registry at
0.2.1 — and ran it:

| | range | installed |
|---|---|---|
| before | `^0.2.0` | 0.2.0 |
| after one run | `^0.2.1` | **0.2.1** |

Reproduced three times, including under `npm_config_offline=true`. The
range `^0.2.0` was satisfied by what was installed and npx upgraded
anyway.

**The caret range this record points at is not the decision input.**
npx resolves the *spec* recorded in `_npx.packages`; for an unpinned
spec that is the `latest` tag, resolved fresh. The `dependencies` range
is just what `npm install --save` writes, and reading it as the reuse
predicate is the misreading the whole record was built on.

### The cited evidence was disuse, not stranding

```
_npx/668c188756b835f3/package.json   last written  2026-04-28T04:54:34Z
@mermaid-js/mermaid-cli 11.14.0          published  2026-04-29T20:03:10Z
@mermaid-js/mermaid-cli 11.16.0          published  2026-06-29T17:08:27Z
```

The entry was last written **one day before any newer version existed**.
Nothing prevented it from re-resolving; nobody ran it. A neighbouring
entry run three days ago is current.

Four minors behind with no mechanism to notice was the observation. The
mechanism inferred from it was never tested, and a static snapshot
cannot distinguish *would not update* from *was not run* — the same
error OBS-019 names one domain over, where a rank drop had two causes
and rank data could not say which.

### What survives: the pin, on a different argument

PROPOSAL-042 stays, and its mechanism is confirmed — a pinned spec keys
a **separate** cache directory:

```
328c96e2caf1886e   spec ["@yasnikoff/docdog"]          ^0.2.1
46f2fd422453773e   spec ["@yasnikoff/docdog@0.2.0"]    ^0.2.0
```

But the reason has to change, and the change has a cost this record
never named. Unpinned npx was **auto-upgrading**: every `serve` start
rode whatever `latest` was that morning. Pinning trades that for a
version the repo names and `docdog update` bumps.

That is still the right trade — an MCP server changing under a running
project is worse than one that changes when you ask — but it is a trade,
not a rescue. "A pin cannot serve the wrong one whatever npx does" is
true and was answering a threat that is not there.

### Severity, in hindsight

`blocks-work` was wrong, and the reasoning that produced it is worth
keeping: *the fix is cheap enough that waiting for proof is the more
expensive option.* That is sound for deciding whether to **build**, and
it silently became the grounds for a **severity** — which is a claim
about the world, not about the cost of acting. The pin should have
shipped at `inconvenient` on exactly the same argument.

### The rule to carry

**A cache entry that looks stale may simply be unrun. Check the mtime
against the release date before inferring a mechanism.** It cost one
`statSync` and one `npm view`, and it would have prevented this record.
