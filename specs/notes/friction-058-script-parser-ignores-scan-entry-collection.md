---
id: FRICTION-058
title: "The script parser ignores the scan entry's `collection:` — every other parser applies it, and the ParsedSection contract says it applies"
collection: notes
status: open
date: 2026-09-25
description: "A `parser: script` entry declaring `collection: decisions` indexes every section the script returns with `collection: null` into directory inference or `default_collection` instead. split, table and default each read `parserConfig.collection` themselves; `script.ts` passes the script's result through untouched and discovery's fallback chain skips parser config — while the `collection` doc comment in parsers/types.ts promises `this field → parser config → frontmatter → directory name → default_collection`."
severity: inconvenient
upstream_issue: https://github.com/yasnikoff/docdog/issues/1
relationships:
  - references: DISC-042
    context: "found by running the script-parser sketch drafted for issue #1's acknowledgment against a throwaway project before posting it — the drafted config would have put all 261 rows in `notes`"
  - references: DD-067
    context: "the parser system whose contract (`ParsedSection.collection` resolution order) the script parser does not honour"
  - references: FRICTION-056
    context: "the same escape hatch; making it findable is worth less if the first thing it does is file every record under the wrong collection"
  - references: FRICTION-059
    context: "same session, same sketch, the other defect a script author meets on the first iteration"
---

# FRICTION-058: the script parser drops the scan entry's collection

## What was being attempted

Verifying the `parser: script` sketch in issue #1's drafted acknowledgment
before posting it: a throwaway project, installed docdog 0.4.0, a CRLF
fixture of `- D-AREA-n.` list items, and the config from the draft —

```yaml
  - path: spec/design-decisions.md
    parser: script
    script: rows
    collection: decisions
```

with the sketch returning `collection: null` on every section.

## What went wrong

Every row indexed — ids from the text, one vector each — into `[notes]`.
`docdog list --collection decisions` returned `No records match.`

The three built-in parsers each apply the entry's collection themselves
(`split.ts:25`, `table.ts:18`, `default.ts:28`). `script.ts` returns the
script's array as-is, and discovery's fallback (`discovery.ts:263`) goes
section → directory inference → `default_collection`, never consulting
parser config. So the rule lives in each parser rather than in the chain,
and the one parser docdog does not write is the one that misses it.

The contract says otherwise: `ParsedSection.collection` in
`parsers/types.ts` documents *"this field → parser config → frontmatter →
directory name → default_collection"*.

## Workaround

The script reads it itself: `collection: input.parserConfig.collection ??
null`. That is now in the drafted comment, with a line saying why.

## What should change

Apply `parserConfig.collection` in `scriptParser.parse` to any section
that returned a null collection — the script's own non-null value still
wins, matching the documented order. One line, plus a test that a script
returning `collection: null` under a `collection:`-bearing entry lands in
that collection. Moving the rule into discovery's chain instead would
make the three built-ins' copies redundant; either is mechanical (DP-001
tier 1), the parser-local fix is the smaller diff.
