/**
 * File-first write paths for the kernel tools — P-023 §7 step 5
 * (write half). docdog_relate / docdog_create / docdog_update edit
 * markdown files (src/storage/frontmatter.ts) and then reindex that
 * one file; the cache indexer derives every row (DD-070 §2: `docdog
 * index` is the only writer of canonical-derived state; DD-043: edges
 * are born only in `relationships:` frontmatter).
 *
 * Placement rule for create (flagged in the session-5 handoff): the
 * caller supplies an explicit repo-relative path. Where a record lives
 * is an organizational decision, so it stays with the agent (DP-001
 * Tier 3 stays out of code); the code validates mechanically — under a
 * configured scan path, default parser, no existing file, no id
 * collision.
 *
 * All three writes require an existing cache (openCacheRead). A
 * missing cache means the project was never indexed; letting a write
 * seed a one-file cache would make later reads silently partial, so
 * the guard errs actionable: run `docdog index` first.
 *
 * Writes are only expressible against default-parsed files (one file =
 * one record with a real frontmatter block). Split/table/script-parsed
 * sections synthesize their frontmatter from headings — there is no
 * per-section `relationships:` home to patch — so those records refuse
 * with a pointer at editing the file directly.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DocdogConfig } from "../types/config.js";
import { isKnownVertexCollection } from "../config/collections.js";
import { openCacheRead, type CacheHandle } from "./cache.js";
import {
  matchScanEntry,
  reindexCacheFile,
  type CacheIndexerOptions,
  type CacheIndexStats,
} from "./indexer.js";
import { getVertexById, type CacheVertex } from "./vertices.js";
import { loadRegistryFromCache } from "./relations.js";
import { extractRelationships } from "../engine/relationships/extract.js";
import { buildVisibilityIndex, crossVisibilityLeak, isCrossVisibilityLeak } from "./visibility.js";
import {
  appendRelationship,
  composeRecordFile,
  removeFrontmatterField,
  replaceBody,
  setFrontmatterField,
  type FrontmatterScalar,
} from "./frontmatter.js";

export class WriteError extends Error {
  constructor(
    message: string,
    public code:
      | "MISSING_REQUIRED"
      | "NOT_FOUND"
      | "UNSUPPORTED_PARSER"
      | "INVALID_PATH"
      | "FILE_EXISTS"
      | "ID_CONFLICT"
      | "SYSTEM_COLLECTION"
      | "UNKNOWN_COLLECTION"
      | "DUPLICATE_EDGE"
      | "RESERVED_FIELD"
      | "INVALID_FIELD"
      | "CROSS_VISIBILITY",
  ) {
    super(message);
    this.name = "WriteError";
  }
}

// ─── relate ─────────────────────────────────────────────────────────────────

export interface RelateInput {
  fromId: string;
  toId: string;
  type: string;
  context: string;
  anchorText?: string | null;
}

/** Per-call overrides shared by both relate paths. */
export interface RelateWriteOptions {
  /**
   * Write an edge that crosses from in-clone to out-of-clone anyway
   * (PROPOSAL-047). Per-call and visible — DP-001 tier 2. There is
   * deliberately no batch-wide form: `--accept-all` is the analogue that
   * must never exist, and a leak waived once is not a leak waived always.
   */
  allowCrossVisibility?: boolean;
}

export interface RelateResult {
  filePath: string;
  /** False when the target id has no cache row — the edge dangles honestly. */
  targetKnown: boolean;
  /** False when the type has no relation-concept entry in the registry. */
  typeKnown: boolean;
  stats: CacheIndexStats;
}

/**
 * Record an outbound edge by patching the source record's
 * `relationships:` block and reindexing its file. Never writes an edge
 * row directly — the indexer derives it from the frontmatter.
 */
