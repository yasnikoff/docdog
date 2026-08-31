---
id: DD-059
title: "`description` is an agent-authored frontmatter field, preferred over mechanical previews"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-023 under DD-034's artifact-resilience lens. Every vertex carries a `description` field from frontmatter. Agents write it; `preview` is the mechanical fallback. The indexer never invents descriptions."
relationships:
  - supersedes: EJ-023
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-043
  - references: DD-044
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — description is the artifact explaining itself to a cold reader
  - references: DD-051
    context: description edits can't bust the embedding cache — embeddings key on body content per DD-051
---

# DD-059: `description` is authored, `preview` is mechanical

Every vertex carries a `description: string | null` field
sourced from the source file's frontmatter. Agents are expected
to write or update it on every create / edit / relate operation.

## Preview vs description

- **`preview`** — mechanical slice of the body, word-boundary
  truncated. Always present. Agents don't write it; the indexer
  computes it.
- **`description`** — agent-authored summary of what the section
  covers. `null` for artifacts no agent has touched. The
  preferred summary in search results; `preview` is the
  fallback.

The indexer reads `description:` from frontmatter. If present it
is stored on the vertex; if absent the field is `null`. Editing
only the description triggers a metadata re-index but does not
bust the embedding cache — embeddings are keyed to body content,
not frontmatter (DD-051).

## Why authored beats mechanical

Agents produce better summaries than slice-at-character-N. A
`description:` written by the author of the section is what
another agent needs to decide whether a search hit is worth
reading; a mechanical preview is only ever a fallback for when
that judgment wasn't made.

## DD-034 check

Direct fit. `description:` lives in frontmatter. A vanilla agent
reading `specs/` finds the authored summary right at the top of
each file, with no docdog-mediated step. It is the highest-
value metadata field under DD-034's test — it is literally the
artifact explaining itself to a cold reader.
