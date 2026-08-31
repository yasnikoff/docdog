---
id: DP-003
title: "Comprehensive toolbelt with escape hatch — direct DB access allowed, CLI expected to cover the common cases"
collection: principles
status: accepted
date: 2026-04-12
related: [DP-001, DP-002, FR-001, DISC-010]
relationships:
  - discussed_in: DISC-010
  - references: DP-001
    context: complementary — mechanical tools that cover the ground without making judgments
  - references: DP-002
  - references: FR-001
description: "Agents and developers may access docdog's underlying Arango database directly when the CLI and MCP surface don't yet cover a needed operation. In exchange, docdog commits to providing sufficient first-class tooling so that direct DB access is rarely needed in steady state. Repeated use of the escape hatch for the same operation is a signal that the command set has a gap worth filing as a feature request."
---

# DP-003: Comprehensive toolbelt with escape hatch

## Statement

Three clauses.

### Clause 1 — The permission

**Agents and developers may access the underlying ArangoDB directly**
(via AQL, arangojs, or other Arango-native tooling) when docdog's CLI
and MCP surface don't yet cover a needed operation.

Direct DB access is **explicitly allowed**, not a workaround. It is
the **escape hatch** for operations docdog doesn't yet express as
first-class commands — one-off investigations, experimental migrations,
dev-cycle patches, exploratory queries during design sessions.

This applies both to developers working on docdog itself and to agents
operating on a docdog-hosted project. There is no "forbidden zone" in
the database.

### Clause 2 — The promise

**Docdog commits to providing sufficient first-class CLI and MCP
tooling so that direct DB access is rarely needed in steady state.**

Every common manipulation of the graph — enumerating, mutating,
reshaping, migrating — has a supported command or MCP tool:

- Enumerate: `docdog search`, `docdog collections list`, `docdog gc
  list`, etc.
- Mutate: `docdog add`, `docdog index`, `docdog refs scan`, planned
  MCP tools `docdog_create` / `docdog_update` / `docdog_relate`
- Reshape: `docdog move`, `docdog gc hard-delete`, `docdog gc restore`,
  `docdog collections add`, `docdog relations add`
- Migrate: `docdog migrate`, future schema migrations

The escape hatch exists for the uncommon cases, not the common ones.
A developer or agent reaching for `arangosh` or direct AQL for a
common task is a **signal** that the toolbelt has a gap.

### Clause 3 — The feedback loop

**Repeated use of the escape hatch for the same operation is a signal
that the command set has a gap worth filing as a feature request.**

When a developer or agent notices they've written the same raw AQL
twice, or that a recurring pattern of DB-level work could be
expressed as a command, the right response is:

1. Open a friction report (`specs/notes/friction-NNN-*.md`) describing
   the operation, why direct DB access was needed, and how a CLI or
   MCP tool could cover it
2. Open a proposal if the right shape isn't obvious
3. Continue using the escape hatch in the meantime

This turns everyday use into a continuous improvement loop, keeping
the toolbelt evolving toward comprehensiveness.

## Relationship to other commitments

- **Complements DP-001 (agent-first mechanics).** DP-001 requires that
  code never makes semantic decisions. DP-003 scopes what "code" means
  in practice: the CLI and MCP surface must be comprehensive enough
  to cover the common cases without the agent needing to bypass it.
  Together: mechanical tools (DP-001) that cover the ground
  (DP-003) without making judgments (DP-001 again).
- **Complements DP-002 (concepts carry meaning).** DP-002 requires
  that meaning lives in dedicated meta collections. DP-003 commits
  that the CLI can manipulate those meta collections without forcing
  users to write raw AQL.
- **Enforces FR-001 (feature pattern).** FR-001 clause 3 says features
  get their own command namespace. DP-003 sharpens this: the namespace
  must be **comprehensive** for the feature's operations. A feature
  that ships with half its operations unreachable from the CLI is
  incomplete under both FR-001 and DP-003.

## When direct DB access is appropriate

**Appropriate:**

- Dev-cycle debugging: inspecting the actual state of a collection
  while working on indexer code
- One-off data migrations that don't warrant a reusable command
- Experimental queries during design sessions (e.g. "can I even write
  this AQL?" before deciding on a proposal)
- Emergency repairs when docdog itself is broken and the CLI can't
  run
- Onboarding investigation of an unfamiliar docdog-hosted project
- Patching data during development of a new feature before its CLI
  commands are implemented

**Inappropriate:**

- Routine operations that should be expressed as commands (find
  these, file a friction report instead)
- Production data mutations in a shared project without at least a
  record of what was done — direct DB access bypasses the audit trail
  git provides over source-of-truth files
- Anything that could be done through docdog but the user "prefers"
  direct DB access for speed — the convenience is a signal, not a
  justification

## Test for new commands

When proposing a new CLI command or MCP tool, ask:

- Is this a common-enough operation that users will do it repeatedly?
- Can it be expressed cleanly through existing commands, or does it
  genuinely need a new one?
- If users are already doing this via direct DB access, how often?

If the operation is common and already being done via direct DB
access, the command is overdue. DP-003 clause 3 says this is the
signal to ship it.

## Meta-observation

DP-003 is in tension with itself. Clause 1 permits an open back door.
Clause 2 promises the back door is rarely needed. Clause 3 catches
the case where the promise slips. Together they form a homeostatic
loop: direct access is allowed, but its use is instrumented as
feedback that improves the CLI.

The tension is deliberate. A principle that only permits or only
promises would be brittle. Permission without a promise becomes a
convention of raw DB access; promise without permission blocks
legitimate uncommon work. The three clauses together keep docdog
honest: the CLI aspires to completeness, the escape hatch catches
the gaps, and the feedback loop closes them over time.