export async function relateFileFirst(
  options: CacheIndexerOptions,
  input: RelateInput,
  writeOpts: RelateWriteOptions = {},
): Promise<RelateResult> {
  const { from, target, typeKnown } = withCacheRead(options, (handle) => {
    const from = requireVertex(handle, input.fromId);
    return {
      from,
      // The vertex, not just its existence: the cross-visibility guard needs
      // the target's file to ask git about it.
      target: getVertexById(handle.db, input.toId),
      typeKnown: loadRegistryFromCache(handle.db).lookup(input.type).known,
    };
  });
  const targetKnown = target !== null;

  // A (type, target) pair already in the block would only add a
  // duplicate line — the cache edge PK is (from, to, type) anyway.
  const existing = extractRelationships(from.frontmatter).tuples;
  if (existing.some((t) => t.type === input.type && t.target_id === input.toId)) {
    throw new WriteError(
      `${input.fromId} already has a "${input.type}" relationship to ${input.toId} — edit ${from.source_file} to change its context.`,
      "DUPLICATE_EDGE",
    );
  }

  requireDefaultParser(options.config, from.source_file);

  // PROPOSAL-047. Refused here rather than only warned about at index time,
  // because this is the moment the leak is created: a warning that arrives
  // after the file is written and committed arrived too late.
  //
  // Skipped when the target has no cache row — that edge dangles honestly
  // and is reported under its own name, and there is no file to classify.
  if (!writeOpts.allowCrossVisibility && target !== null) {
    if (crossVisibilityLeak(options.projectRoot, from.source_file, target.source_file)) {
      throw new WriteError(
        `${input.fromId} (${from.source_file}) is in this repository and ${input.toId} ` +
          `(${target.source_file}) will not be in a clone of it — writing this edge publishes ` +
          `${input.toId}'s id and leaves every clone a pointer to a record it does not have. ` +
          `Record the relationship on ${input.toId} instead: traverse reads inbound edges, so ` +
          `nothing is lost here and nothing leaks there.`,
        "CROSS_VISIBILITY",
      );
    }
  }

  const absPath = join(options.projectRoot, from.source_file);
  const raw = readFileSync(absPath, "utf-8");
  const patched = appendRelationship(raw, {
    type: input.type,
    target: input.toId,
    context: input.context,
    anchor_text: input.anchorText ?? null,
  });
  writeFileSync(absPath, patched, "utf-8");

  const stats = await reindexCacheFile(options, from.source_file);
  return { filePath: from.source_file, targetKnown, typeKnown, stats };
}

// ─── relate (batch) ─────────────────────────────────────────────────────────

/** Why a row in a batch was not applied (PROPOSAL-028 §2 guard table). */
export type RelateSkipReason =
  | "source_not_found"
  | "source_not_recordable"
  | "source_unpatchable"
  | "already_declared"
  | "duplicate_row"
  | "empty_context"
  | "cross_visibility";

export interface RelateOutcome {
  edge: RelateInput;
  /** True when the edge was written — or, under dryRun, would have been. */
  applied: boolean;
  skipReason: RelateSkipReason | null;
  /** Extra detail for skips that carry one (the frontmatter error, say). */
  detail: string | null;
  /** Repo-relative source file, or null when the source never resolved. */
  sourceFile: string | null;
  /** False when the target id has no cache row — the edge dangles honestly. */
  targetKnown: boolean;
  /** False when the type has no relation-concept entry in the registry. */
  typeKnown: boolean;
}

export interface RelateManyOptions {
  /** Apply rows whose context is empty (default: skip them — OBS-011). */
  allowEmptyContext?: boolean;
  /** Classify and report, touch no file (dry run). */
  dryRun?: boolean;
  /** Write edges that cross from in-clone to out-of-clone anyway. */
  allowCrossVisibility?: boolean;
}

export interface RelateManyResult {
  outcomes: RelateOutcome[];
  /** Repo-relative paths written (empty under dryRun). */
  filesWritten: string[];
  edgesApplied: number;
}

