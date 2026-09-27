---
id: PROPOSAL-019
title: "Injectable skills — minimal-footprint integration pattern"
collection: proposals
status: shipped
date: 2026-04-13
related:
  - DP-001
  - PROPOSAL-015
  - PROPOSAL-018
relationships:
  - sourced_from: "orchestrator sidecar planning"
    context: "the first concrete consumer is a `/specs` navigation skill injected into the host-project orchestrator repo, which must not take docdog as an npm dependency"
  - references: DP-001
    context: "skill generation is pure aggregation over the indexed corpus — no inference, no defaults, literal dispatch"
  - references: PROPOSAL-015
    context: "extends the templates subsystem with a new `injectable-skills` category semantically distinct from the existing docdog-operation skills under templates/skills/"
  - references: PROPOSAL-018
    context: "skill install is deliberately NOT a workflow — it is a one-shot command, not a runnable artifact, because the output is a static file emitted once and owned by the target repo"
  - references: DD-070
    context: the v3 kernel CLI this shipped into — `docdog skill install` (§4) emits the injectable skill set
  - references: PROPOSAL-020
    context: the factoring the shipped skill set actually followed — navigate-specs plus specs, minus the `/backport` skill
description: "SHIPPED in v3 — docdog skill install emits the injectable skills (DD-070 §4); the shipped set and on-disk layout have since changed, see the body's status notes. Original pitch: define the smallest possible integration mode for docdog: a one-shot `docdog skill install <name>` command that emits a standalone skill file (plus a generated index file) into a target repository, with zero runtime dependency on docdog. The skill teaches an agent how to navigate the target repo's specs both WITH and WITHOUT docdog present — the non-docdog path (grep + id conventions) is the first-class instruction, the docdog/MCP path is an enhancement layered on top. First and only supported skill name in this proposal is `specs`; the subcommand is shaped as an extension point so future injectable skills (`/tasks`, `/decisions`, etc.) can land one at a time. Id-prefix discovery is empirical from the indexed corpus — no schema primitive required, no dependency on a future `id_pattern` field on dd_collection_meta."
---

# PROPOSAL-019: Injectable skills

**Status note (2026-07-11, FEATURE-002):** shipped — `docdog skill
install` exists in the v3 CLI (DD-070 §4) and emits the injectable
skill set (`navigate-specs`, `specs`), following PROPOSAL-020's
factoring minus `/backport` (which died with PROPOSAL-021's
sync/export premise). The Arango-era integration modes described
below are historical.

**Status note (2026-09-27, OBS-029):** the output shape in §2 is historical
too.
- A skill installs as a directory, `<target>/docdog-<name>/SKILL.md`,
  because a flat `specs.md` is discovered by nothing (FRICTION-040).
- The generated flat index file is gone (FRICTION-043).
- `navigate-specs` was folded into `specs` (PROPOSAL-044).
- The output is no longer "emitted once and owned by the target repo":
  `docdog init` writes the injectable skills, and `docdog update` keeps an
  unedited one current and reports an edited one (PROPOSAL-041, PROPOSAL-044).
- `skill install` remains, for re-emitting one skill or writing to a
  non-default `--target`.

## Motivation

docdog has two integration modes today: **full install** (a `.docdog/`
directory, `.mcp.json`, Arango at runtime) and **MCP-only** (`.mcp.json`
+ a running `docdog serve`). Both require docdog to be *present* for
the host repo to get value. For projects that cannot take docdog as a
dependency — whether for organizational, tooling, or
opt-in-reversibility reasons — neither mode fits.

The orchestrator sidecar planning surfaced a third, smaller mode:
**docdog writes a one-time teaching artifact into the target repo and
leaves**. The artifact is a skill file under the repo's Claude-skills
directory (`.claude/skills/` by convention). It describes how agents
should navigate the repo's spec corpus, using grep and file conventions
as the primary path and docdog's MCP tools as an optional enhancement
if present. The artifact is standalone markdown — an agent that has
never heard of docdog reads it and gets oriented.

This is the smallest integration mode possible. The target repo sees
a two-file diff and zero runtime changes.

| Mode | Footprint in host repo |
|---|---|
| Full install | `.docdog/`, `.mcp.json`, CLAUDE.md edits, Arango dependency at runtime |
| MCP-only | `.mcp.json` + running `docdog serve` |
| **Skill install** (this proposal) | **One outer skill file + one generated index file, zero runtime** |

The integration is also self-adjusting: docdog inspected a real
corpus, extracted its id prefixes and file conventions empirically,
and wrote those findings into the skill. The skill file is a *report*
from docdog's indexer rendered as agent instructions.

## Specification

### 1. Command

```
docdog skill install <name> [--target <dir>] [--force] [--dry-run]
```

- `<name>` — one of the registered injectable skills. First and only
  name in this proposal: `specs`. Unregistered name → hard error
  listing valid names.
