---
id: OQ-39
title: "Per-section metadata in multi-section files — how rich can it get?"
collection: questions
status: leaning
description: "Multi-section files have limited per-section metadata. Currently extracted: id, title, status, date. Leaning Option 4: rich metadata lives in ArangoDB only. If you want rich disk metadata, split."
---

# OQ-39: Per-section metadata in multi-section files — how rich can it get?

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