/**
 * Apply a batch of reviewed edges — PROPOSAL-028's applier half.
 *
 * The unit of work is the *file*, not the edge: rows group by source,
 * each source file is read once, gets all of its accepted relationships
 * appended, and is written and reindexed once. Every hand-scripted drain
 * so far (OBS-003, OBS-011, the orchestrator's) called the single-edge
 * path per edge and paid one full reindex each — 271 reindexes for 92
 * files, in OBS-011's case.
 *
 * Guards never abort the run: a bad row is skipped and reported, because
 * a 3,947-candidate backlog drained in batches must not lose 3,946 good
 * edges to one stale id. Malformed *input* is the caller's problem and
 * dies before this is called (see storage/accept.ts).
 *
 * Sibling of relateFileFirst, not a rewrite of it: docdog_relate's error
 * codes are a shipped MCP contract, and turning its refusals into skips
 * would change them. They share the guards below, not the control flow.
 */
export async function relateManyFileFirst(
  options: CacheIndexerOptions,
  inputs: RelateInput[],
  opts: RelateManyOptions = {},
): Promise<RelateManyResult> {
  // One cache read for the whole batch — 3,947 rows must not become
  // 3,947 cache opens.
  const { sources, targets, typeKnown } = withCacheRead(options, (handle) => {
    const registry = loadRegistryFromCache(handle.db);
    const sources = new Map<string, CacheVertex | null>();
    // The vertex, not just its existence: the cross-visibility guard needs
    // the target's file to ask git about it.
    const targets = new Map<string, CacheVertex | null>();
    const typeKnown = new Map<string, boolean>();
    for (const edge of inputs) {
      if (!sources.has(edge.fromId)) {
        sources.set(edge.fromId, getVertexById(handle.db, edge.fromId));
      }
      if (!targets.has(edge.toId)) {
        targets.set(edge.toId, getVertexById(handle.db, edge.toId));
      }
      if (!typeKnown.has(edge.type)) {
        typeKnown.set(edge.type, registry.lookup(edge.type).known);
      }
    }
    return { sources, targets, typeKnown };
  });

  // One visibility index for the whole batch: the git probes are per-run,
  // not per-edge, so a 3,947-row drain costs the same three calls a single
  // one does. Skipped entirely under the override — the only case where the
  // answer cannot change anything.
  const visibility = opts.allowCrossVisibility
    ? null
    : buildVisibilityIndex(options.projectRoot, [
        ...new Set(
          [...sources.values(), ...targets.values()]
            .filter((v): v is CacheVertex => v !== null)
            .map((v) => v.source_file),
        ),
      ]);

  // Pass 1 — per-row guards that need no file read.
  const outcomes: RelateOutcome[] = [];
  const candidatesByFile = new Map<string, RelateOutcome[]>();
  const onDisk = new Map<string, Set<string>>();
  const added = new Map<string, Set<string>>();

  for (const edge of inputs) {
    const source = sources.get(edge.fromId) ?? null;
    const outcome: RelateOutcome = {
      edge,
      applied: false,
      skipReason: null,
      detail: null,
      sourceFile: source?.source_file ?? null,
      targetKnown: (targets.get(edge.toId) ?? null) !== null,
      typeKnown: typeKnown.get(edge.type) ?? false,
    };
    outcomes.push(outcome);

    if (!source) {
      outcome.skipReason = "source_not_found";
      continue;
    }
    if (!isDefaultParser(options.config, source.source_file)) {
      outcome.skipReason = "source_not_recordable";
      continue;
    }
    if (!opts.allowEmptyContext && edge.context.trim() === "") {
      outcome.skipReason = "empty_context";
      continue;
    }

    // Declared-pair sets are seeded from the source's own frontmatter and
    // grown as the batch appends, so a row already on disk and a row
    // repeated inside the file both skip — which is what makes re-running
    // the same accept file a no-op.
    let declared = onDisk.get(edge.fromId);
    if (!declared) {
      declared = new Set(
        extractRelationships(source.frontmatter).tuples.map((t) => declaredKey(t.type, t.target_id)),
      );
      onDisk.set(edge.fromId, declared);
    }
    let staged = added.get(edge.fromId);
    if (!staged) {
      staged = new Set<string>();
      added.set(edge.fromId, staged);
    }
    const key = declaredKey(edge.type, edge.toId);
    if (declared.has(key)) {
      outcome.skipReason = "already_declared";
      continue;
    }
    if (staged.has(key)) {
      outcome.skipReason = "duplicate_row";
      continue;
    }

    // PROPOSAL-047, and it sits AFTER already_declared on purpose: an edge
    // already on disk is not being created by this run, so claiming it was
    // skipped for leaking would change what re-running an accept file means
    // (PROPOSAL-028's idempotency). The standing defect belongs to the
    // index-time check, which reports it every run.
    const target = targets.get(edge.toId) ?? null;
    if (
      visibility?.available &&
      target !== null &&
      isCrossVisibilityLeak(visibility.of(source.source_file), visibility.of(target.source_file))
    ) {
      outcome.skipReason = "cross_visibility";
      outcome.detail =
        `${target.source_file} will not be in a clone of this repository — ` +
        `record the relationship on ${edge.toId} instead.`;
      continue;
    }

    staged.add(key);

    outcome.applied = true;
    const file = source.source_file;
    const bucket = candidatesByFile.get(file);
    if (bucket) bucket.push(outcome);
    else candidatesByFile.set(file, [outcome]);
  }

  // Pass 2 — patch each file in memory. A source whose frontmatter won't
  // parse (indexed body-only, per FRICTION-019) fails here, and takes only
  // its own rows down: nothing is on disk yet.
  const patched = new Map<string, string>();
  for (const [file, rows] of candidatesByFile) {
    let raw: string;
    try {
      raw = readFileSync(join(options.projectRoot, file), "utf-8");
      for (const row of rows) {
        raw = appendRelationship(raw, {
          type: row.edge.type,
          target: row.edge.toId,
          context: row.edge.context,
          anchor_text: row.edge.anchorText ?? null,
        });
      }
    } catch (err) {
      for (const row of rows) {
        row.applied = false;
        row.skipReason = "source_unpatchable";
        row.detail = err instanceof Error ? err.message : String(err);
      }
      continue;
    }
    patched.set(file, raw);
  }

  // Pass 3 — write. One write and one reindex per file.
  const filesWritten: string[] = [];
  if (!opts.dryRun) {
    for (const [file, contents] of patched) {
      writeFileSync(join(options.projectRoot, file), contents, "utf-8");
      filesWritten.push(file);
      await reindexCacheFile(options, file);
    }
  }

  return {
    outcomes,
    filesWritten,
    edgesApplied: outcomes.filter((o) => o.applied).length,
  };
}