- `--target <dir>` — target directory for the skill files. **Must be
  relative to CWD.** Absolute paths are rejected to prevent accidental
  writes outside the caller's project. Default: `.claude/skills/`.
- `--force` — overwrite an existing outer skill file. Without it, the
  command refuses to clobber. The index file is always regenerated
  (idempotent by design); only the outer skill needs `--force`.
- `--dry-run` — print the target paths and a summary of what would
  be written, exit 0. No disk writes.

The subcommand lives in `src/cli/commands/skill.ts` and registers
one verb (`install`) in this proposal. Future verbs (`update`,
`uninstall`, `list`) are explicitly out of scope.

### 2. Output shape — the `specs` skill

Two files, both markdown:

- **`<target>/specs.md`** — the outer skill. Hand-authored template
  in `templates/injectable-skills/specs.md`, rendered at install time
  with a handful of substitutions. Describes, in order:
  1. What the file is (an agent navigation guide).
  2. The non-docdog path: grep patterns per id prefix, file
     conventions (where each prefix lives, directory layout),
     how to find cross-references.
  3. The docdog-enhanced path: if `docdog_search` / `docdog_get` /
     `docdog_traverse` MCP tools are available, use them instead for
     richer results. Enumerates exact MCP calls.
  4. A pointer to the companion index file for id-to-file lookups.
- **`<target>/specs.index.md`** — a generated flat alphabetical
  index. One entry per indexed vertex with a recognizable id, in the
  shape `{id} | {collection} | {path} | {one-line summary}`. No
  grouping, no headers — the file is not meant for humans, it is a
  lookup table agents consult when grep is too broad.

The two-file split keeps the regeneration story clean: `skill install
specs` without `--force` always regenerates the index and leaves the
outer skill alone. Re-running after a `docdog index` refreshes the
index without touching the authored instructions.

### 3. Template substitutions

The outer skill template uses a minimal, literal substitution set.
No conditional logic, no loops — every substitution is a string
replacement in a pre-declared list.

| Placeholder | Replaced with |
|---|---|
| `{{id_prefixes}}` | Newline-delimited list of `- <prefix> — found in: <collection>` lines, one per discovered prefix. |
| `{{file_conventions}}` | Newline-delimited `- <collection>/ — <path pattern>` lines derived from `scan_paths`. |
| `{{index_path}}` | The relative path to the companion index file (e.g. `./specs.index.md`). |
| `{{generated_at}}` | ISO timestamp when the skill was generated. |
| `{{docdog_version}}` | docdog package.json version at install time. |

Unknown placeholders in the template are a build-time error; unused
substitutions emit a warning. No string interpolation beyond literal
replacement.

### 4. Id-prefix discovery

Empirical, no schema dependency. On `skill install`, docdog:

1. Loads the project config and ensures the corpus is indexed (runs
   `docdog index` iff `--reindex` is passed, otherwise trusts the
   existing state and warns if the vertex count is zero).
2. Queries Arango for all vertices with a non-null `id` field,
   grouped by collection.
3. For each collection, extracts id prefixes via a single literal
   rule: **everything up to the last hyphen-number group**. For
   `FR-PROV-06`, the prefix is `FR-PROV-`. For `DD-ARCH-01`, `DD-ARCH-`.
   For `DP-01`, `DP-`. For `TASK-052`, `TASK-`.
4. Deduplicates per collection and sorts alphabetically.
5. Renders the prefix list into the `{{id_prefixes}}` substitution.

This rule is tier-1 literal mechanics per DP-001. No regex inference,
no "best-match" matching, no fallback vocabulary. If a vertex id
doesn't match the `^[A-Z][A-Z0-9-]*\d+$` shape, it is excluded from
prefix discovery entirely (the vertex still appears in the index
file if it has any id at all). The skill template explicitly names
this behavior so agents know to cross-check via grep when a prefix
seems unusual.

### 5. Template location

New directory `templates/injectable-skills/` at the repo root, sibling
to the existing `templates/skills/`. The two directories have
distinct semantics:

- `templates/skills/` — **docdog-operation skills** (the existing
  `_common/search.md`, `_common/index.md`, `workflows/task-frontmatter.md`,
  etc.). Teach an agent **how to use docdog itself** on a project
  where docdog is installed. Shipped as part of `docdog init`.
- `templates/injectable-skills/` — **standalone skills** emitted into
  a target repo that may not have docdog installed. Teach an agent
  **how to navigate a repo's content** with docdog as an optional
  enhancement. Shipped by `docdog skill install`.

Keeping them in separate directories makes the distinction visible
to contributors and prevents accidentally shipping a docdog-operation
skill via `skill install` or vice versa.

### 6. Index file format

Flat alphabetical, one line per vertex with an id. Not for human
reading — for agent lookup. Plain markdown, no frontmatter, no
headers, no table syntax (table syntax adds visual ceremony that
agents have to parse):

