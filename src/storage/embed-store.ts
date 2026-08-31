/**
 * The embed store — PROPOSAL-029.
 *
 * `embed_cache` is keyed by *content* hash, but until now it lived
 * inside `index.db`, a file scoped to one working tree and dropped
 * whole on any SCHEMA_VERSION bump. Two consequences, both measured:
 * a fresh worktree of the same HEAD re-embedded byte-identical content
 * (604s vs 3s on this corpus), and any future schema change billed
 * every user the same ten CPU-minutes for a table the change had
 * nothing to do with.
 *
 * So the table moves into its own file with its own version, whose
 * location resolves — first match wins:
 *
 *   1. `embed.cache_path` in config.yaml (absolute, or relative to the
 *      project root) — the explicit override;
 *   2. `<git-common-dir>/docdog/embeddings.db` when git answers — one
 *      store shared by every worktree of the clone, living outside every
 *      working tree, so it can never be tracked;
 *   3. `<projectRoot>/.docdog/cache/embeddings.db` — the no-git fallback,
 *      and today's home.
 *
 * The file name in cases 2 and 3 carries the schema version from v2
 * onward (`embedStoreFileName`). That is FRICTION-034: the clone-wide
 * reach which makes case 2 worth having is also what made an in-place
 * version drop expensive, since it deletes every worktree's vectors at
 * once and two docdog versions against one clone can do it repeatedly.
 * Vintages coexist instead, and `gc` names the ones lying around.
 *
 * Writes are `INSERT OR IGNORE`. For a given (content_hash, recipe),
 * every writer computes the same vector — and where hardware perturbs
 * the low float bits, any of them is equally correct, because the value
 * is a similarity vector, not an identity. First-writer-wins therefore
 * makes the store a grow-only set: conflict-free, mergeable by union,
 * safe for two worktrees to write at once.
 *
 * That argument is load-bearing and it is why the second key column is a
 * *recipe* id rather than a model name (FRICTION-033): "every writer
 * computes the same vector" is only true if every writer ran the same
 * function, and the model was never the whole function.
 *
 * The store is still derived, still disposable, still untracked
 * (DD-070 §2) — deleting it is safe, it just costs a re-embed.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import type { DocdogConfig } from "../types/config.js";
import { CACHE_DIR } from "./cache.js";
import { gitCommonDir } from "./git.js";

/** File name of the store, under whichever directory resolution picks. */
export const EMBED_STORE_FILE = "embeddings.db";

/** Subdirectory created inside the git common dir (case 2). */
export const EMBED_STORE_GIT_SUBDIR = "docdog";

/**
 * Versioned independently of the cache's SCHEMA_VERSION — that
 * independence is the point (a cache schema change must not cost a
 * re-embed). The rows are recomputable, so there are still no migrations
 * (DD-070 §2).
 *
 * This used to say the mismatch path was "same as the cache", and that
 * sentence is what let FRICTION-034 stay invisible for a year: it is the
 * one thing it is not. `index.db` lives inside one working tree, so a
 * version disagreement costs that tree a reindex. This file resolves to
 * the git common dir and is read by every worktree of the clone — the
 * whole of PROPOSAL-029 — so dropping its tables in place would delete
 * every tree's vectors, and the documented dev loop (npm-linked docdog
 * beside `npx tsx src/cli/index.ts`) can hold two docdog versions against
 * one clone and ping-pong the drop indefinitely, each run finding the
 * other's version and re-embedding the corpus with no explanation.
 *
 * So the version lives in the FILE NAME rather than only in the file
 * (`embedStoreFileName`), and vintages coexist instead of clobbering each
 * other. In-place rebuild survives for the paths where docdog does not
 * own the name — see `openEmbedStore` — and reports what it dropped.
 */
export const EMBED_SCHEMA_VERSION = 1;