function declaredKey(type: string, targetId: string): string {
  return `${type} ${targetId}`;
}

// ─── create ─────────────────────────────────────────────────────────────────

export interface CreateRecordInput {
  /** Repo-relative target path — the caller's placement decision. */
  path: string;
  collection: string;
  title: string;
  content: string;
  id?: string | null;
  description?: string | null;
  status?: string | null;
  scope?: string | null;
  /** Extra frontmatter; `relationships:` entries become edges at reindex. */
  frontmatter?: Record<string, unknown>;
}

export interface CreateRecordResult {
  filePath: string;
  id: string | null;
  collection: string;
  title: string;
  stats: CacheIndexStats;
}

/** Create a record as a new markdown file, then reindex it. */
export async function createRecordFile(
  options: CacheIndexerOptions,
  input: CreateRecordInput,
): Promise<CreateRecordResult> {
  const { config, projectRoot } = options;
  if (!input.path || !input.collection || !input.title || typeof input.content !== "string") {
    throw new WriteError(
      "Missing required fields: path, collection, title, content",
      "MISSING_REQUIRED",
    );
  }
  if (input.collection.startsWith("dd_")) {
    throw new WriteError(
      `Cannot create in system collection: ${input.collection}`,
      "SYSTEM_COLLECTION",
    );
  }
  if (!isKnownVertexCollection(input.collection, config)) {
    throw new WriteError(
      `Unknown collection: ${input.collection}. Declare it in vertex_collections config.`,
      "UNKNOWN_COLLECTION",
    );
  }

  const repoRelPath = normalizeRecordPath(input.path);
  if (!matchScanEntry(config.scan_paths, repoRelPath)) {
    const paths = config.scan_paths
      .map((p) => (typeof p === "string" ? p : p.path))
      .join(", ");
    throw new WriteError(
      `path is outside every configured scan path (${paths}) — the file would never be indexed: ${repoRelPath}`,
      "INVALID_PATH",
    );
  }
  requireDefaultParser(config, repoRelPath);
  const absPath = join(projectRoot, repoRelPath);
  if (existsSync(absPath)) {
    throw new WriteError(`File already exists: ${repoRelPath}`, "FILE_EXISTS");
  }

  withCacheRead(options, (handle) => {
    if (input.id && getVertexById(handle.db, input.id)) {
      throw new WriteError(`A record with id "${input.id}" already exists.`, "ID_CONFLICT");
    }
  });

  const extra = { ...(input.frontmatter ?? {}) };
  const relationships = extra.relationships;
  delete extra.relationships;
  for (const consumed of ["id", "title", "collection", "status", "scope", "description"]) {
    delete extra[consumed];
  }

  // Deterministic key order; fields at their read-time defaults are
  // simply not supplied by the caller and stay off disk.
  const fm: Record<string, unknown> = {};
  if (input.id) fm.id = input.id;
  fm.title = input.title;
  fm.collection = input.collection;
  const status = input.status ?? (input.frontmatter?.status as string | undefined);
  if (status) fm.status = status;
  const scope = input.scope ?? (input.frontmatter?.scope as string | undefined);
  if (scope) fm.scope = scope;
  const description = input.description ?? (input.frontmatter?.description as string | undefined);
  if (description) fm.description = description;
  Object.assign(fm, extra);
  if (relationships !== undefined) fm.relationships = relationships;

  writeFileSync(absPath, composeRecordFile(fm, input.content), "utf-8");

  const stats = await reindexCacheFile(options, repoRelPath);
  return {
    filePath: repoRelPath,
    id: input.id ?? null,
    collection: input.collection,
    title: input.title,
    stats,
  };
}

