---
id: DISC-040
title: The feedback story — replacing the local-file exchange with the user's
  own GitHub account, per-report consent, and a decision procedure that must
  stay in the skill
collection: discussions
status: resolved
date: 2026-08-25
retained_privately: docdog-discussions
relationships:
  - references: DISC-022
    context: the thread that created the conduit this one replaces — a directory of
      dated feedback-* notes harvested at phase gates, which works only while
      the reporter and the maintainer share a filesystem
  - references: DP-001
    context: the principle that splits the feature — formulating a report, judging
      whether an existing issue is the same one, and choosing between comment
      and new issue are tier 3 and belong to the agent; the mechanical halves
      are already covered by gh and status --json
  - references: DP-003
    context: "clause 3 supplies the bar that keeps code out of this release: the
      escape hatch here is the agent hand-assembling an issue body, and it has
      been hand-rolled zero times, not three"
  - references: PROPOSAL-028
    context: the accept-all line, restated for a second surface — an unattended
      report-everything mode is the same forbidden shape, because it sends the
      user's content on a judgment the user never made
  - references: PROPOSAL-027
    context: "the generic frontmatter attributes that carry the backlink:
      upstream_issue is set with the update fields patch and read back with list
      --where"
  - references: FRICTION-040
    context: the installed-skill shape the feedback skill must follow — a prefixed
      directory, because a flat .md is discovered by nothing, silently
  - references: DD-038
    context: "the standing no-automated-leak-detection posture, applied one level
      out: the reviewer of an outbound report is the agent and the user, and the
      rule is that the user sees the exact bytes before they leave the machine"
  - references: WF-006
    context: the friction-resolve loop the maintainer-side intake feeds — an
      external issue becomes a FRICTION record and then drains through the
      existing workflow
  - references: PROPOSAL-035
    context: "the boundary this reuses: docdog refuses its own writes and leaves the
      host's job to the host, exactly as it declines to hold a credential and
      leaves the send to the user's gh"
  - companion: DISC-039
    context: the same message's other half, split per WF-001; the consent asymmetry
      between a version check and a report was argued there and is the
      load-bearing premise here
  - follows_workflow: WF-001
---

# DISC-040: The feedback story — replacing the local-file exchange with the user's own GitHub account, per-report consent, and a decision procedure that must stay in the skill

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-040` for what it
connects to.