/**
 * The store's file name for a given schema version.
 *
 * **Version 1 keeps the bare name, permanently.** Renaming it to
 * `embeddings-v1.db` would orphan every store in existence and bill its
 * owner the full re-embed this whole scheme exists to avoid — paying the
 * cost once, to install the mechanism that avoids paying it. The bare
 * name simply *is* v1's name; the suffix starts where the harm does.
 *
 * Applied to the two paths docdog names itself (git common dir, project
 * cache dir). An explicit `embed.cache_path` is left exactly as the user
 * wrote it: writing to a file they did not name is a worse surprise than
 * the disclosure `openEmbedStore` gives them instead.
 */
export function embedStoreFileName(version: number = EMBED_SCHEMA_VERSION): string {
  return version <= 1 ? EMBED_STORE_FILE : `embeddings-v${version}.db`;
}

const VERSION_KEY = "schema_version";

const EMBED_DDL: readonly string[] = [
  `CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID`,

  // `model` holds an embed *recipe* id, not a bare model name — the model
  // plus every other input to the embedding function, `embedRecipe` in
  // storage/embed-health.ts being the one place that composes it (FRICTION-033).
  // The column keeps its original name on purpose: renaming it is a schema
  // change, a schema change bumps EMBED_SCHEMA_VERSION, and that drops the
  // store — billing every user a full re-embed to improve a comment. The
  // store treats the value as opaque either way.
  `CREATE TABLE embed_cache (
    content_hash TEXT NOT NULL,
    model        TEXT NOT NULL,
    embedding    BLOB NOT NULL,
    created_at   TEXT NOT NULL,
    PRIMARY KEY (content_hash, model)
  ) WITHOUT ROWID`,
];

/** Which resolution rule produced the store path. */
export type EmbedStoreSource = "config" | "git" | "project";

export interface EmbedStoreLocation {
  /** Absolute path of the store file. */
  path: string;
  source: EmbedStoreSource;
  /**
   * True when the store is reachable by more than this working tree —
   * the git-common-dir case, or an explicit path outside the project
   * root. Liveness is per-tree but the store is not; PROPOSAL-029 §5 made
   * that a refusal, and DISC-032 replaced the refusal with a union across
   * every working tree. So this flag now shapes how gc computes liveness
   * rather than whether it runs at all.
   */
  shared: boolean;
}

export interface EmbedStoreHandle extends EmbedStoreLocation {
  db: Database.Database;
  /** True when this open created or rebuilt the schema. */
  rebuilt: boolean;
  /**
   * The schema version found in the file before this open rebuilt it, or
   * null when there was nothing there to disagree with (a fresh file, or
   * one too damaged to read a version out of).
   *
   * Non-null means a store belonging to a *different docdog* was dropped,
   * which is the whole of FRICTION-034 and the one thing the old code
   * could not say. Versioned file names make it rare rather than
   * impossible — an explicit `embed.cache_path` keeps the user's name, so
   * two docdog versions pointed at one such file still collide there.
   */
  priorVersion: number | null;
  /**
   * Rows the rebuild deleted. Zero unless `priorVersion` is non-null.
   *
   * Reported rather than guarded against — DD-070 §2 makes this time and
   * never data, and `gc.ts` sets the precedent for stating a cost instead
   * of gating on it. What makes it worth a line is the reach: the file is
   * shared by every worktree of the clone, so the CPU is charged once per
   * tree and only the tree that triggered it knows why.
   */
  dropped: number;
  /** Rows copied from a legacy in-`index.db` embed_cache on this open. */
  adopted: number;
  /**
   * `recipe` identifies the function that produced the vector, not just the
   * model — see `embedRecipe` in storage/embed-health.ts. Opaque here.
   */
  get(contentHash: string, recipe: string): Buffer | null;
  put(contentHash: string, recipe: string, embedding: Buffer, createdAt: string): void;
  close(): void;
}

export interface OpenEmbedStoreOptions {
  /** Override the resolved path (tests, or an explicit caller). */
  filePath?: string;
  /**
   * Path of the project's `index.db`. When the store is created fresh
   * and that file still carries a pre-PROPOSAL-029 `embed_cache` table,
   * its rows are copied across once (§4) — purely so that shipping this
   * does not gratuitously bill existing users a full re-embed.
   */
  adoptFrom?: string;
}

