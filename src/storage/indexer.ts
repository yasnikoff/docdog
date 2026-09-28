/**
 * Cache indexer — P-023 §7 step 3 (indexer retarget).
 *
 * Derives the embedded SQLite cache (files, vertices, edges, chunks,
 * fts) from the markdown corpus on disk. Parse semantics are shared
 * with the v2 indexer via src/engine/discovery.ts; everything below
 * the parse is cache-specific and intentionally simpler than the
 * Arango reconciler:
 *
 * - Edges are born only in `relationships:` frontmatter (DD-043,
 *   PROPOSAL-023 §1.1). Reindexing a file replaces its vertices'
 *   outbound edge rows wholesale. There is no orphan machinery and no
 *   soft delete: an edge whose target id has no vertices row is just
 *   a dangling row — exactly what the frontmatter says.
 * - A record cannot outlive its file (DD-070 §2), so PROPOSAL-021's
 *   archive-collection exception does not exist here.
 * - Embeddings are reused via the embed store, keyed by
 *   (content_hash, model) per DD-051. It is a separate file from the
 *   cache and survives everything the cache does not — full reindexes,
 *   schema bumps, and the working tree it was written from
 *   (PROPOSAL-029).
 *
 * This module never imports the Arango driver — it is the indexer
 * that survives step 6. (The collection-name helpers it uses from
 * src/arango/collections.ts are config-only and must relocate when
 * src/arango/ is deleted.)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { DocdogConfig, ScanPathEntry } from "../types/config.js";
import { isKnownVertexCollection } from "../config/collections.js";
import { normalizeScanPath } from "../config/defaults.js";
import { generateEmbeddings } from "../engine/embedder.js";
import {
  discoverAndParseAll,
  findMissingScanPaths,
  withLocalScanPath,
  governingScanEntry,
  LOCAL_DIR_REL,
  type ParsedFile,
  type SectionToIndex,
} from "../engine/discovery.js";
import { extractRelationships } from "../engine/relationships/extract.js";
import { cacheFilePath, openCache, setMeta, getMeta } from "./cache.js";
import { checkEdgeHealth, formatEdgeHealthWarnings } from "./edge-health.js";
import {
  MAX_EMBED_CHARS,
  embedRecipe,
  describeRecipeChange,
  checkEmbedHealth,
  formatEmbedHealthWarnings,
  hasEmbeddableBody,
} from "./embed-health.js";
import {
  EMBED_SCHEMA_VERSION,
  openEmbedStore,
  type EmbedStoreHandle,
} from "./embed-store.js";
import { loadRegistryFromCache } from "./relations.js";
import { META_KEYS } from "./schema.js";

/** Batch embedding signature — injectable so tests run without ONNX. */
export type EmbedBatchFn = (config: DocdogConfig, texts: string[]) => Promise<number[][]>;

