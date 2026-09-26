---
id: DD-071
title: "Publication boundary: fresh public history, the corpus ships whole, private-project names stay out of the shipping worktree"
collection: decisions
status: current
date: 2026-07-11
relationships:
  - references: DD-038
    context: "this decision is DD-038's ad-hoc leak review, executed once at the publication gate; no automated pipeline was built"
  - references: DD-039
    context: "extends history-as-archive across the publication boundary: the full git history stays private as the archive; the public repo gets a fresh cut whose worktree is the public read surface"
  - references: DD-070
    context: "the v3 milestone this publication policy ships; the corpus and retrieval eval DD-070 produced are the public pitch"
  - references: OQ-03
    context: "operationalizes OQ-03's 'CLAUDE.md rules + ad-hoc review' answer at the one gate where it matters most"
  - references: OBS-010
    context: corpus-ships-whole clause exists to keep the eval re-runnable and OBS-010's published numbers honest
  - references: DP-001
    context: DP-001 check
  - references: FRICTION-055
    context: "the general shape this record instantiated — an audit line that was true when written, read seven weeks later as a statement of the present"
  - references: DISC-042
    context: "the first push to public main that was not a release (1602493, 2026-09-25), made so the records cited in issue #1's acknowledgment could be read; the 2026-09-27 amendment makes that a rule rather than a precedent"
  - references: WF-007
    context: "step 4 checks that every id an acknowledgment cites is readable on public main — the consumer of the between-releases push this record now permits"
  - references: DD-073
    context: "the amendment to clause 2 — discussions ship as stubs rather than whole, because the eval argument turns out to be two queries in forty and the dogfood argument does not reach a transcript"
description: "How docdog goes public, decided 2026-07-11 after a full audit. (1) The public history starts at publication: a fresh cut of the current tree — the full development history is never pushed, because it contains docs/discussion.md (explicitly gitignored as private) from the v1 era; it stays local as the DD-039 archive. (2) The specs corpus ships whole, no curation: it is the dogfood evidence, and the frozen retrieval-eval gold sets (tests/eval/queries.yaml) reference corpus records by id — curating would break the shipped eval and falsify OBS-010's numbers. (3) The private host-project name is genericized to host-project placeholders in the shipping worktree; generic role nouns like 'orchestrator' stay. (4) No leak-detection pipeline — this was DD-038's ad-hoc review, run once. AMENDED same day: the audit's claim that docs/discussion.md had been removed from the worktree was false — it was still tracked in HEAD (gitignore is inert for tracked files); fixed with git rm --cached so the fresh cut cannot ship it. Reliable sweep for this trap: git ls-files -i -c --exclude-standard. AMENDED 2026-07-20: the open registry question is closed — npmjs (registry.npmjs.org) as @yasnikoff/docdog, because GitHub Packages requires auth even for public installs, which would break the npx wiring docdog init writes into every adopter's .mcp.json; unscoped docdog and a @docdog org were both checked and rejected (squatted / brand mismatch). .npmrc deleted, HANDOFF-*.md untracked+gitignored. AMENDED 2026-08-31: clause 2 gains one exception (DD-073) — the 41 discussion records ship as STUBS carrying id, title, status, date and the full relationship graph, with bodies and descriptions moved to a private sibling repo; the eval ground for ships-whole was 2 of 40 golds and both still resolve, and the stub is what keeps the 117 inbound edges from dangling. Clause 1 is now load-bearing for a second reason: the full bodies live only in this repo's local history. AMENDED 2026-09-27: public main is the latest published cut of v3's tree, not a release line — releases are the v* tags, which alone trigger publishing; a between-releases cut to main is allowed when it makes a cited record readable, built the same way (commit-tree v3^{tree} -p origin/main, never v3 history). No develop branch: the default branch is where a reporter looks up a cited id, and cuts share no history to merge. AMENDED 2026-09-27 (second): v3 had no backup anywhere, so the working history now lives on a private remote (yasnikoff/docdog-dev, remote `private`, remote.pushDefault) and clause 1 is enforced by .githooks/pre-push — a push to the public repository may add only one single-parent commit on top of what it holds, with every discussion file a stub. Clause 3's host-name check stays manual, since encoding the name would publish it."
---

# DD-071: Publication boundary

V3 is done (P-023 all seven steps; OBS-010 holds the measured
retrieval win). What stands between the repo and a public GitHub repo
/ `npm publish` is a boundary question: what ships, and with what
history. Decided 2026-07-11 after a full audit.

## Audit findings (2026-07-11)