/**
 * Where this project's embed store lives. Pure path arithmetic plus one
 * optional git probe — no state is touched (DP-001 tier 2: a visible
 * default, and callers print it).
 */
export function resolveEmbedStorePath(
  projectRoot: string,
  config: DocdogConfig,
): EmbedStoreLocation {
  const configured = config.embed?.cache_path;
  if (configured) {
    const path = isAbsolute(configured) ? configured : resolve(projectRoot, configured);
    return { path, source: "config", shared: !isInside(projectRoot, path) };
  }

  const commonDir = gitCommonDir(projectRoot);
  if (commonDir) {
    return {
      path: join(commonDir, EMBED_STORE_GIT_SUBDIR, embedStoreFileName()),
      source: "git",
      shared: true,
    };
  }

  return {
    path: join(projectRoot, CACHE_DIR, embedStoreFileName()),
    source: "project",
    shared: false,
  };
}

/** A store file beside the current one, written by another docdog. */
export interface EmbedStoreVintage {
  path: string;
  /** Parsed out of the file name; 1 for the bare `embeddings.db`. */
  version: number;
  bytes: number;
}

/**
 * Store files sitting beside the current one under an older (or newer)
 * schema version — the disk cost that versioning the file name trades the
 * repeated CPU cost for (FRICTION-034).
 *
 * Pure name arithmetic plus a `stat`; nothing is opened, because a file
 * written by a docdog this one has never met may hold a schema it cannot
 * read. The version comes from the name for exactly that reason.
 *
 * **There is no flag to delete these and there does not need to be.** A
 * vintage is one whole file whose path is printed here, so removing it is
 * `rm` — the contrast with `gc --prune-recipes`, which had to be built
 * because its stratum lives *inside* a file and no shell command can
 * reach it. Keeping the old vintage is what makes rolling docdog back
 * free, which is the property the whole scheme buys; spending it should
 * cost a deliberate `rm` and not a flag that reads as hygiene.
 */
export function findOtherVintages(currentPath: string): EmbedStoreVintage[] {
  const dir = dirname(currentPath);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  const found: EmbedStoreVintage[] = [];
  for (const name of names) {
    const version = parseStoreFileName(name);
    if (version === null) continue;
    const path = join(dir, name);
    if (resolve(path) === resolve(currentPath)) continue;
    let bytes = 0;
    try {
      bytes = statSync(path).size;
    } catch {
      continue;
    }
    found.push({ path, version, bytes });
  }
  return found.sort((a, b) => a.version - b.version);
}

/**
 * The schema version a store file name encodes, or null when the name is
 * not one docdog writes. Deliberately strict: a user's own
 * `embed.cache_path` file is not a vintage of anything, and guessing that
 * it is would report someone else's database as reclaimable.
 */
export function parseStoreFileName(name: string): number | null {
  if (name === EMBED_STORE_FILE) return 1;
  const m = /^embeddings-v(\d+)\.db$/.exec(name);
  return m ? Number.parseInt(m[1], 10) : null;
}

/**
 * Open (creating or rebuilding as needed) the project's embed store.
 * Like the cache, every failure mode resolves by rebuilding — the file
 * holds derived state only.
 */
