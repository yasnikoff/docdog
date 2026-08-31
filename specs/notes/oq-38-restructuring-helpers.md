---
id: OQ-38
title: "Restructuring helpers — what tools should docdog provide?"
collection: questions
status: open
description: "ingest split/stamp exist as migration tools. Nice-to-haves: `docdog advise` (lint-like parser suggestions), `docdog extract-sections` (split + DB enrichment), `docdog restructure` (interactive walkthrough). Non-blocking."
---

# OQ-38: Restructuring helpers — what tools should docdog provide?

`docdog ingest split` and `ingest stamp` exist as one-shot migration tools. They help
users restructure multi-section files into one-file-per-section. Other tools worth
considering:

- **`docdog advise`**: look at scan_paths, warn about files that might benefit from
  different parsers. "architecture.md has 25 sections and no parser config — consider
  adding `parser: split, split_on: \"## DD-\"`." Lint-like, opinionated but non-destructive.
- **`docdog extract-sections <file>`**: combine split logic with existing DB data.
  Produces one-file-per-section output that includes enrichment (descriptions, related
  edges) from ArangoDB. Lets a user migrate from "multi-section + rich DB" to
  "split files + rich frontmatter" without losing work.
- **`docdog restructure`**: interactive walkthrough. Shows parser options, previews
  output, user picks.

**Status:** not blocking. Built-in parsers + existing ingest commands cover the
essentials. These are nice-to-haves for UX.
