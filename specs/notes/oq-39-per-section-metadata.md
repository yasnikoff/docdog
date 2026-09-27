---
id: OQ-39
title: "Per-section metadata in multi-section files — how rich can it get?"
collection: questions
status: resolved
description: "Multi-section files have limited per-section metadata: id, title, status, date. Resolved by DD-068 as option 4, minus its database half since v3: split-parsed sections keep only what the parser extracts and refuse the write tools; for rich metadata, split the file."
relationships:
  - references: DD-068
    context: the decision that resolved this question with option 4, in the harder form DD-070 left it
---

# OQ-39: Per-section metadata in multi-section files — how rich can it get?

**Resolved by DD-068 (mirroring EJ-032), in the form DD-070 left it.**
Option 4 was taken, minus its database half. v3's cache is disposable, so
there is no DB-only store, and the write tools refuse split-parsed sections
rather than enriching them somewhere else. Multi-section files keep only what
the parser extracts. If you want rich metadata, split the file. The options
below are the question as it was asked.

Multi-section files (kept via split parser) have limited per-section metadata.
Currently extracted: `id` (from heading), `title` (from heading), `status` (from
`**Status:** current`), `date` (from `**Date:** 2026-03-24`).

**Problem:** richer fields don't have a convention.
- `description:` is multi-sentence prose, doesn't fit `**Description:**` one-liner
- `related:` is a list, `**Related:** FR-01, FR-02` extraction is fragile
- Agent-authored edges have nowhere to live on disk

**Options:**
1. **Extend the split parser** to extract more patterns (`**Description:**`,
   `**Related:**`, etc.). Heuristic and fragile.
2. **Inline HTML comment blocks** with structured metadata:
   ```
   ## DD-ARCH-01: Title
   <!-- docdog: { status: current, description: "..." } -->
   ```
   Machine-readable, invisible in rendered markdown, but a new convention users must learn.
3. **Per-section frontmatter blocks** between sections — non-standard, breaks markdown
   parsers.
4. **Rich metadata lives in ArangoDB only.** Multi-section files stay minimal on disk.
   Agent-authored `description:`, edges, etc. are DB-only. If the user wants rich disk
   metadata, they split the file.

**Leaning:** Option 4 is the honest answer. The tradeoff is clear: multi-section ⇔
minimal disk metadata ⇔ rich DB metadata. If you want rich on-disk metadata, split.