- `docs/discussion.md` — the raw 33-session discussion archive,
  listed in `.gitignore` with an explicit "private — not for public
  repo" marker — **is present in the full git history** (committed in
  the v1 era, e.g. `cf336f0`). Any push that includes v1-era history
  exposes it. `v3` carries that history; `origin/main` today is a
  single empty "Initial commit", so nothing sensitive is public yet.
  *(This audit also claimed the file had been "removed from the
  worktree" — that was wrong; it was still tracked in HEAD. See the
  2026-07-11 amendment below.)*
- The **private host-project name** (the repo docdog's ejection-era
  design work served) appeared on ~16 worktree lines across 11
  corpus/test files, plus the disposable session handoff. The name
  has no public association with the author's GitHub account
  (checked 2026-07-11), so it identifies a private codebase. This
  record deliberately does not repeat it; the private archive
  retains it everywhere.
- **"orchestrator"** (~150 further mentions) is a generic role noun
  and part of docdog's recorded origin story (docs-internal →
  orchestrator sidecar → docdog). It identifies nothing by itself
  and stays.
- No credentials, `.env` files, or user-identifying absolute paths
  ever entered history. The npm tarball (`files: dist/, templates/`)
  contains no corpus content regardless.

## Decision

1. **The public history starts at publication.** The public repo
   gets a fresh cut of the current tree; the full development
   history is never pushed. It stays local (and on any private
   remote) as the DD-039 archive — history remains a recovery path,
   not a public read surface. No history rewriting, no scrubbing:
   a clean boundary instead.
2. **The specs corpus ships whole.** Every decision / discussion /
   question / friction / observation record ships, EJ-era records
   included. Curation is rejected: the corpus is the dogfood
   evidence and the live demo, and the frozen retrieval eval
   (`tests/eval/queries.yaml`) references corpus records by id — a
   curated corpus would break the shipped eval's re-runnability and
   falsify OBS-010's published numbers.
3. **Private-project identifiers do not ship in the worktree.** The
   private host-project name is genericized to `host-project` /
   `<host-project>` placeholders (16 lines, mechanical replace,
   done with this decision). Generic role nouns ("orchestrator",
   "docs-internal") stay. `docs/discussion.md` stays gitignored.
   The private archive keeps the originals; if the author later
   declares the name public, reverting is a mechanical replace.
4. **No leak-detection pipeline.** This audit was DD-038's ad-hoc
   agent review, run once at the publication gate. Content written
   after the fresh cut is public-by-default; private-by-nature
   material goes under already-gitignored paths.

## What this does NOT decide

- *When* to publish, and whether public `main` is replaced in place
  or a new public repo is created — the author's call at publish
  time; the fresh cut is `git commit-tree`-level mechanics once
  instructed.
- npm registry choice (publishConfig currently points at GitHub
  Packages) — orthogonal to the boundary; revisit at publish time.

## Amendment (2026-07-11, same day): the archive was still tracked

A publish-readiness review hours after this decision found the
audit's worktree claim false: `docs/discussion.md` was committed in
the v1 era and **never removed** — it sat tracked in `v3` HEAD
(90,639 bytes), with the `.gitignore` entry inert (gitignore never
affects already-tracked files). The fresh cut as planned would have
shipped the very file this decision exists to keep private.

Why the audit missed it: `git check-ignore` consults the index and
reports nothing for tracked files, and ripgrep skips
gitignore-matched paths even when tracked — so both the "is it
ignored?" check and the content sweeps passed while the file sat in
the tree. The reliable sweep is `git ls-files -i -c
--exclude-standard` (tracked files matching ignore rules); its only
hit was this file.

**Fix, executed with this amendment:** `git rm --cached
docs/discussion.md`. The file stays on disk and in private history
(the DD-039 archive); it is no longer in the tree a fresh cut ships.
The file contains no private-project names (checked) — its
sensitivity is the explicit private marker, not an identifier leak.
Decision points 1–4 stand unchanged; point 1 is reinforced.

Also noted for publish time, same review: `.npmrc` (a
`@yasnikoff` → GitHub Packages scope mapping, no token) and
`HANDOFF-v3-session-5.md` (a session working file, clean of private
names) are tracked and ship in the fresh cut unless removed —
decide alongside the registry choice, which the same review
sharpened: the unscoped `docdog` name on npmjs is already taken by
an unrelated package, `@yasnikoff/docdog` is free there, and GitHub
Packages requires auth even for public installs.

## Amendment (2026-07-20): registry decided — npmjs, personal scope

