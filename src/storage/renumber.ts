/**
 * `docdog renumber <old> <new>` — the promotion primitive (PROPOSAL-031,
 * authorized by DISC-027).
 *
 * A host project that mints provisional ids (`DD-T168-01` on a task
 * branch, promoted to `DD-072` on trunk) needs exactly one mechanic from
 * docdog: rename an id and fix everything that pointed at it. Docdog
 * learns nothing about branches, tasks, or what makes an id provisional —
 * it renames what it is told to rename (DISC-027 §"division of labour").
 *
 * The split that runs through this module is certainty:
 *
 * | target                     | how                          | certainty |
 * |----------------------------|------------------------------|-----------|
 * | the record's own `id:`     | frontmatter surgery          | exact     |
 * | inbound edges elsewhere    | the cache's `edges.to_id`    | exact     |
 * | the file name              | opt-in, and only when derivable | exact  |
 * | prose mentions in bodies   | the suggest-edges scanner    | REPORTED  |
 *
 * The inbound half is the part docdog is uniquely able to get right:
 * `edges.to_id` is an indexed column and FRICTION-012's forward-edge-only
 * rule guarantees every reference to an id is a real row there, with no
 * stored inverses to chase. A hand-rolled `sed` can miss an edge; this
 * cannot.
 *
 * Prose is the part it cannot. An id is an exact token, so substituting
 * it is unambiguous in the ordinary case — but a slash-list (`OQ-18/19/21`)
 * names three ids in one token and renaming one sibling cannot be expressed
 * by substitution (OQ-46). So the planner reports every prose mention with
 * its location, rewrites the unambiguous ones only under `prose: true`, and
 * never touches a slash-list.
 *
 * Write discipline follows PROPOSAL-028: every patch is computed in memory
 * before any file is opened for writing. A file that will not parse is
 * discovered during planning, and a plan that cannot be applied whole is
 * refused — a broken file mid-run cannot leave the corpus half-renamed.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type Database from "better-sqlite3";
import type { DocdogConfig } from "../types/config.js";
import { parse as parseMarkdown } from "../markdown/index.js";
import { openCacheRead } from "./cache.js";
import { FrontmatterPatchError, retargetRelationships, setFrontmatterField } from "./frontmatter.js";
import { type CacheIndexerOptions, matchScanEntry, reindexCacheFile } from "./indexer.js";
import { expandMention, mentionMatcher } from "./suggest.js";
import { getVertexById } from "./vertices.js";
import { isDefaultParser, WriteError } from "./writes.js";

/** An inbound edge the rename rewrites — one `to_id` row in the cache. */
export interface InboundEdge {
  fromId: string;
  type: string;
  /** Repo-relative file whose `relationships:` block carries the edge. */
  file: string;
}

/** An inbound edge whose source file cannot be patched — reported, never guessed at. */
export interface UnpatchableSource extends InboundEdge {
  reason: string;
}

/** One id mention in body prose (or in a context string — same thing to the scanner). */
export interface ProseMention {
  file: string;
  /** 1-based line number in the file as the plan will leave it. */
  line: number;
  text: string;
  /** The token as written: `DD-070`, or `OQ-18/19/21` for a slash-list. */
  match: string;
  /**
   * True when the id is named only as part of a slash-list. Renaming one
   * sibling cannot be expressed by substituting the token, so these are
   * always left for a human (OQ-46).
   */
  ambiguous: boolean;
}

export interface RenumberPlan {
  oldId: string;
  newId: string;
  /** Repo-relative file holding the record being renumbered. */
  recordFile: string;
  /**
   * False in contested-loser mode: the cache's row for `oldId` belongs to
   * a *different* file, so the id — and every edge pointing at it — stays
   * with that record. Only this file's own id is rewritten.
   */
  ownsId: boolean;
  rename: { from: string; to: string } | null;
  /** Why no rename was planned, when one was asked for. */
  renameSkipped: string | null;
  edges: InboundEdge[];
  unpatchableSources: UnpatchableSource[];
  /**
   * Contested-loser mode only: inbound edges to `oldId` that are NOT
   * rewritten, because they resolve to the record that keeps the id.
   * Which citer meant which record is judgment (DP-001 Tier 3).
   */
  retainedEdges: InboundEdge[];
  /** Every mention found, rewritable and ambiguous alike. */
  mentions: ProseMention[];
  /** How many prose tokens this plan rewrites (0 unless `prose`). */
  proseRewrites: number;
  /** Final content per repo-relative file — computed before anything is opened for writing. */
  patches: Array<{ file: string; content: string }>;
}

