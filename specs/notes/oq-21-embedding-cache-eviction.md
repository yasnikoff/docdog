---
id: OQ-21
title: "Embedding cache eviction policy"
collection: questions
status: resolved
description: "RESOLVED in v3: docdog gc evicts embed-cache rows no longer referenced by the index (--dry-run supported), as an explicit manual command — no TTL auto-delete per DP-001. Original question: the embedding cache grows as new content is indexed and needs an eviction policy."
relationships:
  - references: DD-070
    context: "§4 ships the v3 gc command whose embed-cache eviction answers this question"
  - references: FRICTION-008
    context: the friction that killed the age-based MVP default sketched here — it established that auto-delete-by-timer is the wrong shape for eviction
  - references: DP-001
    context: the principle that rules out a TTL answer, so v3 eviction is an explicit manual `docdog gc` step rather than an age-based sweep
---

# OQ-21: Embedding cache eviction policy

**Status note (2026-07-11, FEATURE-002):** resolved in v3 — `docdog
gc` evicts stale embed-cache rows, `--dry-run` supported (DD-070 §4).
Eviction is an explicit manual step, not a TTL: the age-based MVP
default sketched below was dropped after FRICTION-008 established
that auto-delete-by-timer violates DP-001.

The embedding cache (`embedding_cache` collection) grows as new content is indexed.
Needs a configurable eviction policy with sensible defaults.

**Considerations:**
- Entries not referenced by any current (non-deleted) vertex are candidates for eviction
- But keeping them is cheap (one 768-float array per entry) and valuable for branch
  switch performance — the whole point of the cache
- Age-based eviction? (remove entries older than N days with no references)
- Size-based eviction? (keep cache under N MB)
- Manual trigger only? (`docdog gc --cache`)
- Should `docdog gc` prune the cache by default, or only with `--cache` flag?

**Default for MVP:** `docdog gc` prunes cache entries not referenced by any current
vertex AND older than 30 days. Configurable in `.docdog/config.yaml`.

**Defer to post-MVP:** advanced policies (LRU, size-based), per-collection settings.