```
BACKPORT-039 | notes | specs/backports/backport-039-title-slug.md | One-line summary from description or first sentence
BACKPORT-040 | notes | specs/backports/backport-040-title-slug.md | ...
DD-ARCH-01 | decisions | specs/architecture/dd-arch-01-core-abstraction.md | ...
DP-01 | principles | specs/principles/dp-01-core-abstraction.md | ...
FR-PROV-01 | requirements | specs/requirements/fr-prov-01-automated-server-creation.md | ...
...
TASK-052 | tasks | tasks/TASK-052/ | ...
```

Summary source priority: `frontmatter.description` first, otherwise
the first non-empty sentence of the vertex body, truncated to 120
chars. Vertices with neither get an empty summary column.

Sort order: ASCII-literal by id. No collection-aware grouping, no
prefix priority. Predictable > pretty for an agent lookup table.

### 7. DP-001 compliance walkthrough

Every mechanic in this proposal against DP-001's three tiers:

| Operation | Tier 1 (pure mechanics) | Tier 2 (defaults + override) | Tier 3 (inference) |
|---|---|---|---|
| Command arg parsing | ✅ | — | — |
| Template placeholder substitution | ✅ literal string replace | — | — |
| Id prefix extraction | ✅ single literal rule | — | — |
| Index sort | ✅ ASCII literal | — | — |
| Outer skill clobber protection | — | ✅ `--force` override | — |
| Target directory | ✅ relative-to-CWD rejection of absolute paths | — | — |
| Summary source selection | ✅ literal priority list (frontmatter → first sentence → empty) | — | — |

No tier-2 defaults for anything but the clobber safety (which is a
safety rail, not a behavioral default). No tier-3 inference anywhere.
If the indexed corpus doesn't have id'd vertices, the index file is
simply empty — the generator doesn't invent prefixes, doesn't pick
a template, doesn't guess.

### 8. Estimated effort

**Core:**
- `src/cli/commands/skill.ts` — new subcommand tree (~120 LOC)
- `src/engine/skill-install.ts` — discovery + rendering library
  (~180 LOC)
- Registration in `src/cli/index.ts` (~5 LOC)

**Template:**
- `templates/injectable-skills/specs.md` — hand-authored outer skill
  with `{{...}}` placeholders (~100 lines of prose)
- `templates/injectable-skills/README.md` — one paragraph explaining
  the directory's semantic and how to add a new injectable skill
  (~20 lines)

**Tests:**
- `tests/unit/skill-install.test.ts` — render fixture, substitution
  coverage, prefix discovery rule, summary priority, relative-path
  rejection (~200 LOC)
- `tests/integration/skill-install.test.ts` — end-to-end against real
  Arango: seed a fixture corpus with three id shapes, run
  `skillInstall`, assert both files exist with expected content
  (~150 LOC)

**Total:** ~475 LOC core + ~350 LOC tests. Small. One commit.

### 9. Not in scope

- **Other injectable skills.** `tasks`, `decisions`, `traverse`,
  `graph` — all interesting, all deferred. The subcommand shape
  accepts a name registry so adding one is a one-file change.
- **`id_pattern` field on `dd_collection_meta`.** The empirical
  discovery rule in §4 intentionally sidesteps this. When typo
  detection or pattern validation becomes a felt need, that's a
  separate proposal. Until then, empirical > schema.
- **Auto-regeneration on `docdog index`.** The install step and
  the index step are deliberately separate. An agent-visible
  change to the generated skill file should pass through git review,
  not happen silently during a routine reindex.
- **Runtime update of the target repo's `CLAUDE.md`.** The injected
  skill is discoverable via its filename under `.claude/skills/`;
  forcing a CLAUDE.md edit would cross into full-install footprint
  territory.
- **Task README generation.** Different shape (per-task, not
  per-corpus), different workflow (uses PROPOSAL-018 primitives),
  different write surface (`tasks/TASK-NNN/README.md`, not
  `.claude/skills/`). Captured as a separate follow-up proposal;
  this proposal is strictly about the navigation skill.
- **Removing an injected skill.** No `skill uninstall`. Deleting two
  files from the target repo is a two-line `rm`, not worth a
  subcommand.

### 10. Implementation order

One commit. The slug fix landed in `0a58f71` was the only prerequisite.

1. Create `src/engine/skill-install.ts` with the discovery + rendering
   library and its unit tests.
2. Create `templates/injectable-skills/specs.md` with placeholder
   substitutions.
3. Create `src/cli/commands/skill.ts` wiring the CLI, register in
   `src/cli/index.ts`.
4. Add integration test seeding a fixture corpus and running end-to-end.
5. Run `npm test` + `npm run build` + `docdog skill install specs
   --dry-run` as a self-smoke-test (docdog self-host has id'd
   vertices — it is a valid target).

**Not** splitting into multiple commits. The proposal is small,
everything is pinned, there are no intermediate reviewable states
that add value. One commit lands the whole pattern and the first
concrete consumer at once.

## Status

Proposed. No open design questions — every decision pinned during
the orchestrator-sidecar planning thread. Ready for implementation
once the user signs off on scope.
