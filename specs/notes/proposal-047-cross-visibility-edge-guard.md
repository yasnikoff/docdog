---
id: PROPOSAL-047
title: "Cross-visibility edges: derive visibility from git, report the leak, refuse the write, name the repair"
collection: proposals
status: shipped
date: 2026-08-28
description: "A record in a committed file may not declare an edge to a record in a file that will never be in the clone — the same relationship recorded on the other side carries the same information and leaks nothing."
relationships:
  - references: DISC-041
    context: "the discussion this is split out of — the one piece that is broken today regardless of how projection, local/ and adapters land"
  - references: DP-001
    context: "the walk that shapes it: asking git what it tracks is tier 1, refusing a write with an override is tier 2, and deciding what ought to be private is tier 3 and stays out"
  - references: DD-071
    context: "the boundary this makes safe — 'the corpus ships whole' is correct only while the corpus IS whole, and this is the check for when it is not"
  - references: DD-070
    context: "why the guard reads git rather than frontmatter: disk is canonical and git is the archive, so git is also the authority on what a clone will contain"
  - references: PROPOSAL-024
    context: "the surface that manufactures the leak — the scanner offers a tracked-to-ignored candidate today with nothing to distinguish it"
  - references: PROPOSAL-028
    context: "the bulk-accept path that would write such an edge across a whole batch, and where the refusal has to land to be worth anything"
  - references: FRICTION-025
    context: "the lesson constraining how suppression may work here: a candidate that vanishes silently is the failure that note measured, so a cross-visibility candidate is marked and never hidden"
  - references: OBS-014
    context: "supplies the repair — traverse reads inbound edges for free, so the same relationship recorded on the less-visible side carries the same information with nothing to leak"
---

# PROPOSAL-047: Cross-visibility edge guard

## The gap

A file git ignores, inside a `scan_paths` directory, is indexed and
retrievable (DISC-041 finding 0). That is the mechanism for "private
but indexable" and it works today. What does not work is keeping the
privacy once a public record mentions the private one:

```
$ docdog suggest-edges
  PUB-001  (specs/public.md)
    - references: PRIV-001
```

Accepting that writes `- references: PRIV-001` into `specs/public.md`,
which **is** committed. Two things go wrong at once, and only the
first is about privacy:

1. The private record's **id, and the fact of its existence**, are
   published.
2. Every clone gets an edge to a record it does not have. `traverse`
   resolves it to nothing; `docdog index` reports it as a dangling
   target. The public repo is *broken*, not merely leaky.

Nothing anywhere distinguishes this candidate from any other.

## Visibility is derived, never declared

The obvious move is a frontmatter field, and it is the wrong one.
`scope` is already carrying two unrelated meanings in this corpus
(DD-058's *who may see this*, DP-002's *who wrote this* — 320/26/11),
and a third claim on one string is the smaller objection.

The larger one: **a marker can disagree with reality.** A record
stamped `scope: private` that is nonetheless committed reads as a
guarantee and is a decoration — the exact failure FRICTION-052
describes one directory over. Git is the authority on what a clone
will contain, so the guard asks git.

## The classification

Three states, all mechanically distinguishable, all verified:

| file | probe | state |
|---|---|---|
| tracked by this repo | `git ls-files` | **in-clone** |
| ignored | `git check-ignore` → exit 0, names the rule | **out-of-clone** |
| outside the worktree | path is not under `git rev-parse --show-toplevel` | **out-of-clone** |
| inside, untracked, unignored | `git check-ignore` → exit 1 | **undecided** |

The fourth row is the one that decides whether this feature is usable.
A record you have written and not yet committed is *not* a leak; it is
work in progress, and the answer changes the moment you `git add`.
Conflating it with a deliberate exclusion would fire the warning on
every new record until commit, which is how a warning gets turned off.
**Undecided never triggers anything.**

Rows 2 and 3 collapse on purpose. "Ignored" and "outside the
worktree" are different reasons for the same fact — this file will not
be in a clone — so the external-corpus case (`scan_paths: ../other/`,
also verified to index) is covered by the same predicate at no extra
cost.

Cost: two subprocesses per whole-corpus run (`git ls-files`, one
batched `git check-ignore --stdin`) plus a prefix comparison. **Not a
git repo, or no git: the whole check is skipped**, silently. It is an
optional guard on an optional integration and must fail in the
direction of doing nothing.

## The rule

> An edge may point from less-visible to more-visible. Never the
> reverse.

`in-clone → out-of-clone` is the violation. Every other combination is
fine, including `out-of-clone → in-clone` (the edge lives in the file
nobody else has) and `out-of-clone → out-of-clone` (internally
consistent within the machine that has both).

## The repair is a redirect, not a refusal

This is what makes the guard cheap to obey rather than something to
override. The relationship does not have to be discarded — it has to
be recorded on the other side:

```
PUB-001  → references → PRIV-001     leaks, dangles in every clone
PRIV-001 → references → PUB-001      identical information, leaks nothing
```