export interface RenumberOptions {
  /** Rewrite unambiguous prose mentions too (default: report only). */
  prose?: boolean;
  /** Rename the file when its name begins with the old id's slug. */
  renameFile?: boolean;
  /**
   * Repo-relative file to renumber, when the id alone does not name it —
   * the losing side of a contested id has no cache row of its own, so it
   * is unaddressable any other way (PROPOSAL-031 §2).
   */
  file?: string;
}

export interface RenumberResult {
  plan: RenumberPlan;
  filesWritten: string[];
  renamed: { from: string; to: string } | null;
}

/**
 * Build the exact set of patches for a rename. Pure with respect to disk:
 * reads files, writes none.
 */
export function planRenumber(
  db: Database.Database,
  config: DocdogConfig,
  projectRoot: string,
  oldId: string,
  newId: string,
  opts: RenumberOptions = {},
): RenumberPlan {
  requireIdShape(oldId, "old id");
  requireIdShape(newId, "new id");
  if (oldId === newId) {
    throw new WriteError(`Old and new id are the same: ${oldId}`, "MISSING_REQUIRED");
  }
  if (getVertexById(db, newId)) {
    throw new WriteError(
      `A record with id "${newId}" already exists — pick a free id.`,
      "ID_CONFLICT",
    );
  }

  const owner = getVertexById(db, oldId);
  const recordFile = opts.file ? resolveNamedFile(projectRoot, opts.file, oldId) : null;
  if (!recordFile && !owner) {
    throw new WriteError(
      `Record not found: ${oldId} — index the corpus, or name the file with --file if two records claim the id.`,
      "NOT_FOUND",
    );
  }

  const file = recordFile ?? owner!.source_file;
  if (!isDefaultParser(config, file)) {
    const parser = matchScanEntry(config.scan_paths, file)?.parser ?? "default";
    throw new WriteError(
      `${file} is parsed by the "${parser}" parser (multi-record file) — its sections have no frontmatter id to rewrite. ` +
        "Edit the file directly, then run docdog index.",
      "UNSUPPORTED_PARSER",
    );
  }
  const ownsId = owner !== null && owner.source_file === file;

  // ── The exact half ───────────────────────────────────────────────────
  // Patches accumulate through the map, so a record citing itself gets both
  // its id and its own edge rewritten in the same content.
  const patched = new Map<string, string>();
  patched.set(file, setFrontmatterField(readFile(projectRoot, file), "id", newId));

  const inbound = ownsId ? readInboundEdges(db, oldId) : [];
  const edges: InboundEdge[] = [];
  const unpatchableSources: UnpatchableSource[] = [];

  for (const [sourceFile, rows] of groupByFile(inbound)) {
    if (!isDefaultParser(config, sourceFile)) {
      for (const row of rows) {
        unpatchableSources.push({ ...row, reason: "multi-record file — no relationships: block to patch" });
      }
      continue;
    }
    const before = patched.get(sourceFile) ?? readFile(projectRoot, sourceFile);
    try {
      const { content } = retargetRelationships(before, oldId, newId);
      patched.set(sourceFile, content);
      edges.push(...rows);
    } catch (err) {
      if (!(err instanceof FrontmatterPatchError)) throw err;
      for (const row of rows) unpatchableSources.push({ ...row, reason: err.message });
    }
  }

  // ── The reported half ────────────────────────────────────────────────
  // Scanned over the content as the exact half will leave it, so the `id:`
  // line and the edge targets — already rewritten — cannot be double-counted.
  // Whatever still names the old id is prose, wherever it sits.
  const scanFiles = ownsId ? corpusFiles(db, file) : [file];
  const mentions: ProseMention[] = [];
  let proseRewrites = 0;

  for (const scanned of scanFiles) {
    const before = patched.get(scanned) ?? readFile(projectRoot, scanned);
    const { content, found, rewritten } = scanProse(scanned, before, oldId, newId, opts.prose === true);
    mentions.push(...found);
    if (rewritten > 0) {
      patched.set(scanned, content);
      proseRewrites += rewritten;
    }
  }

  // ── The file name ────────────────────────────────────────────────────
  let rename: { from: string; to: string } | null = null;
  let renameSkipped: string | null = null;
  if (opts.renameFile) {
    const planned = planFileRename(projectRoot, file, oldId, newId);
    if ("to" in planned) rename = { from: file, to: planned.to };
    else renameSkipped = planned.skipped;
  }

  return {
    oldId,
    newId,
    recordFile: file,
    ownsId,
    rename,
    renameSkipped,
    edges,
    unpatchableSources,
    retainedEdges: ownsId ? [] : readInboundEdges(db, oldId),
    mentions,
    proseRewrites,
    patches: [...patched].map(([f, content]) => ({ file: f, content })),
  };
}

