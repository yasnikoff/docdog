# Changelog

Each release leads with **what to do about it**, because you are reading this
mid-upgrade rather than shopping. The feature list is underneath.

Upgrading, in general:

```bash
docdog update --check     # is there a newer version? (one lookup; sends nothing about you)
npm i -g @yasnikoff/docdog@latest    # or npm i -D …, depending on how you installed it
docdog update             # bring this repo's seeded files + .mcp.json pin up to it
docdog index              # if seeded records changed
```

A running `docdog serve` keeps the code it booted with. Restart it after
upgrading — the MCP tool `docdog_status` says so in its **Server** block. The
CLI cannot: `docdog status` describes the installation on disk, and knows
nothing about a server process someone else started.

## 0.5.0

**Action required:** none to keep working. Run `docdog update` to get two
corrected skill lines (`relate` lists `part_of` rather than the retired
`parent`/`child`, and describes `reject:` rows; `ejection-resilience`
cites the right record).

### Added

**`docdog pairs` — find records that say nearly the same thing
(PROPOSAL-049).** Two records that overlap heavily with no edge between
them are usually a stale claim nobody retired. `docdog pairs` finds them;
it never decides what they are.

```bash
docdog pairs                                  # similar pairs no settling edge joins
docdog pairs --id DD-042                      # just the one you wrote
docdog pairs --format review > pairs.yaml     # a file to judge, with the passages that overlap
docdog pairs --accept-from pairs.yaml --dry-run
docdog pairs --accept-from pairs.yaml         # apply the verdicts
docdog pairs --defects                        # defects recorded and not fixed yet
```

- **It nominates, and something else judges.** Candidates are live
  records whose stored vectors have a cosine of 0.80 or more, minus pairs
  a settling edge already joins. Superseded, deprecated, resolved and
  archived records are left out by default. Nothing calls a model. The
  review file carries, for each side, the passage most like the other, so
  the judge (you, or an agent) reads a few lines rather than two whole
  records.
- **Each verdict row is checked before it is applied.** A row is refused,
  by name, when a quoted piece of evidence is not word for word in its
  file, the relation is not registered, or either body changed after the
  file was written. The other rows still apply. Edges go through the same
  path as `suggest-edges`, including the cross-visibility guard. There is
  no `--accept-all`.
- **Verdicts are remembered** in `.docdog/pair-verdicts.yaml`, which you
  commit. A judged pair is not offered again until either body changes.
  A verdict that records a defect stays on `--defects` until an edge that
  closes it joins the pair; judging the pair again does not clear it.
- **Which edges count is configurable per step**, and each run prints what
  it used:

  ```yaml
  pairs:
    edges:
      settle: [supersedes, amends]   # a pair joined by one of these is not offered
      show: all                      # edges listed beside a pair for the judge
      close: [supersedes, amends]    # what closes a recorded defect (defaults to settle)
  ```

  The defaults are narrowed to the relation types your project registers,
  so a project without `amends` runs with `supersedes` alone. A type you
  write yourself that nothing registers is refused.

## 0.4.2

**Action required:** run `docdog update` to get the rewritten `ingest`
skill. If you use `parser: script`, or give one file a scan entry of its
own inside a directory that has another, upgrade and run
`docdog index --full` once.

One behaviour change can stop an index that ran before: **a path declared
twice in `scan_paths` with different parser config is now refused**, by
name, instead of being indexed both ways. Keep one entry for that path.

### Fixed

**A file entry now overrides the directory entry around it
(FRICTION-057).** With

```yaml
scan_paths:
  - spec/
  - path: spec/design-decisions.md
    parser: script
    script: rows
```

0.4.1 parsed `design-decisions.md` once per entry, and the two parses
deleted each other's records. The file flipped between them on every
`docdog index`, in either list order, each run reporting success. Now
each file is parsed once, by the most specific entry covering it: a
file beats a directory, a deeper directory beats a shallower one, and
list order plays no part. The overlap is not reported, because it is the
normal way to say "this one file is different".

**`docdog index --path <dir>` parses the way a full index does.** It
used to default-parse every file under the path, whatever parser the
config gave them.

**The script parser applies the entry's `collection:` (FRICTION-058).**
It used to file every section the script returned with
`collection: null` under directory inference or `default_collection`,
unlike every other parser. A collection the script sets itself still
wins.

