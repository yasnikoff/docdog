---
id: PROPOSAL-043
title: "The feedback channel — the reporter's own GitHub account, per-report consent, and a decision procedure that ships as a skill because none of it is mechanical"
collection: notes
status: shipped
date: 2026-08-25
description: "DISC-022's feedback conduit — dated notes in a directory, harvested at phase gates — assumes the reporter and the maintainer share a filesystem, which a second user on another machine does not. Replaces it with GitHub issues reached through the reporter's own gh CLI or a prefilled issues/new URL, so the credential and the authorship stay theirs and docdog holds no token and runs no endpoint. Consent is asked per report, on the exact bytes, because a stored blanket yes is consent to content that does not exist yet. The formulate/search/decide procedure is DP-001 tier 3 at every step and ships as the docdog-feedback skill; zero code ships, on DP-003 clause 3's own hand-rolled-three-times bar. Adds the two halves the sketch lacked: an upstream_issue backlink making 'did I already report this' answerable offline, and WF-007 intake so a report does not land in the one corpus docdog cannot search."
severity: n/a
relationships:
  - references: DISC-040
    context: "the discussion that decided this shape, including the rejection of stored blanket consent and the decision to ship no code"
  - references: DISC-022
    context: "the conduit being replaced — its local-directory harvest was right for a co-located dogfood and has no source once the reporter is remote"
  - references: DP-001
    context: "the split that keeps this out of code: judging whether someone else's issue is the same as yours is the paradigm tier 3 call, and it sits in the middle of the procedure"
  - references: DP-003
    context: "clause 3 cited against building — the issue-body projection has been hand-rolled zero times, and clause 3 is a trigger rather than a licence"
  - references: PROPOSAL-028
    context: "the --accept-all line restated for an outbound surface: an unattended report-everything mode automates a decision the user never made, with the blast radius of leaving the machine"
  - references: PROPOSAL-027
    context: "the fields patch that writes the upstream_issue backlink onto the local record"
  - references: PROPOSAL-042
    context: "its companion in this release, and a consumer: a search that lands on a CLOSED issue means the fix already shipped, which turns a report into an upgrade"
  - references: FRICTION-040
    context: "the installed-skill shape this must follow — .claude/skills/docdog-feedback/SKILL.md, because a flat .md is discovered by nothing, silently"
  - references: FRICTION-045
    context: "the gap the backlink exposes: --where is equality-only, so 'which frictions are unreported' cannot be asked once upstream_issue exists"
  - references: DD-038
    context: "the no-detection-pipeline posture applied one level out — the reviewer of an outbound report is the agent and the user, and the rule is that the user sees the exact bytes"
  - references: DD-071
    context: "why the tracker and the corpus share an id space: the corpus ships whole in the public repo, so an external reporter can cite DD-070 and be understood"
  - references: WF-006
    context: "the drain this feeds — an accepted external report becomes a FRICTION record and resolves through the existing workflow"
---

# PROPOSAL-043: the feedback channel

## Motivation

The existing conduit was designed in DISC-022 and was correct for the
situation it was designed in: the adopting repo wrote dated `feedback-*`
notes into one of its own directories, and docdog-side sessions
harvested them into FRICTION and OBS records at phase gates. It has
produced most of the friction backlog.

Every step of it assumes one filesystem. A user on another machine has
no directory the maintainer can read, and the harvest has no source. The
replacement is not really new machinery — it is a **new owner of the
transport**. GitHub already accepts writes from strangers, and the
reporter already has an account there.

## What ships

Nothing executable. Four artifacts and a sentence.

1. **The `docdog-feedback` skill** — `docdog skill install feedback`,
   landing at `.claude/skills/docdog-feedback/SKILL.md`, the prefixed
   directory shape FRICTION-040 established.
2. **`.github/ISSUE_TEMPLATE/friction.yml`** in the public repo, whose
   fields mirror the FRICTION frontmatter: title, one-sentence
   description, severity (`blocks-work` / `inconvenient` / `cosmetic`),
   what you were doing, what happened, workaround, environment.
3. **Labels** matching those fields — `friction`, `severity:*`,
   `external` — so triage is a filter rather than a reading.
4. **A CONTRIBUTING section** naming the channel and the consent rule.
5. **The standing-refusal sentence**, for a reporter whose environment
   forbids outbound reporting: a line pasted into their own `CLAUDE.md`
   saying so. Deliberately not a config key — a key needs a reader, and
   the only reader would be the skill, so the key would be a second
   place for the same instruction to drift.

The environment block is filled by pasting `docdog status --json`,
which already emits version, collections, record and edge counts, cache
location and embed model. That is the whole mechanical assist, and it
cost nothing to build because it already existed.

## The procedure the skill carries

Written as guidance with reasons, not as a decision table, because every
branch below is a judgment and the skill's job is to inform it.

1. **Precondition: it is already a local record.** A report starts from
   a `FRICTION-NNN` in the reporter's own corpus. The issue is a
   *projection*; the record is the source. This is the same relationship
   the corpus has to the cache, and it means a reporter who never sends
   anything still has their finding.
2. **Formulate.** Title, one-sentence description, severity, the
   smallest sequence that reproduces it, the environment block.
3. **Redact before searching, not after deciding.** A useful report
   quotes record ids, titles, paths, sometimes body text — all of it the
   reporter's private project. Quote the minimum that reproduces the
   problem, *propose* redactions rather than applying them, and never
   attach the corpus. Auto-redaction is not on the table: deciding what
   is sensitive is tier 3, and a redactor that is wrong in the confident
   direction is worse than none.