/**
 * Apply a plan: write every patched file, rename if planned, reindex what
 * changed. One write and one reindex per file (PROPOSAL-028's discipline);
 * nothing is opened for writing until every patch exists in memory, which
 * `planRenumber` already guaranteed.
 */
export async function applyRenumber(
  options: CacheIndexerOptions,
  plan: RenumberPlan,
): Promise<RenumberResult> {
  const { projectRoot } = options;
  const filesWritten: string[] = [];

  for (const { file, content } of plan.patches) {
    writeFileSync(join(projectRoot, file), content, "utf-8");
    filesWritten.push(file);
  }

  if (plan.rename) {
    renameSync(join(projectRoot, plan.rename.from), join(projectRoot, plan.rename.to));
  }

  // Reindex after every write lands: the record's old vertex row is swept
  // by its own file's reindex (its id left the file), and a rename sweeps
  // the vacated path the same way a deletion does.
  for (const file of filesWritten) {
    if (plan.rename && file === plan.rename.from) continue;
    await reindexCacheFile(options, file);
  }
  if (plan.rename) {
    await reindexCacheFile(options, plan.rename.from); // ghost sweep — the path is gone
    await reindexCacheFile(options, plan.rename.to);
  }

  return { plan, filesWritten, renamed: plan.rename };
}

/** Plan + apply, opening the cache read-only for the planning half. */
export async function renumberRecord(
  options: CacheIndexerOptions,
  oldId: string,
  newId: string,
  opts: RenumberOptions & { dryRun?: boolean } = {},
): Promise<RenumberResult> {
  const handle = openCacheRead(options.projectRoot, { filePath: options.cacheFilePath });
  let plan: RenumberPlan;
  try {
    plan = planRenumber(handle.db, options.config, options.projectRoot, oldId, newId, opts);
  } finally {
    handle.close();
  }
  if (opts.dryRun) return { plan, filesWritten: [], renamed: null };
  return applyRenumber(options, plan);
}

// ─── Contested ids ──────────────────────────────────────────────────────────

/** One id claimed by more than one file — the indexer's LWW warning, persisted. */
export interface ContestedId {
  id: string;
  /** The file whose row is in the cache (last indexed wins). */
  winner: string | null;
  /** The other claimants — their records are invisible to search, get and traverse. */
  losers: string[];
}

/**
 * Contested ids, as the last whole-corpus index run recorded them
 * (PROPOSAL-031 §2). The detection was always there; before this it lived
 * only in a warning line that scrolled past. Now it is state a reader can
 * query — through `docdog_status`, which is already the kernel's health
 * surface, rather than a ninth tool.
 *
 * Resolution stays out of code: which of two records deserves the id is
 * judgment (DP-001 Tier 3). The report names the contenders and the agent
 * runs `renumber --file <loser>` on the other.
 */
export function readContestedIds(db: Database.Database): ContestedId[] {
  const rows = db
    .prepare(`SELECT id, file_path, won FROM contested_ids ORDER BY id, file_path`)
    .all() as Array<{ id: string; file_path: string; won: number }>;

  const byId = new Map<string, ContestedId>();
  for (const row of rows) {
    let entry = byId.get(row.id);
    if (!entry) {
      entry = { id: row.id, winner: null, losers: [] };
      byId.set(row.id, entry);
    }
    if (row.won === 1) entry.winner = row.file_path;
    else entry.losers.push(row.file_path);
  }
  return [...byId.values()];
}

// ─── Internals ──────────────────────────────────────────────────────────────

/** Mechanical shape guard — an id is a token, not a sentence. */
function requireIdShape(id: string, label: string): void {
  if (!id || /\s/.test(id)) {
    throw new WriteError(`Invalid ${label}: "${id}" — an id is a single whitespace-free token.`, "MISSING_REQUIRED");
  }
}

function readFile(projectRoot: string, repoRelPath: string): string {
  return readFileSync(join(projectRoot, repoRelPath), "utf-8");
}

