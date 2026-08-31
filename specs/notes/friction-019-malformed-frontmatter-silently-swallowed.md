---
id: FRICTION-019
title: "Malformed frontmatter is silently swallowed at index time — ids, descriptions and edges vanish with zero warnings"
collection: notes
status: resolved
fixed_date: 2026-07-13
description: "8 orchestrator files with invalid YAML frontmatter (unquoted prose containing ': ') indexed as body-only `default:<path>` vertices with title 'Summary' and empty frontmatter — their declared ids, descriptions and 18 relationships silently disappeared from the graph while `docdog index` printed success. Code-confirmed: src/markdown/index.ts:80 catches the YAML parse error and leaves frontmatter empty with no diagnostic channel out. A corpus owner cannot fix what the indexer never reports."
severity: blocks-work
source: external-dogfood (host-project orchestrator, PLAN-DOCDOG-001)
harvested_from: specs/investigations/docdog-adoption/feedback-2026-07-12-malformed-frontmatter-silent.md
relationships:
  - references: DP-001
    context: "warning on a parse failure is pure mechanics (tier 1) — it reports what happened, it does not guess intent or repair the YAML; the repair stays with the agent+user loop"
  - references: DD-043
    context: "relationships come from frontmatter — so a frontmatter parse failure is silent *edge* loss, not just field loss; 18 declared edges vanished here"
  - references: DD-070
    context: "the disk is canonical and the cache is derived — but a derivation that silently drops what the disk declares breaks the contract that reindexing reconstructs the truth"
  - references: FRICTION-009
    context: another indexer-silence bug — the pattern of the indexer doing something destructive without saying so
  - references: WF-002
    context: harvested from the external dogfood track; the first-index gate ("interpret warnings") had nothing to interpret
  - references: PROPOSAL-027
    context: "bounds the residue this fix cannot touch: frontmatter that parses into something the author never meant cannot be warned on, because PROPOSAL-027 made attributes generic and no schema says what a key like `triggers` should be"
---

# FRICTION-019: Malformed frontmatter is silently swallowed at index time

## What they were doing

First full `docdog index` over the orchestrator corpus (343 files).
Eight files under `specs/deferred/` carried pre-existing invalid YAML
frontmatter — unquoted prose containing `: ` inside `triggers:` list
entries, e.g.:

```yaml
triggers:
  - The const-backed registry grows past ~5 game types (today: 2)
```

The adoption plan's Phase 1 gate is "run the first index, interpret
the warnings."

## What went wrong

**Zero warnings.** The eight files were indexed as body-only vertices
with fallback id `default:specs/deferred/<file>.md`, title `Summary`
(the body's first heading), and empty frontmatter. Their declared
`id:`, `description:` and `relationships:` (18 edges) silently
vanished from the graph. `docdog index` printed only its summary line
and reported success. The gate had nothing to interpret.

It was discovered by accident, much later, when a gate query
(`docdog_get DEF-001`) returned nothing.

## Confirmed in source

`src/markdown/index.ts:80`:

```ts
} catch {
  // Malformed frontmatter — leave empty. Mirrors prior behavior.
}
```

The parse error is caught and discarded inside `parse()`, whose
return type (`ast`, `raw`, `frontmatter`, `frontmatterEndOffset`)
carries no diagnostic field. So the failure is not merely unreported —
there is currently **no channel** by which a parser or the indexer
could report it, even though the indexer already has a `warn()` sink
that it uses for duplicate ids and unknown collections.

Note the asymmetry: the *write* path already treats this as a hard
error (`parseFrontmatterObject` in `src/storage/frontmatter.ts:78`
throws `MALFORMED_FRONTMATTER`). Only the read path degrades quietly.

## Workaround

Repaired the YAML in all 8 files with a one-off script
(`scripts/docdog/fix-deferred-yaml.mjs`, orchestrator-side — re-emits
only the YAML blocks that fail to parse, as folded scalars) and
reindexed.

## What should change

When frontmatter exists but fails to parse, emit a warning naming the
file and the parse error, on the same channel as the existing
`duplicate id` / `unknown collection` warnings — instead of silently
degrading to a body-only `default:` vertex.

Smallest correct shape: give `parse()` a `frontmatterError: string |
null` field, thread it onto the parsed section/file, and have the
indexer `warn()` it. Degrading to a body-only vertex afterwards is
fine and probably still right — the file's prose is better indexed
than not. The bug is the *silence*, not the fallback.

Do **not** attempt to auto-repair the YAML: that is inference, and
DP-001 forbids it. Report and let the agent fix.

## Resolution (2026-07-13)

Fixed as described. `parse()` (`src/markdown/index.ts`) now returns
`frontmatterError` alongside the degraded-but-still-useful
`frontmatter: {}`; discovery attaches it to `ParsedFile.warnings`, and
the indexer emits it on the same `warn()` channel as duplicate ids. It
surfaces on both surfaces for free — CLI stderr, and the MCP index
tool's `Warnings:` block. The body-only fallback is unchanged and
deliberate: a broken file's prose still indexes. Verified end to end:

```
Cache: specs/notes/tmp-broken-check.md: frontmatter is not valid YAML —
  indexed body-only, so its declared id, description and relationships
  were ignored (Nested mappings are not allowed in compact mappings at
  line 4, column 41:)
```

Discovery parses each file once and hands the doc to the parser
(`ParseInput.doc`), so the diagnostic costs no second parse.

## Correction found while fixing: the reported trigger shape does not fail

Their note blames the eight files on `: ` inside unquoted list prose,
e.g. `- The registry grows past ~5 game types (today: 2)`. **That
parses cleanly.** YAML reads it as an implicit key and yields a valid
map:

```json
{"triggers": [{"The registry grows past ~5 game types (today": "2)"}]}
```

`id` and `description` survive it, so it cannot be what emptied their
frontmatter. The shapes that genuinely throw are *two* colons in one
entry (`Nested mappings are not allowed in compact mappings`) and
implicit keys over 1024 chars — both plausible in the same prose, and
both now warned. Their eight files were one of those; the example line
they quoted was not.

That leaves a **second, narrower silent class this fix cannot touch**:
frontmatter that parses *successfully* into something the author never
meant — the single-colon case above, where `triggers` silently becomes
a list of maps. No parse error exists to report, and since PROPOSAL-027
made frontmatter attributes generic, docdog has no schema that says
what `triggers` *should* be. Warning there would mean guessing intent,
which DP-001 forbids. Recorded here as a known, bounded residue rather
than papered over.