**Editing a parser script re-parses the files it governs
(FRICTION-059).** The change check hashed the entry, which names the
script, and not the script, so an edit applied only after `--full`. A
helper module the script imports is still not tracked: after editing
one, run `--full`. A running `docdog serve` also picks up the edited
script on its next index.

### Docs

**Records that are not headings (FRICTION-056).** `split_on` finds
records only at headings. When a file's units are list items, table
rows or anything else, and the file must not be reformatted, the answer
is `parser: script`. Until now it was documented only as a way to read
foreign formats. The `ingest` skill now leads with that case and
carries a working script for list-item rows, and the README says a file
can hold many records.

## 0.4.1

**Action required:** none. If you keep one corpus in more than one
repository — a scan path that walks out of your working tree — upgrade,
because 0.4.0 refuses to write edges across that boundary.

### Fixed

**An edge into another repository is no longer treated as a leak
(FRICTION-054).** 0.4.0's cross-visibility guard classified every path
against a single working tree, so anything reached by an external
`scan_paths` entry was "not in a clone" — and the rule inverted on
exactly the arrangement it was supposed to protect. Concretely, in a
private repo whose corpus reaches into a public one:

- `docdog relate` **refused** every edge to the public records, saying
  it would publish an id that the more-public repository had already
  published;
- the repair it named — *record it on the other side* — when followed,
  **patched a file in the other repository**, where the same id resolved
  to a different record;
- `docdog index` reported one leak per crossing edge, forever.

Git knows what a clone of one repository contains. Whether a *different*
repository is more or less visible than this one is not a git fact, and
0.4.0 guessed. It now answers **`undecided`** — the state the guard
already had for *not determinable, triggers nothing*.

Nothing was loosened where git is certain. A target is still
`out-of-clone`, and an edge into it still refused and reported, when it
is ignored in this working tree, ignored in **its own** working tree, or
outside **every** working tree — the last because no clone of anything
carries it.

The one true half of the old message survives, said once about the
project instead of once per edge:

```
Cache: this corpus spans more than one repository — 344 edge(s) point at
records under ../other, outside this working tree. They resolve here and
will not resolve in a clone of this repository alone. Not a leak: whether
that repository is more or less visible than this one is not something
git can answer.
```

**What this gives up, stated plainly:** docdog no longer flags a public
repository that points into a private sibling. It never flagged that
*distinguishably* — it flagged every crossing edge — so in any split
configuration the signal was already noise, and a guard that fires on
the benign case as loudly as the harmful one is a guard you turn off.

## 0.4.0

**Action required:** run `docdog update` in every repo that has adopted
docdog, then restart any running `docdog serve`.

`update` will offer to rewrite two things it previously could not:

- **`.mcp.json` now pins the docdog version** it runs (`@yasnikoff/docdog@0.4.0`
  rather than the bare package). If you had not edited that entry, `update`
  bumps it for you; if you had, it reports and leaves it alone.
- **The `CLAUDE.md` block** was two kernel tools short and described config in
  v2 terms. Same rule: taken automatically only if it is byte-identical to
  what docdog wrote.

`update` also registers the union merge driver in `.git/config` if the
`.gitattributes` block names it and git does not define it — including in a
fresh clone, where that state arrives with no docdog involvement at all.

**If you use `docdog skill install specs`:** it no longer emits
`specs.index.md`. Delete the one you have; `update` lists it as no longer
shipped. The skill's lookups now read the live corpus instead.

**`update` now maintains three more things it previously wrote once and
forgot.** All three follow the same rule as everything else it touches — taken
automatically only if still byte-identical to what docdog wrote, reported
otherwise:

- **The injectable skills** (`specs`, `feedback`). They were outside the seed
  set on the theory that a per-corpus file has no shipped bytes to compare
  against, which confused *shipped* with *fixed*: what the comparison needs is
  what docdog would write **now**, and that is one render away. The practical
  effect is that an unedited skill picks up newly registered collections in
  its id-prefix roster instead of silently aging.
- **The `cache/` line in `.docdog/.gitignore`.** `init` wrote it and recorded
  nothing, so a repo that lost the rule — or adopted docdog before it existed —
  kept committing the disposable SQLite cache forever. Only that one line
  belongs to docdog, so your own ignore rules are invisible to the comparison.
- **The merge driver's `.git/config` half**, on every run rather than only at
  `init`.

**`update` also now reports whether any scan path reaches
`.docdog/concepts/`.** It has always written concept records there; if nothing
indexes that directory, it was reporting `added` for records that `search`,
`get` and `traverse` cannot see. It reports and never edits your config — the
two possible repairs are opposites and which one you want is not in the file.

