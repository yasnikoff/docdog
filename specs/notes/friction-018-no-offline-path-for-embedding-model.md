---
id: FRICTION-018
title: "No offline/mirror story for the embedding model — and the error message's advice is circular"
collection: notes
status: resolved
fixed_date: 2026-07-20
resolution_approach: patch
description: "First `docdog index` in a network-restricted sandbox fails to fetch nomic-embed-text-v1 and advises switching to the ollama provider, which also needs a network download — circular advice in exactly the environment that triggered it. `env.localModelPath` is hardcoded to `.docdog/models/` in engine/embedder.ts, is undocumented, and nothing ever populates it; real downloads land in transformers.js's package-internal cache, which any clean reinstall wipes. RESOLVED across three sessions: item 1 (circular advice + documented drop-in path) 2026-07-13; item 2 (durable ~/.docdog/models cache surviving npm ci) and item 3 (quantized dtype — measured in OBS-022, q8 shipped as opt-in, fp32 kept default) 2026-07-20."
severity: blocks-work
source: external-dogfood (host-project orchestrator, PLAN-DOCDOG-001)
harvested_from: specs/investigations/docdog-adoption/feedback-2026-07-12-embedding-model-offline.md
relationships:
  - references: OBS-022
    context: "item 3's measured answer — fp32 vs q8 on the frozen 40, hybrid Δ −0.017 (within noise) but vector-leg Δ −0.062 (real). The default stays fp32 and q8 becomes the config-selectable opt-in this friction's constrained filer needs (132 MB vs 522 MB through the allowlist)"
  - references: FRICTION-033
    context: "what item 3 was built on: dtype is a third input to the embedding function, so it joins the recipe key and fp32/q8 vectors coexist without collision — the measurement embedded the corpus at both dtypes into isolated stores cleanly, and the shipped opt-in relies on the same property"
  - references: DD-051
    context: "the embed cache survives cache rebuilds by design; the *model* has no equivalent durable home — the gap this friction names"
  - references: DD-070
    context: "v3 promises 'delete the cache, it's always safe' — true for index.db, but a wiped node_modules also takes the 547 MB model with it, which is neither safe nor cheap offline"
  - references: WF-002
    context: harvested from the external dogfood track — the first-index experience in a restricted environment
  - references: OBS-010
    context: the quantized-dtype default (fix 3) is a measurable question, and OBS-010's frozen own-corpus eval set is one of the two query sets it must be measured against rather than guessed at
  - references: DP-001
    context: "tiers the three fixes: documenting the offline model path and a durable model cache are Tier-1 mechanics, while changing the default dtype is a Tier-2 visible default that must be measured before it is changed"
  - references: OBS-013
    context: supplies the second frozen eval query set (the orchestrator corpus) that the quantized-dtype change would have to be measured against before the default moves
---

# FRICTION-018: No offline path for the embedding model

## What they were doing

The orchestrator adoption's first `docdog index`, inside a sandbox
whose egress allowlist excludes huggingface.co.

## What went wrong

```
error: Failed to load ONNX embedding model "nomic-ai/nomic-embed-text-v1".
Try setting embed.provider to "ollama" in .docdog/config.yaml.
```

The suggested fallback needs a network download too, so in an offline
environment the advice is circular — it points at the one other thing
that also cannot work.

Verified in source: `src/engine/embedder.ts:57` sets
`env.localModelPath = ".docdog/models/"`. That path is real and it
works — but it is undocumented, and **nothing ever populates it**.
Actual downloads go to transformers.js's package-internal cache
(`node_modules/@huggingface/transformers/.cache/`), which any clean
reinstall of a linked checkout deletes.

## Workaround

Hand-copied the 547 MB `nomic-embed-text-v1/onnx/model.onnx` (plus
config.json, tokenizer.json, tokenizer_config.json) from another
machine's transformers cache into the sandbox's `node_modules` cache.

## What should change

Three separable pieces, cheapest first:

1. **Document `.docdog/models/` as the offline drop-in path**, and
   name it in the failure message instead of (or alongside) the
   ollama suggestion. The mechanism already works — it is only
   invisible. This is a message + docs change.
2. **Cache the model somewhere that survives `node_modules`
   reinstalls** — e.g. `~/.docdog/models/`. Today an `npm ci` costs a
   547 MB re-download.
3. **Evaluate a quantized dtype as the default.** The fp32
   `model.onnx` is 547 MB; transformers.js supports quantized dtypes
   that are 4–8× smaller with minimal retrieval-quality loss. This is
   a measurable question, and docdog now has two frozen eval query
   sets (OBS-010's own-corpus set, and the orchestrator's) to measure
   the quality delta against rather than guess at it.

(1) and (2) are mechanical (DP-001 tier 1). (3) is a default with an
override, so DP-001 tier 2 — but it should be *measured* before it
is changed, not assumed.