export interface CacheIndexerOptions {
  config: DocdogConfig;
  projectRoot: string;
  /** Wipe the cache's derived rows (never the embed store) and reindex everything. */
  full?: boolean;
  /** Override config.scan_paths (e.g. CLI --path, single-file reindex). */
  paths?: ScanPathEntry[];
  /** Index sections with unknown collections instead of skipping them. */
  createCollections?: boolean;
  /** Override the cache file location (tests). */
  cacheFilePath?: string;
  /** Override the embed store location (tests). Default: PROPOSAL-029 resolution. */
  embedStorePath?: string;
  /** Override the embedder (tests). Default: the real ONNX/Ollama path. */
  embed?: EmbedBatchFn;
  /** Progress/warning sink. Default: console.log / console.warn. */
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

export interface CacheIndexStats {
  /** True when the cache file was dropped and recreated on open. */
  rebuilt: boolean;
  filesSeen: number;
  filesChanged: number;
  verticesUpserted: number;
  verticesRemoved: number;
  edges: number;
  embedded: number;
  embedReused: number;
  /** Resolved embed store (PROPOSAL-029) — printed, never inferred. */
  embedStorePath: string;
  /** True when that store is shared with other worktrees of the clone. */
  embedStoreShared: boolean;
  /** Ids claimed by more than one file (PROPOSAL-031). Always 0 on a path-scoped run. */
  contestedIds: number;
  /** Edges whose relation type is not in the registry (FRICTION-028). 0 on a path-scoped run. */
  unknownTypeEdges: number;
  /** Edges pointing at an id no record declares (FRICTION-028). 0 on a path-scoped run. */
  danglingEdges: number;
  /**
   * Edges from a tracked record to one no clone will have (PROPOSAL-047).
   * 0 on a path-scoped run, and 0 whenever git cannot answer — the check is
   * silent outside a repository rather than absent, so a zero here means
   * "none found or not asked", never "none exist".
   */
  crossVisibilityEdges: number;
  /** Records whose tail is past MAX_EMBED_CHARS, so no vector sees it. 0 on a path-scoped run. */
  oversizedRecords: number;
  /**
   * Records under `.docdog/local/` — indexed, never committed (DISC-041).
   * 0 on a path-scoped run, which holds a partial view of the corpus.
   */
  localRecords: number;
  /**
   * Sections dropped because their collection is not registered
   * (FRICTION-032). User content that did not make it into the graph, so
   * it belongs in the summary and not only in a mid-stream warning: the
   * symptom a user notices is "search can't find my record", which reads
   * as bad retrieval rather than as a skipped write.
   */
  skippedSections: number;
  /** The distinct unregistered collection names behind `skippedSections`, sorted. */
  skippedCollections: string[];
  /**
   * Whole-cache totals AFTER this run — cumulative, unlike every count
   * above, which describes only the files reindexed this run. A single
   * `SELECT COUNT(*)` per table; the number a "how big is the graph now?"
   * question actually wants (FRICTION-029).
   */
  totalVertices: number;
  totalEdges: number;
}

/**
 * The summary lines for sections dropped by the collection filter
 * (FRICTION-032). Empty when nothing was skipped — the common case must
 * stay silent, or the loud case stops reading as loud.
 *
 * Shared by the CLI summary and the MCP index tool so the two surfaces
 * cannot drift on the wording of a message whose whole job is to be
 * noticed. Mechanical throughout: it reports names the config already
 * decided were unknown and quotes the two documented remedies — it never
 * guesses which one the user meant (DP-001).
 */
export function formatSkipSummary(stats: CacheIndexStats): string[] {
  if (stats.skippedSections === 0) return [];
  const names = stats.skippedCollections.map((c) => `"${c}"`).join(", ");
  return [
    `  Cache: ${stats.skippedSections} section(s) SKIPPED — not indexed, not searchable.`,
    `    Unregistered collection(s): ${names}.`,
    `    Fix: add them to vertex_collections in .docdog/config.yaml and reindex,`,
    `    or re-run with --create-collections to index them without changing config.`,
  ];
}

/**
 * Build or refresh the cache from disk. The only writer of
 * canonical-derived state (DD-070 §2).
 */
export async function runCacheIndexer(options: CacheIndexerOptions): Promise<CacheIndexStats> {
  const { config, projectRoot, full = false, createCollections = false } = options;
  const embed = options.embed ?? generateEmbeddings;
  const log = options.log ?? ((m) => console.log(m));
  const warn = options.warn ?? ((m) => console.warn(m));
  // `.docdog/local/` joins the scan implicitly when it exists — see
  // withLocalScanPath for why it is not a config entry. A path-scoped run
  // scans exactly what it was handed, local or not.
  const scanPaths = options.paths ?? withLocalScanPath(projectRoot, config.scan_paths);
  // An explicit `paths` narrows this run to a subtree (`--path`, or the
  // single-file reindex the write tools use). It is the difference between
  // "rebuild the cache" and "rebuild this subtree" — see the wipe below.
  const pathScoped = options.paths !== undefined;

  // The store opens BEFORE the cache: its one-time adoption of a
  // pre-PROPOSAL-029 `embed_cache` reads that table out of index.db, and
  // opening the cache at SCHEMA_VERSION 3 is what drops it.
  const indexPath = cacheFilePath(projectRoot, options.cacheFilePath);
  const store = openEmbedStore(projectRoot, config, {
    filePath: options.embedStorePath,
    adoptFrom: indexPath,
  });
  const handle = openCache(projectRoot, { filePath: options.cacheFilePath });
  try {
    const db = handle.db;

    // A default that relocates state must be visible, or it is not a
    // default — it is an inference (DP-001).
    log(
      `  Embeddings: ${store.path}` +
        (store.shared ? " (shared across worktrees)" : "") +
        (store.adopted > 0 ? ` — adopted ${store.adopted} existing embedding(s)` : ""),
    );

    // FRICTION-034: a version disagreement on this file is not the cheap
    // thing a version disagreement on index.db is. Versioned file names
    // make vintages coexist, so this should now only fire where docdog
    // does not own the name — an explicit embed.cache_path. When it does
    // fire on a shared store the cost is charged once per working tree,
    // and only the tree that triggered it is in a position to know why.
    if (store.dropped > 0) {
      warn(
        `  Embeddings: dropped ${store.dropped} vector(s) written by another docdog ` +
          `(store schema v${store.priorVersion} → v${EMBED_SCHEMA_VERSION})` +
          (store.shared
            ? " — this file is shared by every working tree of the clone, and each one re-embeds on its next index."
            : " — they re-embed on this run.") +
          " Derived state, so this costs time, never data (DD-070 §2).",
      );
    }

    // A change to the embedding function invalidates every stored vector,
    // and the thing that identifies that function is the RECIPE — model,
    // cap and dtype together — because that is what the embed store files
    // a vector under (`embedRecipe`, FRICTION-033).
    //
    // This used to compare `config.embed.model` alone, which meant a
    // dtype switch invalidated nothing: files whose content hash was
    // unchanged are skipped at the file level, before `resolveEmbeddings`
    // is ever reached, so the store's correct key was never consulted and
    // the cache ended up holding two quantizations at once with no
    // warning, from following the README's own advice (FRICTION-046). The
    // displayed value stays the bare model, under its own key — one field
    // doing two jobs with one of them wrong is how this survived review.
    //
    // A full rebuild is not a re-embed: the store keeps rows under every
    // recipe it has seen, so switching q8 → fp32 → q8 reindexes each time
    // and re-embeds none of it.
    const recipe = embedRecipe(config.embed.model, MAX_EMBED_CHARS, config.embed.dtype);
    // A cache written before this fix recorded only the model. Reading the
    // absence as "unchanged" would leave exactly the mixed store this fix
    // exists to prevent already-affected projects sitting in, so synthesize
    // what such a cache implies — the bare model at the current cap with no
    // dtype — and let the comparison heal it on the next run.
    const priorModel = getMeta(db, META_KEYS.embedModel);
    const priorRecipe =
      getMeta(db, META_KEYS.embedRecipe) ?? (priorModel === null ? null : embedRecipe(priorModel));
    const recipeChanged = priorRecipe !== null && priorRecipe !== recipe;
    const fullRebuild = full || handle.rebuilt || recipeChanged;
    if (recipeChanged) {
      log(
        `  Cache: embed recipe changed (${describeRecipeChange(priorRecipe, recipe)}) — full reindex`,
      );
    }
    setMeta(db, META_KEYS.embedModel, config.embed.model);
    setMeta(db, META_KEYS.embedRecipe, recipe);

    const scanPrefixes = scanPaths
      .map((p) => normalizeScanPath(p).path)
      .map((p) => p.replace(/\\/g, "/"));

    if (fullRebuild) {
      // The embed store is a different file and is never touched here —
      // reuse across rebuilds is the point of content-hash keying
      // (DD-051), and its own file is what guarantees it (PROPOSAL-029).
      if (pathScoped) {
        // FRICTION-022: a scoped run must wipe only what it will rebuild.
        // Deleting every derived row here and then reindexing one subtree
        // left the rest of the corpus missing from the cache, with a
        // success summary printed over the top of it. Sweeping the scoped
        // prefixes against an empty discovered-set is exactly that wipe.
        const wiped = sweepGhostFiles(db, new Set<string>(), scanPrefixes);
        if (wiped.files > 0) {
          log(
            `  Cache: full rebuild scoped to ${scanPrefixes.join(", ")} — ` +
              `cleared ${wiped.files} file(s), ${wiped.vertices} vertex(es)`,
          );
        }
      } else {
        db.transaction(() => {
          for (const table of ["edges", "chunks", "fts", "vertices", "files", "contested_ids"]) {
            db.exec(`DELETE FROM ${table}`);
          }
        })();
      }
    }

    // Discover + parse, then validate collections against config.
    // Unlike the v2 indexer there is nothing to auto-create — a
    // collection is a column value — but validation keeps the same
    // config-declared type registry contract (DD-070 §6 / DD-046).
    const stats: CacheIndexStats = {
      rebuilt: handle.rebuilt,
      filesSeen: 0,
      filesChanged: 0,
      verticesUpserted: 0,
      verticesRemoved: 0,
      edges: 0,
      embedded: 0,
      embedReused: 0,
      embedStorePath: store.path,
      embedStoreShared: store.shared,
      contestedIds: 0,
      unknownTypeEdges: 0,
      danglingEdges: 0,
      crossVisibilityEdges: 0,
      oversizedRecords: 0,
      localRecords: 0,
      skippedSections: 0,
      skippedCollections: [],
      totalVertices: 0,
      totalEdges: 0,
    };

    // A declared path that does not exist is skipped in silence by
    // discovery, which makes the entry read like a home for records that
    // it is not — anything written there is on disk and in no corpus.
    // One line however many are missing: the common case is zero, and a
    // per-entry list of an empty template's directories would train the
    // eye to skip the block that matters.
    const missingScanPaths = findMissingScanPaths(projectRoot, scanPaths);
    if (missingScanPaths.length > 0) {
      warn(
        `  Cache: ${missingScanPaths.length} scan_paths entry/entries point at nothing on disk ` +
          `(${missingScanPaths.join(", ")}) — files written there are NOT indexed. ` +
          `Create the path, or drop the entry from .docdog/config.yaml.`,
      );
    }

    const skippedCollections = new Set<string>();
    const parsedFiles: ParsedFile[] = [];
    for (const parsed of await discoverAndParseAll(projectRoot, scanPaths, config)) {
      // Emitted before the collection filter below, and for every parsed
      // file — including one that produced no sections and is about to be
      // dropped. That silent drop is the whole point (FRICTION-019/023).
      for (const w of parsed.warnings) warn(`  Cache: ${w}`);

      const validSections = parsed.sections.filter((s) => {
        if (createCollections || isKnownVertexCollection(s.collection, config)) return true;
        warn(`  Cache: unknown collection "${s.collection}" in ${parsed.repoRelPath} — section skipped.`);
        stats.skippedSections++;
        skippedCollections.add(s.collection);
        return false;
      });
      if (validSections.length > 0) {
        parsedFiles.push({ ...parsed, sections: validSections });
      }
    }
    stats.filesSeen = parsedFiles.length;

    const discoveredSet = new Set(parsedFiles.map((f) => f.repoRelPath));

    // Ghost sweep BEFORE reindexing changed files so a rename (old
    // path swept, new path indexed) never trips the duplicate-id
    // warning on its own vertex ids. Full rebuild already cleared.
    if (!fullRebuild) {
      const swept = sweepGhostFiles(db, discoveredSet, scanPrefixes);
      stats.verticesRemoved += swept.vertices;
      if (swept.files > 0) {
        log(`  Cache: ghost sweep removed ${swept.files} file(s), ${swept.vertices} vertex(es)`);
      }
    }

    // Incremental fast-path: skip files whose file_hash is unchanged.
    const existingHashes = new Map<string, string>();
    if (!fullRebuild) {
      const rows = db.prepare(`SELECT path, file_hash FROM files`).all() as Array<{
        path: string;
        file_hash: string;
      }>;
      for (const row of rows) existingHashes.set(row.path, row.file_hash);
    }
    const changedFiles = parsedFiles.filter((f) => existingHashes.get(f.repoRelPath) !== f.fileHash);
    stats.filesChanged = changedFiles.length;

    for (const file of changedFiles) {
      const r = await reindexParsedFile(db, store, config, projectRoot, file, embed, warn);
      stats.verticesUpserted += r.upserted;
      stats.verticesRemoved += r.removed;
      stats.edges += r.edges;
      stats.embedded += r.embedded;
      stats.embedReused += r.reused;
    }

    // Contested ids are a property of the whole parse, not of the files that
    // happened to change — `parsedFiles` holds every discovered file's
    // sections whether or not it was reindexed, so this recomputes cleanly
    // and heals itself the moment a duplicate is resolved. A path-scoped run
    // cannot see the corpus, so it leaves the table alone rather than
    // reporting a truth it only half-knows.
    if (!pathScoped) {
      stats.contestedIds = recordContestedIds(db, parsedFiles);
      if (stats.contestedIds > 0) {
        warn(
          `  Cache: ${stats.contestedIds} contested id(s) — two or more files claim one id; ` +
            `only the last indexed is queryable. Run "docdog status" to list them.`,
        );
      }

      // Edge health (FRICTION-028). Whole-corpus by nature: an unregistered
      // type needs the registry and a dangling target needs every id, so both
      // are only knowable once the last file is in. Same gate as contested
      // ids — a path-scoped run holds a partial view of the corpus and would
      // report defects in files it never looked at, on every single write.
      const health = checkEdgeHealth(db, loadRegistryFromCache(db), projectRoot);
      stats.unknownTypeEdges = health.unknownTypeEdges;
      stats.danglingEdges = health.danglingTargets.length;
      stats.crossVisibilityEdges = health.crossVisibility.length;
      for (const line of formatEdgeHealthWarnings(health)) warn(line);

      // Embed coverage. Truncation is knowable per-record at embed time, so
      // this could fire inside the loop — but the useful unit is the corpus,
      // not the file: "this record is 24% unembedded" invites splitting a
      // record that cannot be split, where "16% of the corpus reaches no
      // vector" is the number that argues for chunking. Reading the cache
      // also reports the standing hole on a run that changed nothing, which
      // tracking the loop would not. Same !pathScoped gate as the checks
      // above, for the same reason: a path-scoped run would report a corpus
      // it did not look at, on every single write.
      // `.docdog/local/` is scanned without a config entry, so the corpus can
      // hold records nothing in config.yaml accounts for. Reported whenever
      // there are any — silence is what would make an implicit scan path
      // objectionable, not the scanning.
      stats.localRecords = (
        db
          .prepare(`SELECT COUNT(*) AS n FROM vertices WHERE file_path LIKE ?`)
          .get(`${LOCAL_DIR_REL}/%`) as { n: number }
      ).n;
      if (stats.localRecords > 0) {
        log(
          `  Cache: ${stats.localRecords} record(s) from ${LOCAL_DIR_REL}/ — indexed, never committed.`,
        );
      }

      const embedHealth = checkEmbedHealth(db, MAX_EMBED_CHARS);

      // Clear a vector an older docdog stored for an empty body. The file is
      // unchanged, so the incremental run skipped it and the per-file refusal
      // above never saw it; without this, only `--full` would apply the fix.
      // By id from the report, so one predicate (`hasEmbeddableBody`) decides.
      const clear = db.prepare(
        `UPDATE chunks SET embedding = NULL WHERE vertex_id = ? AND embedding IS NOT NULL`,
      );
      let cleared = 0;
      for (const r of embedHealth.emptyBodies) cleared += clear.run(r.id).changes;
      if (cleared > 0) {
        log(`  Cache: cleared ${cleared} vector(s) stored for an empty body (FRICTION-060).`);
      }
      stats.oversizedRecords = embedHealth.oversized.length;
      for (const line of formatEmbedHealthWarnings(embedHealth)) warn(line);
    }

    // Cumulative totals for the footer (FRICTION-029). Every count on the
    // per-run line above is scoped to the files this run touched, so the
    // edges figure legitimately shrinks between incremental runs and reads
    // as loss. These two COUNT(*)s are the whole-graph size the summary
    // was mistaken for — stated separately so the scope of each is plain.
    stats.totalVertices = (db.prepare(`SELECT COUNT(*) AS n FROM vertices`).get() as { n: number }).n;
    stats.totalEdges = (db.prepare(`SELECT COUNT(*) AS n FROM edges`).get() as { n: number }).n;

    stats.skippedCollections = [...skippedCollections].sort();

    log(
      `  Cache: ${stats.filesSeen} file(s), ${stats.filesChanged} reindexed — this run: ` +
        `${stats.verticesUpserted} vertices upserted, ${stats.verticesRemoved} removed, ` +
        `${stats.edges} edges, ${stats.embedded} embedded (${stats.embedReused} reused)`,
    );
    // Printed BELOW the counts and ABOVE the graph total, because the last
    // line a user reads is the one they believe. A skip is the one figure
    // here that means "your content is not in the graph" (FRICTION-032).
    for (const line of formatSkipSummary(stats)) log(line);
    log(`  Graph total: ${stats.totalVertices} record(s), ${stats.totalEdges} edge(s)`);

    return stats;
  } finally {
    // FRICTION-020: the summary above has already been printed, so anything
    // that throws from here down turns a *completed* index into a nonzero exit
    // with nothing on screen to say which half failed — the shape that
    // friction reports, and the only path inside docdog that produces it.
    //
    // Closing a handle is housekeeping. Every write is committed by the time
    // we get here, and a WAL left uncheckpointed is still durable, so a close
    // that fails costs a file handle the exiting process is about to drop
    // anyway. Report it and let the verdict stand — the same call
    // `autoSweepEmbedStore` makes one command over, for the same reason: an
    // exit code that blames a successful reindex for a housekeeping hiccup is
    // worse than the hiccup. A failure in the *body* still propagates; this
    // only declines to invent one.
    closeQuietly("cache", handle, warn);
    closeQuietly("embed store", store, warn);
  }
}

/**
 * Close a handle without letting the close decide the command's exit code
 * (FRICTION-020). Named rather than inlined twice so the reason is stated once
 * and a third handle cannot quietly skip it.
 */
function closeQuietly(
  what: string,
  closable: { close(): void },
  warn: (message: string) => void,
): void {
  try {
    closable.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`  ⚠ ${what} did not close cleanly: ${message} (the index itself completed)`);
  }
}

