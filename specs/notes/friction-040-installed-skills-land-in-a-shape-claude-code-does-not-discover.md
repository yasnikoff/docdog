---
id: FRICTION-040
title: "skill install writes a flat .md into .claude/skills/, which discovers nothing"
collection: notes
status: resolved
fixed_date: 2026-07-30
resolution_approach: fix
fix_commit: 643fe2c
description: "docdog skill install's default target and filename produce <name>.md directly in .claude/skills/, but a skill is <name>/SKILL.md — the installed file registers as nothing."
severity: inconvenient
---

# Installed skills land in a shape Claude Code does not discover

## What I was trying to do

Answer whether docdog's skills should be namespaced with a `docdog-` prefix, to
keep `specs` from colliding with a host project's own skill of that name.

## What went wrong

The collision question turned out to be downstream of a plainer defect.

`docdog skill install <name>` defaults to `--target .claude/skills/`
(`src/cli/commands/skill.ts:18`) and writes the skill as a flat file:

```ts
const outerPath = join(resolvedTarget, `${name}.md`);
const indexPath = profile.hasIndex ? join(resolvedTarget, `${name}.index.md`) : "";
```

So `docdog skill install specs` produces `.claude/skills/specs.md` +
`.claude/skills/specs.index.md`. But a Claude Code skill is a **directory**
whose name is the skill name:

| Level | Path |
|---|---|
| Personal | `~/.claude/skills/<skill-name>/SKILL.md` |
| Project | `.claude/skills/<skill-name>/SKILL.md` |
| Plugin | `<plugin>/skills/<skill-name>/SKILL.md` → `<plugin>:<skill-name>` |

A bare `.md` sitting directly in `.claude/skills/` matches none of these. Bare
files are the `.claude/commands/` shape, which is a different directory. The
installed file is therefore discovered by nothing: it does not appear in
autocomplete, `/specs` does not invoke it, and Claude never loads it on its own.
It is still readable by path — which is how this repo's own
`.claude/skills/docdog.md` is used — but that is a file an agent is *told* to
read, not a skill.

Nothing errors. `skill install` reports success, the file is written, and the
failure is entirely silent — the same silent-success shape as the `scan_paths`
coverage gap that `docdog split --apply-plan` now reports unconditionally.

Confirmed against the local machine (`~/.claude/skills/playwright-cli/SKILL.md`,
with `references/` as supporting files) and the current docs at
https://code.claude.com/docs/en/skills.

## Workaround

Read the file by path, or move it by hand into `<name>/SKILL.md`.

## What should change in docdog

Two coupled facts, in this order:

**1. The layout.** If `.claude/skills/` is the default target, the emitted
shape has to be `<target>/<name>/SKILL.md`, with the companion index as a
sibling supporting file inside the same directory. `specs.md`'s cross-reference
to `./navigate-specs.md` becomes `../navigate-specs/SKILL.md` and must move with
it, or the two skills stop pointing at each other.

**2. The namespace, which comes free with the fix.** Because the directory name
*is* the skill name, prefixing is the only project-level disambiguation
available — `docdog-specs/`, `docdog-navigate-specs/`. It matters more than it
looks: **personal overrides project**, so an adopter with any
`~/.claude/skills/specs/` silently shadows the one docdog installed into their
repo, again with no error. `specs` is close to the worst available name for a
tool that installs into other people's repositories.

The rename is cheap *right now* and will not stay cheap. `skill install` has no
`update` or `uninstall` verb by design (PROPOSAL-019 scoped them out), so docdog
cannot rename a file it wrote into a host repo — normally a rename would orphan
every adopter's copy. That objection is currently void, because the installed
files are not functioning as skills anyway. Fixing the layout and the names in
one change costs nothing; fixing the layout first and the names later pays the
orphan twice.

## What is *not* being proposed here

- **Prefixing the seeded skills in `.docdog/skills/`.** Those are already
  namespaced by directory, by MCP URI (`docdog://skills/<file>`) and by record
  id (`default:.docdog/skills/ingest.md`); they never enter an agent's flat skill
  namespace, so a prefix buys nothing and changes record ids that the frozen
  eval set uses as gold (`tests/eval/report.md` q13, q30).
- **Shipping the injectable skills as a plugin.** Deferred deliberately; the
  reasoning is below so it is not re-derived when the evidence shows up.
- **Grouping directories.** `.claude/skills/docdog/specs.md` does not namespace
  anything; there is no grouping level inside a single `.claude/skills/`. The
  nesting the docs describe is *other* `.claude/skills/` directories deeper in
  the repo tree (`apps/web/.claude/skills/deploy/` → `apps/web:deploy`), which
  only load once Claude touches a file in that subtree.

## The plugin route, and why it is not this fix

A Claude Code **plugin** is a directory with a `.claude-plugin/plugin.json`
manifest that bundles skills (`skills/<name>/SKILL.md`), agents, hooks and — the
interesting part — an `.mcp.json`. Components are namespaced by the manifest
name, so the skill is `docdog:specs` and *cannot* collide at any level. Installed
at `project` scope it is declared in `.claude/settings.json`, checked in, and
reaches every collaborator on clone. A lighter form exists: a folder under
`.claude/skills/` containing `.claude-plugin/plugin.json` loads in place as
`<name>@skills-dir` with no marketplace and no install step — though at project
scope it loads only from the start directory's `.claude/skills/`, without the
walk up to the repo root that plain skills get.

Three reasons it is a separate question rather than a better answer to this one:

**Only half the surface fits.** `navigate-specs` is generic, evolves with docdog
itself, and is byte-identical in every repo — a distributed artifact in the
literal sense, and versioning it with a plugin beats making every adopter re-run
an install. `specs` cannot be one at all: its content is *generated per corpus*
by `discoverSpecs` reading the host's cache. A plugin ships static files and
there is no install-time hook that runs discovery against the host. So `specs`
stays a generated file written into the host repo regardless. The plugin
boundary lands exactly on PROPOSAL-020's factoring.

**A plugin is a docdog dependency, which is what injectable skills exist to
avoid.** DD-034/DD-035 ejection resilience is why `navigate-specs` is written to
be actionable with nothing but `rg` and `git`: remove docdog and the corpus stays
navigable. A file copied into the repo satisfies that by being an ordinary
checked-in file. A marketplace-installed plugin does not — it is machinery living
outside the repo, the coupling `.docdog/` was made the marker of. (An
`@skills-dir` plugin checked into the repo *does* survive, which is the strongest
point in that form's favor.)

**It is provider-specific.** `--target` takes any directory and CONTRIBUTING
calls these provider-neutral skill definitions. `<name>/SKILL.md` is the Agent
Skills open standard, so the layout fix above is portable;
`.claude-plugin/plugin.json` is not.

**When to write the proposal.** Its real prize is not namespacing — the prefix
already settles that — but collapsing adoption: `npx` wiring + `docdog init` +
`docdog skill install` becomes one install, because the plugin can carry the MCP
server config that `docdog init` currently hand-writes into the host's
`.mcp.json`. That is a claim about onboarding friction, and onboarding friction
is measurable and has not been measured. The trigger: an adopter tripping over
the MCP wiring, or `navigate-specs` going stale in a host repo because nobody
re-ran the install. External dogfooding is where that evidence comes from;
nothing in FRICTION-017..024 has asked for it yet.

## Principle check

Pure mechanics — a path shape and a fixed name prefix, no inference (DP-001
tier 1). `--target` stays as it is; the provider-specific part is the
`<name>/SKILL.md` layout, and that layout is the Agent Skills open standard
rather than a Claude Code invention, so it is less of a coupling than it looks.