The registry question this decision left open is closed at the alpha
gate: **registry.npmjs.org**, publishing as **`@yasnikoff/docdog`**.

Why npmjs over GitHub Packages: GH Packages requires authentication
even for public *installs*, and `docdog init` writes `npx -y
@yasnikoff/docdog serve` into every adopter's `.mcp.json`
(`src/cli/commands/init.ts`) — on GH Packages that wiring fails for
anyone without a PAT, breaking the primary onboarding path. npmjs
installs are anonymous.

Why the personal scope over a `@docdog` org (checked 2026-07-20):
unscoped `docdog` on npmjs is squatted by an unrelated abandoned 2018
package; `github.com/docdog` is owned by an unrelated third party, so
a `@docdog` npm org would claim a brand mismatched with the repo's
home at `github.com/yasnikoff/docdog`; and pre-1.0 with zero adopters,
a later move to a project scope is one publish plus one deprecation
pointer — no urgency premium.

Executed with this amendment: `publishConfig.registry` dropped
(npmjs default; `access: public` kept for the scoped name), tracked
`.npmrc` scope-mapping deleted, and `HANDOFF-*.md` untracked +
gitignored so the session working file can never ride the fresh cut —
closing the two loose ends the 2026-07-11 amendment flagged.

## Amendment (2026-08-31): clause 2 has one exception — DD-073

**The corpus ships whole except the discussions, which ship as
stubs.** DD-073 carries the decision and OBS-028 the measurement; this
records what changed here.

Clause 2 rejected curation on two grounds and neither reaches this
case. The *dogfood evidence* argument is about records written for a
reader; the `discussions` collection is the one part of the corpus
that is a conversation. The *shipped eval* argument is checkable and
turned out small: **2 of 40** golds name a discussion, and both still
resolve, because a stub keeps the id.

What clause 2 was right about is that removal is not free. Deleting
the 41 records would dangle **117 edges from 86 published records**
and **253 prose mentions across 85 records**. The stub is what keeps
the public corpus whole — **1918 edges before and after** — while the
reasoning moves to a private sibling repo.

**Clause 1 is what makes this work, and the coupling is worth naming.**
The full bodies stay in this repo's local history. If v3 history is
ever pushed the stubs publish nothing, because the bodies go with it.
Clause 1 was already never-push; it is now load-bearing for a second
reason.

## Amendment (2026-08-31): this record's audit line aged into a false claim about the present

The 2026-07-11 audit says *"`origin/main` today is a single empty
'Initial commit', so nothing sensitive is public yet."* True when
written. **False from 2026-08-14**, when three cuts — `ca33c4e` (v3),
`6ffe214` (v0.2.1), `2709342` (v0.3.0) — were pushed to a public
repository, carrying **37 of the 41 discussion records in full**.

**Nothing was violated.** Clause 1 held: each push was a fresh cut, and
`docs/discussion.md` appears in none of the three. Clause 2 was
*executed* — the corpus shipped whole, discussions included, exactly as
decided. The discussions were public because this record said they
should be.

What went wrong is one layer up. DD-073 was designed and built on
2026-08-31 to keep the discussions private, and the sentence above was
read as a statement of current fact rather than a dated audit finding.
One `gh repo view` would have shown the repository public with 37 full
records in it; the check was never run, because the corpus had already
answered.

### What was done about it

The repository was **deleted and recreated** on 2026-08-31, and a
single orphan commit (`60d9131`) pushed in its place — 587 files, 41
discussion stubs, zero discussion bodies. The old commits, and the
`v0.2.0`/`v0.2.1`/`v0.3.0` tags pointing into them, went with it.

**That is best-effort, not erasure**, and the distinction is the point:
anyone who cloned between 2026-08-14 and 2026-08-31 still holds all 37.
The repository had 0 forks and 0 stars, so the practical exposure is
probably nil — and *probably* is the honest word. Treat DISC-038..041
as the only records the split actually kept private, and the rest as
private going forward rather than retroactively.

Two things survived the recreation and are worth recording because
neither was certain in advance: npm's **trusted publisher matched on
the repository name, not an id**, so publishing worked untouched; and
the `release` environment had to be rebuilt by hand from a captured
copy, because deleting a repository destroys its environments and
their protection rules.

The general failure is FRICTION-055: a record can carry a claim about
the world outside the corpus, and nothing — not `status`, not the
index, not the reader — can notice when the world has moved.

## Amendment (2026-09-27): public `main` is the latest cut, and the tags are the releases

