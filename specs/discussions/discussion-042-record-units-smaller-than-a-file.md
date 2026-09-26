---
id: DISC-042
title: "The first external report asks for a record unit smaller than a file, and
  three of its four asks are already shipped — what is missing is one predicate,
  a relation mapping, and a specificity rule"
collection: discussions
status: open
date: 2026-09-20
retained_privately: docdog-discussions
relationships:
  - references: DD-067
    context: "the decision that already grants asks 1-4: parsers are declared per
      scan path, and the split parser produces one vertex per id-bearing section
      with the id read from the text"
  - references: DD-043
    context: "the constraint that silently blocks ask 3 — edges are born only in a
      `relationships:` block, so the reporter's `amends: [D-GRAPH-13]` top-level
      frontmatter key is invisible no matter how well the rows index"
  - references: DD-068
    context: "the cost side of index-time sub-file records: split-parsed sections
      keep minimal on-disk metadata and refuse the write tools, which bounds what
      adoption can offer the reporter even when it succeeds"
  - references: DISC-034
    context: "the open ancestor, and the frame this report breaks: that discussion
      argued authoring-time splitting into files, which a corpus that must not be
      reformatted cannot do — this is the third mechanism, neither chunking nor
      re-authoring"
  - references: PROPOSAL-045
    context: "the standing regex refusal that must be scope-checked rather than
      cited: both of its reasons are about the split COMMAND's `--on`, and both
      fail for a config key that no heading prefix list can express"
  - references: PROPOSAL-034
    context: "why the multi-cohort escape that defeated regex once does not defeat
      it here — a list of heading prefixes is unbounded in cohorts and closed in
      shape, and the shape is what is wrong"
  - references: FRICTION-023
    context: "the last coverage gap found in this parser, and the precedent for how
      one is closed: two backward-compatible ScanPathConfig keys, no new command"
  - references: FRICTION-039
    context: "the defect any raw-line regex would re-introduce — fenced code blocks
      and setext headings — which is why a pattern must match mdast nodes rather
      than lines"
  - references: OBS-016
    context: "the refusal that does NOT bind this and will be pattern-matched onto
      it: its mechanism assumes the record is one idea, and 261 decisions glued
      into one file have no aboutness to destroy"
  - references: OBS-024
    context: "explains why the reporter's corpus retrieves at all — FTS finds the
      row's text and hands back the file — and why the vector leg is blind rather
      than weak at ~2-3% of the file embedded"
  - references: OBS-019
    context: "the mechanism that makes whole-file embedding defensible for a record
      and indefensible here: framing-at-the-top is a property of one document, not
      of 261 stacked ones"
  - references: DP-001
    context: "decides the labor split cleanly for once — the author writes the
      pattern and docdog matches it, tier 1; a per-collection rule would need
      docdog to know the collection before parsing, which it cannot"
  - references: DD-064
    context: "the escape hatch that already answers the whole report, via
      `parser: script`, and that the reporter never found"
  - references: OQ-38
    context: "asked what restructuring helpers docdog should provide; this report is
      the case for the one it did not name — leaving the document alone and
      teaching the indexer its units"
  - references: DD-044
    context: "the original commitment to section granularity, which this report
      shows was implemented for headings and only for headings"
  - references: PROPOSAL-031
    context: "the contested-id machinery that an overlapping scan entry stresses:
      two entries covering one file reindex the same file_path in sequence and the
      list order decides"
  - references: PROPOSAL-043
    context: "the feedback channel that produced this report, working as designed on
      its first use"
  - references: PROPOSAL-048
    context: "the code change this surfaced — the one predicate that is missing, split
      out with the PROPOSAL-045 scope-check written down so the regex refusal is
      not cited to close it"
  - references: OQ-48
    context: "the ask hiding inside ask 3, kept separate on purpose: the rows can
      become records and their declared graph still does not arrive"
  - references: FRICTION-056
    context: "the docs defect this found — the escape hatch that already answers the
      report, documented once under a heading about foreign file formats"
  - references: FRICTION-057
    context: "the defect found while answering the granularity question, true today
      regardless of this report: two entries covering one file race, and the file
      flips between its two parses on every run (measured 2026-09-25; list order
      does not decide, as first filed)"
  - references: FRICTION-058
    context: "found by running the acknowledgment's script sketch before posting it:
      the script parser ignores the scan entry's `collection:`, so the drafted config
      would have filed all 261 rows under the default collection"
  - references: FRICTION-059
    context: "found in the same pre-post run: editing a parser script re-parses
      nothing without `--full`, because the scan-entry signature carries the
      script's name and not its contents"
  - follows_workflow: WF-007
    context: "the triage this report walked, and the first run of a workflow whose
      own notes predicted the table would be wrong in a row"
  - follows_workflow: WF-001
    context: captured under the discussion-capture workflow
---

# DISC-042: The first external report asks for a record unit smaller than a file, and three of its four asks are already shipped — what is missing is one predicate, a relation mapping, and a specificity rule

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-042` for what it
connects to.