`traverse` reads inbound edges for free — the `edges.to_id` index is
complete by construction under forward-edge-only (PROPOSAL-031), and
OBS-014 established that a same-typed reciprocal is not a second
relationship. So on the machine holding both files, `traverse PUB-001`
surfaces the private record as an inbound edge exactly as before. In a
clone, it surfaces nothing. **The information is preserved precisely
where it is allowed to exist**, and the public repo stays whole.

Docdog names this repair. It must never perform it: silently flipping
an edge the author wrote is rewriting an assertion, and which
direction a relationship runs is the author's claim (DP-001 tier 3).

## Where it fires

Three surfaces, because the leak has three moments:

1. **`docdog index`** — a whole-corpus post-pass in
   `storage/edge-health.ts`, joining `edges` to `vertices.file_path`
   twice. Same shape, same file, same posture as the existing
   unregistered-type and dangling-target checks: warn, persist
   nothing, skip on path-scoped runs. This catches edges already in
   the corpus, including ones written before the guard existed.
2. **`docdog relate` / `docdog_relate` / `--accept-from`** — refuse
   the write, name the redirect. This is the moment the leak is
   actually created, and a warning that arrives after the file is
   written and committed is a warning that arrived too late. Refusal
   is per-edge in the batch path, matching how PROPOSAL-028's guards
   already skip rather than throw.
3. **`docdog suggest-edges`** — **mark, never hide.** A
   cross-visibility candidate is offered with its violation noted, the
   way a rejected candidate is offered with its reason. FRICTION-025
   measured what silent removal costs: the judgment leaves no trace
   and the same work is redone every sweep. The scanner reports; the
   agent decides which side to write it on.

An override on the refusal (`--allow-cross-visibility`) is tier 2 —
visible default, per-edge, no `--allow-all` analogue, ever.

## DP-001 walk

- **Tier 1.** Asking git which files it tracks or ignores. Comparing
  two derived states. Joining two tables. No judgment anywhere.
- **Tier 2.** Refusing the write by default with a per-edge override.
- **Tier 3, refused.** Inferring that a record *should* be private.
  Moving a record between destinations. Rewriting the edge's
  direction. Suppressing the candidate. Guessing that an untracked
  file was meant to be ignored.

## What this is not

- **Not a security control.** It stops docdog from writing a pointer
  into a tracked file. It does nothing about prose that mentions the
  same id in the body, and it cannot — deciding that a string in a
  paragraph is a disclosure is judgment. Same boundary PROPOSAL-031
  drew when it reported prose mentions instead of rewriting them.
- **Not a claim that gitignored records are secure.** They are
  plaintext on disk. `local/` over `private/` for the same reason.
- **Not dependent on the projection design.** It is correct for a
  hand-written gitignored note, an external scan path, and a generated
  projection alike, because all three produce the same fact: a file
  that will not be in the clone.

## Acceptance criteria

- [x] `visibilityOf(path)` returns in-clone / out-of-clone / undecided
      and is skipped wholesale outside a git repo.
- [x] An `undecided` target triggers nothing, on every surface.
- [x] `docdog index` reports in-clone → out-of-clone edges with both
      file paths, and is silent on the other three combinations.
- [x] `relate`, `docdog_relate` and `--accept-from` refuse such a
      write and name the reversed edge as the repair.
- [x] `suggest-edges` marks the candidate and never omits it; `--json`
      carries the mark.
- [x] An external scan path outside the worktree classifies as
      out-of-clone without a `git check-ignore` call.
- [x] The override is per-edge and there is no batch-wide form.

## Shipped (2026-08-28)

Three commits, one per surface: `027434f` (index-time report),
`73b9c1b` (write refusal), and this one (candidate marking). Tests
808 → 842.

`src/storage/visibility.ts` holds the classification and the rule;
the three git probes live in `storage/git.ts`, whose docstring already
claimed every git invocation in the codebase.

**Two things the build changed from this document.**

The classification collapsed "ignored" and "outside the working tree"
into one state rather than carrying them separately — different reasons,
identical consequence — which is what makes the external-corpus case
free rather than a second feature.

`checkEdgeHealth` takes `projectRoot` as a **required** argument. The
check is silent when git cannot answer, so an omitted optional argument
would have been indistinguishable from that silence, and a caller who
forgot it would have lost the check invisibly.

**One property that only showed up end to end, and is worth keeping.**
`--allow-cross-visibility` waives the *write*, not the *defect*: the
index-time check goes on reporting the edge every run afterwards. That
is the right split — the override says "I know, write it anyway", not
"stop telling me" — and it means the standing state of the corpus is
never silently agreed to. Verified by applying an override and watching
the next `docdog index` name the same edge.

Verified with the built binary against a constructed leak in this
repository, across the whole loop: the scanner marks it and still offers
it, `--format review` warns without pre-writing a `reject:` (a filter and
a rejection are different claims), `--accept-from` skips it naming the
repair, the override applies it, and `docdog index` then reports it.
