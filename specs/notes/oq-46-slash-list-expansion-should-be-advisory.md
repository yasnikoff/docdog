---
id: OQ-46
title: "Slash-list expansion in suggest-edges — its safety net is sparsity, not design; should it be optional or advisory?"
collection: questions
status: open
date: 2026-07-14
description: "`OQ-18/19/21` expands to three ids by re-using the head's stem. The expansion is purely lexical, and bogus products (`DD-070/2` → `DD-2`) are dropped by intersecting against known ids — but that net holds only because the named id happens not to exist. It is sparsity, not a guarantee. `X/2` is also a plausible section reference in a corpus that writes `DD-070 §2` constantly, and a namespaced id space (DISC-027) makes accidental hits likelier. The feature was needed and earns its keep (OBS-014); the question is whether expanded candidates should be labelled as such in the report, or gated behind a flag, rather than presented as ordinary mentions."
relationships:
  - references: PROPOSAL-024
    context: "the scanner this questions — expansion lives in its mention grammar, and the known-id intersection it relies on is the same net that catches UTF-8 and SHA-256 false positives"
  - references: OBS-014
    context: "why expansion exists and should not simply be removed — slash-lists were the scanner's recurring blind spot, and matching only the head manufactured the arbitrary-subset shape its own triage taxonomy tells reviewers to reject"
  - references: DP-001
    context: "the tier the question turns on — the expansion is defended in code as tier-1 lexical mechanics, but a mechanic whose correctness depends on a coincidence about the id space is doing quiet inference"
  - references: DISC-027
    context: "the change that erodes the net — if a host project mints namespaced ids (DD-T168-01), the id space gets denser and a bogus expansion is likelier to name a real record"
  - references: PROPOSAL-031
    context: "the downstream limit this imposes — renumber cannot rewrite a slash-list mention by token substitution when only one sibling is renamed, so it reports them for manual repair instead"
---

# OQ-46: Should slash-list expansion be optional or advisory?

## What ships today

`src/storage/suggest.ts`:

```js
const MENTION_REGEX = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+(?:\/\d+)*\b/g;
```

A trailing run of `/<digits>` is absorbed into the mention, and
`expandMention` re-uses the head's stem for each group: `OQ-18/19/21` →
`OQ-18`, `OQ-19`, `OQ-21`; `DD-ARCH-01/02` → `DD-ARCH-01`, `DD-ARCH-02`.

The code defends this as Tier-1 mechanics, and is explicit that it decides
nothing about whether an expansion is real:

> `DD-070/2` expands to DD-2 the same way, and the known-id intersection in
> `suggestEdges` drops it — the same net that already catches UTF-8 and
> SHA-256.

## The doubt

**The net is sparsity, not design.** `DD-070/2` is safe *only because
`DD-2` does not happen to exist*. Nothing structural prevents a bogus
expansion from naming a real record; it is a coincidence about the current
id space, re-rolled every time the corpus grows. A mechanic whose
correctness rests on a coincidence is doing inference quietly — which is
exactly the thing DP-001 exists to catch.

Two forces make the coincidence less reliable over time:

1. **`X/N` is genuinely ambiguous in this corpus.** We write `DD-070 §2`,
   `P-023 §5`, `DD-070 §3` constantly. `DD-070/2` is at least as plausibly
   a *section* reference as a sibling-id list — and it expands to a vertex
   reference either way.
2. **Namespaced ids densify the space** (DISC-027). If a host project mints
   `DD-T168-01`, the population of short, oddly-shaped real ids grows, and
   with it the chance an accidental expansion lands on one.

The feature is not a mistake — it earned its place. OBS-014 recorded
slash-lists as the scanner's recurring blind spot, and matching only the
head *manufactured the arbitrary-subset failure* the triage taxonomy tells
reviewers to reject. It was needed for the orchestrator corpus and for
docdog's own. Removing it would reintroduce a known, measured defect.

## The question

Should an expanded candidate be presented as an ordinary mention, or should
its provenance travel with it?

- **(a) As-is.** Expansion silently produces candidates indistinguishable
  from literal mentions.
- **(b) Advisory — label provenance.** Each candidate carries
  `literal` vs `expanded`, so a reviewer draining a report can reject
  expansions cheaply and in bulk, and a spurious one is visible rather than
  camouflaged. Costs one field in `--format review`; changes no behavior.
- **(c) Opt-in flag.** `--expand-slash-lists`, off by default. Restores the
  blind spot for everyone who does not know the flag exists.

**Leaning (b).** It is the DP-001-shaped answer: the mechanics stay exactly
as they are, and the *judgment* — is this expansion real? — gets the
information it needs to be exercised. (c) trades a measured defect for an
unmeasured one and hides the fix behind knowledge the user does not have.

## Consequence already noted

PROPOSAL-031's `renumber` cannot rewrite a slash-list mention by token
substitution when only one sibling is renamed (`OQ-18/19/21`, renaming
`OQ-19`, has no substitution that preserves meaning). It reports such
mentions for manual repair. Whatever this question settles, that limit
stands — a compressed multi-id token is not a token you can rename.

## Status

Open. Surfaced 2026-07-14 by the user during DISC-027, flagged as off-task
and worth its own record: *"I had my doubts about introducing the feature
but it was needed for the orchestrator and docdog itself. We should make
the feature optional/advisory."*