export function openEmbedStore(
  projectRoot: string,
  config: DocdogConfig,
  opts: OpenEmbedStoreOptions = {},
): EmbedStoreHandle {
  const location: EmbedStoreLocation = opts.filePath
    ? {
        path: opts.filePath,
        source: "config",
        shared: !isInside(projectRoot, opts.filePath),
      }
    : resolveEmbedStorePath(projectRoot, config);

  mkdirSync(dirname(location.path), { recursive: true });

  let db: Database.Database;
  try {
    db = connect(location.path);
  } catch {
    // Not a SQLite file at all. Same contract as the cache: disposable,
    // so remove and start over.
    rmSync(location.path, { force: true });
    rmSync(`${location.path}-wal`, { force: true });
    rmSync(`${location.path}-shm`, { force: true });
    db = connect(location.path);
  }

  let rebuilt = false;
  let priorVersion: number | null = null;
  let dropped = 0;
  const found = readVersion(db);
  if (found !== EMBED_SCHEMA_VERSION) {
    // A file at the versioned name carrying a different version is not
    // supposed to happen — that is what versioning the name buys. It
    // still can: an explicit `embed.cache_path` keeps the user's name
    // across every version, and a file can be copied by hand. So the
    // in-place drop survives for those paths, and says what it cost.
    if (found !== null) {
      priorVersion = found;
      dropped = countRows(db);
    }
    rebuild(db);
    rebuilt = true;
  }

  const adopted = rebuilt && opts.adoptFrom ? adoptLegacyRows(db, opts.adoptFrom) : 0;

  const getStmt = db.prepare(
    `SELECT embedding FROM embed_cache WHERE content_hash = ? AND model = ?`,
  );
  const putStmt = db.prepare(
    `INSERT OR IGNORE INTO embed_cache (content_hash, model, embedding, created_at)
     VALUES (?, ?, ?, ?)`,
  );

  return {
    ...location,
    db,
    rebuilt,
    priorVersion,
    dropped,
    adopted,
    get(contentHash, recipe) {
      const row = getStmt.get(contentHash, recipe) as { embedding: Buffer } | undefined;
      return row ? row.embedding : null;
    },
    put(contentHash, recipe, embedding, createdAt) {
      putStmt.run(contentHash, recipe, embedding, createdAt);
    },
    close: () => db.close(),
  };
}

/** A stored vector no live vertex hashes to. */
export interface UnusedEmbedRow {
  content_hash: string;
  model: string;
  /**
   * When this vector was first embedded — ISO 8601, exactly as the
   * indexer wrote it, so ordinary string comparison is chronological.
   *
   * Carried so a caller can apply a *retention floor* (DISC-032 item 3).
   * It is the only temporal column the store has, and it says nothing
   * about use: see `retainedSince` below for why that makes it right for
   * a floor and wrong for the eviction policy it superficially suggests.
   */
  created_at: string;
}

/**
 * Content hashes of every vertex one cache holds — the liveness set for
 * *that* working tree.
 *
 * Split from `findUnusedRows` so several trees' answers can be unioned
 * (DISC-032): liveness is per-worktree, but the store is not, and the
 * only honest way to sweep a contended store is to ask every tree.
 */
export function liveContentHashes(indexDb: Database.Database): Set<string> {
  return new Set(
    (indexDb.prepare(`SELECT DISTINCT content_hash FROM vertices`).all() as Array<{
      content_hash: string;
    }>).map((r) => r.content_hash),
  );
}

/**
 * Rows in the store that nothing in `live` hashes to — the accumulation
 * the grow-only write path leaves behind (OBS-021).
 *
 * Recipe-agnostic on purpose: a live hash keeps its rows under every
 * recipe (switching back reuses them); a dead hash has no owner under
 * any. The two databases are separate files, so liveness resolves in
 * memory rather than by a join — at corpus scale these are thousands of
 * rows, and it keeps the store free of any dependency on the cache's
 * schema.
 *
 * A consequence worth stating, because FRICTION-033 predicted the
 * opposite: rows written under a *superseded* recipe are NOT swept.
 * Their content is still live, so they are retained exactly as an old
 * model's rows are — and that retention is precisely what makes flipping
 * the cap (or the model) back free. "Reverting is cheap" and "the old
 * vintage ages out" cannot both hold; this file chooses the first. A
 * recipe change therefore leaves a permanent stratum in a grow-only
 * store, which is the cost of not dropping it wholesale (OBS-021).
 *
 * **Unused is only as wide as the `live` set you pass.** One tree's
 * hashes answer "unused here", which is what `status` reports; the union
 * of every worktree's hashes answers "unused by this clone", which is
 * what `gc` needs before it deletes anything (DISC-032).
 */
export function findUnusedRows(
  embedDb: Database.Database,
  live: ReadonlySet<string>,
): UnusedEmbedRow[] {
  const rows = embedDb
    .prepare(`SELECT content_hash, model, created_at FROM embed_cache`)
    .all() as UnusedEmbedRow[];

  return rows.filter((r) => !live.has(r.content_hash));
}