**A note on disk, not an action:** the embed store now carries its schema
version in the file name (`embeddings-v2.db` beside `embeddings.db`), so
vintages coexist instead of dropping each other. Your existing vectors are
untouched and a rollback is free. The cost is one more file per schema
version; delete an old one with `rm` when you are sure.

### Added

- `docdog update --check` — ask the registry what the latest version is and
  cache the answer. One unauthenticated GET for a public package's `latest`
  tag, sending nothing about you or your corpus. The two modifiers mean one
  thing on every path: `--offline` guarantees no socket and answers from the
  cache, `--dry-run` guarantees no write. CONTRIBUTING.md states every socket
  docdog opens.
- `docdog status` names the installed version and how this copy was installed,
  then reports the cached verdict with its age. It never fetches it itself.
- `docdog status --json` carries an `install` block — version, install shape,
  and the cached verdict — because that JSON is the environment block a
  friction report pastes, and it previously carried no version at all. It is
  emitted on the unindexed path too, where a report is most likely to be
  needed.
- `docdog_status` gains a **Server** block: boot time, mode, and a stale
  verdict from two independent signals — the version this process loaded
  versus the one on disk now, and the newest mtime under the loaded code root
  versus boot. Neither can see the other's case (PROPOSAL-037).
- The upgrade instruction is chosen from how this copy was installed — npx
  cache, global, project dependency, or a source checkout.
- `docdog skill install feedback` — the reporter half of the feedback channel,
  as a skill rather than a command, because formulating, redacting, searching
  for duplicates and deciding what to send are judgment at every step. It sends
  nothing: docdog holds no token and runs no endpoint, so a report goes through
  your own `gh` or a link you click.
- **`--has` and `--lacks`** on `docdog list`, `docdog search` and
  `docdog_search` — absence becomes a predicate. `--where` compares a field
  against a value, so a record lacking the field never matches, which made the
  state every convention passes through while it is being rolled out
  unaskable: *which records has this not reached yet*. The two are exact
  complements by construction, so a record is always in one set or the other.
  A field name nothing carries is answered honestly rather than refused —
  returning everything on the day a convention is invented is the correct
  answer and the first query anyone runs.
- **`--scope`** on `docdog list` and `docdog search`, and `scope` on
  `docdog_search`. `--where scope=…` had always refused with *"use the
  dedicated scope parameter"*, and on the read surfaces there wasn't one.
- **`docdog suggest-edges` remembers a rejection.** Write `reject: <why>` on a
  review row instead of a `context:` and the pair is recorded in
  `.docdog/rejected-edges.yaml`; later sweeps stop offering it, and say how
  many they held back. Deleting a row still means *defer*, unchanged. A
  rejection is keyed to the source record's body, so accepting edges on that
  record does not expire it but editing its prose does — at which point the
  candidate returns carrying your original reason. `--show-rejected` sees
  through the suppression; deleting a line undoes it.
- **`docdog gc` reclaims space it previously only marked.** Any sweep now
  `VACUUM`s, so the file actually shrinks. `--prune-recipes` takes the
  superseded-recipe rows that content-keyed eviction cannot reach — opt-in
  forever, because it spends the free rollback rather than reclaiming waste.
  `--retain-days` and `--no-compact` are new. `embed.auto_gc` (default true)
  sweeps at the end of a full `docdog index`, and `embed.retain_days`
  (default 7) never evicts a row younger than that.
- **`docdog split` has one executor.** `--on` and `--depth` no longer act:
  they pre-populate the plan you review, so a pattern nominates boundaries
  instead of asserting that every matching heading begins a separate idea.
  `--on` is repeatable. The plan header carries `output: files | records`, so
  the result shape is a property of the plan rather than of which command you
  typed, and `parent_id` is optional — which is what lets a foreign document
  with no id through the unified path at all.
- `docdog status` rosters **`Records by status`** and **`Records by scope`**
  beside the collection roster, so you learn a filter's vocabulary before
  typing rather than by being refused. Scope is the one that had to ship: a
  free-string filter cannot refuse an unknown value, so a roster is the only
  way to learn it.
- `docdog index` reports scan-path entries that point at nothing on disk. A
  directory in `scan_paths` that does not exist reads like a home for records
  and is not one; files written there are silently unindexed.