/**
 * Reindex a single file — the path `docdog_create`/`update`/`relate`
 * will call after writing a record file (P-023 §7 step 5). Resolves
 * the parser from the configured scan entry whose path is the longest
 * prefix of the file's path, so a file under a `split`-parsed scan
 * root is re-split, not default-parsed. Deleting the file then calling
 * this sweeps its rows (the scoped ghost sweep sees the missing path).
 */
export async function reindexCacheFile(
  options: CacheIndexerOptions,
  repoRelPath: string,
): Promise<CacheIndexStats> {
  const normalized = repoRelPath.replace(/\\/g, "/");
  const entry = matchScanEntry(options.config.scan_paths, normalized);
  const scoped: ScanPathEntry = entry
    ? { ...entry, path: normalized }
    : normalized;
  return runCacheIndexer({ ...options, full: false, paths: [scoped] });
}

/** Longest-prefix match of a file path against configured scan entries.
 * Exported for the write tools (src/storage/writes.ts), which resolve
 * the effective parser the same way this module's single-file path does.
 * One implementation with discovery's (FRICTION-057), so a write and a full
 * index can never disagree about which entry governs a file. */
export function matchScanEntry(scanPaths: ScanPathEntry[], repoRelPath: string) {
  return governingScanEntry(scanPaths, repoRelPath);
}