## Partial fix (2026-07-13) — item 1 shipped, items 2 and 3 open

**The circular advice is gone.** The ONNX load failure now leads with
the offline answer and names the exact directory, before mentioning
ollama and saying what ollama actually requires:

> Failed to load ONNX embedding model "nomic-ai/nomic-embed-text-v1". If
> the machine is offline or cannot reach huggingface.co, drop the
> model's files (model.onnx, config.json, tokenizer.json,
> tokenizer_config.json) into `.docdog/models/nomic-ai/nomic-embed-text-v1/`
> and re-run — docdog loads from there first. Otherwise, set
> embed.provider to "ollama" in .docdog/config.yaml if a local ollama
> server is available.

The path is now a named constant (`LOCAL_MODEL_PATH` in
`src/engine/embedder.ts`) rather than a bare string, and README gained
an "Indexing offline" section with the directory layout and where to
copy the files from. The mechanism itself needed no change — it always
worked, it was just invisible.

**Item 2 (a model cache that survives `node_modules`) is still open.**
An `npm ci` still costs a 547 MB re-download.

**Item 3 (quantized dtype) is still open, and should stay measured
rather than assumed.** A data point from this session: a cold index of
this repo's 277-record corpus burned ~2,000 CPU-seconds (~8 minutes
wall) on the fp32 model. The cost is real, and docdog now has two frozen
eval query sets (OBS-010's and the orchestrator's, per OBS-013) to
measure the retrieval-quality delta against before changing the default.

## Resolution (2026-07-20) — items 2 and 3 close the friction

### Approach

Item 2 was pure mechanics (DP-001 tier 1): point the download cache at a
durable home instead of one `npm ci` erases. Item 3 was a tier-2 default that
the friction rightly insisted be *measured* — so it was, and the measurement
(OBS-022) chose the conservative half: ship the small model as an opt-in, keep
the safe one as the default.

### What shipped

**Item 2 — durable model cache.** `env.cacheDir` now resolves to
`~/.docdog/models/` (honoring an existing `HF_HOME` / `TRANSFORMERS_CACHE`
override), a new `MODEL_CACHE_DIR` constant in `src/engine/embedder.ts`. The
model is byte-identical across every project and clone on a machine, so the
durable home is the user's home dir, not any one repo — downloaded once per
machine, reused everywhere. This is the same reasoning that put the embed
*store* in the git common dir (PROPOSAL-029), one scope wider. An `npm ci` no
longer costs a re-download. `localModelPath` (the manual offline drop-in from
item 1) is untouched and independent: it is where a human *drops* files;
`cacheDir` is where docdog *caches* downloads.

**Item 3 — quantized dtype, measured (OBS-022).** `config.embed.dtype` is
plumbed through the embedder (`pipeline(..., { dtype })`, pipeline cache now
keyed by `model::dtype`) and into the embed-store recipe key (`embedRecipe`,
FRICTION-033) so fp32 and q8 vectors coexist without collision and an *unset*
dtype re-embeds nothing. Measured fp32 vs q8 on the frozen 40 over this
315-record corpus: hybrid MRR 0.849 → 0.831 (Δ −0.017, within the ~0.03 noise
floor), vector-leg MRR 0.673 → 0.610 (Δ −0.062, real), model 522 → 132 MB (4×),
index ~2× faster. **fp32 stays the default; q8 ships as a documented opt-in**
(`embed.dtype: q8`) for the download/disk-constrained environment that filed
this — 132 MB clears an allowlist 522 MB does not. Tests: recipe-with-dtype
coverage in `storage-embed-store.test.ts`; the measurement ran in an isolated
temp cache/store (no pollution) and is not part of `npm test`.

### Rejected alternatives

- **Move the default to q8** (the tempting read of "4× smaller, hybrid within
  noise"). Rejected: the vector leg is measurably worse, hybrid only hides it
  via the dtype-independent FTS leg, and OBS-013's weak-hybrid adopted corpus
  is exactly where that hidden cost could surface. See OBS-022.
- **Auto-select dtype when the environment looks constrained.** DP-001 tier 3
  — docdog exposes the knob, it does not infer the machine's situation.
- **A project-local model cache** (`.docdog/cache/models/`) for item 2.
  Rejected: per-project re-downloads and a cache-clear wipes it, defeating
  durability; home is both durable and cross-project.

### Knock-on effects

- OBS-022 created (the measurement + decision) and is the standing answer to
  "should docdog quantize by default?" — do not reopen without a new corpus.
- `config.embed.dtype` is a new public config key; documented in the README
  offline section as the constrained-environment lever.
- The pipeline cache is now keyed by `model::dtype`, correcting a latent
  "one model per process" assumption that a multi-dtype run would have broken.
