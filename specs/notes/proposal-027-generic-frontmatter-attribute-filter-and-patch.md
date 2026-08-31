---
id: PROPOSAL-027
title: "Generic frontmatter attributes — equality `where` filter on search, generic `fields` patch on update"
collection: proposals
status: shipped
date: 2026-07-12
description: "Make every frontmatter field uniformly filterable and patchable: docdog_search gains a `where` map compiled to json_extract equality clauses (generalizing the scope filter), docdog_update gains a `fields` map replacing the four-field allowlist with a reserved-key guard plus null-deletes-key. No registration, no new MCP tools, no schema bump, no code-side vocabulary enforcement."
relationships:
  - discussed_in: DISC-025
    context: "the ratifying discussion — registration model rejected, generic model accepted, write-side gap identified as the sharper half"
  - references: DP-001
    context: "tier walk: storing, filtering, and patching caller-stated fields is Tier-1 mechanics; reserved-key refusals are mechanical guards, not judgment; no defaults and no inference are introduced"
  - references: DD-070
    context: "the kernel 8 stands — both changes are parameters on existing tools; §6's frontmatter_json column is the substrate, so no SCHEMA_VERSION bump and no reindex are needed"
  - references: DD-058
    context: "the scope filter (json_extract over frontmatter_json with an absent-means-shared default) is the mechanism the where filter generalizes; scope keeps its dedicated param and its default semantics"
  - references: DISC-023
    context: "attribute meaning is documented advisorily in collection concept records, exactly like status_vocabulary — nothing in code validates attribute values"
---

# PROPOSAL-027: Generic frontmatter attribute filter + patch

## Motivation

DISC-025 carries the full argument; the short form: the tier
boundary between the five first-class fields and everything else is
an implementation accident. Both generalizing mechanisms already
exist in the codebase — the `scope` filter proves attribute
filtering without a column (`json_extract` over `frontmatter_json`,
storage/search.ts), and `setFrontmatterField` already patches an
arbitrary key (storage/frontmatter.ts); only the hardcoded
allowlist in `updateRecordFile` (storage/writes.ts) stops generic
patching. The write side is the sharper gap: any patch beyond
title/description/status/scope today means a manual file edit +
reindex, which is exactly the friction `docdog_update` exists to
remove. Live example: `severity` on friction notes is settable at
create time, then untouchable and unqueryable.

## Design

### 1. Search: `where` — equality filter over any frontmatter field

`SearchOptions` gains `where?: Record<string, string | number |
boolean>`. Each entry compiles in `vertexFilters` to:

```sql
AND json_extract(v.frontmatter_json, ?) = ?
```

with the path bound as `'$.' + key` and the value bound with
deliberate coercion (below).

- **Keys are top-level identifiers only** — must match
  `^[A-Za-z_][A-Za-z0-9_-]*$`. No dotted paths, no nested
  traversal; reject with a clear error. Nested queries are
  future-proposal material, on evidence.
- **Type coercion is explicit.** `json_extract` returns JSON
  strings as TEXT, numbers as INTEGER/REAL, and `true`/`false` as
  `1`/`0`. Bind accordingly: JS string → TEXT param, number →
  numeric param, boolean → `1`/`0`. This is the detail that makes
  `where: {is_outdated: true}` actually match.
- **Missing field ≠ match.** `json_extract` yields NULL for an
  absent key and NULL never satisfies equality — records lacking
  the field are excluded, which is the intuitive reading. No
  absent-key operator in this proposal.
- **Scalars only.** Equality against an array- or object-valued
  field will not match (json_extract returns its JSON text);
  documented, not special-cased.
- **Single syntax path (dedicated params win).** `where` refuses
  the keys `collection`, `status`, and `scope` with an error
  pointing at the dedicated parameter. One way to say each thing;
  `excludeStatus` keeps negation exclusive to status, where the
  need is proven.