4. **Search, including closed issues.**
   `gh issue list --repo yasnikoff/docdog --search "<terms>" --state all`.
   Closed is not noise — a closed issue means the fix shipped, so the
   correct outcome is often *upgrade*, not report, which hands the reader
   straight to PROPOSAL-042. That is the single highest-value branch in
   the procedure and it is invisible if the search is `--state open`.
5. **Decide.** Same symptom and same cause → comment with what is new.
   Same symptom, different cause → new issue, cross-referencing. Already
   fixed → upgrade and record that on the local record instead. Nothing
   new to add → do nothing, and say so; a report that adds nothing costs
   the maintainer a read and the reporter a round trip.
6. **Ask.** Show the exact bytes. Per report, every time. The payload is
   different each time, which is the whole argument against a stored
   blanket yes — it would be consent to content that does not exist yet.
7. **Send, as the user.** `gh issue create` / `gh issue comment` when
   `gh` is installed and authenticated; otherwise emit a prefilled
   `https://github.com/yasnikoff/docdog/issues/new?title=...&body=...`
   for the user to click. Both paths share the property that matters:
   **the last action before anything leaves the machine is the user's.**
8. **Backlink.** Write `upstream_issue: <url>` onto the local record
   with PROPOSAL-027's `fields` patch, so *"did I already report this?"*
   is answerable from the reporter's own corpus, offline, without
   consulting a tracker.

## What must never be built

- **An unattended report mode.** PROPOSAL-028 forbade `--accept-all`
  because the decision it automates belongs to the user. This is the
  same shape with a worse blast radius, since what is decided leaves the
  machine.
- **A docdog-owned endpoint, token or telemetry stream.** The first
  would be the first service dependency in a project whose pitch is
  having none; the rest would make docdog the accountable party for
  content it did not write.
- **Automatic redaction**, per step 3.
- **A crash reporter.** An unhandled exception is exactly the moment
  consent cannot be asked, which is the moment it matters most.

## Why no code, stated as a bet

The obvious command is `docdog feedback <FRICTION-ID>`, projecting the
record's frontmatter into an issue body. It is honest tier 1 mechanics
and it will probably exist. DP-003 clause 3's bar is *hand-rolled three
times*; this has been hand-rolled zero, and the last two commands
resurrected on that clause (`suggest-edges`, `--accept-from`) each had
three documented instances behind them. Building it now would be
guessing at the body format before a single real report has been
written — and the format is the only part a command would own.

The bet is falsifiable in the ordinary way: if the skill's steps get
hand-assembled three times, clause 3 fires and the command gets written.

## The intake half

A report that lands in an untriaged tracker teaches the maintainer
nothing and teaches the reporter that reporting is pointless. WF-007
closes it: issue → `FRICTION-NNN` in this corpus → drain through WF-006
→ close naming the fix commit and the version it shipped in. Written as
a workflow record per DD-036.

One asset worth naming, because it is unusual: DD-071 ships the specs
corpus **whole** in the public repo, so the tracker and the corpus share
an id space. An external reporter can cite `DD-070` or `DP-001` and be
understood, and the maintainer can answer with a record rather than a
paraphrase.

## Principles

- **DP-001.** Tier 1: reading `gh` output, formatting a URL, patching a
  frontmatter field — all of which already exist. Tier 3, hence
  agent-side: whether an observation is worth reporting, whether an
  existing issue is the same one, what to redact. Nothing landed in
  between, which is the sign the split is on a real seam.
- **DP-002 — untouched.** `upstream_issue` is a plain frontmatter field
  under PROPOSAL-027, not a new collection or relation type.
- **DP-003 — cited against building**, above.

## Cost

Zero code, zero tests beyond the seed-set pin that every shipped skill
carries (`tests/unit/skill-seeds.test.ts`). One skill, one issue
template, one label set, one CONTRIBUTING section, one workflow record.
The only ongoing cost is triage, which is the cost of having users.

## Shipped (2026-08-25)

Zero lines of feature code, as designed. What landed:

- **`docdog skill install feedback`** → `.claude/skills/docdog-feedback/SKILL.md`,
  registered beside `specs` and `navigate-specs` and sharing their
  no-corpus discovery. It carries the eight steps, the decision table, and
  a **Never** section naming the four things that must not be built.
- **`.github/ISSUE_TEMPLATE/friction.yml`** with the frontmatter's fields,
  `docdog status --json` as the environment block, and the install shape —
  which PROPOSAL-042 made worth asking for, since it decides the advice.
  Plus a `config.yml` routing questions to discussions rather than issues.
- **CONTRIBUTING** gained a reporting section and, deliberately, a *full*
  statement of what docdog transmits: one unauthenticated GET for a public
  package's `latest` tag, and the one-time model download. A privacy claim
  that is exhaustive can be checked; a reassuring one cannot.

One thing changed while implementing, in a neighbouring file. The seed set
derived its legacy-orphan paths from the skill registry — `.claude/skills/
<name>.md` for every registered name — which was fine while the registry held
`specs` and `navigate-specs` and became wrong the moment it held `feedback`:
docdog has never written `.claude/skills/feedback.md`, and a file by that name
is far more likely to be the user's own skill than docdog's orphan. Deriving a
*historical* fact from a *current* registry is the bug shape; the list is now
enumerated.

The registry entry is the only thing a test can pin here, and it is pinned: a
skill that quietly stops being registered stops being installable, silently —
the failure mode `tests/unit/skill-seeds.test.ts` exists to prevent for the
seeded skills.

**Still open, by design:** WF-007 is unexercised until the first external
issue arrives, and `docdog feedback <FRICTION-ID>` remains unbuilt with the
bar restated — three hand-rolls, not one.