/** An unused set split by the retention floor. */
export interface RetentionSplit {
  /** Unused and old enough to evict. */
  evictable: UnusedEmbedRow[];
  /** Unused but younger than the floor — kept this round. */
  retained: UnusedEmbedRow[];
}

/**
 * Split unused rows on a retention floor (DISC-032 item 3, `embed.retain_days`).
 *
 * `cutoff` is an ISO timestamp; rows created at or after it are retained.
 * Pass `null` for no floor, which is what `--retain-days 0` resolves to and
 * what every caller did before this existed.
 *
 * **Why the store's one timestamp is right here and wrong three lines
 * over.** `created_at` records when a vector was *first embedded*; `get()`
 * records nothing, so the store cannot say when a row was last used.
 * OBS-021 established what that forbids — age-as-a-ceiling ("evict rows
 * older than N") reads age-since-first-embed as age-since-last-use and so
 * evicts precisely the long-lived, still-live rows whose re-embed is least
 * justified. The floor inverts the comparison and with it the failure
 * mode: it never decides that an old row is *dead*, only that a young row
 * is *not yet safe to call dead*, and being wrong costs a retained row
 * rather than a discarded one.
 *
 * What it actually protects is the residual gap DISC-032 accepted rather
 * than plugged: a commit checked out in no working tree is invisible to
 * the liveness union, so its rows look dead to every tree. Age cannot see
 * that branch either — but the work that produced it was recent, and
 * recency is a property the store *does* record. So the floor buys a real
 * guard against the one case worktree-counting cannot reach, for one
 * column that already exists and no schema bump.
 */
export function applyRetentionFloor(
  unused: readonly UnusedEmbedRow[],
  cutoff: string | null,
): RetentionSplit {
  if (!cutoff) return { evictable: [...unused], retained: [] };

  const evictable: UnusedEmbedRow[] = [];
  const retained: UnusedEmbedRow[] = [];
  for (const row of unused) {
    // ISO 8601 with a fixed `Z` offset, so lexicographic order is
    // chronological order and no Date is constructed per row.
    (row.created_at >= cutoff ? retained : evictable).push(row);
  }
  return { evictable, retained };
}

/**
 * Default for `embed.retain_days` — a week, which is the span in which
 * "somebody is still working on that branch" stops being the likely
 * explanation for an orphaned row.
 */
export const DEFAULT_RETAIN_DAYS = 7;

/**
 * The ISO instant `days` before `now`, or null when the floor is off.
 *
 * `now` is a parameter rather than a `Date.now()` call so the floor is
 * testable without freezing the clock — the boundary is the whole
 * behaviour here, and a test that cannot name the boundary cannot pin it.
 */
export function retentionCutoff(days: number, now: Date = new Date()): string | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/**
 * Delete every row keyed to a recipe other than the current one — the
 * *unreachable* stratum `countSupersededRecipeRows` reports (FRICTION-035).
 *
 * This is the one sweep that spends a property rather than reclaiming
 * waste, and that asymmetry is why it exists only behind an explicit flag
 * (`gc --prune-recipes`) and is never reached by `embed.auto_gc`.
 * FRICTION-033 chose to retain these rows so that flipping the model, cap
 * or dtype *back* is free; deleting them makes reverting cost a full
 * re-embed. Both are defensible and neither is inferable from the corpus,
 * so the choice belongs to whoever typed the command (DP-001 tier 3 kept
 * out of code by making the flag the decision).
 *
 * Measured motivation: on docdog's own store a single recipe change left
 * **390 rows / 1.7 MB frozen and unreachable — 50% of the file, and
 * roughly 1.4 years of ordinary edit churn minted in one day** (OBS-026).
 * Content-keyed `gc` cannot touch any of it, by design, which made a
 * recipe change the largest growth event the store has and the only one
 * with no sweep at all.
 *
 * The retention floor deliberately does not apply: a superseded-recipe row
 * is unreachable at any age, and the flag is the consent the floor would
 * otherwise be standing in for.
 */
