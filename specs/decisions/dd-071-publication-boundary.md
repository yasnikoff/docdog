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
  - references: DD-073
    context: "the amendment to clause 2 — discussions ship as stubs rather than whole, because the eval argument turns out to be two queries in forty and the dogfood argument does not reach a transcript"
description: "How docdog goes public, decided 2026-07-11 after a full audit. (1) The public history starts at publication: a fresh cut of the current tree — the full development history is never pushed, because it contains docs/discussion.md (explicitly gitignored as private) from the v1 era; it stays local as the DD-039 archive. (2) The specs corpus ships whole, no curation: it is the dogfood evidence, and the frozen retrieval-eval gold sets (tests/eval/queries.yaml) reference corpus records by id — curating would break the shipped eval and falsify OBS-010's numbers. (3) The private host-project name is genericized to host-project placeholders in the shipping worktree; generic role nouns like 'orchestrator' stay. (4) No leak-detection pipeline — this was DD-038's ad-hoc review, run once. AMENDED same day: the audit's claim that docs/discussion.md had been removed from the worktree was false — it was still tracked in HEAD (gitignore is inert for tracked files); fixed with git rm --cached so the fresh cut cannot ship it. Reliable sweep for this trap: git ls-files -i -c --exclude-standard. AMENDED 2026-07-20: the open registry question is closed — npmjs (registry.npmjs.org) as @yasnikoff/docdog, because GitHub Packages requires auth even for public installs, which would break the npx wiring docdog init writes into every adopter's .mcp.json; unscoped docdog and a @docdog org were both checked and rejected (squatted / brand mismatch). .npmrc deleted, HANDOFF-*.md untracked+gitignored. AMENDED 2026-08-31: clause 2 gains one exception (DD-073) — the 41 discussion records ship as STUBS carrying id, title, status, date and the full relationship graph, with bodies and descriptions moved to a private sibling repo; the eval ground for ships-whole was 2 of 40 golds and both still resolve, and the stub is what keeps the 117 inbound edges from dangling. Clause 1 is now load-bearing for a second reason: the full bodies live only in this repo's local history."
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

## DP-001 check

Policy, not code: the judgment happened once in the agent+user loop
and is recorded as an artifact. No inference moved into code; no
scanner ships. Clean.