/** `--file` names the record directly; it must exist and actually claim the old id. */
function resolveNamedFile(projectRoot: string, file: string, oldId: string): string {
  const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");
  const absPath = join(projectRoot, normalized);
  if (!existsSync(absPath)) {
    throw new WriteError(`File not found: ${normalized}`, "NOT_FOUND");
  }
  const declared = parseMarkdown(readFileSync(absPath, "utf-8")).frontmatter.id;
  if (declared !== oldId) {
    throw new WriteError(
      `${normalized} declares id "${String(declared ?? "(none)")}", not "${oldId}" — --file must name the record being renumbered.`,
      "NOT_FOUND",
    );
  }
  return normalized;
}

function readInboundEdges(db: Database.Database, oldId: string): InboundEdge[] {
  return db
    .prepare(
      `SELECT e.from_id AS fromId, e.type AS type, v.file_path AS file
         FROM edges e JOIN vertices v ON v.id = e.from_id
        WHERE e.to_id = ?
        ORDER BY e.from_id, e.type`,
    )
    .all(oldId) as InboundEdge[];
}

function groupByFile(edges: InboundEdge[]): Map<string, InboundEdge[]> {
  const byFile = new Map<string, InboundEdge[]>();
  for (const edge of edges) {
    const bucket = byFile.get(edge.file);
    if (bucket) bucket.push(edge);
    else byFile.set(edge.file, [edge]);
  }
  return byFile;
}

/** Every indexed file, plus the record's own (which may not be indexed — a contested loser isn't). */
function corpusFiles(db: Database.Database, recordFile: string): string[] {
  const rows = db.prepare(`SELECT DISTINCT file_path FROM vertices ORDER BY file_path`).all() as Array<{
    file_path: string;
  }>;
  const files = new Set(rows.map((r) => r.file_path));
  files.add(recordFile);
  return [...files];
}

/**
 * Find (and optionally rewrite) prose mentions of `oldId`, line by line,
 * through the suggest-edges grammar. A slash-list is matched whole, so an
 * id named only as a sibling (`OQ-18/19/21` when renaming OQ-19) is found
 * by expansion and never by substitution — which is exactly why it can be
 * reported and cannot be rewritten.
 */
function scanProse(
  file: string,
  content: string,
  oldId: string,
  newId: string,
  rewrite: boolean,
): { content: string; found: ProseMention[]; rewritten: number } {
  const found: ProseMention[] = [];
  let rewritten = 0;
  const lines = content.split(/\r\n|\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hits: ProseMention[] = [];
    let rewritable = false;

    for (const match of line.matchAll(mentionMatcher())) {
      const token = match[0];
      if (!expandMention(token).includes(oldId)) continue;
      const ambiguous = token !== oldId;
      hits.push({ file, line: i + 1, text: line.trim(), match: token, ambiguous });
      if (!ambiguous) rewritable = true;
    }
    if (hits.length === 0) continue;

    if (rewritable && rewrite) {
      lines[i] = line.replace(mentionMatcher(), (token) => (token === oldId ? newId : token));
      rewritten += 1;
      // A slash-list can share a line with a rewritten mention. Report the
      // line as the plan will leave it, or the reader goes looking for text
      // that is no longer there.
      for (const hit of hits) hit.text = lines[i].trim();
    }
    found.push(...hits);
  }

  if (rewritten === 0) return { content, found, rewritten: 0 };
  return { content: lines.join(content.includes("\r\n") ? "\r\n" : "\n"), found, rewritten };
}

/**
 * A file name is renamed only when it *derives* from the id — `dd-070-*.md`
 * for DD-070. Anything else and docdog would be guessing at a naming
 * convention it does not own (DP-001), so it reports and leaves the name.
 */
function planFileRename(
  projectRoot: string,
  file: string,
  oldId: string,
  newId: string,
): { to: string } | { skipped: string } {
  const name = basename(file);
  const slug = oldId.toLowerCase();
  if (!name.toLowerCase().startsWith(slug)) {
    return { skipped: `${name} does not begin with "${slug}" — the name is not derived from the id, so it is left alone.` };
  }
  const dir = dirname(file);
  const renamed = newId.toLowerCase() + name.slice(slug.length);
  const to = dir === "." ? renamed : `${dir}/${renamed}`;
  if (existsSync(join(projectRoot, to))) {
    return { skipped: `${to} already exists — the file is left alone.` };
  }
  return { to };
}