**Public `main` holds the latest published cut of v3's tree. A release
is a `v*` tag.** Nothing here ever said `main` was a release line; it
looked like one because the first two cuts after the recreation
(`60d9131`, `6d46f90`) were both releases. The first cut that was not —
`1602493`, 2026-09-25, docs only — was pushed so that the records
issue #1's acknowledgment cites could be read, and it raised the
question of whether that broke a rule. It did not; this makes the rule
explicit so the next one does not have to ask.

**What makes this safe is that publishing keys on tags.** As measured
2026-09-27, the publish workflow triggers only on `push: tags: v*`, and
its run history holds exactly the two release runs — the `1602493` push
started nothing. Re-measure before relying on that (FRICTION-055): a
workflow that someday also triggers on `push: branches: main` turns
every docs cut into a release.

**When to cut between releases:** when a record someone outside this
checkout is told to read would otherwise not be readable — in practice,
WF-007 step 4's check before an acknowledgment is posted. Not on a
schedule and not per commit; a between-releases cut is a publication,
and each one gets the review below.

**How — unchanged from every other cut, and that is the point.** Clause
1 holds: v3 history is never pushed, because it carries the full
discussion bodies (DD-073) and, before them, `docs/discussion.md`.

```
git commit-tree "v3^{tree}" -p origin/main -m "<message>"
git push origin <sha>:refs/heads/main
```

Before the push: the tree diff against `origin/main` is what you expect
and nothing else; any discussion file in it is a stub (no
`description`, the retained-privately body); no private host-project
name and no local path appears in it (clause 3).

**No `develop` branch.** Considered and refused on two grounds. The
default branch is where a reporter goes to look up an id they were
given, so a cut that makes a record readable belongs on it — a
`develop` holding it would have to become the default, leaving `main`
to restate what the tags already say. And the usual payoff of the
split, merging develop into main at release, does not exist here: cuts
are made by `commit-tree` from a tree that shares no history with
either branch, so there is nothing to merge and a second branch is a
second line of cuts to keep in step.

## Amendment (2026-09-27): the working history has a private remote, and clause 1 has a hook

**Clause 1 said where the history must not go and nothing about where it
does.** Measured 2026-09-27: `v3` had no upstream and no GitHub repository
held it — 375 commits, the only copy of the full discussion bodies' history
and of everything since the recreation, on one disk. "Stays local as the
DD-039 archive" had quietly come to mean *has no backup*.

**The working history lives on a private remote.** `yasnikoff/docdog-dev`,
created PRIVATE, is the git remote `private`, and `v3` tracks `private/v3`.
`v2`, `dev`, `implementation`, `design-draft-1` and the tags went with it —
all of them local-only until then. The pre-recreation `main` (`3d141f4`, not
an ancestor of `v3`) is kept there as `archive/main-pre-recreation`; local
`main` was reset to `origin/main`, so the one local branch that tracks the
public repository now matches it rather than pointing at the history clause
1 forbids. `remote.pushDefault = private`, so a bare `git push` from any
branch cannot reach the public repository.

It is a separate repository from `docdog-discussions` on purpose: that one
is a docdog corpus with its own `scan_paths`, and code history in it would
be a second, unrelated thing sharing its default branch.

**Clause 1 is enforced mechanically now.** It was enforced by memory, and
two routes around it were live: VS Code's *Publish Branch* on `v3`
(`branch.v3.vscode-merge-base` was `origin/main`), and a `--force` from the
stale local `main`. `.githooks/pre-push` (enabled per clone with
`git config core.hooksPath .githooks`) applies only to a push whose URL is
the public repository, and allows a ref update only if it adds at most one
commit the public repository does not hold, that commit has exactly one
parent which it does hold — the shape `commit-tree … -p origin/main`
produces — and every `specs/discussions/*.md` in it carries
`retained_privately:`, which no full record does. Deletions are refused.
Checked by dry-run against the real remote the day it was written: `v3`
refused (375 new commits), `v3:main --force` refused, a real snapshot cut
passed, a cut with one full discussion record swapped in refused by file
name, a push of an already-public tag passed, the private remote untouched.

**What it does not check, named so nobody reads it as covered:** clause 3.
Matching the private host-project name would put that name in a tracked
file, which is the leak the check exists to prevent, so the host-name and
local-path review before a cut stays manual. The hook also lives in the
clone's config, not in git: a fresh clone is unprotected until
`core.hooksPath` is set, and `--no-verify` skips it — a guard against an
accident, not against a decision.

## DP-001 check

Policy, not code: the judgment happened once in the agent+user loop
and is recorded as an artifact. No inference moved into code; no
scanner ships. Clean.