export function deleteSupersededRecipeRows(
  embedDb: Database.Database,
  currentRecipe: string,
  opts: { dryRun?: boolean } = {},
): number {
  const doomed = countSupersededRecipeRows(embedDb, currentRecipe);
  if (!opts.dryRun && doomed > 0) {
    embedDb.prepare(`DELETE FROM embed_cache WHERE model <> ?`).run(currentRecipe);
  }
  return doomed;
}

export interface EvictionResult {
  /** Rows in the store before the sweep. */
  scanned: number;
  /** Unused, past the floor, and deleted (unless `dryRun`). */
  evicted: number;
  /** Unused but younger than the floor — kept this round. */
  retained: number;
  /** Rows a live vertex still hashes to. */
  kept: number;
}

/**
 * Evict store rows that nothing in `live` hashes to.
 *
 * `live` decides what "stale" means and the caller owns that choice
 * (DISC-032): pass one tree's hashes and this evicts what that tree
 * cannot see; pass the clone-wide union and it evicts what no working
 * tree can see. `engine/embed-gc.ts` passes the union.
 *
 * Which rows those are is `findUnusedRows`' answer, shared with `docdog
 * status` (OBS-021) so the count status reports and the set this deletes
 * can never disagree. `retainSince` then holds back the young ones —
 * see `applyRetentionFloor` for why the store's one timestamp is right
 * for that and wrong for the eviction policy it resembles.
 */
export function evictStaleEmbeddings(
  live: ReadonlySet<string>,
  embedDb: Database.Database,
  opts: { dryRun?: boolean; retainSince?: string | null } = {},
): EvictionResult {
  const scanned = (
    embedDb.prepare(`SELECT COUNT(*) AS n FROM embed_cache`).get() as { n: number }
  ).n;

  const unused = findUnusedRows(embedDb, live);
  const { evictable, retained } = applyRetentionFloor(unused, opts.retainSince ?? null);

  if (!opts.dryRun && evictable.length > 0) {
    const del = embedDb.prepare(`DELETE FROM embed_cache WHERE content_hash = ? AND model = ?`);
    embedDb.transaction(() => {
      for (const row of evictable) del.run(row.content_hash, row.model);
    })();
  }

  return {
    scanned,
    evicted: evictable.length,
    retained: retained.length,
    kept: scanned - unused.length,
  };
}

/** Bytes on disk before and after a compaction. */
export interface CompactionResult {
  before: number;
  after: number;
  /** Non-null when VACUUM could not run; the eviction still stands. */
  error: string | null;
}

/**
 * `VACUUM` the store and report what the file actually gave back.
 *
 * Deleting rows returns their pages to SQLite's freelist, not to the
 * filesystem — so before this existed, `docdog gc` could evict a sixth of
 * the store and leave the file exactly as large as it found it. That is a
 * poor answer to the only symptom anyone reports (*"the file keeps
 * growing"*), and a worse one to give twice.
 *
 * Both sides are checkpointed before measuring: in WAL mode the freed
 * pages and the rewrite both land in `-wal` first, so an uncheckpointed
 * `before` under-reports and an uncheckpointed `after` over-reports.
 *
 * Every failure is a value, never a throw. VACUUM takes an exclusive lock
 * and the store is shared by every worktree of the clone (PROPOSAL-029),
 * so losing the lock to a sibling's index run is an ordinary outcome — and
 * the rows are already gone by then. Reclaiming the space is the part that
 * can wait for the next sweep; the eviction is not.
 */
