# docdog

Context management for AI agents. Your project's decisions, specs, and
notes live as markdown files with YAML frontmatter — docdog gives agents
a fast retrieval surface over them: hybrid search, a relationship graph,
and eight MCP tools. No services, no migrations, no lock-in.

**Files are the source of truth.** The index is a disposable local
SQLite cache (`.docdog/cache/`, gitignored), rebuilt from disk by
`docdog index`. Deleting the cache is always safe. Deleting docdog
leaves you with a folder of readable markdown.

> ### This is an experiment, not a product
>
> I am building docdog to find out whether managing an agent's context as
> a queryable corpus actually works, and the way I am finding out is by
> using it on itself every day. That is also the whole of its track
> record: one author, the project it was designed around, and one project
> that adopted it. Nothing here has been hardened by strangers yet.
>
> Practically, that means: it is 0.x, so the CLI surface, the config
> schema and the frontmatter conventions can change without a deprecation
> cycle; there are open rough edges, and they are
> [filed in this repo](specs/notes/) rather than tidied out of sight; and
> there is no support commitment.
>
> The reason to try it anyway is that the exit cost is close to zero. Your
> content is markdown files you already own, the index is disposable by
> construction, and if you stop — or if the experiment fails — you keep a
> folder of readable markdown and its git history. Nothing has to be
> exported back out.
>
> If you do try it, the [friction reports](#found-a-bug) are the point.

## Why

Agents re-derive project context every session — grepping for decisions
that are recorded somewhere, re-asking questions the repo already
answers, missing the constraint that made yesterday's design choice.
Docdog turns the corpus of decisions/specs/notes into something an
agent can actually query.

Measured on two corpora the same day with the same code — docdog's
own, and a 1,134-record corpus in a project that adopted it and froze
its questions *before* installing anything. Frozen query sets with gold
answers, single-shot, no reformulation on either side:

| corpus | system | Hit@1 | Hit@5 | MRR@10 | median tokens to locate |
|---|---|---|---|---|---|
| **adopted**, 1,134 records / 7.6 MB (22 queries) | docdog hybrid | **45%** | 86% | **0.623** | **224** |
| | grep, generously ranked | 9% | 45% | 0.238 | — |
| | grep, raw transcript | 0% | 0% | 0.000 | 35,740 |
| **docdog's own**, 344 records (40 queries) | docdog hybrid | **75%** | 93% | **0.833** | **144** |
| | grep, generously ranked | 18% | 63% | 0.347 | — |
| | grep, raw transcript | 3% | 5% | 0.046 | 7,541 |

Read the asymmetry, because it is the actual claim. Ranking quality
falls on a bigger corpus nobody wrote for docdog — and the token cost
of the alternative falls apart faster. Per query, paired, docdog costs
**43× less** to read than the honest grep transcript on its own corpus
and **326× less** on the adopted one. A ranked top-10 is flat in corpus
size; a grep transcript is linear. On that corpus grep reaches a right
answer inside its first ten files for **zero of 22 questions**.

Honest caveats. Docdog's own corpus is small and self-describing
(agent-authored titles and descriptions do real lifting) and its gold
judgments were made by the system's builder; the adopted corpus is
neither, and its golds were judged by that project. Both sets ask
record-finding questions — *which record covers X*. For a fact sitting
past the 8,000-char embedding cap, hybrid search does measurably worse
than its own keyword leg
([OBS-024](specs/observations/obs-024-fusion-loses-to-its-own-keyword-leg-past-the-embed-cap.md)).

Method, harness, and the frozen query set live in
[`tests/eval/`](tests/eval/README.md), and the same harness runs
against your corpus in one command — don't take the numbers on faith,
take them on your own repo. Full analyses:
[OBS-010](specs/observations/obs-010-retrieval-eval-first-measurement.md)
(first measurement),
[OBS-023](specs/observations/obs-023-the-token-win-re-measured-on-an-adopted-corpus.md)
(both corpora, one instrument).

## How it works

- **A record** is a markdown section with frontmatter: `id`, `title`,
  `collection`, `status`, `description`, and a `relationships:` block.
- **The graph is frontmatter.** Every relationship edge is born in the
  source record's `relationships:` block — the cache's edge table is
  purely derived. `git diff` shows you graph changes.
- **The cache** is one embedded SQLite file: FTS5 for BM25 keyword
  search, in-process embeddings (ONNX, no API calls) for the vector
  leg, reciprocal-rank fusion to merge them.
- **No migrations, ever.** Schema change? The cache drops and rebuilds
  from disk.
- **Zero service dependencies.** Node 20+ is the whole install story.
  First `docdog index` downloads the embedding model once.

A record looks like this (`collection:` must be one your project
registers — see `vertex_collections` in `.docdog/config.yaml`):

```markdown
---
id: DD-014
title: "Auth tokens move to httpOnly cookies"
collection: decisions
status: current
description: "JWTs leave localStorage; the API gains /refresh. XSS was the driver."
relationships:
  - supersedes: DD-009
    context: "localStorage tokens were XSS-exposed"
---

# DD-014: Auth tokens move to httpOnly cookies

Ordinary markdown body...
```

**One file can hold many records, and stay as written.** By default a file
is one record. A file whose units are smaller — a decisions log, a glossary,
a reference amended row by row — gets a parser on its own `scan_paths`
entry instead of being split up: `split` when each unit begins at a
heading (`split_on: "## DD-"`), `script` when the units are list items,
table rows or anything else (a function of yours, run at index time). Each
unit is then a record with its own id — searchable, and a valid edge
target — and the file on disk is never rewritten. A file entry overrides
the directory entry around it. The `ingest` skill (`.docdog/skills/ingest.md`)
has a worked script.

## Quickstart

```bash
npm install -g @yasnikoff/docdog

# --template structured registers decisions/requirements/principles/…;
# the default `minimal` registers only notes + concepts, and a record
# whose collection is not registered is skipped at index time.
docdog init --name my-project --template structured
docdog index                    # build the cache from your scan paths
docdog search "why did we drop the legacy auth flow"
docdog serve                    # MCP server (init wires .mcp.json for you)
```

Point your agent at the MCP server and it gets the full tool surface.
Records are created by the agent (via MCP) or by hand — write markdown,
run `docdog index`, done. Deletion is `rm` + `docdog index`; files and
git are the archive.

### Using docdog from Claude Cowork (desktop app)

`docdog init` wires `.mcp.json` for **Claude Code**. The **Cowork** desktop
app doesn't read a project's `.mcp.json` — register `docdog serve` in the
app's own config instead, and it proxies the tools into your session. See
[`docs/cowork-mcp-setup.md`](docs/cowork-mcp-setup.md).

### Indexing offline

The first `docdog index` downloads the embedding model
(`nomic-ai/nomic-embed-text-v1`, ~550 MB) from huggingface.co. On a machine
that can't reach it, drop the model files in yourself — docdog looks there
before the network:

```
.docdog/models/nomic-ai/nomic-embed-text-v1/
  onnx/model.onnx
  config.json
  tokenizer.json
  tokenizer_config.json
```

Copy them from any machine that has already indexed. Downloaded models are
cached under `~/.docdog/models/` (shared across every project on the machine
and surviving `npm ci`; set `HF_HOME` or `TRANSFORMERS_CACHE` to override the
location) — so once one project has indexed, others reuse the model for free.
Or take the files from the model's Hugging Face page. The
`embed.provider: ollama` alternative in `.docdog/config.yaml` needs a
reachable ollama server, so it is not an offline answer by itself.

**Smaller model on a constrained connection.** The default fp32 model is
~522 MB. A quantized variant is ~132 MB (4× smaller) — set it in
`.docdog/config.yaml`:

```yaml
embed:
  dtype: q8
```

It measures ~2× faster to index. What it costs in quality depends on what you
ask. Measured on two corpora, **finding the record that covers a topic is
unaffected** — Δ hybrid MRR −0.017 here and −0.023 on an adopted
1,134-record corpus, both inside the noise floor — even though the vector leg
alone is ~9–18% weaker, because keyword search is dtype-independent and rank
fusion absorbs the damage. **Finding a specific fact inside a document is where
quantization is felt**: on that axis hybrid fell −0.107 where the fact was
inside the embedding (`OBS-025`, and read its confidence section — seven
queries). So q8 is an opt-in rather than the default (`OBS-022`, `OBS-025`).
Reach for it when download size or disk footprint is the constraint, and less
readily if you mostly ask the corpus for facts rather than for documents.

fp32 and q8 vectors are cached separately, so switching back and forth never
re-embeds content already seen at either. Changing `dtype` reindexes the corpus
on the next `docdog index`, which says so on one line — reindexing is not
re-embedding, and the second switch reuses every vector the first one made.

## MCP tools

| Tool | What it does |
|---|---|
| `docdog_search` | hybrid retrieval (BM25 + vector, rank fusion) |
| `docdog_get` | fetch a record by id |
| `docdog_traverse` | walk the relationship graph from a record |
| `docdog_relate` | add an edge — patches the source file's frontmatter |
| `docdog_create` | create a record file at a caller-supplied path |
| `docdog_update` | patch a record's frontmatter/body |
| `docdog_index` | rebuild/refresh the cache |
| `docdog_status` | corpus and cache stats |

## CLI

Every MCP tool above has a CLI counterpart wherever the shell can express
its inputs, so an agent without MCP is not a second-class caller. The two
exceptions are `docdog_create` and `docdog_update`: they take a markdown
body, which is the one input shell quoting mangles. From a shell you write
the file and run `docdog index` — the files are the source of truth, so
that is the same operation, not a workaround.

```
docdog init            # create .docdog/, config, MCP wiring
docdog update          # bring seeded skills/vocabulary/wiring up to this docdog
                       #   --dry-run, --force <path>, --json
docdog index           # (re)index scan_paths into the embedded cache
docdog search <query>  # hybrid search from the terminal
docdog get <id>        # print a record
docdog traverse <id>   # walk the relationship graph  --depth, --direction
docdog relate <a> <b>  # record an edge — patches a's frontmatter  --type, --context
docdog status          # corpus and cache stats — and any id two files claim
docdog suggest-edges   # report undeclared id mentions as edge candidates, for review
docdog renumber <old> <new>  # rename an id and rewrite every inbound edge  --prose, --rename-file
docdog serve           # start the MCP server
docdog add <file>      # stamp frontmatter onto raw markdown
docdog split <file>    # split a multi-section file into one-file-per-section
docdog gc              # evict stale embedding-cache rows
docdog run <name>      # run a project script from .docdog/scripts/
docdog skill install   # emit agent-facing navigation skills (as docdog-<name>/SKILL.md)
```

Every read command takes `--json`.

`docdog init` also installs a git merge driver for the `relationships:`
block. Two branches each adding an edge to the same record is a set union,
but git diffs lines and calls it a conflict — the driver unions them, and
still conflicts loudly on anything that needs a judgment call.

## Upgrading

```bash
docdog update --check                 # is there a newer version?
npm i -g @yasnikoff/docdog@latest     # or npm i -D …, however you installed it
docdog update                         # bring this repo's seeded files up to it
```

`docdog update` adds what is absent, updates what is byte-identical to what
docdog wrote, and **reports what you edited** rather than overwriting it —
there is no `--force-all`. That includes the docdog version pinned in
`.mcp.json`, which is pinned on purpose: npx caches per package spec and can
otherwise serve one version indefinitely.

`--check` makes one unauthenticated `GET` for a public package's `latest` tag,
carrying no version, no identifier and nothing about your project. `docdog
status` then reports the cached answer and its age without fetching anything;
`--offline` answers from that cache and opens nothing. It is the only socket
docdog opens on its own behalf — the other two are the one-time embedding-model
download on first index, and, if you set `embed.provider: ollama`, the local
embedding server you pointed it at. See
[CONTRIBUTING.md](CONTRIBUTING.md#reporting-a-problem-with-docdog) for the
full statement.

A running `docdog serve` keeps the code it booted with — `docdog_status` says
so when it is behind. Release notes: [CHANGELOG.md](CHANGELOG.md).

## Found a bug?

[Open an issue](https://github.com/yasnikoff/docdog/issues) — the **Friction
report** template mirrors a docdog friction record, so a note you already
wrote pastes straight in. Search closed issues first; a closed one usually
means the fix shipped and `docdog update --check` is the faster answer.

Working with an agent? `docdog skill install feedback` installs the procedure
— formulate, redact, search, decide, ask, send, link back. It sends nothing on
its own: reports go through your own `gh` or a link you click, so docdog never
holds a token and never sees your corpus. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full statement of what docdog
transmits.

## Design stance

Docdog's code is strictly mechanical — ranking, indexing, file surgery.
Semantic judgment (what a record means, where it belongs, what relates
to what) stays with the agent and the user. That principle and the
others are recorded in [`specs/principles/`](specs/principles/), and
the whole design history is in [`specs/decisions/`](specs/decisions/)
— docdog manages its own specs, so this repo doubles as the living
demo. Point `docdog search` at it and ask it why it exists.

One exception, so you are not surprised by it:
[`specs/discussions/`](specs/discussions/) ships as **stubs** — each
record's id, status and full relationship graph, with the reasoning
retained privately. They are conversations rather than documents
written for a reader, and the decisions they produced ship whole. The
reasoning is [DD-073](specs/decisions/dd-073-discussions-ship-as-stubs.md);
`docdog traverse DISC-015` shows what a stub still answers.

## Status

**Experimental, and used daily.** Docdog manages its own specs — every
decision, friction report and measurement behind it is a record in
`specs/`, retrieved through the tool this README describes. That is the
strongest evidence it works and the narrowest possible test of it at the
same time: it has been shaped by one corpus written by its author, plus
one corpus it did not get to influence.

While it is 0.x, expect the CLI surface, the config schema and the
frontmatter conventions to move without a deprecation cycle. `docdog
update` is built for that — it adds what is missing, updates only what is
still byte-identical to what docdog wrote, and *reports* anything you
edited rather than overwriting it.

What does not depend on any of that: your records are markdown files with
YAML frontmatter, and docdog does not own them. The cache is disposable
and rebuilt from disk. Walking away costs you nothing but the tool.

Node ≥ 20; Windows, macOS, Linux. MIT.
