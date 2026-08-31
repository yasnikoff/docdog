export interface GitConfig {
  enabled: boolean;
  /** Branch considered authoritative for docs. */
  canonical_branch: string;
}

export interface EmbedConfig {
  /** "onnx" (in-process) or "ollama" (HTTP fallback) */
  provider: "onnx" | "ollama";
  model: string;
  /** Ollama base URL — used only when provider = "ollama" */
  ollama_url: string;
  /**
   * ONNX quantization to load, passed straight to transformers.js's
   * `pipeline(..., { dtype })` (FRICTION-018 item 3). Unset = the library
   * default (fp32, the 547 MB `model.onnx`). `"q8"`/`"q4"` load a 4–8× smaller
   * file. It is an input to the embedding function exactly as the model is,
   * so it joins the embed-store recipe key (`embedRecipe`, FRICTION-033):
   * fp32 and q8 vectors never collide, and a live-but-superseded dtype's rows
   * simply miss. A visible default (DP-001 tier 2) — but changing docdog's
   * default away from fp32 must be measured, not assumed (OBS-022).
   * ONNX-only; ignored under the ollama provider.
   */
  dtype?: string | null;
  /**
   * Where the embed store lives (PROPOSAL-029) — absolute, or relative
   * to the project root. Unset (the normal case) resolves to
   * `<git-common-dir>/docdog/embeddings.db` when git answers, so every
   * worktree of the clone shares one store, and to
   * `.docdog/cache/embeddings.db` otherwise. Set it to point several
   * clones at one store (e.g. `~/.cache/docdog/embeddings.db`); the
   * resolved path is printed by `docdog index` either way.
   */
  cache_path?: string | null;
  /**
   * Sweep the embed store at the end of a full-scope `docdog index`
   * (OBS-026). Default **true**, and that default is the feature: the
   * store is grow-only by construction (PROPOSAL-029), `gc` has been
   * reachable since DISC-032, and the only thing still missing was
   * anyone running it. An opt-in knob reproduces that exactly — nobody
   * turns on a setting they have not gone looking for — so the sweep
   * rides the command people already run.
   *
   * Three gates, all mechanical (DP-001 tier 2 — a visible default with
   * an override, printed on every run that acts):
   *
   *   - **full-scope runs only.** `index --path X` sweeps nothing, for
   *     the same reason `sweepGhostFiles` is scope-limited: a run that
   *     looked at part of the corpus knows nothing about the rest.
   *   - **no blind worktrees.** A sibling tree with no readable cache
   *     contributes nothing to the liveness union, so its rows look
   *     dead. `gc` reports that and lets a human decide; a sweep nobody
   *     asked for has no human to ask, so it declines instead.
   *   - **never prunes recipes.** That is `gc --prune-recipes`, and it
   *     spends the free-revert property FRICTION-033 bought. Spending it
   *     requires someone to have said so.
   *
   * Set false to keep `docdog index` free of side effects; `docdog gc`
   * still works by hand.
   */
  auto_gc?: boolean;
  /**
   * Never evict store rows younger than this many days (DISC-032 item 3).
   * Default **7**. `0` disables the floor.
   *
   * The floor is what makes `auto_gc` comfortable: liveness is answered
   * by the worktrees git can see, and a branch checked out *nowhere* is
   * invisible to all of them (DISC-032's accepted residual gap). Age
   * cannot tell you that row is live, but it can tell you the work that
   * made it is recent, which is the correlate that matters — a floor
   * protects in-flight work on any branch without knowing anything about
   * worktrees at all.
   *
   * **This is not LRU and must never become it.** `embed_cache` stores
   * `created_at` and the handle's `get()` records no access, so age here
   * means age-since-first-embed. As a *ceiling* ("evict things older
   * than N") that is precisely backwards — it would evict the rows whose
   * re-embed is least justified, which is OBS-021's trap. As a *floor*
   * ("keep things newer than N") the same column is exactly right, and
   * needs no schema change: a young row is one somebody's recent index
   * run paid for, whatever its liveness. Real LRU needs a `last_used_at`
   * column, which bumps EMBED_SCHEMA_VERSION, which drops the store — a
   * full re-embed to install the feature that saves storage.
   *
   * Applies to the liveness sweep only. `gc --prune-recipes` ignores it:
   * the flag *is* the consent, and a row under a superseded recipe is
   * unreachable at any age.
   */
  retain_days?: number;
}

