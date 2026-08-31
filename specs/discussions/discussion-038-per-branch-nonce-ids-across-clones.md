---
id: DISC-038
title: Id minting across clones — a per-branch nonce beats a stable machine id,
  because distinctness is the load-bearing property and stability is the one
  that leaks
collection: discussions
status: open
date: 2026-07-31
retained_privately: docdog-discussions
relationships:
  - references: DISC-027
    context: the predecessor this continues — it resolved the worktree case by
      partition-by-node-identity and named the across-clones case as where the
      hard problem actually lives; this thread takes up exactly that parked
      half, and amends its rejected-alternatives bullet on random ids
  - references: PROPOSAL-031
    context: the promotion primitive a nonce scheme consumes — renumber already
      rewrites an id, its file and every inbound edge exactly; what is missing
      for this is the sweep that drives it over a whole branch
  - references: OQ-46
    context: the slash-list fragility that supplies the safer-to-rewrite argument —
      a nonce id cannot form a slash-list or collide as a substring, so the
      hazard that forces renumber to report prose instead of rewriting it does
      not arise
  - references: OQ-43
    context: contested ids as queryable state — the detection half a nonce scheme
      falls back on when two branches draw the same nonce, which is what makes
      the residual collision risk affordable
  - references: DP-001
    context: "the decisive argument: optimistic ordinal minting makes merge-time
      resolution tier 3 judgment per record, while nonce minting leaves a
      fixed-rule renumber at tier 1 — the same judgment-into-mechanics move
      renumber itself made"
  - references: DD-050
    context: the tier ladder that holds DISC-027's division of labour in place —
      docdog must not learn what a branch is, so the mint convention stays
      host-side and only the sweep could be docdog's
  - references: DP-003
    context: the escape-hatch rule that would authorize building the promotion sweep
      — hand-rolling the drive over renumber is the escape hatch, and it has
      been used zero times, which is the honest reason this is not yet
      proposal-ready
  - follows_workflow: WF-001
---

# DISC-038: Id minting across clones — a per-branch nonce beats a stable machine id, because distinctness is the load-bearing property and stability is the one that leaks

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-038` for what it
connects to.
