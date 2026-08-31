---
id: OQ-44
title: "Does DD-034's artifact-resilience test apply retroactively to existing specs?"
collection: questions
status: open
related: [DD-034, DISC-011, PROPOSAL-017]
relationships:
  - references: DD-034
    context: the question's subject — whether its artifact contract applies retroactively or by opportunistic backfill
  - discussed_in: DISC-011
  - references: PROPOSAL-017
    context: "the EJ→DD refactor is one opportunity to opportunistically backfill"
description: "DD-034 commits new artifacts to a stronger frontmatter/body contract. Question is whether existing ej-NNN, proposals, discussions, and observations should be audited and backfilled to the same standard, or grandfathered."
---

# OQ-44: Retroactive application of DD-034

DD-034 says: every new task, workflow, feature, decision,
proposal, and observation must carry its relationships and
load-bearing context in on-disk frontmatter + body, so that a
vanilla agent can reconstruct the project without docdog running.

Many pre-DD-034 artifacts don't meet this standard. Some cite
other artifacts only in prose. Some have thin frontmatter. Some
assume the reader has docdog's graph to fill in edges. Three
plausible answers:

**(a) Grandfather.** New artifacts held to DD-034; old ones left
alone. Lowest friction. Downside: the vanilla-agent test has a
visible gap — parts of the repo pass, parts don't.

**(b) Audit + backfill.** Walk every existing artifact, upgrade
frontmatter to meet the standard. High value, high cost.
Probably 2-3 sessions of pure capture work.

**(c) Opportunistic backfill.** Grandfather the corpus, but
upgrade each artifact when it's touched for any other reason
(supersession, edit, referenced). No dedicated pass; the corpus
drifts toward compliance as work happens.

**Lean:** (c) opportunistic. PROPOSAL-017's EJ→DD refactor is
one natural trigger — each DD mirror is a chance to upgrade
frontmatter. Normal edit flow handles the rest. The audit gap
shrinks monotonically without any dedicated session.

**Open:** is the lean right, or is there a case for (b)? The
argument for (b) is that the vanilla-agent test is only
meaningful if the whole repo passes — partial compliance means a
vanilla agent still hits random gaps. The counter is that the
whole repo will never pass at once anyway (new artifacts are
constantly being added), and the goal is asymptotic compliance,
not a snapshot.

Defer until a concrete need surfaces — e.g. "I tried to hand the
repo to Cursor and it couldn't make sense of three specs."