export function compactStore(embedDb: Database.Database): CompactionResult {
  const path = embedDb.name;
  const size = () => {
    try {
      return statSync(path).size;
    } catch {
      return 0;
    }
  };

  let before = size();
  try {
    embedDb.pragma("wal_checkpoint(TRUNCATE)");
    before = size();
    // Cannot run inside a transaction — callers must have committed.
    embedDb.exec("VACUUM");
    embedDb.pragma("wal_checkpoint(TRUNCATE)");
    return { before, after: size(), error: null };
  } catch (err) {
    return { before, after: before, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * How many rows are keyed to a recipe other than the current one — the store's
 * *unreachable* stratum (FRICTION-035). No lookup will ever produce a
 * superseded recipe again (until it reverts), so these rows can never be read,
 * yet `findUnusedRows` counts them as USED whenever their content is still live
 * — it filters on `content_hash` alone and is recipe-agnostic by design (that
 * agnosticism is what makes reverting free). "Unused" (dead content) and this
 * (dead recipe) are therefore different sets that were identical until the day
 * a recipe first changed; a row can be in either, both, or neither.
 *
 * A pure count against the store, `currentRecipe` opaque here exactly as
 * `model` is — the caller composes it with `embedRecipe`. Reported by `status`,
 * never swept: eviction would undo the free-revert trade FRICTION-033 chose,
 * and `gc` keying on content is load-bearing for it. Disclosure only.
 */
export function countSupersededRecipeRows(
  embedDb: Database.Database,
  currentRecipe: string,
): number {
  return (
    embedDb
      .prepare(`SELECT COUNT(*) AS n FROM embed_cache WHERE model <> ?`)
      .get(currentRecipe) as { n: number }
  ).n;
}

function connect(path: string): Database.Database {
  const db = new Database(path);
  try {
    // WAL + busy_timeout are what make a store shared by several
    // worktrees safe to write concurrently; with idempotent writes, a
    // lost race is a no-op rather than a corruption.
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("synchronous = NORMAL");
    db.pragma("user_version");
    return db;
  } catch (err) {
    // Release the handle before the caller deletes the file — on Windows
    // an open handle makes the unlink fail with EBUSY.
    db.close();
    throw err;
  }
}

function readVersion(db: Database.Database): number | null {
  try {
    const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(VERSION_KEY) as
      | { value: string }
      | undefined;
    if (!row) return null;
    const parsed = Number.parseInt(row.value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

function rebuild(db: Database.Database): void {
  const names = (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'`)
      .all() as Array<{ name: string }>
  ).map((r) => r.name);

  db.transaction(() => {
    for (const name of names) db.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}"`);
    for (const stmt of EMBED_DDL) db.exec(stmt);
    db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?)`).run(
      VERSION_KEY,
      String(EMBED_SCHEMA_VERSION),
    );
  })();
}

/**
 * One-time §4 adoption: copy a pre-PROPOSAL-029 `embed_cache` out of the
 * project's `index.db`. Not a migration in the sense DD-070 §2 forbids —
 * nothing here is unrecomputable; it exists so the split does not cost
 * every existing user ten CPU-minutes. Any failure is a no-op: worst case
 * the vectors are recomputed.
 */
function adoptLegacyRows(db: Database.Database, indexDbPath: string): number {
  if (!existsSync(indexDbPath)) return 0;

  try {
    db.prepare(`ATTACH DATABASE ? AS legacy`).run(indexDbPath);
  } catch {
    return 0;
  }

  try {
    const table = db
      .prepare(`SELECT name FROM legacy.sqlite_master WHERE type = 'table' AND name = 'embed_cache'`)
      .get();
    if (!table) return 0;

    const before = rowCount(db);
    db.exec(
      `INSERT OR IGNORE INTO main.embed_cache (content_hash, model, embedding, created_at)
       SELECT content_hash, model, embedding, created_at FROM legacy.embed_cache`,
    );
    return rowCount(db) - before;
  } catch {
    return 0;
  } finally {
    try {
      db.exec(`DETACH DATABASE legacy`);
    } catch {
      // Nothing to detach, or already gone.
    }
  }
}

/**
 * Rows currently in the store, tolerating a file that has no such table
 * — the pre-rebuild probe runs against whatever is there, which may be
 * a schema this version has never seen.
 */
function countRows(db: Database.Database): number {
  try {
    return (db.prepare(`SELECT COUNT(*) AS n FROM embed_cache`).get() as { n: number }).n;
  } catch {
    return 0;
  }
}

function rowCount(db: Database.Database): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM main.embed_cache`).get() as { n: number }).n;
}

/** True when `path` sits under `root` (or is `root` itself). */
function isInside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