// ─── Per-file reconcile ─────────────────────────────────────────────────────

interface FileReindexResult {
  upserted: number;
  removed: number;
  edges: number;
  embedded: number;
  reused: number;
}

/**
 * Replace one file's derived rows. Embeddings resolve first (async,
 * cache-backed); all row writes then commit in a single transaction.
 */
async function reindexParsedFile(
  db: Database.Database,
  store: EmbedStoreHandle,
  config: DocdogConfig,
  projectRoot: string,
  file: ParsedFile,
  embed: EmbedBatchFn,
  warn: (message: string) => void,
): Promise<FileReindexResult> {
  // Vertex ids: frontmatter id when present, else the section key
  // (parser-generated keys embed the file path, so they are unique
  // cache-wide). Duplicate ids across live files (OQ-43) resolve
  // last-writer-wins with a warning.
  const seen = new Set<string>();
  const sections: Array<SectionToIndex & { vertexId: string }> = [];
  for (const s of file.sections) {
    const vertexId = s.id ?? s.sectionKey;
    if (seen.has(vertexId)) {
      warn(`  Cache: duplicate id "${vertexId}" within ${file.repoRelPath} — later section skipped.`);
      continue;
    }
    seen.add(vertexId);

    const owner = db
      .prepare(`SELECT file_path FROM vertices WHERE id = ?`)
      .get(vertexId) as { file_path: string } | undefined;
    if (owner && owner.file_path !== file.repoRelPath && existsSync(join(projectRoot, owner.file_path))) {
      warn(
        `  Cache: id "${vertexId}" is also claimed by ${owner.file_path} — reassigning to ${file.repoRelPath} (last indexed wins).`,
      );
    }
    sections.push({ ...s, vertexId });
  }

  const { blobs, embedded, reused } = await resolveEmbeddings(store, config, sections, embed);

  let removed = 0;
  let edges = 0;

  const apply = db.transaction(() => {
    // Sections that existed for this file but are gone from the new parse.
    const existingIds = (
      db.prepare(`SELECT id FROM vertices WHERE file_path = ?`).all(file.repoRelPath) as Array<{
        id: string;
      }>
    ).map((r) => r.id);
    const newIds = new Set(sections.map((s) => s.vertexId));
    for (const gone of existingIds) {
      if (newIds.has(gone)) continue;
      deleteVertexRows(db, gone);
      removed++;
    }

    const upsertVertex = db.prepare(
      `INSERT OR REPLACE INTO vertices
         (id, collection, status, title, description, file_path, content_hash, frontmatter_json, body_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const deleteChunks = db.prepare(`DELETE FROM chunks WHERE vertex_id = ?`);
    const insertChunk = db.prepare(
      `INSERT INTO chunks (vertex_id, ord, heading_path, start_line, end_line, text, embedding)
       VALUES (?, 0, ?, NULL, NULL, ?, ?)`,
    );
    const deleteFts = db.prepare(`DELETE FROM fts WHERE vertex_id = ?`);
    const insertFts = db.prepare(
      `INSERT INTO fts (vertex_id, title, description, body) VALUES (?, ?, ?, ?)`,
    );
    const deleteEdges = db.prepare(`DELETE FROM edges WHERE from_id = ?`);
    const insertEdge = db.prepare(
      `INSERT OR REPLACE INTO edges (from_id, to_id, type, context, extra_json) VALUES (?, ?, ?, ?, ?)`,
    );

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const description = (s.frontmatter.description as string | undefined) ?? null;
      const status = (s.frontmatter.status as string | undefined) ?? "current";

      upsertVertex.run(
        s.vertexId,
        s.collection,
        status,
        s.title,
        description,
        file.repoRelPath,
        s.contentHash,
        JSON.stringify(s.frontmatter),
        s.content,
      );

      // One chunk per section for now — vertex-granularity retrieval,
      // matching v2's embedding unit. The schema supports finer
      // section chunking later without another version bump.
      deleteChunks.run(s.vertexId);
      insertChunk.run(s.vertexId, s.title, s.content, blobs[i]);

      deleteFts.run(s.vertexId);
      insertFts.run(s.vertexId, s.title, description, s.content);

      // Outbound edges replaced wholesale from the relationships block.
      deleteEdges.run(s.vertexId);
      const { tuples, warnings } = extractRelationships(s.frontmatter);
      for (const w of warnings) {
        warn(`  Cache: ${file.repoRelPath}: ${w.message}`);
      }
      for (const t of tuples) {
        const extra: Record<string, string> = {};
        if (t.anchor_text !== null) extra.anchor_text = t.anchor_text;
        if (t.role !== null) extra.role = t.role;
        insertEdge.run(
          s.vertexId,
          t.target_id,
          t.type,
          t.context,
          Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
        );
        edges++;
      }
    }

    db.prepare(`INSERT OR REPLACE INTO files (path, file_hash) VALUES (?, ?)`).run(
      file.repoRelPath,
      file.fileHash,
    );
  });
  apply();

  return { upserted: sections.length, removed, edges, embedded, reused };
}

/**
 * Rebuild the `contested_ids` table from the full parse (PROPOSAL-031 §2).
 *
 * An id claimed by two live files is the one corpus fact the cache cannot
 * represent: last-writer-wins keeps a single `vertices` row, and the loser's
 * record disappears — searchable by nobody, with only a scrolled-past warning
 * to say it ever existed. These rows are that warning, made queryable.
 *
 * Detection only. Which record deserves the id is judgment (DP-001 Tier 3),
 * handed back to the agent through `docdog status` + `docdog renumber`.
 *
 * Returns the number of contested ids (not rows).
 */
function recordContestedIds(db: Database.Database, parsedFiles: readonly ParsedFile[]): number {
  const claims = new Map<string, Set<string>>();
  for (const file of parsedFiles) {
    for (const section of file.sections) {
      // Parser-generated section keys embed the file path, so only a
      // frontmatter id can be claimed by two files in the first place.
      const id = section.id;
      if (!id) continue;
      let files = claims.get(id);
      if (!files) {
        files = new Set();
        claims.set(id, files);
      }
      files.add(file.repoRelPath);
    }
  }

  const contested = [...claims].filter(([, files]) => files.size > 1).sort((a, b) => a[0].localeCompare(b[0]));

  const rewrite = db.transaction(() => {
    db.exec(`DELETE FROM contested_ids`);
    const insert = db.prepare(`INSERT INTO contested_ids (id, file_path, won) VALUES (?, ?, ?)`);
    for (const [id, files] of contested) {
      // The winner is whichever file the cache actually indexed — read it
      // back rather than re-deriving the LWW order.
      const owner = db.prepare(`SELECT file_path FROM vertices WHERE id = ?`).get(id) as
        | { file_path: string }
        | undefined;
      for (const path of [...files].sort()) {
        insert.run(id, path, owner?.file_path === path ? 1 : 0);
      }
    }
  });
  rewrite();

  return contested.length;
}

/** Remove every derived row keyed by a vertex id (not its inbound edges —
 * those belong to other files' frontmatter and dangle honestly). */
function deleteVertexRows(db: Database.Database, vertexId: string): void {
  db.prepare(`DELETE FROM chunks WHERE vertex_id = ?`).run(vertexId);
  db.prepare(`DELETE FROM fts WHERE vertex_id = ?`).run(vertexId);
  db.prepare(`DELETE FROM edges WHERE from_id = ?`).run(vertexId);
  db.prepare(`DELETE FROM vertices WHERE id = ?`).run(vertexId);
}

/**
 * FRICTION-009 sweep, cache edition: a `files` row under a scanned
 * prefix whose path is missing from the discovered set means the file
 * left the disk — drop its derived rows. Scoped to the prefixes this
 * run covered so `--path` runs never sweep outside their scope.
 */
function sweepGhostFiles(
  db: Database.Database,
  discoveredSet: Set<string>,
  scanPrefixes: readonly string[],
): { files: number; vertices: number } {
  if (scanPrefixes.length === 0) return { files: 0, vertices: 0 };

  const rows = db.prepare(`SELECT path FROM files`).all() as Array<{ path: string }>;
  let files = 0;
  let vertices = 0;

  const sweep = db.transaction(() => {
    for (const { path } of rows) {
      if (!scanPrefixes.some((prefix) => path.startsWith(prefix) || path === prefix)) continue;
      if (discoveredSet.has(path)) continue;

      const ids = db.prepare(`SELECT id FROM vertices WHERE file_path = ?`).all(path) as Array<{
        id: string;
      }>;
      for (const { id } of ids) {
        deleteVertexRows(db, id);
        vertices++;
      }
      db.prepare(`DELETE FROM files WHERE path = ?`).run(path);
      files++;
    }
  });
  sweep();

  return { files, vertices };
}

// ─── Embeddings ─────────────────────────────────────────────────────────────

/**
 * The cap and its rationale live in storage/embed-health.ts, beside the check
 * that reports what it costs. `embedRecipe` moved there too (FRICTION-035) so
 * `status` can name the current recipe without importing this module; both are
 * re-exported here because this is where they are *applied*, and where a reader
 * looking for the truncation expects to find them.
 */
export { MAX_EMBED_CHARS, embedRecipe };

/**
 * The one place the cap is applied. Its output IS the embedding function's
 * input, so `embedRecipe` (embed-health.ts) must name every knob that changes
 * what this emits — if you ever prepend, normalize, or otherwise reshape the
 * text here (cf. OBS-017), extend the recipe in the same commit or unchanged
 * records will silently serve stale vectors.
 */
function embedInput(content: string): string {
  return content.length > MAX_EMBED_CHARS ? content.slice(0, MAX_EMBED_CHARS) : content;
}

interface EmbeddingResolution {
  /** Per-section embedding BLOBs, aligned with the input order. */
  blobs: Array<Buffer | null>;
  embedded: number;
  reused: number;
}

async function resolveEmbeddings(
  store: EmbedStoreHandle,
  config: DocdogConfig,
  sections: ReadonlyArray<{ content: string; contentHash: string }>,
  embed: EmbedBatchFn,
): Promise<EmbeddingResolution> {
  // Not `config.embed.model` — the recipe, which names the truncation and the
  // dtype too (FRICTION-033). `meta.embed_model` still records the bare model,
  // because that check answers a different question ("did the model change?")
  // and its answer is what gets shown to a user.
  const recipe = embedRecipe(config.embed.model, MAX_EMBED_CHARS, config.embed.dtype);
  const blobs: Array<Buffer | null> = new Array(sections.length).fill(null);
  const misses: Array<{ index: number; text: string; hash: string }> = [];
  let reused = 0;

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    // No vector for an empty body (FRICTION-060): the model's answer to
    // nothing is one fixed vector, shared by every such record, which
    // `pairs` then ranks at cosine 1.000. A refusal, not a new input, so the
    // recipe does not change — a null chunk is what search and pairs
    // already skip.
    if (!hasEmbeddableBody(s.content)) continue;
    const hit = store.get(s.contentHash, recipe);
    if (hit) {
      blobs[i] = hit;
      reused++;
    } else {
      misses.push({ index: i, text: embedInput(s.content), hash: s.contentHash });
    }
  }

  let embedded = 0;
  if (misses.length > 0) {
    const vectors = await embed(config, misses.map((m) => m.text));
    const now = new Date().toISOString();
    for (let j = 0; j < misses.length; j++) {
      const vector = vectors[j];
      if (!vector) continue;
      const blob = Buffer.from(new Float32Array(vector).buffer);
      blobs[misses[j].index] = blob;
      // Union, not overwrite: a sibling worktree that raced us here wrote
      // the same vector, so first-writer-wins is free of consequence. That
      // holds only because the recipe is in the key — a sibling on a
      // different cap now writes a different row rather than winning the
      // race with a vector built by another function (FRICTION-033).
      store.put(misses[j].hash, recipe, blob, now);
      embedded++;
    }
  }

  return { blobs, embedded, reused };
}
