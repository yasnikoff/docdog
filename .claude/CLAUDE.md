**DocDog project (v3) — self-hosting.** Docdog manages its own specs via its
own CLI and MCP server. This file tells an agent how to work on docdog itself.

**V3 architecture in one line (DD-070):** markdown files + frontmatter are the
single source of truth; the database is an embedded, disposable SQLite cache
(`.docdog/cache/index.db`, gitignored) rebuilt from disk by `docdog index`.
No Docker, no ArangoDB, no migrations — deleting the cache is always safe.

## Process workflows (canonical)

Per DD-036, the repeatable processes that govern work on this project
live as first-class artifacts in the `workflows` collection, not in
this file. Retrieve them via docdog when you need them:

| Workflow | ID | What it covers |
|---|---|---|
| Discussion capture      | `WF-001` | Turning "let's discuss…" threads into DISC-NNN records plus any surfaced artifacts |
| Dual-track dogfooding   | `WF-002` | Using docdog on every non-trivial task + when to capture an observation |
| Docs batch rewrite      | `WF-003` | Renaming/reframing/retiring large cohorts of docdog-managed records in reviewable batches |
| Task lifecycle          | `WF-005` | The outer wrapper every `tasks/TASK-NNN` record walks: seed, start, delegate to the inside workflow, verify AC, promote, record the outcome. **Dormant — see below.** |
| Friction resolve        | `WF-006` | Draining the open friction backlog through docdog's retrieval surface; docdog-first, bypass-logs-itself, composes with WF-002 |
| External feedback triage| `WF-007` | Turning a GitHub issue from someone else's machine into a record, a fix and a closed loop; hands off to WF-006 |

**The task apparatus is dormant, and `WF-004` is deprecated (2026-08-27).**
WF-004 was the capture of a `.docdog/skills/` code-loop cluster — `start-task`,
`architect`, `coder`, `reviewer`, `finalize-task` — that was deleted at v3
step 6; the directory today holds `compose`, `index`, `ingest`, `populate`,
`relate`, `search`, `task-frontmatter`, `ejection-resilience`,
`example-workflow-seed`. Its DD-034 claim held (the prose survived its skills
being deleted); what did not survive is the reason to run it. WF-005 stays
`current` because the lifecycle is skill-independent and correct for any task
that gets opened — but all seven TASK records are `done` and nothing has been
filed under `tasks/` since 2026-07-14: PROPOSAL-041..045 and OBS-021..026 each
ran through WF-002 + WF-006 and a commit. **Do not open a task folder for
ordinary code work here**; if a code-change loop is wanted again, write it
against the surfaces that exist rather than reviving WF-004 by reference.

Read them via `docdog_get WF-NNN`, `docdog search "<topic>"`, or
open the file at `.docdog/workflows/wf-NNN-<slug>.md`. When a
process changes, edit the workflow artifact and reindex — do not
re-narrate it here.

## The corpus is not a monitor (FRICTION-055)

**Before acting on a corpus claim about mutable state OUTSIDE this
repository — what is published, what is installed, what a registry
holds, what another repo contains — re-measure it.** It costs one
command.

A record holds two kinds of claim and stores them identically: **what
was decided**, which is durable by construction and is what a corpus is
for, and **what was observed**, which is a measurement with a timestamp
and starts ageing the moment it is written. Both sit in the same
paragraph, at the same `status`, retrieved by the same query, with the
same authority.

`status` cannot separate them and is not broken for failing to: DD-071
was correctly `current` for seven weeks while containing
*"origin/main today is a single empty Initial commit, so nothing
sensitive is public yet"* — false from 2026-08-14, and the basis on
which DD-073 was designed to keep 41 discussion records private when
37 of them were already public. FRICTION-053's fix does not reach this
either; every surface reported `current`, accurately. Dating the prose
did not help, because retrieval returns a passage stripped of its
distance from now.

This does not weaken the standing rule that corpus questions go
through docdog rather than around it. It bounds it. The corpus answers
*what did we decide and why*, authoritatively and forever. It cannot
answer *what is true right now, out there*, and it will answer anyway.

## Documentation layout

**Current:**
- `specs/decisions/` — design decisions (`dd-*.md`; `ej-*.md` names are historical)
- `specs/principles/` — design principles
- `specs/notes/` — ephemeral notes, case studies, friction reports, open questions
- `specs/discussions/` — DISC-NNN records, and **every one of them is a
  STUB** (DD-073, measured by OBS-028). The reasoning lives in the private
  sibling repo `../docdog-discussions`; what ships here is id, title,
  collection, status, date, `retained_privately`, and the FULL
  `relationships:` block with its contexts. Keeping the graph is FREE —
  fts5 covers title/description/body and the embed input is body-derived,
  so a relationships block reaches neither leg; a stub-with-graph scores
  identically to a stub-without while keeping 377 edges. The corpus holds
  1918 edges before and after the split. The `description` was dropped on
  VOLUME, not retrieval: 25,752 chars across 41 records, median 485, and
  keeping it cost 0.019 MRR, which is the noise floor.
  Deleting the records instead was the worse option, not the cheaper one:
  117 edges from 86 published records point at a `DISC-` id, plus 253
  prose mentions across 85 records.
  **NEVER index both halves as one corpus.** A stub and its full record
  share an id, so that mints 41 contested ids and the loser is a record on
  disk that search, get and traverse cannot see (PROPOSAL-031). The
  private project's `scan_paths` therefore enumerate this repo's spec
  directories ONE AT A TIME and omit `specs/discussions/` — which is also
  why the files moved out of `specs/notes/`: the exclusion is by PATH, and
  collections come from frontmatter so the move changed no record's
  collection.
  That enumeration is the arrangement's one moving part. **A directory
  added to this repo does not reach it, and nothing can notice** —
  `findMissingScanPaths` catches a path that has gone away, never one that
  was never named. Check it first when a record seems missing there.
  The split works ONLY because of DD-071 clause 1: the full bodies remain
  in this repo's local history, so pushing v3 history would make every
  stub decoration. Clause 1 is load-bearing for a second reason now.
  Cost, accepted and filed as FRICTION-054: the private project reports
  344 cross-visibility leaks on every run, because its tracked records
  point at a corpus reached by an external scan path, and the repair the
  message names cannot be performed. Configuring around it only swaps the
  report — scanning only itself yields 344 dangling targets instead. No
  arrangement of a two-repo corpus is quiet, and that is the same shape
  DD-073 used to REJECT the alternative design: the warning moved to where
  it competes with less, it did not go away.
  15 of the 41 (DISC-016..021, DISC-032..040) declared
  `collection: notes` rather than `discussions` — pre-existing drift in
  two contiguous bands, invisible while they sat in `specs/notes/` and
  obvious once they did not. Corrected in BOTH halves, since a stub and
  its record must not disagree about what they are: `discussions` 26 ->
  41, `notes` 79 -> 65. **Any frontmatter convention applied to a
  discussion has two files to reach from now on.** The edit cost no
  re-embed — the embed key is a hash of the BODY with frontmatter
  excluded (FRICTION-033), so all 15 reused their vectors.
- `specs/observations/` — OBS-NNN dogfooding + measurement records. **Not
  `.docdog/observations/`**, which is a `scan_paths` entry (shipped by the
  `workflows` template) pointing at a directory that does not exist here, so
  the entry reads like a home for these and is not one. `docdog index` says so
  now — one collapsed `point at nothing on disk` warning per run,
  `findMissingScanPaths` in engine/discovery.ts. It reports and never fixes:
  creating the directory and dropping the entry are opposite repairs and which
  one is wanted is not in the config (DP-001 tier 3).
