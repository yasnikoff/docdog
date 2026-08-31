---
id: FRICTION-039
title: "`docdog split` finds sections with a line-prefix scan while its sibling parser uses the AST — so it splits inside code fences and cannot see setext headings"
collection: notes
status: resolved
fixed_date: 2026-07-29
resolution_approach: patch
fix_commit: 2fc7582
description: "The split COMMAND (engine/ingest.ts) locates sections with `lines[i].startsWith(on)`, a raw line scan, while the split PARSER (engine/parsers/split.ts) has used the markdown AST since DISC-016. The command therefore treats a `## foo` inside a fenced code block as a section boundary, is blind to setext headings entirely, and has no concept of heading depth — only a literal string prefix."
severity: inconvenient
relationships:
  - discussed_in: DISC-034
    context: "found by reading the code before arguing the design; it reframed 'build an AST splitter' into 'wire the existing AST machinery into the one path that never got it'"
  - references: DISC-016
    context: "the decision to delegate structural markdown parsing to a mature library; the parser honored it and the command was never migrated, which is exactly the shape of this defect"
  - references: FRICTION-023
    context: "the other split defect, on the PARSER side and already closed by PROPOSAL-034; filed separately because they are separate code paths that happen to share a name"
---

# FRICTION-039: the split command never got the AST

## What I was doing

Assessing whether docdog's mechanical splitter is good enough to be the
remediation tool for corpora past `MAX_EMBED_CHARS` (DISC-034). The user's
report was that `#` is not reliably a section marker — it can be a comment
character, a shebang, a line inside a code sample.

## What I found

There are two splitters and they do not share an implementation.

**The parser is correct.** `src/engine/parsers/split.ts` delegates to
`src/markdown/` per DISC-016, calls `sectionsByHeading(doc, predicate)`, and
matches structurally:

```ts
h => patterns.some(p => h.depth === p.depth && h.text.startsWith(p.prefix))
```

A `#` inside a fenced block is not a heading node, so it is never a candidate.

**The command is not.** `src/engine/ingest.ts:80-84`, reached by
`docdog split <file>`:

```js
const lines = raw.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith(on)) splitIndices.push(i);
}
```

Three consequences, all following directly from the code:

1. **Code fences are split.** A markdown file documenting markdown — a README
   with a fenced frontmatter sample, a skill file quoting heading syntax — has
   its code block cut at the fence's interior `##`, producing one section whose
   body ends mid-fence and another that opens with an unterminated one.
2. **Setext headings are invisible.** `Title` over `=====` is an H1 to every
   markdown parser and to `sectionsByHeading`; to a `startsWith("# ")` scan it
   is ordinary prose. A corpus written in setext style splits into zero
   sections and the command reports `No matches`.
3. **There is no depth, only a string.** `--on` is matched with `startsWith`,
   so `## D` matches `## DD-070` and `## Design` alike, and `--on "## "`
   silently also matches nothing at `###` — the caller cannot express "split at
   H2 whatever the text says" without also expressing the text.

Failure mode 1 is the dangerous one: it does not error, it produces
plausible-looking files with corrupted bodies, and the corruption is only
visible if someone reads the output.

## Workaround

None used — the finding came from code review, not from a broken run. The
available workaround is to hand-split, or to configure the file as a `split`
scan-path entry and let the *parser* handle it, which works but leaves the file
multi-section on disk instead of splitting it.

## What should change

Rebuild `splitFile` on the same AST machinery the parser uses. See
PROPOSAL-038, which pairs the fix with the depth-selection design the DISC-034
thread produced.

## Resolution (2026-07-29): PROPOSAL-038 §1 only

`splitFile` now calls `parse()` + `sectionsByHeading()` from `src/markdown/`.
All three consequences close:

1. Heading-shaped lines inside fenced code blocks are not heading nodes, so
   they are never boundaries and a fence can no longer be cut in half.
2. Setext headings are heading nodes, so they split.
3. `--depth <n>` is added as the pattern-free selector, and `--on` now means
   *a heading at that depth whose text starts with that prefix* — so `## D` no
   longer matches an H3, which the `startsWith` scan could not express either
   way.

One thing the two paths had been deriving twice is now derived once:
`parseSplitPattern` and the match predicate moved to `src/engine/split-pattern.ts`
and the indexer-time parser imports them. That is the durable half of the fix —
FRICTION-039 exists because the same question was answered in two places.

**A behavior change worth stating.** Sections used to run from one matched line
to the *next matched line*, so an unmatched sibling heading between two matches
was absorbed into the earlier section. They now run to the next same-or-shallower
heading, which is what `sectionsByHeading` has always given the parser. The two
splitters agreeing is the point; the difference only shows on files that mix
matched and unmatched headings at the same level.

**Not implemented here.** PROPOSAL-038 §2 (size-driven descent) and §3
(refuse over-cap leaves) are the descent design, amended by PROPOSAL-039 from
default action to reported diagnostic, and they ship with the plan file rather
than with this. `--on` / `--depth` remain the only selectors, and one is
required — the command still refuses to guess where a document divides.