export interface SearchConfig {
  /**
   * Character limit for section previews returned by docdog_search.
   * If the body is shorter than this limit, the full body is returned.
   * Default: 600. Future: replace with agentic summary generation.
   */
  preview_length: number;
}

/**
 * Parser configuration for a scan path.
 *
 * - `default` — one file = one vertex (DD-053, simplest case)
 * - `split` — multi-section file split on heading pattern (reuses ingest split logic)
 * - `table` — markdown table rows become vertices (glossaries, term lists)
 * - `script` — user-provided parser in .docdog/scripts/ (escape hatch)
 */
export type ParserType = "default" | "split" | "table" | "script";

export interface ScanPathConfig {
  /** Repo-relative path (file or directory), forward-slash. */
  path: string;
  /** Which parser to apply. Defaults to "default" if omitted. */
  parser?: ParserType;
  /** Target collection for all vertices produced from this path. */
  collection?: string;
  /**
   * For `split` parser: heading pattern(s) to split on, e.g. "## DD-" or
   * ["### FR-", "### NFR-"]. A single string splits one cohort; a list splits
   * a file that carries several id cohorts — a heading matches if it matches
   * any pattern (PROPOSAL-034, FRICTION-023 gap 1).
   */
  split_on?: string | string[];
  /**
   * For `split` parser: what to do with a file whose headings match no
   * `split_on` pattern. Omitted (default) — the file is dropped with a
   * warning (FRICTION-023). `"whole-file"` — index it as one vertex via the
   * default parser instead, so a split entry can keep its non-matching files
   * (PROPOSAL-034, FRICTION-023 gap 2's deferred half).
   */
  fallback?: "whole-file";
  /** For `table` parser: group vertices by preceding `## heading` (adds category field). */
  group_by_heading?: boolean;
  /** For `script` parser: script name (without .ts/.js) in .docdog/scripts/. */
  script?: string;
}

/**
 * scan_paths entries can be:
 * - A string (repo-relative path, default parser)
 * - A ScanPathConfig object (explicit parser + options)
 */
export type ScanPathEntry = string | ScanPathConfig;

export interface DocdogConfig {
  project: {
    name: string;
  };

  /**
   * Shipped template this project was initialized with (PROPOSAL-015).
   * Determines the built-in vertex collection set unioned at runtime by
   * `getVertexCollections`. Missing → falls back to `minimal` with a
   * consistency warning. Legacy projects (pre-v2 schema) leave this
   * undefined; their full collection list lives in `vertex_collections`
   * and the union is still a superset.
   */
  template?: string;

  /** Paths to scan for section files (strings use default parser, objects specify a parser). */
  scan_paths: ScanPathEntry[];

  /**
   * User vertex collections. All content goes into these.
   * e.g. ["decisions", "requirements", "principles", "terms", "notes"]
   */
  vertex_collections: string[];

  /**
   * Default collection for files that can't be routed via frontmatter or directory name.
   * Must be listed in vertex_collections. If null/empty, unroutable files are skipped.
   */
  default_collection: string | null;

  git: GitConfig;
  embed: EmbedConfig;
  search: SearchConfig;

}

// V2-era config keys (`arango:`, `gc:`, `edge_collections:`,
// `code_refs:`, `version:`, `git.patches:`, `ingest:`) are tolerated on
// load — the loader's deep merge simply carries unknown keys past this
// type — but nothing reads them and `docdog init` no longer writes them.
// `git.patches` was DD-050 tier-3 pre-wiring, removed as dormant
// (RECON-001); reviving the patches convention is a new proposal.
//
// `ingest.sanitization` is the newest entry and the only one docdog was
// still AUTHORING (FRICTION-052). It declared `mode: redact,
// systemDefaults: true` in every project docdog ever initialized, and
// the 104-line engine behind it was imported by nothing but its own
// tests. A dead key is a nuisance; a dead key that reads as a safety
// property is a false claim, and it was the only line in the config
// that spoke to whether docdog is safe for a corpus holding
// credentials. Redaction is not a feature docdog has. Reporting
// suspected credentials would be tier 1 and is a different feature
// than the one that key described — it needs a proposal, not a
// reconnection.
