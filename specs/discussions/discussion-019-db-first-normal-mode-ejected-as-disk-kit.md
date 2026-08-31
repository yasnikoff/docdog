---
id: DISC-019
title: DB-first normal mode, ejected mode as disk-only kit
collection: discussions
status: resolved
date: 2026-04-14
retained_privately: docdog-discussions
relationships:
  - references: DD-034
    context: DD-034's artifact-resilience reframe already pulled 'eject' toward 'the
      on-disk artifacts survive without docdog.' This proposal formalizes what
      that means as a mode.
  - references: DD-035
    context: DD-035 scoped the resilience test to the `.docdog/` folder — exactly
      the folder ejected mode populates with skills and scripts.
  - references: EJ-030
    context: Historical ejection framing; this discussion is the direct successor
      for what 'ejected' actually means in v2.
  - references: DP-001
    context: DB-first write paths raise the temptation to add 'smart' behavior on
      write. DP-001 walk required before promotion.
  - references: DISC-018
    context: DISC-018's flat-vs-nested question collapses under this reframe — if
      disk files are DB snapshots, nested-always (option c) is the natural shape
      in both modes.
  - references: OQ-22
    context: "OQ-22 is prior art for OQ 7 (collaboration substrate): it already
      weighs shared ArangoDB vs CI-built snapshots + local restore vs
      arangodump/arangorestore, under EJ-016's scope-based sync. OQ 7's
      dedicated discussion should build on OQ-22, not re-derive it."
  - references: DISC-020
    context: "DISC-020 (spun out of OQ 7) resolved the collaboration substrate
      (git-first) and OQ 8's artifact format (lossless readable markdown). The
      2026-07-01 OQ 1/3/8 session ratifies and builds on it: OQ 3's
      DB-first-then-export write path is FORCED by DISC-020's graph-native
      one-tier edges — `docdog_relate` has no disk-first form."
  - references: DD-070
    context: "resolved this discussion's go/no-go with the canonicality arrow
      inverted: disk-canonical, DB as disposable embedded cache. PROPOSAL-023 §1
      records what carried over from this thread (one-tier edges, defaults-elide
      serializer, lossless markdown, git substrate) and what was rejected
      (DB-first write path, clobber-guard, index demotion)"
  - references: PROPOSAL-022
    context: the proposal this discussion promoted to — superseded by P-023 before
      implementation
  - references: PROPOSAL-023
    context: P-022's successor; the disk-canonical inversion that resolved this
      discussion against its own framing
  - references: DD-053
    context: chunking counter-argument — section-per-file layout already keeps
      documents near paragraph scale
  - references: DD-043
    context: chunk retrieval must resolve to the parent record for citation and
      edges per DD-043
  - references: PROPOSAL-003
    context: "cited in the why-this-is-worth-it list: DB-first makes the
      relationship graph the primary surface, which is what PROPOSAL-003 and the
      workflow primitives actually want"
  - references: FRICTION-005
    context: the strip-list notes that `docdog add` — the command a DB-first flip
      would delete — is also where FRICTION-005's Tier-3 id-inference lived
  - references: DP-003
    context: the strip-list argues `docdog run` is scope-creep against
      single-purpose because a general `.docdog/scripts/` runner overlaps
      DP-003's direct-DB escape hatch
  - references: PROPOSAL-018
    context: "OQ 4 (what ships in the ejection kit): if PROPOSAL-018's workflow
      primitives land DB-only lifecycle fields, those need a disk representation
      before ejection is honest"
  - references: EJ-016
    context: prior art for OQ 7's collaboration substrate — the shared-vs-personal
      sync mechanisms were already weighed under EJ-016's scope-based sync, so
      OQ 7 should build on it rather than re-derive it
  - references: PROPOSAL-021
    context: OQ 3's byte-deterministic-export obligation is de-risked by
      PROPOSAL-021's round-trip contract (`docdog index` accepts its own emitted
      files unmodified) — that contract is the determinism test
---

# DISC-019: DB-first normal mode, ejected mode as disk-only kit

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-019` for what it
connects to.