// ─── update ─────────────────────────────────────────────────────────────────

export interface UpdateRecordInput {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  scope?: string;
  content?: string;
  /**
   * Generic frontmatter patch (PROPOSAL-027): set any top-level field
   * to a scalar or flat scalar list; `null` deletes the key. Reserved
   * keys (id, collection, relationships) and fields with dedicated
   * params above (title, description, status, scope) refuse.
   */
  fields?: Record<string, FrontmatterScalar | FrontmatterScalar[] | null>;
}

export interface UpdateRecordResult {
  filePath: string;
  updatedFields: string[];
  stats: CacheIndexStats | null;
}

/** Update a record by patching its file, then reindex it. */
export async function updateRecordFile(
  options: CacheIndexerOptions,
  input: UpdateRecordInput,
): Promise<UpdateRecordResult> {
  if (!input.id) {
    throw new WriteError("Missing required field: id", "MISSING_REQUIRED");
  }
  const vertex = withCacheRead(options, (handle) => requireVertex(handle, input.id));
  requireDefaultParser(options.config, vertex.source_file);

  const absPath = join(options.projectRoot, vertex.source_file);
  let raw = readFileSync(absPath, "utf-8");
  const updatedFields: string[] = [];

  for (const key of ["title", "description", "status", "scope"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    raw = setFrontmatterField(raw, key, value);
    updatedFields.push(key);
  }
  // Generic patch: validation throws before anything reaches disk, so
  // a bad key aborts the whole update (all-or-nothing).
  for (const [key, value] of Object.entries(input.fields ?? {})) {
    requirePatchableField(key);
    const before = raw;
    if (value === null) {
      raw = removeFrontmatterField(raw, key);
    } else {
      requireScalarValue(key, value);
      raw = setFrontmatterField(raw, key, value);
    }
    // Deleting an absent key (or re-setting an equal value) changes
    // nothing — report only what actually changed.
    if (raw !== before) updatedFields.push(key);
  }
  if (input.content !== undefined) {
    raw = replaceBody(raw, input.content);
    updatedFields.push("content");
  }

  if (updatedFields.length === 0) {
    return { filePath: vertex.source_file, updatedFields, stats: null };
  }

  writeFileSync(absPath, raw, "utf-8");
  const stats = await reindexCacheFile(options, vertex.source_file);
  return { filePath: vertex.source_file, updatedFields, stats };
}

/** PROPOSAL-027 §2: keys the generic `fields` patch refuses, with why. */
const RESERVED_FIELDS = new Map<string, string>([
  ["id", "record identity is immutable through update"],
  ["collection", "record identity is immutable through update"],
  ["relationships", "edges go through docdog_relate"],
  ["title", 'use the dedicated "title" parameter'],
  ["description", 'use the dedicated "description" parameter'],
  ["status", 'use the dedicated "status" parameter'],
  ["scope", 'use the dedicated "scope" parameter'],
]);

/** Same identifier shape search's `where` accepts — and the only key
 * shape `findTopLevelKey`'s unquoted `key:` line matching can find. */
const FIELD_KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function requirePatchableField(key: string): void {
  const reason = RESERVED_FIELDS.get(key);
  if (reason) {
    throw new WriteError(`Cannot patch "${key}" via fields — ${reason}.`, "RESERVED_FIELD");
  }
  if (!FIELD_KEY_RE.test(key)) {
    throw new WriteError(
      `Invalid field key "${key}" — top-level frontmatter identifiers only ([A-Za-z_][A-Za-z0-9_-]*).`,
      "INVALID_FIELD",
    );
  }
}

function isFrontmatterScalar(value: unknown): value is FrontmatterScalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function requireScalarValue(key: string, value: unknown): void {
  const ok = isFrontmatterScalar(value) || (Array.isArray(value) && value.every(isFrontmatterScalar));
  if (!ok) {
    throw new WriteError(
      `Invalid value for field "${key}" — scalars or flat scalar lists only; nested objects are not supported.`,
      "INVALID_FIELD",
    );
  }
}

// ─── Shared guards ──────────────────────────────────────────────────────────

function withCacheRead<T>(options: CacheIndexerOptions, fn: (handle: CacheHandle) => T): T {
  const handle = openCacheRead(options.projectRoot, { filePath: options.cacheFilePath });
  try {
    return fn(handle);
  } finally {
    handle.close();
  }
}

function requireVertex(handle: CacheHandle, id: string): CacheVertex {
  const vertex = getVertexById(handle.db, id);
  if (!vertex) {
    throw new WriteError(`Record not found: ${id}`, "NOT_FOUND");
  }
  return vertex;
}

/**
 * The record's file must resolve to the default parser (one file = one
 * record). A path outside every scan entry resolves to the default
 * parser too — for relate/update that only happens when scan_paths
 * changed after indexing, and the single-file reindex still handles it;
 * create rejects such paths outright before calling this.
 */
function requireDefaultParser(config: DocdogConfig, repoRelPath: string): void {
  if (isDefaultParser(config, repoRelPath)) return;
  const parser = matchScanEntry(config.scan_paths, repoRelPath)?.parser ?? "default";
  throw new WriteError(
    `${repoRelPath} is parsed by the "${parser}" parser (multi-record file) — ` +
      `records there have no per-section frontmatter to patch. Edit the file directly, then run docdog index.`,
    "UNSUPPORTED_PARSER",
  );
}

/** The same resolution, as a predicate — batch writes skip such rows
 * rather than refusing the whole run (PROPOSAL-028). */
export function isDefaultParser(config: DocdogConfig, repoRelPath: string): boolean {
  const entry = matchScanEntry(config.scan_paths, repoRelPath);
  return (entry?.parser ?? "default") === "default";
}

function normalizeRecordPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new WriteError(`path must be repo-relative, got: ${path}`, "INVALID_PATH");
  }
  if (normalized.split("/").some((seg) => seg === "..")) {
    throw new WriteError(`path must not traverse outside the repo: ${path}`, "INVALID_PATH");
  }
  if (!normalized.endsWith(".md")) {
    throw new WriteError(`path must end in .md, got: ${path}`, "INVALID_PATH");
  }
  return normalized;
}
