---
id: FRICTION-052
title: "Every adopter's config.yaml declares `sanitization: mode: redact, systemDefaults: true` and nothing in docdog has ever redacted anything"
collection: notes
status: resolved
fixed_date: 2026-08-28
resolution_approach: fix
description: "docdog init writes an ingest.sanitization block into every new project; the engine behind it is 104 lines, has 8 passing tests, and is called from nowhere in the product."
severity: inconvenient
relationships:
  - references: DISC-041
    context: "found while auditing what docdog actually does about privacy — the answer is nothing, and this key is why that is not obvious from the outside"
  - references: DP-001
    context: "the one defensible reading of the dead engine: pattern-matching a secret is mechanical, but deciding that a match IS a secret and rewriting the author's bytes is tier 3, which may be why it was never wired"
  - references: RECON-001
    context: "the precedent this follows — dormant tier-3 pre-wiring is removed rather than left connected to nothing, and reviving it is a new proposal"
  - references: OQ-03
    context: "the standing privacy answer — 'CLAUDE.md rules, ad-hoc review, no automated pipeline' — is correct, and this config key contradicts it in every adopting project"
---

# FRICTION-052: a redaction promise with no redactor

## What I was trying to do

Audit docdog's privacy surfaces before publishing, prompted by the
question of whether a mixed public/private corpus is safe (DISC-041).
`.docdog/config.yaml` in this repo ends with:

```yaml
ingest:
  sanitization:
    mode: redact
    systemDefaults: true
    rules: []
```

## What went wrong

Nothing calls it.

```
$ grep -rn "sanitiz" src/ --include=*.ts
src/config/defaults.ts:42:    sanitization: {
src/engine/sanitization-engine.ts:57:export function sanitize(
src/types/config.ts:187:    sanitization: {
```

Three hits: a default, a type, and the definition. **No call site.**
`src/engine/sanitization-engine.ts` is 104 lines carrying a real
implementation — `redact` and `block` actions over system patterns for
API keys, bearer tokens, Mongo/Postgres/MySQL connection strings and
AWS `AKIA…` access-key ids, plus user-supplied rules. Its only importer
in the entire repo is its own test file, which has 8 passing cases.

So the module is green, typed, defaulted and documented in every
config, and it has never processed a byte of anyone's content.

And this is not a legacy key that lingers only in old projects — it is
written **today**. A fresh `docdog init` in a scratch directory
produced:

```
$ grep -n "sanitiz" -A3 /tmp/…/.docdog/config.yaml
21:  sanitization:
22-    mode: redact
23-    systemDefaults: true
24-    rules: []
```

## Why this is worse than a dead key

Compare the other v2-era vestiges. `arango:`, `gc:`, `code_refs:`,
`git.patches:` are *tolerated on load and never written* — the comment
in `types/config.ts` says so explicitly, and `RECON-001` removed
`git.patches` for exactly this reason. Those keys can only appear in a
config a human already had. This one docdog authors.

The content of the claim is the problem. A key named `sanitization`
set to `mode: redact` with `systemDefaults: true` reads as *docdog
strips secrets from content by default*. Someone deciding whether to
point docdog at a corpus containing credentials could reasonably read
that as a safety property and be wrong. It is the only thing in the
config that speaks to the question at all, and it answers it falsely.

The honest current answer is OQ-03's: CLAUDE.md rules, ad-hoc review,
no automated pipeline.

## Workaround

None needed — remove the key from `.docdog/config.yaml` by hand and
nothing changes, which is the whole point.

## What should change in docdog

Three options; this note does not pick one, because the third is a
design question rather than a repair.

1. **Delete the key, the type and the engine.** Consistent with
   RECON-001's treatment of `git.patches`: dormant tier-3 pre-wiring
   goes, and reviving it is a new proposal. Cheapest, and honest.
2. **Delete the key and the type, keep the engine unexported.**
   Pointless — an unreachable module with tests is what produced this.
3. **Wire it.** This is where DP-001 bites, and it may be the reason
   the wiring never happened. Matching `AKIA[0-9A-Z]{16}` is pure
   mechanics (tier 1). Concluding that a match *is* a live secret and
   **rewriting the author's file** is judgment plus a destructive
   write (tier 3). A *reporting* sanitizer — "these 4 lines look like
   credentials, here is where" — is tier 1 and composes with the
   existing index-time warnings, but it is a different feature than
   the one this config declares.

Whichever way it goes, `docdog init` must stop writing a claim the
code does not honour. That half is not a design question.

## Resolution (2026-08-28) — option 1, delete it

**Closed by removal.** The key, the type and the engine are gone:

```
src/cli/commands/init.ts     `ingest: defaultConfig.ingest` — the line that authored it
src/config/defaults.ts       the default block
src/types/config.ts          `SanitizationRule` and the whole `ingest` member
src/engine/sanitization-engine.ts   deleted (104 lines)
tests/unit/sanitization.test.ts     deleted (8 tests)
```

Option 3 — wiring it — was refused on the note's own analysis, and the
refusal is worth keeping rather than reopening later. Matching
`AKIA[0-9A-Z]{16}` is tier 1; concluding a match **is** a live secret
and rewriting the author's file is judgment plus a destructive write,
which is tier 3. A *reporting* sanitizer would be legitimate and is a
different feature from the one that key described. It needs a proposal,
not a reconnection.

### The mechanism that was supposed to prevent this, and did not

`init.ts` picks config sections explicitly, and the comment directly
above the offending line says why:

> `// Sections are picked explicitly so v2-era keys (arango, gc,`
> `// code_refs) never reach a fresh v3 config.`

The next line was `ingest: defaultConfig.ingest`. An allowlist only
excludes what is left off it, so a key that made it onto the list was
protected by the very mechanism designed to catch it. That is the
general shape worth remembering: **an allowlist is not a review.**

### What was deliberately not done

- **No config rewriting, and no `update` outcome.** Every project docdog
  ever initialized still carries the block; it is tolerated on load,
  exactly like `arango:` and the rest of the v2-era keys, and
  `docdog update` reports on *seeded files*, never on the adopter's
  config (the same posture as the concept-reach report). The key is
  inert wherever it survives.
- **No warning about the retired key.** RECON-001 removed `git.patches`
  the same way and stayed silent about existing configs. A warning
  telling adopters to delete a line that does nothing is noise.

### One thing this turned up

`tsconfig.json` excludes `tests`, so `npm run lint` reported clean while
`tests/unit/config-loader.test.ts` still asserted on
`config.ingest.sanitization.systemDefaults`. `npm test` caught it —
`Cannot read properties of undefined` — so the net holds, but it holds
at runtime rather than at typecheck. Worth knowing when deleting a type:
**lint clean does not mean the tests still compile.**

That assertion is replaced by two that pin what actually matters: a
legacy config carrying both `ingest:` and `arango:` still loads and
indexes, and the loaded config no longer has an `ingest` member at all.
Verified end to end as well — a fresh `docdog init` writes a config with
no `sanitization` line, and a hand-written config carrying the old block
indexes and lists normally.

This repo's own `.docdog/config.yaml` had the block and no longer does.

Tests 842 → 836 (−8 with the engine, +2 on the loader), files 50 → 49.