- **`.docdog/local/` — markdown that is indexed and never committed.** Put a
  record there and it is searchable, traversable and retrievable exactly like
  any other, and git never carries it. The matching ignore rule is written at
  `init` and maintained by `update`, including in projects that predate it, so
  there is nothing to remember and no config to edit — the directory is scanned
  whenever it exists. `docdog index` reports how many records it holds, so they
  are never in your corpus silently. Two things to know: such a record has no
  git history and no recovery path if you delete it, and a committed record may
  not declare an edge to one (see the next entry) — record the relationship on
  the local record instead.
- **An edge may point from less-visible to more-visible, never the reverse.**
  A file git ignores, inside a scan path, is indexed and retrievable — that
  is how a private note stays searchable without being published, and it
  always worked. What did not work was keeping it private: a *tracked*
  record declaring an edge to it publishes the target's id and leaves every
  clone a pointer to a record it does not have. `docdog index` now reports
  such edges, `relate` and `--accept-from` refuse to write one, and
  `suggest-edges` marks the candidate without hiding it. Visibility is asked
  of git rather than declared in frontmatter, because a marker can disagree
  with reality. A record you have written and not yet committed is never
  flagged — that is work in progress, not a leak. The message names the
  repair: record the relationship on the other record instead, where
  `traverse` still finds it as an inbound edge and no clone sees anything.
  `--allow-cross-visibility` writes it anyway, per edge; the index-time
  report continues regardless, because the override waives the write and
  not the defect.
- The retrieval eval harness runs against **any** docdog project
  (`tests/eval/run-external-eval.ts --root <path>`), so the numbers in the
  README can be reproduced on your own corpus rather than taken on faith.

### Fixed

- **`search` and `traverse` now show each record's `status`**, on both the CLI
  and MCP halves — `list` and `get` always did, so the two surfaces that
  *choose* records for you were the two that would not say whether a record is
  still live. `docdog traverse --json` gained the field too; its projection had
  dropped it entirely (FRICTION-053). No ranking change: stale records were
  measured at 15.0% of top-5 slots against a 17.2% share of the corpus, so
  penalizing them would introduce a bias rather than remove one (OBS-027).
- `docdog update` wrote the `.gitattributes` merge block without registering
  the driver it names, leaving git warning per path on every conflicting merge
  (FRICTION-041).
- The seeded `CLAUDE.md` block listed 6 of the 8 MCP tools, omitting
  `docdog_create` and `docdog_update` — the two with no CLI counterpart, so
  the two an agent cannot discover from `--help` (FRICTION-042).
- `docdog skill install specs` shipped a committed flat index that was stale
  on the next spec write and read by nothing (FRICTION-043).
- The MCP handshake advertised a hardcoded `0.2.0` — and so did `docdog
  --version`, which matters more than it looks: on 0.2.1 the command reports
  `0.2.0`, so the obvious way to check whether an upgrade landed says it did
  not. Both read the real version from `package.json` now. If you are
  diagnosing a pre-0.4.0 install, trust `node_modules/@yasnikoff/docdog/package.json`,
  not `--version`.
- `docdog update --check` ignored `--offline` and `--dry-run`: it opened a
  socket and wrote the cached verdict regardless of either. Both paths share
  one implementation now, so `update --dry-run` reports a live verdict instead
  of whatever the cache last held.
- The upgrade instruction was printed whenever `latest` differed from the
  installed version rather than when it was newer, so a version *ahead* of
  `latest` was told to upgrade underneath a line saying "current".
- `docdog init` did not say which version it pinned into `.mcp.json`, and said
  nothing when the pinning copy was a source checkout whose version may never
  have been published.
- **Changing `embed.dtype` invalidated nothing.** The full-rebuild guard
  compared the bare model name while the embed lookup keyed on the whole
  recipe, so unchanged files were skipped before the store's key was ever
  consulted and the store went silently mixed at two quantizations. It
  compares the recipe now. Note that a rebuild is not a re-embed: the store
  keeps a row per recipe, so switching back and forth costs an index and no
  model time (FRICTION-046).
- **Two docdog versions against one clone could clobber each other's
  vectors indefinitely** — an embed-store schema bump deleted every
  worktree's vectors at once, and the documented dev loop holds two versions
  against one clone. The version is in the file name now (FRICTION-034).
- **A `--status` value nothing carries was not refused.** An allowlist naming
  nothing returned an honest-looking empty; an exclusion naming nothing
  returned the whole corpus while looking like a filter that worked. Both are
  checked against the corpus and the declared vocabulary now, and the message
  says which direction failed. Never a fuzzy correction — `opne` is refused,
  not silently read as `open` (FRICTION-038).