- **Composition:** `where` clauses AND with the existing
  collection/scope/status filters and apply identically to both
  search legs (FTS and vector), like every `vertexFilters` clause.

**CLI:** `docdog search` gains a repeatable `--where key=value`
flag. Values parse as YAML scalars (`true` → boolean, `3` →
number, quoting forces string), mirroring what frontmatter itself
would contain.

### 2. Update: `fields` — generic patch with a reserved-key guard

`UpdateRecordInput` gains `fields?: Record<string, scalar |
scalar[] | null>` (scalar = string | number | boolean). For each
entry:

- **value** → `setFrontmatterField` (already arbitrary-key;
  its type widens from `string` to scalar | scalar[] —
  `stringifyYaml` and the existing key-span replacement already
  handle multi-line values).
- **`null`** → delete the key via a new `removeFrontmatterField`
  in storage/frontmatter.ts (find the top-level key span, splice
  it out — the one genuinely new function).
- **Reserved keys refused:** `id` and `collection` (record
  identity is immutable through update), `relationships` (edges go
  through `docdog_relate`). Same single-syntax-path rule as
  search: `title`, `description`, `status`, `scope` are refused in
  `fields` with a pointer to their dedicated params.
- **Arrays of scalars allowed, nested objects refused** — flat
  lists (`tags: [a, b]`) are a mainline attribute shape; nested
  structures wait for evidence.

Patched keys append to the existing `updatedFields` result;
single-file reindex behavior is unchanged.

### 3. What carries the meaning

Nothing in code. An attribute's vocabulary, when worth
documenting, goes in the owning collection's concept record next
to `status_vocabulary` — advisory data for agents, per DISC-023.
Descriptive, not prescriptive; the registry warns nobody and
blocks nothing.

## Deliberately not in scope

- **No attribute registration/declaration mechanism** — rejected
  in DISC-025: ceremony without mechanical payoff at this scale.
- **No new MCP tools** — the kernel 8 stands (DD-070); both
  changes are parameters on existing tools.
- **No operators beyond equality** — no `exists`, ranges,
  negation (outside `excludeStatus`), or substring. Extend on
  demonstrated need.
- **No indexes or generated columns** — brute-force
  `json_extract` at docdog corpus scale; revisit only if a corpus
  proves otherwise.
- **No code-side validation of attribute names or values** —
  schema-sprawl hygiene stays with the agent+user loop and
  advisory concept records (DP-001).
- **No `SCHEMA_VERSION` bump** — `frontmatter_json` already
  exists on every row; existing caches serve the new filter
  without reindexing.

## Touched surface

`src/storage/search.ts` (SearchOptions + vertexFilters),
`src/storage/writes.ts` (updateRecordFile),
`src/storage/frontmatter.ts` (removeFrontmatterField),
`src/mcp/tools/search.ts` + `src/mcp/tools/update.ts` (schemas),
`src/cli/commands/search.ts` (`--where`), plus unit tests: boolean/
number coercion, absent-key exclusion, dedicated-param refusal,
filter composition on both legs, reserved-key refusal, key
deletion, array values, and the frontmatter-surgery removal
function. Estimated at a half-day to a day including tests.

## Implemented

2026-07-12, same session as ratification. 17 new unit tests (240
total): where-filter coercion/refusals/composition including a
pure-vector-leg case (`tests/unit/storage-search.test.ts`), fields
patch/delete/refusals plus the all-or-nothing abort
(`tests/unit/storage-writes.test.ts`), and `removeFrontmatterField`
surgery (`tests/unit/storage-frontmatter.test.ts`). Live smoke on
this corpus: `docdog search --where severity=blocks-work` (string),
`--where symmetric=false` on concepts (boolean 1/0 coercion against
real records), dedicated-param refusal; a set→verify→delete
round-trip of `smoke_test: true` on this record left the file
byte-identical. One deviation from the spec text: none — reserved
keys, coercion, and scalars-only landed as written.
