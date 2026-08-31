---
id: FR-001
title: "Features beyond the core are opt-in, applicability-detectable, and own their command namespace"
collection: requirements
status: accepted
date: 2026-04-12
related: [DP-001, DISC-009, PROPOSAL-005]
relationships:
  - discussed_in: DISC-009
  - references: DP-001
    context: clause 2 codifies the principle — detectors report applicability signals, never judge usefulness
  - references: PROPOSAL-005
  - references: DD-070
    context: core-set amendment — infra and migrate left the core by ceasing to exist
description: "Functional requirement establishing the pattern for every non-core docdog feature: default off, include an applicability detector that surfaces facts (not judgments), and provide its own command namespace so agents follow a uniform enable-then-invoke model."
---

# FR-001: Opt-in, auto-discoverable, independently-commanded features

## Requirement

Every docdog feature **beyond the essential core** must satisfy three
clauses.

### Clause 1 — Default off

New installations of docdog do not silently enable non-core behavior.
Every feature ships disabled by default. Users or agents enable a
feature explicitly by editing `.docdog/config.yaml` (directly or via
a feature-management command). Enablement is visible, version
controlled, and reversible.

### Clause 2 — Applicability detector

Every non-core feature must provide a **mechanical detector** that
scans the project and produces **applicability signals** — factual
counts, pattern matches, or file-type summaries. The detector must
not judge fit or usefulness; it only reports what it found.

Detection is surfaced via `docdog features scan` (command shape to be
specified by the feature-management feature itself). Output format:

```
Detected signals:
  - <count> <pattern> occurrences in <file scope>
  - <other factual observations>

Features available based on these signals:
  [ ] <feature-name> — <one-line description>
      Signal: <the facts that made this feature applicable>
```

The **user decides** whether the feature is useful. Docdog provides
the facts; the judgment stays outside the code.

### Clause 3 — Own command namespace

Each feature provides its own command namespace, typically
`docdog <feature> <action>`. Agents follow a uniform pattern:

1. Read feature state from `.docdog/config.yaml`
2. If the feature is enabled, invoke its commands as needed
3. If the feature is disabled, do not invoke its commands and fall
   back gracefully

**No cross-cutting flags on core commands. No conditional behavior
buried inside `docdog index` or `docdog search`.** A feature stands
alone and its presence or absence in the command tree mirrors its
on/off state in config.

## Scope — what counts as "non-core"

This requirement applies to every feature that **changes what docdog
does for the user** in an observable way:

- New scan passes (e.g. code-ref scanning)
- New collections that hold project content
- New write paths (MCP tools, CLI commands that mutate the graph)
- New query surfaces (search variants, traversal modes)
- New automation (background indexers, watch modes, hooks)

It does **not** apply to:

- Internal refactors (same user-visible behavior, different code)
- Convenience flags on existing commands (`--json`, `--quiet`,
  `--dry-run`) that are pure mechanics
- Bug fixes
- Performance improvements

The test: *"would a user of an existing project notice a behavior
change if this feature shipped without opt-in?"* If yes, the feature
needs an opt-in gate per this requirement. If no, it's internal and
ships unconditionally.

## The core

The following are considered core and exempt from opt-in requirements
(amended by DD-070 §4 — `infra` and `migrate` left the core by ceasing
to exist):

- `docdog init`
- `docdog index`
- `docdog search`
- `docdog serve`
- `docdog gc` (cache eviction)
- `docdog add` / `docdog split`
- `docdog templates`
- `docdog run`
- Their supporting primitives (config loading, embedding, parsing,
  cache lifecycle)

Core features are the irreducible memory-layer behavior that every
docdog project depends on. Everything else is opt-in.

## Rationale

Three reasons, aligned with earlier commitments:

1. **DP-001 compliance.** Code deciding "this feature would be useful
   for you" is Tier-3 judgment. Detectors produce facts, users pick
   features — the decision stays with the user.
2. **Predictable upgrades.** A user upgrading docdog never finds new
   behavior running silently. Every behavioral change is an explicit
   opt-in.
3. **Clean agent model.** Agents working with docdog learn one
   pattern: *"check config, invoke commands for enabled features."*
   They don't need to know which features exist a priori or read
   version changelogs.

## Relationship to other commitments

- **Complements DP-001 (agent-first mechanics).** DP-001 is the
  abstract principle; FR-001 is its concrete operational pattern for
  feature delivery.
- **Informs every future proposal.** Every PROPOSAL-NNN for a new
  feature must describe its detector and its command namespace as
  first-class design concerns, not afterthoughts.
- **First application: PROPOSAL-005** (doc-id code-reference
  tracking). PROPOSAL-005 will serve as the reference implementation
  of the FR-001 pattern and expose any rough edges in the requirement.

## Open items

- The `docdog features scan` / `docdog features list` command itself
  has not been specified. It will be spec'd when the first opt-in
  feature (PROPOSAL-005) ships, because that's when the command has
  a concrete first tenant.
- Whether `docdog init` should run `features scan` automatically
  and present available opt-ins during onboarding. Deferred to the
  `features` command spec.

## Status

Accepted. First application is PROPOSAL-005.

First functional requirement filed in docdog's own specs. Established
2026-04-12 during DISC-009.