- **A `--where` filter aimed at a list or object returned an empty result
  instead of refusing.** SQLite compares such a field as its JSON text, so the
  comparison can never match a member — and an empty result is the one answer
  a caller cannot tell apart from data. It is refused by name, with the type
  and the record count (FRICTION-049).
- **A failing command could exit without saying why.** Twenty-three call sites
  printed an error and immediately called `process.exit`, which terminates
  before pending stderr writes have necessarily reached the terminal — Node
  documents those streams as async on a Windows TTY. Nothing under `src/` calls
  `process.exit` any more, and a test keeps it that way (FRICTION-020).
- The list and search filter flags took a comma-separated string and silently
  kept only the **last** occurrence when repeated. They are repeatable now.
- A malformed-filter refusal arrived wearing *"Cache missing or stale? Run
  docdog index"* — a hint pointing at the one thing that was fine.
- `docdog update` could not restore the `cache/` ignore rule, so a repo that
  lost it committed the disposable cache forever (FRICTION-047); and it seeded
  concept records without saying whether anything indexes them
  (FRICTION-048).
- The shipped skills in this repo and the templates they are copied from had
  drifted in both directions, invisibly — a section documenting `docdog list`
  reached the local copy and never the template, so for two releases every
  adopting project's search skill described a surface that had been replaced.
  A test pins them together (FRICTION-051).
- `npm install github:yasnikoff/docdog` (or any git spec) produced a package
  with no `dist/`, so its only executable did not exist. `prepare` builds it
  now; `prepublishOnly` never ran on install.

### Changed

- `.mcp.json` is written with a pinned version, so the server your project
  runs is the one the repo names rather than whatever `latest` is that
  morning. `docdog update` bumps it. **This changes an auto-upgrade into an
  explicit one:** an unpinned `npx` spec re-resolves `latest` on every run, so
  before this you were riding new releases the moment they published. That was
  measured, after this note originally claimed the opposite (FRICTION-044).
- `docdog skill install navigate-specs` is gone; the `specs` skill absorbed
  it. The two were split so that a convention change need only regenerate the
  generic half — a premise that stopped holding once `update` re-renders both
  in one run.
- Injectable skills no longer carry a generation timestamp. A fresh timestamp
  would make every re-render differ from the recorded bytes, so every `update`
  would rewrite every skill and show you a diff in which nothing changed.
- **`ingest.sanitization` is gone from the config docdog writes.** Every
  project docdog ever initialized carried
  `sanitization: {mode: redact, systemDefaults: true}`, and nothing in
  docdog has ever redacted anything — the engine behind it was imported by
  nothing but its own tests. A dead key is a nuisance; a dead key that
  reads as a safety property is a false claim, and this was the only line
  in the config that spoke to whether docdog is safe for a corpus holding
  credentials. **Docdog does not redact, and now does not say it does.**
  Existing configs keep the block harmlessly — it is tolerated on load like
  the other retired keys — and you can delete it. Reporting suspected
  credentials would be a legitimate feature; it is not this one, and it
  needs designing rather than reconnecting.
- Releases are published from CI through npm **trusted publishing**, so no
  long-lived npm token exists anywhere, and each release carries a provenance
  attestation tying the published tarball to the public commit it was built
  from.

## 0.3.0

**Never published to npm**, so the upgrade everyone actually makes is 0.2.1 →
0.4.0 and crosses this release too. What it added, in that jump:

- `docdog update` — the command 0.4.0's "action required" tells you to run. It
  adds what is absent, updates what is byte-identical to what docdog wrote,
  and reports what you edited. There is no `--force-all`.
- **Skills install as directories.** `docdog skill install specs` now writes
  `.claude/skills/docdog-specs/SKILL.md`; a flat `specs.md` is discovered by
  nothing, silently. `update` lists the old flat files as no longer shipped —
  delete them (FRICTION-040).
- `docdog list` — exhaustive unranked enumeration by predicate, for the
  completeness questions ranked search cannot answer.
- `docdog renumber` — rename an id and every inbound edge.
- The relationships union merge driver: two branches each appending an edge to
  the same record is a set union, and git called it a conflict.
- `docdog split --format plan` / `--apply-plan` — split a document into
  records on boundaries you choose.

## 0.2.1

The index summary reports skipped sections.

## 0.2.0

First public release: disk-canonical context management for AI agents.