- `specs/features/`, `specs/requirements/` — FEATURE-NNN and FR-NNN
- `tasks/` — TASK-NNN work folders (WF-005's subject)
- `.docdog/local/` — **indexed, never committed** (DISC-041). Scanned with
  NO `scan_paths` entry, and that is deliberate: git cannot track an empty
  directory, so an entry would point at nothing in every fresh clone and
  `findMissingScanPaths` would warn about the normal case on every run — and
  `update` never edits an adopter's config, so an entry would reach existing
  projects only by hand, which is the step this removes. The `local/` rule in
  `.docdog/.gitignore` is a sub-document seed beside `#cache`, written before
  the directory exists, because a destination you must remember to ignore is
  one you will forget to ignore once. Independent seeds, not one seed with two
  lines: deleting one must not read as the other diverging.
  The cost of an implicit path is a corpus holding records no config accounts
  for, so `docdog index` PRINTS the count whenever it is non-zero — silence is
  what would make this objectionable, not the scanning. `withLocalScanPath` /
  `isLocalRecordPath` in engine/discovery.ts; `stats.localRecords`.
  **This repo is an exception, enumerated in `seed-drift.test.ts`:** its docdog
  ignores live in the ROOT `.gitignore` (`.docdog/local/` beside
  `.docdog/cache/`), the same reason `#cache` is exempt.
  A local record is SECOND-CLASS by construction — no history, no blame, no
  merge driver, no recovery path — which is exactly the DD-070 invariant it
  trades away. Composes with PROPOSAL-047 for free: gitignored means
  out-of-clone, so a committed record edging into it is already refused with
  nothing new taught.
- `.docdog/concepts/` — collection + relation concept records (DP-002's disk home)
- `.docdog/workflows/`, `.docdog/reconciliations/` — docdog-native meta records
- `.docdog/config.yaml` — docdog config for this project
- `.docdog/skills/` — docdog skills (compose, index, ingest, populate, relate,
  search, task-frontmatter, …). **Mirrors of `templates/skills/`, and pinned as
  such** (FRICTION-051, `tests/unit/seed-drift.test.ts`): edit the template and
  copy it down, never the other way. The section that shipped `docdog list`
  went into this repo's `search.md` and never into the template, so for two
  releases every adopter's search skill still said "use `limit` for more".
  Corpus-specific retrieval guidance has two homes that are meant for it —
  this file, and the injectable `specs` skill, which renders per corpus.
  Same rule for `.docdog/scripts/`, `.claude/commands/docdog.md`, and the
  managed blocks in `CLAUDE.md` and `.gitattributes`. The named exceptions
  are `.mcp.json` (source mode here, pinned package there) and
  `.docdog/.gitignore#cache` (ignored from the root `.gitignore` here).
  `.docdog/concepts/` is deliberately **not** mirrored — this project extends
  those records — so what is checked there is DP-002's `scope: shipped | user`
  provenance marker, against the seed set. It was wrong in both directions
  until 2026-08-27: nine records this project invented claimed `shipped`, and
  the one record docdog actually ships claimed `user`.
- `CONTRIBUTING.md` — contributor guide (indexed)

**Historical:** the v1-era `docs/` folder (MongoDB/REST-era design
material) was removed from tracking on 2026-07-11 (DISC-024 /
FEATURE-002) — git history is the archive; the v1 salvage review
lives indexed at `specs/notes/2026-04-11-first-attempt-review.md`.
`docs/discussion.md` (frozen sessions 1–33 archive) remains on disk,
untracked and gitignored per DD-071.

## CLI (v3 — DD-070 §4)

```
docdog init            # create .docdog/, config, MCP wiring
docdog update          # bring an adopting repo up to this docdog (PROPOSAL-041)
                       #   --dry-run --force <path> --json
                       #   adds what is absent, updates what is byte-identical to
                       #   what docdog wrote, REPORTS what you edited and what is
                       #   orphaned. The device is `.docdog/.seeded.json` — path →
                       #   hash of the shipped bytes at write time — which turns
                       #   "is this file yours or mine?" from inference into a
                       #   comparison. No --force-all, ever: it is --accept-all's
                       #   analogue (DP-001 tier 3, per file). Absorbed
                       #   `templates refresh`, which was the update half with a
                       #   destructive default; `templates` had no other
                       #   subcommand, so the command went with it.
                       #   --check --offline (PROPOSAL-042): --check asks the
                       #   registry for `latest`, caches the verdict to
                       #   .docdog/cache/update-check.json, and stops. The
                       #   request describes nothing about the sender — no
                       #   installed version, no identifier, no user-agent.
                       #   That is load-bearing, not stylistic: the check may
                       #   be default-on because it transmits nothing, while
                       #   every feedback report is consented to individually
                       #   (DISC-039). Both modifiers bind to --check as well
                       #   as to a plain run: --offline answers from the cache
                       #   and opens nothing, --dry-run asks but caches
                       #   nothing. They used to be skipped by --check's early
                       #   return, which no test could see from inside the
                       #   action — the branch is `performCheck` in
                       #   engine/upgrade.ts now, and is pinned. Every failure
                       #   is a value, never a throw — the file work finishes.
                       #   docdog opens exactly three sockets in total and
                       #   CONTRIBUTING enumerates all of them: this check, the
                       #   one-time model download, and (opt-in) the ollama URL
                       #   you configured — that last one is the only path that
                       #   sends corpus CONTENT anywhere.
                       #   Also reconciles the merge driver's .git/config half
                       #   on every run (FRICTION-041).
                       #   Two things init does that update could not maintain,
                       #   both found by reading init against collectSeeds rather
                       #   than by being hit (756485b). (a) The CACHE-IGNORE RULE:
                       #   init wrote `cache/` into .docdog/.gitignore and recorded
                       #   nothing, so a deleted rule — or a repo adopted before the
                       #   rule existed — stayed deleted through every update and the
                       #   disposable SQLite cache gets committed. It is the
                       #   sub-document seed `.docdog/.gitignore#cache` now, the shape
                       #   CLAUDE.md and .gitattributes already use: only that line is
                       #   docdog's, so an adopter's own ignores are invisible to the
                       #   comparison and --force cannot clobber them, and `diverged`
                       #   is unreachable for this member by construction. Authorship
                       #   is claimed only where init actually wrote — a `cache/` you
                       #   typed yourself is reported, not adopted. (b) CONCEPT REACH:
                       #   init warns when no scan path covers .docdog/concepts/;
                       #   update performs the same writes and said nothing, so it
                       #   could report `added` for a record search, get and traverse
                       #   cannot see. Same silent-reach failure `split --apply-plan`
                       #   reports about its children, same posture: report, never
                       #   touch config.yaml. `scanPathsCoverConcepts` lives in
                       #   engine/scan-reach.ts (a CLI command importing from another
                       #   CLI command is the wrong direction). The JSON field is
                       #   `conceptsIndexed: boolean | null` — null when the population
                       #   is not in play, so a consumer cannot read "this project has
                       #   no concept records" as "they are reachable" — and it is
                       #   reported under --dry-run too, being a fact about the
                       #   project's state rather than about this run's writes.
                       #   Maintains the INJECTABLE skills too (PROPOSAL-044).
                       #   They were outside the seed set on the theory that a
                       #   per-corpus file has "no shipped bytes to compare
                       #   against" — which conflated shipped with FIXED: the
                       #   manifest needs what docdog would write NOW, and that
                       #   is one render away. `renderInjectableSkill` is the
                       #   seam; init, update and `skill install` are its three
                       #   callers. Consequences: (a) `{{generated_at}}` had to
                       #   die and must never return — a fresh timestamp makes
                       #   every re-render differ from the recorded bytes, so
                       #   every update would rewrite every skill and show a
                       #   diff in which nothing changed; (b) an UNEDITED skill
                       #   now picks up a new collection in its id-prefix roster
                       #   on the next run, which is the refresh FRICTION-043's
                       #   flat index never had — that is why the same argument
                       #   does not condemn this one; (c) no cache is neither
                       #   orphan nor diverged nor fine, so `collectSeeds`
                       #   returns {items, unavailable} and update SKIPS and
                       #   says why, rather than overwriting a good file with an
                       #   empty roster. init makes the opposite call on the
                       #   same condition, on purpose: there the file does not
                       #   exist yet and the roster reads "not read yet".
docdog index           # (re)index scan_paths into the embedded SQLite cache
docdog search <query>  # hybrid search (BM25 + vector)
                       #   the result line NAMES THE STATUS (FRICTION-053), as list
                       #   and get always did. search and traverse were the two
                       #   surfaces that CHOOSE records for you and the two that
                       #   would not say whether one is live, so the corpus wrote it
                       #   into the body by hand — 71 of 360 records open with a
                       #   status banner, DP-003 clause 3 at seventy-one. Always on,
                       #   not only when stale: silence would mean both `current` and
                       #   `this renderer predates the fix`. MCP keeps suppressing
                       #   `scope` at its DD-058 default and that asymmetry is the
                       #   point — 323 records inherit `shared` without writing it,
                       #   no status is inherited that way.
                       #   NOTHING CHANGED IN THE RANKER, and that was measured, not
                       #   assumed (OBS-027): stale records hold 15.0% of top-5 slots
                       #   against a 17.2% corpus share — UNDER-represented, so a
                       #   penalty or a default --exclude-status would INTRODUCE a
                       #   bias rather than remove one. On the one query where a
                       #   superseded record takes rank 1 over the gold, it is
                       #   arguably the better answer (the question is historical).
                       #   The rule: before weighting a ranker against a category,
                       #   check whether the category is over-represented.
docdog list            # exhaustive unranked enumeration by predicate (FRICTION-036)
                       #   --collection --scope --status --exclude-status --where
                       #   --has --lacks --limit --json
                       #   the completeness query search cannot express: ranked retrieval
                       #   is bounded by recall, so "all open frictions" needs this, not
                       #   a bigger --limit. CLI-only; an MCP docdog_list would be a
                       #   ninth kernel tool and wants a proposal first.
                       #   --status/--exclude-status VALIDATE now (FRICTION-038), on
                       #   `SELECT DISTINCT status` ∪ the status_vocabulary: blocks in
                       #   .docdog/concepts/ — so a declared-but-unused value returns an
                       #   honest empty and a value nothing knows is refused by name
                       #   (UNKNOWN_STATUS). Shared by search + suggest-edges, and the
                       #   first thing in v3 src/ to CONSUME those blocks, which have
                       #   been data-only since PROPOSAL-026. Two directions, one check:
                       #   an allowlist naming nothing fails CLOSED (empty result reads
                       #   as "none exist"), an exclusion naming nothing fails OPEN (the
                       #   whole corpus, looking like a query that worked) — the message
                       #   says which. Never a fuzzy correction: `opne` → `open` is the
                       #   alias map FRICTION-030 refused (DP-001 tier 3). The list flags
                       #   are also REPEATABLE now — they took a CSV string and silently
                       #   kept the last occurrence.
                       #   --where is CHECKED AGAINST THE STORE too (FRICTION-049): a key
                       #   the corpus holds as an array or object is refused by name
                       #   (WHERE_NOT_SCALAR, with the type and the record count), because
                       #   json_extract returns a container as its JSON TEXT and the
                       #   comparison can never match a member. It was the one malformed
                       #   filter that produced output rather than a refusal, and the
                       #   output was an empty result — the single thing a caller cannot
                       #   tell apart from data. Fires on ANY container row, since the
                       #   MIXED field (list in 32, string in 4) answers for the 4 and
                       #   goes quiet about the 32, which is worse than a visible zero.
                       #   Membership (`json_each`) is one line and was NOT built:
                       #   "equality against a list means membership" is a convention
                       #   someone chooses (tier 2) and must not arrive as a side effect
                       #   of closing a tier-1 defect. Runs AFTER vertexFilters on
                       #   purpose — the three argument-shape guards live there and a
                       #   call someone typed wrong is reported before a corpus mismatch.
                       #   An ABSENT field is still an honest empty: that is FRICTION-045,
                       #   a different defect, and pinned as the boundary.
                       #   --scope <name> exists on list AND search now (FRICTION-050) —
                       #   it was reserved OUT of --where ("use the dedicated scope
                       #   parameter") while the only dedicated scope parameter lived on
                       #   docdog_create/docdog_update, so a refusal named a door on the
                       #   write side and closed the one path to a filter vertexFilters
                       #   had implemented all along, DD-058 COALESCE default included.
                       #   The fix is three flags; the DEFECT is that nothing could see
                       #   they were missing, so WHERE_DEDICATED_PARAMS is exported and
                       #   tests/unit/dedicated-params.test.ts walks every reserved key
                       #   against every read surface. Deliberately UNVALIDATED, unlike
                       #   --collection and --status: DD-058 makes scope a free string
                       #   with no enum and no registration, so an unused value is an
                       #   honest empty and there is no status_vocabulary analogue to
                       #   check a guess against — inventing one is tier 3. Which is why
                       #   `Records by scope` had to ship with it (see status below): a
                       #   filter that cannot refuse you cannot teach you its vocabulary.
                       #   The three `where` guards are SearchErrors now
                       #   (WHERE_RESERVED_KEY / _INVALID_KEY / _INVALID_VALUE) — as
                       #   plain Errors they rendered through the CLI's generic branch,
                       #   which appends `Cache missing or stale? Run "docdog index"` to
                       #   a fact about the argument, the exact misdirection the comment
                       #   above that catch cites FRICTION-030 to forbid.
                       #   `scopeExpr` in storage/search.ts is the one SQL spelling of
                       #   the DD-058 default, shared with status's roster (the OBS-021
                       #   findUnusedRows lesson). Writing it once found a live
                       #   divergence: scopeOf, the JS half, reads `scope: ""` as absent
                       #   and the SQL did not, so such a record REPORTED shared and was
                       #   not RETURNED by --scope shared. NULLIF closes it.
                       #   --has <field> / --lacks <field> make ABSENCE a predicate
                       #   (FRICTION-045). --where compares against a value, so a record
                       #   without the field never matches — correctly — and the state
                       #   every convention passes through while being rolled out was
                       #   therefore unaskable: "which records has it not reached yet".
                       #   Comma-separated and repeatable, on search and list, and on
                       #   docdog_search as `has`/`lacks` (three surfaces at once is the
                       #   FRICTION-050 shape, so dedicated-params.test.ts walks both
                       #   flags across all three; they are NOT reserved where keys and
                       #   never will be — they take a field NAME rather than replacing
                       #   one, so no refusal points at them).
                       #   The design decision is the PARTITION, not the operator: has X
                       #   and lacks X are exact complements, because the whole use is
                       #   working a complement and a record in neither set silently
                       #   under-reports the list you asked for. That decides the one
                       #   ambiguous case — a field written with no value counts as
                       #   ABSENT, since json_extract cannot separate an explicit null
                       #   from a missing path and json_type separating them would break
                       #   the sum. Mechanical, not a claim about what an empty
                       #   declaration meant. Pinned as has+lacks == total.
                       #   An unknown FIELD NAME is deliberately NOT refused, which is
                       #   where the FRICTION-038 precedent breaks: an unknown status is
                       #   a typo because the vocabulary already exists, while a field
                       #   nothing carries is the normal first state of a convention —
                       #   `--lacks upstream_issue` returning everything on the day the
                       #   field is invented is the correct answer and the first query
                       #   anyone runs. No `Records by field` roster in status either,
                       #   and for the mirror of FRICTION-050's reason: a scope is
                       #   invisible (319 records inherit a default they never write), a
                       #   field name is written in the record that carries it.
                       #   Reaches three things nothing else could: a convention's blind
                       #   spot (34 of 109 resolved records carry fixed_date); a DEFAULTED
                       #   column's provenance (status defaults to `current` at index
                       #   time, so --status current cannot separate the 16 that never
                       #   wrote one from the 98 that chose it — these read frontmatter,
                       #   the columns are derived); and a LIST field, since presence
                       #   never compares, so --has tags is answerable where FRICTION-049
                       #   refuses --where tags=logging. No membership: 049's ruling stands.
                       #   No `--where !field` spelling — bash history-expands a bare `!`,
                       #   and decisively there is no JSON spelling of PRESENT inside a
                       #   where object, so that design could not have reached
                       #   docdog_search with both halves.
docdog get <id>        # print a record (PROPOSAL-032)
docdog status          # cache/corpus statistics (PROPOSAL-032)
                       #   rosters `Records by status` beside `Records by collection`
                       #   (FRICTION-038) — the vocabulary a filter may name, plus the
                       #   declared-but-unused tail, so you learn it before typing rather
                       #   than by being refused.
                       #   `Records by scope` too (FRICTION-050), and that one is not a
                       #   convenience: --scope cannot refuse an unknown value, so there
                       #   is no learn-by-being-refused path at all and this roster is
                       #   the only one. Printed only when the corpus has more than one
                       #   scope — `shared: 356` describes a filter with one possible
                       #   value — but always present in --json.
                       #   leads with `docdog <version> — <how it was installed>`
                       #   and the cached update verdict; --json carries that as
                       #   an `install` block {version, shape, check}. That block
                       #   is the environment PROPOSAL-043's issue template
                       #   requires, so it is emitted on the NO-CACHE path too
                       #   ({install, cache: null, error}) — the frictions most
                       #   worth reporting are the ones where index never
                       #   finished. Never fetches: `update --check` writes the
                       #   verdict, status renders it.
docdog traverse <id>   # walk edges, --depth 1-3 --direction (PROPOSAL-032)
                       #   neighbour lines name the STATUS too, and --json carries it
                       #   (FRICTION-053) — its projection listed id/title/collection/
                       #   source_file and dropped the field, so a machine consumer
                       #   could not recover it at any depth. A walk hands back
                       #   records the caller never named, which is what makes it the
                       #   surface with the most reason to say.
docdog relate <a> <b>  # record an outbound edge, --type --context (PROPOSAL-032)
                       #   --allow-cross-visibility (PROPOSAL-047). AN EDGE MAY POINT
                       #   FROM LESS-VISIBLE TO MORE-VISIBLE, NEVER THE REVERSE. A
                       #   gitignored file inside a scan path indexes and retrieves
                       #   normally — that is how "private but indexable" works, and it
                       #   always did — but a TRACKED record declaring an edge to one
                       #   publishes the target's id AND hands every clone a pointer to
                       #   a record it does not have. The public repo is broken, not
                       #   merely leaky.
                       #   Visibility is DERIVED FROM GIT, never declared. `scope` is
                       #   already two fields in one here (DD-058 who-may-see-this,
                       #   DP-002 who-wrote-this: 320/26/11), but the deciding argument
                       #   is that a MARKER CAN DISAGREE WITH REALITY — a record stamped
                       #   `scope: private` that is nonetheless committed reads as a
                       #   guarantee and is a decoration (FRICTION-052's shape).
#   THREE STATES, and a target in ANOTHER REPOSITORY is the
                       #   third one (FRICTION-054, 0.4.1). tracked here = in-clone;
                       #   ignored HERE, ignored in ITS OWN worktree, or outside EVERY
                       #   worktree = out-of-clone; inside/untracked/unignored, OR
                       #   tracked in a different repository = UNDECIDED, which triggers
                       #   nothing. That last clause is the fix: 0.4.0 classified every
                       #   path against ONE worktree, so anything an external scan_paths
                       #   entry reached was "not in a clone" — and the rule INVERTED on
                       #   DD-073's own split, where private -> public is
                       #   less-visible -> more-visible, the direction PROPOSAL-047
                       #   PERMITS. It refused every such write, and the repair it named,
                       #   when followed, PATCHED A FILE IN THE OTHER REPOSITORY where
                       #   the same id resolved to the stub.
                       #   The principle: GIT KNOWS WHAT A CLONE OF ONE REPOSITORY
                       #   CONTAINS AND CANNOT RANK TWO REPOSITORIES' AUDIENCES. So the
                       #   honest answer is `undecided`, not a fourth state and not a
                       #   config key — a scan entry declaring a path trusted would be
                       #   the declared visibility this proposal refused, and a
                       #   declaration can disagree with reality (FRICTION-052's shape).
                       #   Nothing loosened where git IS certain: ignored anywhere it
                       #   lives, or in no repository at all, is still refused.
                       #   COST, NAMED: docdog no longer flags a public repo pointing
                       #   into a private sibling. It never flagged that distinguishably
                       #   — it flagged every crossing edge — so the signal was already
                       #   noise in any split, which is what got it filed.
                       #   The completeness half is TRUE and survives, said ONCE PER
                       #   PROJECT rather than once per edge, because it belongs to the
                       #   configuration: "this corpus spans more than one repository —
                       #   N edge(s) point at records under ../x … Not a leak."
                       #   `isOutsideProjectTree` in storage/visibility.ts is that fact;
                       #   `crossRepoEdges`/`crossRepoPaths` on EdgeHealthReport carry it.
                       #   THREE states, and the third is what makes it usable:
                       #   tracked = in-clone; ignored OR outside the worktree =
                       #   out-of-clone (one state, since the reasons differ and the
                       #   consequence does not — which is why an external scan path
                       #   costs nothing extra); inside/untracked/unignored = UNDECIDED,
                       #   which triggers nothing anywhere. A record written and not yet
                       #   committed is work in progress, and the answer changes the
                       #   moment you `git add`. Folding it in with a deliberate
                       #   exclusion fires on every new record until commit, which is how
                       #   a warning gets turned off. Pinned as a PAIR on one corpus
                       #   where the only thing that changes is the ignore rule.
                       #   THE MESSAGE NAMES THE REPAIR, not just the refusal: record it
                       #   on the other side. traverse reads inbound edges (edges.to_id
                       #   is complete under forward-edge-only; OBS-014 settled that a
                       #   same-typed reciprocal is not a second relationship), so the
                       #   relationship survives exactly where it is allowed to exist and
                       #   the clone stays whole. Docdog NAMES it and must never PERFORM
                       #   it — flipping a direction rewrites the author's assertion.
                       #   Three surfaces, three moments: `index` reports standing edges
                       #   (edge-health.ts, same !pathScoped gate as the other two
                       #   checks); relate/docdog_relate/--accept-from REFUSE the write
                       #   (throw in the single path — the MCP error codes are a shipped
                       #   contract — skip per row in the batch, so a 3,947-row drain
                       #   does not lose 3,946 good edges); suggest-edges MARKS and never
                       #   hides (FRICTION-025's line), --json carries it, and
                       #   --format review warns WITHOUT pre-writing a `reject:` — a
                       #   filter and a rejection are different claims.
                       #   The batch guard sits AFTER already_declared on purpose: an
                       #   edge already on disk is not being created by this run, and
                       #   saying otherwise would change what re-running an accept file
                       #   means (PROPOSAL-028's idempotency).
                       #   THE OVERRIDE WAIVES THE WRITE, NOT THE DEFECT — `index` goes
                       #   on reporting the edge every run afterwards. It says "I know,
                       #   write it anyway", never "stop telling me". Per-edge, tier 2,
                       #   and there is NO batch-wide form: that is --accept-all's
                       #   analogue, and a leak waived once is not a leak waived always.
                       #   Git-aware, never git-dependent: no repo, no binary, any git
                       #   failure = the check does nothing and the other two still run.
                       #   `checkEdgeHealth` takes projectRoot REQUIRED, because an
                       #   omitted optional argument is indistinguishable from that
                       #   silence and the check would be lost invisibly (FRICTION-050).
docdog suggest-edges   # report undeclared id mentions as relationship candidates (PROPOSAL-024)
                       #   --format review > f.yaml | --accept-from f.yaml = bulk accept (PROPOSAL-028)
                       #   report-only unless --accept-from is given; there is no --accept-all (DP-001)
                       #   --status --exclude-status = source filters (FRICTION-025's mechanical half)
                       #   REJECTING IS DURABLE NOW (PROPOSAL-046, FRICTION-025). The reject
                       #   half of the loop had no surface: a skip was expressed by DELETING A
                       #   ROW, which leaves no trace, so every sweep re-judged the residue from
                       #   OBS-011's prose and the residue grew (86 skips at OBS-011, 116 at
                       #   OBS-014, 251 live candidates then vs 474 now). All six skips OBS-011
                       #   named by id were still live 48 days and two drains later — the
                       #   documentation fix measurably did not hold.
                       #   The fix is a SECOND VERDICT ON THE ROW, not a second command: fill
                       #   `context:` = accept, replace it with `reject: <why>` = refuse
                       #   durably, delete the row = defer (the old meaning, kept — three moves
                       #   over two keys, no new grammar). `--accept-from` applies both halves
                       #   in one pass. A `--reject-from` would fork the review file into two
                       #   documents an agent has to keep in step, and PROPOSAL-028's finding is
                       #   that ROUND-TRIP SYMMETRY is what makes the loop survive a real drain.
                       #   The ledger is `.docdog/rejected-edges.yaml`, tracked in git — NOT the
                       #   cache, which is disposable and would lose the one artifact this
                       #   exists to keep. Rows are (from, to, reason, source_hash); no
                       #   timestamp, deliberately (git blame answers "when", and a date invites
                       #   time-based expiry, which is the wrong semantics).
                       #   `source_hash` is `vertices.content_hash`, and the column was ALREADY
                       #   exactly right: sha256 over the section's BODY, LF-normalized,
                       #   frontmatter EXCLUDED. Both halves are load-bearing and neither was
                       #   designed. Frontmatter-excluded ⇒ accepting an edge (which patches
                       #   `relationships:`) does NOT invalidate that source's rejections — else
                       #   a drain expires its own judgments as it runs and the feature works
                       #   exactly once. Body-included ⇒ editing the prose DOES, which is
                       #   FRICTION-025's stated requirement.
                       #   Suppression is DEFAULT-ON and never silent: a count prints on every
                       #   human-readable run, `--show-rejected` sees through it, and `--json`
                       #   carries EVERY suppressed row with its `rejected: {reason, stale}`
                       #   marker — the machine surface is where a consumer most needs to see
                       #   the ledger's effect, so filtering it while calling the suppression
                       #   visible would be the contradiction. That count is the whole of what
                       #   keeps default-on suppression inside DP-001 tier 2.
                       #   A STALE rejection (body moved) is re-offered CARRYING ITS OLD REASON,
                       #   pre-filled as `reject:` — leave the row alone to re-affirm and
                       #   refresh the hash. That is what makes the per-body key affordable: a
                       #   typo fix expires all 19 of a record's rejections at once, but
                       #   re-affirming 19 pre-filled rows is a glance, not a re-derivation.
                       #   Guards: an empty reason is REFUSED with no override (unlike
                       #   --allow-empty-context, which has a real use; an empty reason
                       #   recreates the friction); a row with a non-empty `context` AND a
                       #   `reject` is refused (one row, one verdict — a bare `context: ""`
                       #   beside a reject is tolerated, being what the emitter wrote); `type`
                       #   is required to accept and IGNORED to reject (a rejection is keyed on
                       #   the pair); a reject row whose source is not in the cache is skipped,
                       #   never stored with a blank hash — that row could never expire.
                       #   ORPHANS (rows matching no candidate) are reported under
                       #   --show-rejected and NEVER reaped, and only on an UNFILTERED scan:
                       #   under `--id X` every row about another source "matches no candidate",
                       #   so the report was loudest exactly when it was least true. Found by
                       #   running the shipped tool on this repo.
                       #   `renumber` does NOT rewrite the ledger. Checked for direction rather
                       #   than fixed: a stale from/to matches nothing, so the candidate is
                       #   RE-OFFERED. Every failure mode here re-asks; none hides.
                       #   Tier 3, named so it stays named: inferring a rejection, confidence
                       #   scoring, `--reject-all-remaining`, and pattern rejections. The last
                       #   is the tempting one — A FILTER AND A REJECTION ARE DIFFERENT CLAIMS.
                       #   `--exclude-status superseded` says *do not scan this source*; a
                       #   ledger row says *this pair was judged*. Conflating them lets a rule
                       #   stand in for a judgment.
docdog pairs           # nominate similar record pairs no settling edge joins (PROPOSAL-049)
                       #   --collection --status --exclude-status --threshold --limit
                       #   --id X (the write-time use) --show-rejected --defects
                       #   --format review > pairs.yaml | --accept-from pairs.yaml [--dry-run]
                       #   OBS-029's scratch script made repeatable. Docdog NOMINATES
                       #   and VALIDATES and never judges: no model call, no --accept-all.
                       #   Stored record vectors only; paragraphs lost (OBS-030) and
                       #   appear only as per-run PASSAGES in the review file, the
                       #   biggest cost lever OBS-030 measured for a judge, never stored.
                       #   EDGES ARE PER STEP, `pairs.edges` in config, each printed on the
                       #   run it governs: `settle` drops a pair from nomination (default
                       #   supersedes + amends; `references` does NOT settle), `show` picks
                       #   which remaining edges the review lists as `declared` (default
                       #   all), `close` decides what closes a recorded defect (default =
                       #   settle). Hiding an edge from the judge is not settling the pair.
                       #   A TYPED name no concept registers is refused, naming the step;
                       #   a DEFAULT is narrowed to the registered set and printed, as the
                       #   status exclusion is — `amends` ships with no adopter's project.
                       #   --accept-from refuses per row, by name: a quote not verbatim
                       #   in its file (whitespace-collapsed), an unregistered relation,
                       #   a body whose hash moved — read from DISK, not the cache. Ledger
                       #   `.docdog/pair-verdicts.yaml`, keyed to BOTH bodies. A defect
                       #   row is not a rejection: `--defects` lists it until a settling
                       #   edge joins the pair. No contradicts/duplicates relation, ever.
                       #   `pairs.within_file: settle` (default; FRICTION-062): one file's
                       #   records never pair, and an edge on a record settles for what is
                       #   part_of it IN THE SAME FILE — never lifted to a whole file.
                       #   Empty bodies get no vector (FRICTION-060), so never pair either.
docdog renumber <old> <new>  # rename an id + every inbound edge (PROPOSAL-031)
                       #   --dry-run --prose --rename-file --file <path> (contested loser)
docdog merge-driver …  # git merge driver: union the relationships: block (PROPOSAL-030)
                       #   PLUMBING — git invokes it via .gitattributes, a user never does
docdog serve           # start MCP server (use via .mcp.json)
                       #   --root <path> = pin the default project (PROPOSAL-033)
                       #   --read-only = refuse create/update/relate (PROPOSAL-035)
docdog add <file>      # stamp frontmatter onto raw markdown
docdog split <file>    # split a multi-section file — ONE executor (PROPOSAL-045)
                       #   no selector = report outline + descent, write nothing
                       #   --format plan [--on <pat> | --depth <n>] = emit boundaries
                       #   --apply-plan <f> = the only thing that writes
                       #   --on/--depth STOPPED EXECUTING: they pre-populate the plan's
                       #   sections and nothing more, so a pattern nominates rather than
                       #   asserts that every matching heading begins a separate idea —
                       #   the claim descent was forbidden from making. Repeatable now
                       #   (parity with split_on's list); zero matches under a selector
                       #   writes no plan and exits non-zero. Regex refused on EVIDENCE,
                       #   not principle: multi-cohort was already solved by a list, and
                       #   overloading --on silently reinterprets a literal `### [TASK-`.
                       #   `output: files | records` in the plan header carries the shape,
                       #   so it is a property of the plan rather than of which command
                       #   you typed. records = child records + part_of (DD-072), needs
                       #   parent_id and a description each; files = today's pattern-mode
                       #   result — source retired to <base>.index.md, no edges, id and
                       #   description optional. The default is printed and overridable
                       #   (tier 2): records if the source declares an id, files if not.
                       #   parent_id going OPTIONAL is what lets the ingest case — a
                       #   foreign document with no id, which planForFile refused
                       #   outright — onto the unified path at all.
                       #   --update-config REMOVES the source's scan entry in files mode
                       #   (it stops being a record) and ADDS ONLY in records mode.
                       #   Unchanged: split_on in config.yaml still executes directly —
                       #   it produces cache rows, not files, so a wrong pattern costs a
                       #   reindex and there is nothing to review.
docdog gc              # evict stale embed-cache rows (OBS-026)
                       #   --dry-run --retain-days <n> --prune-recipes --no-compact
                       #   Sweeps a SHARED store: DISC-032 unions every worktree's
                       #   liveness rather than refusing. Any deletion now VACUUMs,
                       #   so the file actually shrinks — it never did before.
                       #   --prune-recipes takes the unreachable superseded-recipe
                       #   stratum (FRICTION-035), the one growth event gc could not
                       #   see. Opt-in FOREVER and never reached by auto_gc: it
                       #   SPENDS FRICTION-033's free revert rather than reclaiming
                       #   waste, and which good you want isn't in the corpus.
                       #   `docdog index` sweeps on its own now (embed.auto_gc,
                       #   default true; full-scope runs only, and declines when a
                       #   worktree has no readable cache — gc names that cost and
                       #   lets you weigh it, a side effect has nobody to ask).
                       #   embed.retain_days (default 7) never evicts rows younger
                       #   than N days. That is a FLOOR, not the LRU OBS-021
                       #   forbade — see the embed-store bullet in Key facts.
docdog run <name>      # run .docdog/scripts/<name>
docdog skill install   # re-emit ONE injectable skill, or install to a
                       #   non-default --target. No longer the only path to them:
                       #   `init` writes them and `update` maintains them
                       #   (PROPOSAL-044). Two are registered — `specs` and
                       #   `feedback`.
                       #   installs as <target>/docdog-<name>/SKILL.md — a skill is a
                       #   DIRECTORY and its name IS the directory name, so a flat
                       #   <name>.md is discovered by nothing, silently (FRICTION-040).
                       #   The docdog- prefix is that name: it is the only namespace a
                       #   project-level skill has, and personal skills shadow project
                       #   ones. Registry keys keep the unprefixed name.
                       #   `specs` emits ONE file: the 159 KB flat index it
                       #   used to write beside SKILL.md is gone (FRICTION-043) —
                       #   corpus state committed into a seed had no invalidation
                       #   path and nothing read it. It ALSO absorbed
                       #   `navigate-specs` (PROPOSAL-044), along the seam the code
                       #   showed: `navigate_specs_path` existed only so one file
                       #   could point at the other. PROPOSAL-020 split them so a
                       #   convention change need only regenerate the generic half —
                       #   a premise `update` removes, since it re-renders both in
                       #   one run.
                       #   `feedback` is the reporter half of PROPOSAL-043: it
                       #   ships as a skill because formulate/search/decide is
                       #   DP-001 tier 3 at every step, and it sends nothing —
                       #   docdog holds no token and runs no endpoint. It did NOT
                       #   merge: a skill's `description` is its trigger, and the
                       #   rare skill nobody goes looking for is the one that most
                       #   needs its own.
```

There is **no `infra`, `migrate`, `create`, `collections`, `relations`,
`recent`, `discuss`, `workflow`, `export`, or `refs` subcommand** — all
died at v3 step 6 (P-023 §5, DD-070 §3). Four cohorts came back through
proposals: `suggest-edges` (PROPOSAL-024, 2026-07-11), the parity set
`get`/`status`/`traverse`/`relate` (PROPOSAL-032, 2026-07-14),
`merge-driver` (PROPOSAL-030, 2026-07-14) — which grows the CLI without
growing the *user* surface, since only git ever calls it — and `renumber`
(PROPOSAL-031, 2026-07-14), which is new capability rather than a
resurrection: nothing in v1/v2 could rename an id.

**The relationships union merge driver (PROPOSAL-030).** Two branches each
appending an edge to the same record is a set union, but git diffs lines
and calls it a conflict — on exactly the hub records every branch touches.
The driver runs git's ordinary three-way merge *first* and only engages
when that conflicts, so it can never make a clean merge worse. If the
conflict is confined to `relationships:`, it replays the other side's
added edges through the same `appendRelationship` surgery `docdog relate`
uses. Everything else — divergent prose, divergent scalars, one edge with
two different contexts — still conflicts loudly, because choosing there is
judgment (DP-001 tier 3). `.gitattributes` is generated from `scan_paths`
by `docdog init`; `docdog index` reports drift and never rewrites it.
A clone that never ran `docdog init` gets git's default text merge, i.e.
exactly today's behavior — the only direction an optional feature may fail.

**Renumber + contested ids (PROPOSAL-031).** `docdog renumber <old> <new>`
is the promotion primitive a provisional-id scheme needs (DISC-027: a host
project mints `DD-T168-01` on a task branch and promotes it on trunk;
docdog never learns what a branch is). It splits by certainty: the record's
`id:`, its **inbound edges** (exact — read from the cache's `edges.to_id`
index, which forward-edge-only guarantees is complete) and, opt-in, the file
name are rewritten; **prose mentions are reported, not rewritten**, unless
`--prose`, and a slash-list (`OQ-18/19/21`) is never rewritten at all
because substituting the token would rename its siblings too (OQ-46).
Cross-file duplicate ids now **persist** in the cache (`contested_ids`,
SCHEMA_VERSION 4) instead of scrolling past as an index warning, and
`docdog status` / `docdog_status` list them — the loser is a record on disk
that search, get and traverse cannot see. Resolution is judgment (DP-001
tier 3): status names the contenders, an agent picks, `renumber --file
<loser>` executes. The loser has no cache row, which is exactly why `--file`
exists; in that mode inbound edges are **left alone** (they resolve to the
record that kept the id) and reported.

**Splitting a document into records (PROPOSAL-038 + PROPOSAL-039).** Where a
document divides into ideas is DP-001 tier 3, so every input `split` used to
accept was a *rule* (`--on`, `--depth`) and an agent that had decided
boundaries semantically had no way to say so. The plan file is that input
shape: `split <file> --format plan` emits the heading outline with char counts
and descent's suggestion, the agent edits boundaries and writes each child's
title and description, `split --apply-plan` executes — child files with
`part_of` pointing at the parent (DD-072), parent rewritten down to its framing
prose plus a prose roster. **Boundaries partition the document**, so deleting an
entry merges that section into the one above it and nothing is dropped. Guards:
a `heading:` the tool did not emit is a hard error (OBS-014's validator lesson,
moved from edges to boundaries), a stale `at:` is caught rather than applied,
an empty description is refused, every write is computed in memory before any
file is opened, and there is no `--auto-split-all` — that is the `--accept-all`
analogue and must never be built. **Size-driven descent is a diagnostic, not an
actor**: with no selector the command reports which depth would break the
document into pieces that fit and writes nothing, because "every piece fits
under the cap" is a fine fact and a poor decision — OBS-019 measured that
over-cap records retrieve *well*, so never split a record to get it under the
cap. The `compose` skill ships in `templates/skills/_common/` (pinned by
`tests/unit/skill-seeds.test.ts`) and carries the plural test and the
leave-it-alone outcome. **Apply always reports whether `scan_paths` reaches the
children**, because that failure is otherwise silent — the writes succeed,
`docdog index` says nothing, and the parent's roster points at records that are
not in the corpus. Directory entries recurse, so it usually already does; a
parent reached by a *file-level* entry is the case that bites. `--update-config`
opts into the fix and in plan mode is **additive only** — removing the parent's
own entry, which pattern mode correctly does, would un-index a live record that
every child just declared `part_of`.

**Surface parity (PROPOSAL-032, DD-070 §4).** Every MCP kernel tool has
a CLI counterpart wherever the shell can express its inputs — a new MCP
tool ships with its CLI command, or with a stated reason why it can't.
The standing exception is the two body-bearing writes: `docdog_create`
and `docdog_update` stay MCP-only, because multi-line markdown resists
shell quoting. So record creation/editing happens through the MCP tools
or by editing files + `docdog index`. Deletion = delete the file +
`docdog index`.

## MCP surface (the kernel 8)

`docdog_search`, `docdog_get`, `docdog_traverse`, `docdog_relate`,
`docdog_create` (writes a file at a caller-supplied repo-relative path),
`docdog_update` (patches the file), `docdog_index`, `docdog_status`.

**Every tool declares `write: true|false` (PROPOSAL-035)** in
`BASE_TOOL_DEFINITIONS` (`mcp/server.ts`) — a new tool must answer the
question rather than default into writable, because `serve --read-only`
derives its refusal set from that field rather than from a parallel list
that could drift open. The three writes are `create`/`update`/`relate`;
`index` is **not** a write (it touches the disposable cache, never the
corpus). Under `--read-only` the writes are both hidden from `tools/list`
and refused on call (`SERVER_READ_ONLY`), and `docdog_status` reports the
mode on every path. It refuses *docdog's* writes, not the filesystem's —
an agent with file tools can still hand-edit markdown; sandboxing that is
the host's job.

**Every tool takes an optional `root` (PROPOSAL-033).** The server is no
longer bound to the repo that spawned it: `root` is an absolute path to a
docdog project (or any directory inside one), and a call that omits it acts
on the server's *default* project — resolved once at boot from its cwd, or
pinned with `serve --root`. A server started outside any project still runs;
every call against it must then name its `root`. A `root` that is not a
docdog project is a hard error (`ROOT_NOT_A_PROJECT`) and **never** falls
back — acting on the wrong corpus is worse than failing. Steered calls append
`_(project: <name> — <root>)_`; unsteered ones are unchanged. There is no
"all projects" mode: searching every project, or inferring the project from
an id prefix, is DP-001 tier 3 and must never be built.
This repo's `.mcp.json` runs `npx tsx src/cli/index.ts serve` — source mode,
so the connected server is current after any edit **once it is restarted**
(it previously ran the *published* package and was permanently stale).
Writes require an indexed cache and refuse split/table/script-parsed records.

**The server discloses its own vintage (PROPOSAL-037).** A `serve` runs
whatever it loaded at boot — that tradeoff is deliberate (DISC-021 records it
as the CLI's one structural advantage over MCP); what was wrong is that it was
*silent*, so an agent talking to a stale process gets old behavior and reads it
as a docdog bug. `docdog_status` now carries a **Server** block saying so, and
**that is the surface to check before concluding a fix does not work** — the
sharpest case is FRICTION-037's own fix, where you update docdog to get it,
exercise it through a server spawned before the update, and see the old
refusal. Two signals OR together because each is blind where the other works
(`engine/vintage.ts`): version-compare catches it when installed and is
constant across every source edit; boot-mtime catches it in source mode and is
blind when installed, because **npm preserves the tarball's mtimes on extract**
— a package installed today can carry publish timestamps predating the running
process. The report names which fired. **Disclosure only, forever**: no
`docdog_restart`, no self-reexec, no refusing calls while stale — process
lifecycle belongs to the host that spawned the server, the same boundary
PROPOSAL-035 drew by refusing docdog's writes rather than the filesystem's.
Advising which surface the agent should have used would be DP-001 tier 3.

**Config, unlike code, is re-read per call (FRICTION-037).** `ProjectResolver`
memoized `loadConfig` per root for the life of the process and never
invalidated it, so `serve` outlived the config it booted with: declaring a
collection is a config edit and nothing else, which made `docdog_create` refuse
with "Declare it in vertex_collections config" — an instruction to repeat the
edit you had just made — while `docdog_index` quietly skipped every section
under a scan path that was right there in the file. It loads from disk on every
call now (`mcp/project-resolver.ts`). That was the server's only cross-call
state; the cache handle, relations registry and tool list were already
per-call, and the embedder's pipeline memo is keyed by `model::dtype` so it
reloads rather than lies.
Registered relation/collection vocabulary lives in `.docdog/concepts/`
records — search them, don't look for meta tools.

## Dual dogfooding

Docdog is used in two project contexts simultaneously:

1. **Self-hosting** (this repo): docdog manages its own specs.
2. **External dogfood** (other repos that depend on docdog): reveals onboarding
   and large-corpus behavior.

Two ways to **run** docdog in this repo:

| Mode | How to invoke | When to use |
|---|---|---|
| **Installed** | `docdog <cmd>` (via `npm link`) | Daily work on specs; stable features |
| **Source** | `npx tsx src/cli/index.ts <cmd>` | Testing in-flight features; fallback when the installed build is broken |

### Dev loop after code changes

```
npm run lint     # tsc --noEmit
npm test         # whole suite — Docker-free, pure temp-file SQLite
npm run build    # tsup → dist/
docdog --version # sanity check (npm link persists)
docdog index     # smoke test on real content
```

Optionally `npm run build -- --watch` during active development.

### Fallback when installed docdog breaks

If a code change leaves installed `docdog` broken, fall back to
`npx tsx src/cli/index.ts <cmd>` — runs against the working tree,
bypasses dist/. Fix forward, rebuild, resume installed-mode work.

**Gotcha:** a live `docdog serve` MCP server keeps running old **code**
until restarted — after a rebuild, smoke-test handlers via a tsx
scratch script, not the connected server. Its **config** is no longer
stale (FRICTION-037, re-read per call), and it now *tells you* when its
code is (PROPOSAL-037's Server block in `docdog_status`) — so check that
block before concluding a just-shipped fix does not work.

## Working on docdog code

**Before code changes that touch the indexer/storage/templates:**
1. Snapshot the spec state: `git status && git diff --stat specs/`
2. Commit any in-flight spec edits so a broken build doesn't block recovery

**After code changes:**
1. `npm test` (no services needed)
2. `npm run build && docdog --version` — confirm installed CLI still works
3. `docdog index` against this repo — smoke test on real content
4. If broken: source-mode fallback, fix, rebuild

**MCP stdout is the transport** — never `console.log` in handler paths;
collect indexer output via the log/warn options (see index-tool.ts and the
writes handlers for the pattern).

**Nothing under `src/` calls `process.exit`** (FRICTION-020,
`tests/unit/cli-exit.test.ts`). A command that must stop sets
`process.exitCode` and **returns**; the top-level handler does the same.
`process.exit` terminates before pending stderr writes have necessarily
reached the terminal — Node documents those streams as async on a Windows
TTY and gives `print(); exit(1)` as its own example of what not to do — so
the twenty-three `printError(…); process.exit(1)` pairs could each exit 1
having said nothing about why. That is exactly the shape an adopter
reported. Success paths always exited by returning; this only makes failure
match. `process.exit` was also doing double duty as `return` at every one of
those sites, so a new early exit needs a real `return`. Same family: a
teardown that runs *after* a command has printed its verdict must not be able
to change it — see `closeQuietly` in `storage/indexer.ts`.

## Design principles review

Docdog has design principles in `specs/principles/dp-NNN-*.md`. Read
them. Every principle is a reviewable criterion that any new feature,
refactor, or design change must be checked against.

**Before proposing any design change** (a new CLI command, a config
schema change, an indexer behavior, an MCP tool, a new collection, a
new automation), walk through every DP-NNN and ask whether the proposal
respects it. If a proposal conflicts with a principle:

1. **Default: redesign the proposal to comply.** The principle usually
   wins — it's there because past experience showed the opposite
   approach was wrong.
2. **Surface the conflict explicitly.** Don't silently ignore it. Call
   it out in the discussion or proposal: *"this violates DP-001 Tier 3
   because X; redesign Y mitigates it."*
3. **If the user agrees the principle itself should change**, open a
   new discussion for amending or superseding the principle. Don't
   carve out quiet exceptions in a feature proposal.

**Current principles:**

- **DP-001 — Agent-first mechanics.** Docdog's code is strictly
  mechanical. Semantic decisions (guessing intent, inferring meaning,
  auto-categorizing content) belong to the agent+user loop. Three
  tiers: pure mechanics (always allowed) / visible defaults with
  override (allowed) / inference and judgment (forbidden in code).
  Test every new feature: *"does this push a decision into code?"*
  Templates are a deliberate exception (explicit scaffolding is fine).
  See `specs/principles/dp-001-agent-first-mechanics.md`.

When discussing or designing, apply the test at the earliest stage —
don't get deep into implementation before checking. A principle
violation caught in design is cheap; one caught in code review means
rework.

## Filing friction during dogfooding

When you hit a bug, limitation, or UX friction while using docdog, write a
note file under `specs/notes/friction-NNN-<slug>.md` (directly or via
`docdog_create` with that path) with this frontmatter:

```yaml
---
id: FRICTION-NNN
title: "<short description>"
collection: notes
status: open
description: "<what happened, in one sentence>"
severity: blocks-work | inconvenient | cosmetic
---
```

Body should cover: what you were trying to do, what went wrong (error message
or unexpected behavior), what workaround you used, and anything that should
change in docdog. Then `docdog index` so the note is searchable.

This turns everyday usage into a continuous improvement loop.

## Key facts

- Single project per repo — no multi-project routing
- Tests are Docker-free: pure logic + temp-file SQLite caches with an
  injected fake embedder (`npm test` runs everything in seconds)
- Storage lives in `src/storage/` (cache, schema, indexer, search,
  traverse, vertices, relations, frontmatter surgery, writes)
- `CONTRIBUTING.md` is indexed alongside `specs/`
- `.mcp.json` is created by `docdog init` and points to
  `npx -y @yasnikoff/docdog@<version> serve` — **pinned** since 0.4.0
  (FRICTION-044). **The pin is for DETERMINISM, not rescue — the stranding
  story it was filed against does not reproduce.** Measured 2026-08-30 on
  docdog's own published package, npm 11.8.0: npx resolves the SPEC in
  `_npx.packages` fresh on every run, so an unpinned spec rides `latest`, and
  a reconstructed stale entry (`^0.2.0`, 0.2.0 installed, registry 0.2.1)
  upgraded on one run, three times, offline included. The `dependencies` caret
  is what `npm install --save` writes and is NOT the reuse predicate; reading
  it as one is what produced the claim. The cited evidence — a neighbouring
  package four minors behind — was an entry last written ONE DAY before the
  next release existed: disuse, not stranding.
  So the pin's real trade is that unpinned npx was AUTO-UPGRADING, and pinning
  buys a version the repo names at the cost of that. Still right — a server
  changing under a running project is worse — but a trade, not a fix.
  A pinned spec does key a separate cache directory, so the mechanism holds.
  `docdog update` bumps an untouched pin through PROPOSAL-041's existing
  outcomes and reports an edited one.
  **The maintainer's machine CAN observe the adopter's path**: two env vars
  (`npm_config_prefix` to a temp dir hides the global link, `npm_config_cache`
  gives a clean `_npx/`). "Cannot be observed" and "was not observed" are
  different findings and only the second was true.
  One trap that survives: **published 0.2.1 hardcodes `version("0.2.0")`**, so
  `--version` on an old artifact reports the wrong number. Probe the installed
  `package.json`, never `--version`.
- Windows: write LF, UTF-8 no BOM; git's autocrlf warning on commit is
  cosmetic; `dtype not specified` on index/search is transformers.js noise
- Embeddings live in their own file, **not** in `index.db`: `embeddings.db`
  under the git common dir (`.git/docdog/`) when git answers, else
  `.docdog/cache/` (PROPOSAL-029). Shared by every worktree of the clone,
  so a fresh worktree indexes in seconds. `docdog index` prints the path.
  `docdog gc` **sweeps it** — the shared-store refusal died with DISC-032,
  which unions every worktree's liveness (`git worktree list` → each tree's
  `index.db`) instead of guessing that a sibling might exist. `shared` meant
  "git answered", so the old refusal fired on every git project including
  single-worktree ones: gc was unreachable, not careful.
  **The schema version is in the FILE NAME from v2 on** (`embeddings-v2.db`
  beside `embeddings.db`) — FRICTION-034, resolved 2026-08-27. The clone-wide
  reach that makes this file worth sharing is what made an in-place version
  drop expensive: `rebuild()` deletes every worktree's vectors at once, and
  the documented dev loop (npm-linked docdog beside `npx tsx src/cli/…`) holds
  two versions against one clone and can ping-pong it — each run finding the
  other's version, dropping the store, re-embedding the corpus, explaining
  nothing. Vintages coexist now, rollback is free, and the cost becomes disk.
  **v1 keeps the bare name permanently**: renaming it would orphan every store
  in existence and charge the full re-embed the scheme exists to avoid. Two
  things deliberately NOT built: an adoption path across a bump (a bump means
  the schema changed — that is what makes it a bump), and a flag to delete old
  vintages. A vintage is one whole file whose path `gc` prints, so `rm` reaches
  it; contrast `--prune-recipes`, which had to exist because its stratum lives
  *inside* the current file. In-place rebuild survives only where docdog does
  not own the name — an explicit `embed.cache_path` — and now reports how many
  vectors of whose vintage it dropped.
- **The embed store is grow-only, and the growth driver is not what OBS-021
  said — OBS-026 corrects the rate; OBS-021 stays canonical for the rest.** Re-measured at 38 days rather than 7:
  ordinary edit churn is **~1.2 rows/day ≈ 2 MB/year**, not 18 — OBS-021's
  rate was extrapolated from a window containing a full re-embed. Its
  *finding* (edits, not deletions) stands; its number doesn't. **A growth
  rate measured across one week is a measurement of that week.**
  The real driver is **recipe changes**: one cap change froze **390 rows /
  1.7 MB — 50% of the file, ~1.4 years of churn — in a day**, and
  content-keyed `gc` cannot touch it by design (FRICTION-033 retains it so
  reverting is free). Four things shipped in response:
  `VACUUM` after any sweep (nothing in `src/` ran one, so gc could evict a
  sixth of the store and shrink the file by **zero**); `gc --prune-recipes`
  for that stratum (opt-in forever — it *spends* free-revert rather than
  reclaiming waste, so the flag is the decision); `embed.auto_gc` **default
  true**, sweeping at the end of a full-scope `docdog index` (the store was
  sweepable for weeks and stayed full because nothing ran the sweep — an
  opt-in knob reproduces that exactly); and `embed.retain_days` **default 7**
  (DISC-032 item 3). `index.db` is *not* grow-only — `sweepGhostFiles` drops
  vanished files, though a `--path`-scoped run only sweeps its own scope.
  **The floor is not the LRU OBS-021 forbade** — same column, opposite
  comparison, opposite failure mode. `created_at` is age-since-first-embed
  and `get()` records no access, so age-as-a-*ceiling* ("evict older than N")
  discards exactly the long-lived-but-live rows; age-as-a-*floor* ("keep
  newer than N") only ever declines to call a young row dead, and costs a
  retained row instead of a discarded one. It also covers DISC-032's accepted
  residual gap — a commit checked out in *no* worktree is invisible to the
  liveness union, but the work that made it was recent. Real LRU still needs
  `last_used_at`, still bumps `EMBED_SCHEMA_VERSION`, still drops the store.
  **`status` and `gc` must agree in prose, not just in query.** Adding the
  floor made status say "run gc to evict them" about rows gc would refuse —
  the exact drift OBS-021's shared `findUnusedRows` exists to prevent,
  reintroduced one layer up in the *remedy sentence*. status computes the
  floor now.
- **Relationship entries are type-as-key**: `- references: DD-070`, never
  `- type: … / target: …` (that shape is now refused at parse time —
  FRICTION-028; it used to mint a phantom edge and silently drop the whole
  block). `docdog index` also warns on unregistered relation types and on
  targets no record declares — both whole-corpus post-passes, skipped on
  path-scoped runs (`storage/edge-health.ts`).
- Content hashes are taken over **LF-normalized** content
  (engine/discovery.ts) — under `core.autocrlf` a worktree's bytes differ
  from the trunk's, and an EOL-sensitive key silently re-embeds everything.
- `MAX_EMBED_CHARS = 8000` (storage/**embed-health.ts**, applied by
  `embedInput` in storage/indexer.ts). Changing it is now mechanically safe:
  the embed store's key is a **recipe id** — `embedRecipe(model, cap, dtype?)`
  = `${model}@${cap}`, or `${model}@${cap}#${dtype}` when a dtype is set — so
  old-cap vectors stop matching instead of being served
  beside new ones (FRICTION-033, resolved; this bullet used to say "if changed,
  drop the embed store", a manual invariant in the subsystem that versions
  everything else mechanically). **Anything else that changes what `embedInput`
  emits must join the recipe** — OBS-017's prepend-the-description design is
  the worked example, and `embed.dtype` is the shipped one (see the next
  bullet). An **unset** dtype yields exactly `model@cap`, byte-for-byte the
  pre-dtype key, which is why adding the parameter re-embedded nothing. Superseded-recipe rows are *not* swept (gc keys on
  content), which is what makes reverting free. A record past the cap keeps its
  full body in `body_text` and FTS but embeds only a **prefix**, so its
  tail is findable by keyword and not by meaning. That was silent until
  FRICTION-031; `docdog index` now warns with the corpus share and
  `docdog status` lists the records (`--json` for all of them) and is the
  authoritative count — it drifts with every long record written. It has held
  near **16% of the characters** across 302→355 records (15.0% at 344; 15.4%
  at 355, 62 records over), concentrated on the hubs: DD-070 loses its
  Rationale and Principle walk.
  For **finding the record** that is not a defect — see OBS-019 two bullets
  down. For **finding a fact in the discarded tail** it is, and the damage
  lands in the ranker rather than the index: OBS-024, last bullet.
- **`embed.dtype` is the third recipe input, and fp32 stays the default on
  measurement (OBS-022, then OBS-025).** Passed straight to transformers.js's
  `pipeline(..., { dtype })` (FRICTION-018 item 3); unset = fp32, the 522 MB
  `model.onnx`; `"q8"` is 132 MB and indexes ~2× faster. ONNX-only, ignored
  under the ollama provider. **Own corpus (OBS-022):** hybrid 0.849→0.831
  (−0.017, inside the noise floor) but vector leg 0.673→0.610 (−0.062, outside
  it) — OBS-018's rule replayed, since FTS is dtype-independent and RRF pays for
  diversity. So the operational win is real and the quality win is not, and it
  ships opt-in. **Adopted corpus (OBS-025)** measured the regime OBS-022 named
  as its own scoped-out risk, and the bet-hedge was right about the mechanism
  and unnecessary in outcome: the leg falls 1.6× harder (0.553→0.456) and
  record-finding hybrid still only −0.023. What OBS-022 could not see, having no
  detail query set, is that **the absorption is not uniform** — on detail
  questions whose answer IS embedded, hybrid falls **0.667→0.560 (−0.107)**,
  the largest single drop measured here, while past the cap it falls 0.022
  because quantization cannot subtract from a leg that is already blind
  (OBS-024's mechanism restated). Carry the caveat: that arm is 7 queries and
  three rank changes. **So "q8 costs nothing in hybrid search quality" is a
  record-finding claim and must say so wherever it is repeated.**
  **Changing it invalidates the index — since FRICTION-046, resolved
  2026-08-27.** The full-rebuild guard compared the **bare model** while the
  embed lookup keyed on the **recipe**, so a dtype change invalidated nothing:
  unchanged files are skipped before the store's key is ever consulted, and
  the store went silently mixed at two quantizations. It compares
  `embedRecipe(model, MAX_EMBED_CHARS, dtype)` under its own meta key now
  (`META_KEYS.embedRecipe`); `embed_model` stays as the value `status`
  *displays*, and one field doing both jobs is the defect. `--full` is no
  longer load-bearing knowledge. Two things to keep true: a cache with no
  recorded recipe synthesizes the one it implies rather than reading the
  absence as agreement — otherwise the fix protects only projects the bug
  never reached — and **a rebuild is not a re-embed**, since the store keeps a
  row per recipe, so q8 → fp32 → q8 reindexes each time and embeds nothing.
- **Do not "fix" that by chunking. It was measured and refused (OBS-016).**
  Three designs A/B'd on the frozen 40 with the real `search()`: baseline
  **0.874** hybrid MRR, split-at-every-heading 0.785, all-levels 0.729 —
  doing nothing wins on all four metrics, monotonically. Two reasons:
  `vectorLeg` takes **max-cosine per record**, so more chunks is more
  lottery tickets and rank is relative; and the whole-record centroid
  encodes the *aboutness* that record-finding queries match, which is why
  DD-070 ranks 2nd for "what did DD-070 supersede" **without §10 ever being
  embedded**. FTS indexes the full body, so the keyword leg already covers
  the hole. `chunks.ord/start_line/end_line` stay unused by design.
- **Nor by embedding the description. Also measured, also refused
  (OBS-017).** `fts` is fts5 over **title/description/body** — the
  description is already retrievable, just not by the vector leg. Prepending
  it to the embed input is the only change that ever *improved* that leg
  (55%→65% Hit@1), and hybrid still drops 0.874→**0.840**, because RRF pays for
  leg **diversity, not strength**: it buys the vector leg something FTS already
  had, with body prefix only the vector leg could see. (That number has now read
  0.840 / 0.827 / 0.840 on corpora four records apart — **0.013 is this
  instrument's noise floor; nothing under ~0.03 is a finding**.)
- **Nor by raising the cap — and this one inverts the whole frame (OBS-019).**
  FRICTION-031 offered split-or-chunk and **never asked why the cap is 8,000**.
  It is a resource guard; the corpus fits nomic's 8,192-token context (longest
  record **6,694**), so every record *can* be embedded whole — no chunks, no
  summaries, no length tax. Built and measured: vector MRR 0.674→**0.625**,
  hybrid 0.874→**0.846**, and **0 for 4** on the queries whose gold is a
  truncated record. Proven absolutely, not by rank: the gold record's cosine to
  its own query fell on **12 of 12** pairs — DD-070 by **−0.13** on *"which
  decisions did DD-070 supersede"*, the query its unembedded §10 answers.
  **The truncated prefix is a better vector than the whole document** —
  truncation is accidentally summarizing, since these records open with framing
  and close with detail. The 16% is not lost content; it is what keeps the
  centroid sharp. Mechanism: `pooling: "mean"` over ~6k tokens blurs it, and
  the cap sits at ~107% of nomic's 2,048-token *trained* length.
- **Nor by late chunking — the best chunking ever measured here, and it wins by
  *un*-chunking (OBS-020).** One forward pass over the whole document, pooled
  per span, so each chunk keeps its context: **0.785→0.838**, recovering two
  thirds of OBS-016's gap and still losing to doing nothing (0.874) at 1,881
  vectors and an hour of forward passes. **The result is not the finding.** Its
  claim is that chunk vectors get *better*; measured, every one got **worse**
  (gold cosine down **12/12**) and the winning span got *less* query-responsive.
  What it does is **smear**: a document's spans collapse onto each other
  (0.663→0.843) and onto its whole-document vector (0.774→**0.921**) on
  **240/240 records**, which cuts the max-cosine lottery **39%**. It stops
  playing the tax rather than beating it — so its ceiling is the centroid it is
  approximating, and it lands *between* naive chunking and not chunking because
  it *is* between. Not the NTK boundary: **short** docs collapse harder (+0.201)
  than long (+0.102). Corollary — **the recall and the tax are the same
  property**: chunks only stop paying the tax by ceasing to be distinct, so no
  design buys one without selling the other.
- **A rank drop has two causes and rank data cannot tell you which. Reach for
  the cosine (OBS-019).** OBS-017 said patching only the 45 over-cap records
  hurt because "improved records float up as distractors" — **asserted from
  ranks, never checked**. Measured: their cosines are mixed (7/12 down) and
  their ranks *sank* 5 of 5, which float predicts the opposite of. Its finding
  stands (desc-trunc-only is worse; a length-branching recipe is a bad shape),
  its mechanism doesn't, and "ranking is relative — third instantiation" was
  overclaimed. Cosine is absolute and costs one query. **Generalized one level
  up by OBS-020: an aggregate cannot tell you that a design is succeeding for
  the *opposite* of its stated reason.** Late chunking's +0.053 reads as
  "contextualization works" and means "contextualization destroys the chunks,
  which is what helps". Only a *query-independent* absolute measurement
  (intra-document span similarity) could see it. When an arm wins, measure its
  mechanism, not just its score.
- **The retrieval question is CLOSED. Do not reopen it without new evidence
  (OBS-018, re-swept at 1,470 configs by OBS-020).** PROPOSAL-023 §8's
  ranking-tuning door — the last live path — was swept: leg weight × RRF-K ×
  length normalization over every chunk layout, with the frozen 40 deliberately
  readable so a win would surface if one existed. **The argmax is the shipped
  ranker** (`RRF_K = 60`, equal legs, one chunk per record). A null you cannot
  overfit your way out of. Why: **FTS alone 0.608, vector alone 0.676, fused
  0.874** — the fusion adds ~0.2 over either leg, so **complementarity is the
  product**. Two mediocre retrievers that fail *differently* beat either one.
  That is the rule to carry, and OBS-020 supplied its mirror half: an input
  change that **improves** a leg standalone can still lose (desc: leg 0.733 best
  ever, hybrid 0.840), and one that **worsens** a leg standalone can win big
  (late: leg 0.639, hybrid +0.053). **The standalone leg score is not a weak
  predictor of the fused number — it is not a predictor.** Only the fused number
  decides, in both directions. Untested and unpromising: score-based
  (z-normalized) fusion, per-level weighting. Forbidden: query-dependent leg
  weights (DP-001 tier 3). **Every refusal above is scoped to this corpus,
  this ranker, and record-finding queries** — the sweep's argmax is the
  argmax for those conditions, not a universal one. That scope is now load-
  bearing rather than decorative: see the next bullet, which found a case
  outside it. Still untested there: late chunking, the arm with the most
  reason to differ on longer documents (the literature's one quantitative
  claim is that it helps more as documents grow).
- **The closure has one measured boundary: past the embed cap, fusing is
  worse than not fusing (OBS-024).** On an adopted corpus where **44.5%** of
  characters reach no vector, against a query set aimed at facts in the
  discarded tail, hybrid scores **0.205** MRR against its own FTS leg's
  **0.493** — beaten by generous grep too. The control arm is the finding,
  not the aggregate: where the answer *is* embedded, fusion behaves exactly as
  the bullet above says (**0.667** over FTS 0.643 over vector 0.429, zero
  misses). Where it is past the cap the vector leg is not weak but **blind by
  construction** (0.022, eight misses of nine), and RRF at equal weights still
  hands it half the ranking budget. "Two retrievers that fail differently beat
  either one" assumes both are *retrieving*; a leg that cannot see the answer
  is noise with a vote. **Consequences.** (a) The tail is findable — FTS
  finds it — so the fix is never split-or-chunk; OBS-016/019/020 all stand.
  (b) A bigger cap is refused a second time, on foreign data: cap16k bought
  **+0.009** on exactly these queries while costing **−0.208** on
  record-finding. (c) This **qualifies OBS-018, it does not reopen it** — a
  different argmax on a different corpus argues for a knob, and the shipped
  default should stay what the majority case wants. (d) The only shape DP-001
  licenses is a **static, configurable leg weight** (tier 2); deciding that an
  incoming question is a detail question is intent inference, tier 3, and must
  never be built. It is a discussion, not a patch — open one before touching
  `search.ts`. Companion: OBS-023 measured both corpora on one instrument the
  same day (`tests/eval/run-external-eval.ts --root <project>`), so this is
  reproducible against any adopted corpus rather than argued about.
