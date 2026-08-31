---
name: relate
description: Record outbound relationship edges between records you directly worked with
---

# Relate

Record relationship edges between records. This builds the graph that makes
traversal-based context discovery work.

Edges are **born in the source record's file**: `docdog_relate` patches its
`relationships:` frontmatter block and reindexes that file (DD-043). The
graph in the cache is derived — the frontmatter is the truth. You can always
edit the block by hand instead and run `docdog index`.

## Rules (DD-040)

1. **Outbound only.** Record edges FROM the record you are working with.
   "This task used DP-11" — link FROM your record TO DP-11.
2. **Only what you're certain about.** No entry beats a wrong entry.
   If you're not confident in a relationship, don't submit it.
3. **Never authoritative.** Edges frame themselves as partial connections,
   not a complete index. "These are known connections, not all connections."
4. **Inverse edges are automatic.** Write the forward type on the record
   where it makes semantic sense; traversal finds the other direction.
   Never store an inverse form (`superseded_by`, `referenced_by`,
   `depended_on_by`) as its own edge — a concept record's `inverse_label`
   is a display label, not an edge type.
5. **A reciprocal is two facts or an echo — test which.** Rule 4 bans the
   inverse *type*. It does not ban two records declaring the same type at
   each other, and rule 1 legitimately produces that: if both records
   substantively engage each other, each writes its own outbound edge with
   its own context. `references` is not directional — it asserts "my text
   engages this record" — so both sides can be independently true. **Keep
   those.** What to skip is an *echo*: a back-edge re-stating a
   relationship the other record already asserts. The test —

   > **Does this edge answer a question the forward edge doesn't already
   > answer?**

   `traverse` reads edges inbound for free, so if the answer is no, the
   back-edge stores one fact twice and only doubles a hub's fan-out. The
   canonical echo is a roster: when a sweep record enumerates the records
   it touched, it has already declared those edges — a record → sweep
   back-edge adds nothing (OBS-014).

## Workflow

### After reading a record

If you read DD-ARCH-09 and notice it references DP-11:

```
docdog_relate({
  from_id: "DD-ARCH-09",
  to_id: "DP-11",
  type: "constrains",
  context: "DP-11 requires halting when saga compensation outcome is uncertain"
})
```

`from_id`/`to_id` are record ids (the `id:` from frontmatter), not database
keys.

### After completing a task

Record which specs you used:

```
docdog_relate({
  from_id: "TASK-053",
  to_id: "FR-PROV-01",
  type: "implements",
  context: "Provisioning workflow implements FR-PROV-01 requirements"
})
```

### Many edges at once

`docdog_relate` is the one-at-a-time path — the edge you noticed while
reading. Do not loop it over a backlog: use the review file instead, which
writes once per source *file* rather than once per edge.

```bash
docdog suggest-edges --format review > candidates.yaml   # emit candidates
# delete the rows you reject; write a context: on the rest
docdog suggest-edges --accept-from candidates.yaml       # apply
```

Same rules as below — forward types only, a context per edge, certainty
over coverage. See the **populate** skill for the full loop.

### Writing the block by hand

The relation type **is the YAML key**. The value is the target id.

```yaml
relationships:
  - references: DD-070
    context: "why these two are connected"
  - supersedes: PROPOSAL-012
    context: "…"
```

There is no `type:` key and no `target:` key. That shape looks plausible and
is not the schema:

```yaml
relationships:
  - type: references      # WRONG — refused at index time (FRICTION-028)
    target: DD-070
```

Docdog used to read that as an edge to a record named `references`, of type
`type`, and drop every real edge in the block without a word. It now refuses
the entry and tells you — but the entry is still lost, so write the shape
above. Run `docdog index` afterwards and check the warnings.

## Relationship types

| Type | Meaning |
|------|---------|
| `references` | General cross-reference |
| `constrains` | Source limits/shapes the target |
| `implements` | Source implements the target |
| `supersedes` | Source replaces the target |
| `uses_term` | Source uses a glossary term |
| `companion` | Created together, should be considered together |
| `cross_cutting` | Source applies broadly across many records |
| `parent` / `child` | Structural hierarchy |
| `depends_on` | Source requires the target to function |

The registered set lives in the concepts records
(`.docdog/concepts/relation-*.md`) — search them via
`docdog_search` with `collection: "concepts"`. Unknown types are recorded
with a warning, never blocked.

`docdog index` warns about two things it can only see across the whole corpus:
an edge whose type is not one of those registered records, and an edge whose
target id no record declares. Both usually mean a typo. Both are warnings —
the edge is still written, because the frontmatter is the truth.

## Context field

The `context` field is a one-line factual summary of what connects the two
records. Write it from the source's perspective:

- Good: "DP-11 requires halting when compensation outcome is uncertain"
- Bad: "related" / "see also" / "important"

## Anchor text (optional)

The exact text in the source document that references the target:

```
docdog_relate({
  from_id: "...",
  to_id: "...",
  type: "references",
  context: "Architect spec cites saga pattern for provisioning",
  anchor_text: "compensation follows the saga pattern (DD-ARCH-09)"
})
```
