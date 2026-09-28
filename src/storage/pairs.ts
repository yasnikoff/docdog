/**
 * Similar-pair nomination — PROPOSAL-049's candidate half.
 *
 * OBS-029 found that the high-cosine live pairs with no settling edge are
 * where stale records sit: a newer record changed part of an older one and
 * said nothing. This module is that scratch script made repeatable, plus the
 * one mechanical saving OBS-030 measured as the biggest cost lever for
 * whatever judges the pairs: the most similar passage of each side.
 *
 * Pipeline, every step tier 1 or a printed tier-2 default (DP-001):
 * live records (status filter) → pairwise max-cosine over the STORED record
 * vectors → cosine ≥ threshold → minus pairs joined by a settling edge in
 * either direction → marked (never dropped) by the verdict ledger → sorted.
 *
 * Records are the only nomination unit. A paragraph-level nominator was built
 * and lost (OBS-030) — the fourth measurement on this corpus where finer
 * vectors lose to the whole-record centroid. Paragraphs appear here only as
 * PASSAGES, embedded per run, never stored and never a result (DP-004).
 *
 * Nothing in this module judges. Which pair is a defect is tier 3 and arrives
 * from outside through `--accept-from` (storage/pairs-accept.ts).
 */
import type Database from "better-sqlite3";
import type { DocdogConfig } from "../types/config.js";
import type { EmbedBatchFn } from "./indexer.js";
import { MAX_EMBED_CHARS } from "./embed-health.js";
import { listRecords } from "./search.js";
import { loadStatusVocabulary } from "./status-vocabulary.js";
import { pairKey, verdictIndex, type PairVerdict } from "./pair-verdicts.js";

/** Visible default (tier 2): the edges that mean "this overlap is accounted
 * for". A `references` edge does not settle — DD-068 referenced the right
 * records and still carried a stale claim. Overridden by `pairs.edges.settle`. */
export const DEFAULT_SETTLE_TYPES: readonly string[] = ["supersedes", "amends"];

/**
 * The edges each step reads, resolved from `pairs.edges` (config.ts
 * PairsEdgesConfig). Three steps, three sets, because they answer three
 * different questions: is this pair accounted for (settle), what should the
 * judge see beside it (show), has the defect recorded against it been fixed
 * (close). They default to agreeing, and nothing requires them to.
 */
/** How a pair inside one file's structure is treated (FRICTION-062). */
export type WithinFile = "settle" | "offer";

/** Visible default (tier 2). A multi-record file's records are written
 * together on purpose, and an edge its head states is stated for the whole
 * entry; offering those pairs asks a judge to re-read the file's structure. */
export const DEFAULT_WITHIN_FILE: WithinFile = "settle";

export interface PairEdgeSteps {
  settle: string[];
  /** Null = every edge. */
  show: string[] | null;
  close: string[];
  /** `pairs.within_file` (FRICTION-062): whether the file's own structure
   * settles a pair. Default "settle". */
  withinFile: WithinFile;
  /** Which sets someone wrote in config. A typed name nothing registers is
   * refused; a DEFAULT is narrowed to what the corpus registers instead,
   * because nobody typed it — `amends` ships with no project but this one.
   * `show` needs no flag: its default names nothing. `close` inherits
   * `settle`'s when it defaults to it. */
  typed: { settle: boolean; show: boolean; close: boolean };
}

/** Resolve `pairs.edges`. A malformed key is refused by name rather than
 * guessed around; relation NAMES are checked against the registry by
 * checkPairEdges, which needs the cache. */
export function resolvePairEdges(config: DocdogConfig): PairEdgeSteps {
  // The level above is checked too: `pairs: { settle: [...] }` with the
  // `edges:` level left out would otherwise run on the defaults in silence.
  const pairs: unknown = config.pairs;
  if (pairs !== undefined && pairs !== null) {
    if (typeof pairs !== "object" || Array.isArray(pairs)) {
      throw new PairsError("pairs must be a mapping with edges and within_file keys", "INVALID_CONFIG");
    }
    for (const key of Object.keys(pairs)) {
      if (key !== "edges" && key !== "within_file") {
        throw new PairsError(
          `pairs.${key} is not a key — the edge sets live under pairs.edges (settle, show, close); the other key is within_file`,
          "INVALID_CONFIG",
        );
      }
    }
  }
  const rawWithin: unknown = config.pairs?.within_file;
  if (rawWithin !== undefined && rawWithin !== "settle" && rawWithin !== "offer") {
    throw new PairsError(`pairs.within_file must be settle or offer, got ${JSON.stringify(rawWithin)}`, "INVALID_CONFIG");
  }
  const withinFile: WithinFile = (rawWithin as WithinFile | undefined) ?? DEFAULT_WITHIN_FILE;
  const raw: unknown = config.pairs?.edges;
  if (raw !== undefined && (raw === null || typeof raw !== "object" || Array.isArray(raw))) {
    throw new PairsError("pairs.edges must be a mapping with settle, show and close keys", "INVALID_CONFIG");
  }
  const edges = (raw ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(edges)) {
    if (key !== "settle" && key !== "show" && key !== "close") {
      throw new PairsError(`pairs.edges.${key} is not a key — settle, show or close`, "INVALID_CONFIG");
    }
  }
  const list = (key: string, value: unknown): string[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((t) => typeof t !== "string" || t.trim() === "")) {
      throw new PairsError(
        `pairs.edges.${key} must be a list of relation type names${key === "show" ? ", or all" : ""}`,
        "INVALID_CONFIG",
      );
    }
    return [...new Set(value.map((t: string) => t.trim()))];
  };
  const typedSettle = list("settle", edges.settle);
  const settle = typedSettle ?? [...DEFAULT_SETTLE_TYPES];
  const show = edges.show === "all" ? null : (list("show", edges.show) ?? null);
  const typedClose = list("close", edges.close);
  const close = typedClose ?? [...settle];
  return {
    settle,
    show,
    close,
    withinFile,
    typed: {
      settle: typedSettle !== undefined,
      show: show !== null,
      close: typedClose !== undefined || typedSettle !== undefined,
    },
  };
}

/**
 * Check the edge sets against the registry and return the sets to run with.
 * A name someone TYPED that nothing registers is refused, naming the step: it
 * matches no edge, so it fails quietly in a different direction per step —
 * settle offers pairs it meant to hide, close never closes. A DEFAULT is
 * narrowed to the registered names instead, as the default status exclusion
 * is (nominatePairs), and the narrowed set is what every surface prints.
 */
export function checkPairEdges(steps: PairEdgeSteps, known: ReadonlySet<string>): PairEdgeSteps {
  const step = (key: "settle" | "show" | "close", types: string[]): string[] => {
    const unknown = types.filter((t) => !known.has(t));
    if (unknown.length === 0) return types;
    if (!steps.typed[key]) return types.filter((t) => known.has(t));
    throw new PairsError(
      `pairs.edges.${key} names relation type${unknown.length === 1 ? "" : "s"} no concept record registers: ${unknown.join(", ")}`,
      "UNKNOWN_RELATION",
    );
  };
  return {
    settle: step("settle", steps.settle),
    show: steps.show ? step("show", steps.show) : null,
    close: step("close", steps.close),
    withinFile: steps.withinFile,
    typed: steps.typed,
  };
}

/** What a caller is told to do about an INVALID_CONFIG or UNKNOWN_RELATION. */
export const PAIR_EDGES_HINT =
  "Fix pairs.edges in .docdog/config.yaml, or register the relation with a concept record in .docdog/concepts/.";

/** The three sets as one line every surface prints. */
export function describePairEdges(steps: Pick<PairEdgeSteps, "settle" | "show" | "close">): string {
  const names = (t: readonly string[]): string => (t.length > 0 ? t.join(", ") : "(none)");
  return `settle: ${names(steps.settle)}; show: ${steps.show ? names(steps.show) : "all"}; close: ${names(steps.close)} (pairs.edges)`;
}

/** Visible default (tier 2). Cosine is compressed on this corpus (OBS-029:
 * p99 0.802), so this admits roughly the top percent of live pairs. */
export const DEFAULT_THRESHOLD = 0.8;

/** Visible default (tier 2): statuses whose disagreement with a newer record
 * is the lifecycle working, not a defect. */
export const DEFAULT_EXCLUDE_STATUSES: readonly string[] = [
  "superseded",
  "deprecated",
  "resolved",
  "archived",
];

export interface PairSide {
  id: string;
  title: string;
  collection: string;
  status: string;
  source_file: string;
  /** `vertices.content_hash` — the key the verdict ledger compares. */
  hash: string;
  /** True when the body is longer than the embed cap, so the record vector
   * never saw its tail (OBS-024). Routing data for the judge. */
  past_cap: boolean;
}

export interface DeclaredEdge {
  from: string;
  to: string;
  type: string;
}

export interface VerdictMark {
  verdict: PairVerdict;
  /** True when either body changed since the verdict was applied: the pair is
   * offered again, carrying the old verdict. */
  stale: boolean;
}

export interface PairCandidate {
  a: PairSide;
  b: PairSide;
  cosine: number;
  /** Non-settling edges between the pair. A `references` edge is shown to the
   * judge, never treated as an answer. */
  declared: DeclaredEdge[];
  /** Set when the ledger holds a verdict for this pair. */
  judged: VerdictMark | null;
  /** The most similar passage of each side, with one block of context either
   * side. Attached only on the surfaces that emit it (`attachPassages`). */
  passages?: { a: string; b: string };
}

export interface NominateOptions {
  collections?: string[];
  status?: string[];
  /** Undefined = the default exclusion list; [] = exclude nothing. */
  excludeStatus?: string[];
  threshold?: number;
  /** Restrict to pairs containing this id (the write-time use). */
  id?: string;
  /** Edges that remove a pair (default DEFAULT_SETTLE_TYPES). */
  settleTypes?: readonly string[];
  /** Edges listed beside an offered pair; null or undefined = all. */
  showTypes?: readonly string[] | null;
  /** Edges that close a defect. Not read by nomination — carried so the
   * settings every surface prints name all three sets. Default: settle. */
  closeTypes?: readonly string[];
  /** Default DEFAULT_WITHIN_FILE. */
  withinFile?: WithinFile;
  verdicts?: readonly PairVerdict[];
}

export interface NominateResult {
  candidates: PairCandidate[];
  /** What actually ran, so every surface can print it (tier 2 must be visible). */
  settings: {
    threshold: number;
    status: string[] | null;
    excludeStatus: string[];
    collections: string[] | null;
    settleTypes: string[];
    showTypes: string[] | null;
    closeTypes: string[];
    withinFile: WithinFile;
    id: string | null;
  };
  /** Records in the live pool that carry a vector. */
  pool: number;
  /** Pairs over the threshold that a settling edge removed. */
  settled: number;
  /** Pairs over the threshold that the file's own structure removed
   * (`within_file: settle`); always 0 under `offer`. */
  settledWithinFile: number;
}

export class PairsError extends Error {
  constructor(
    message: string,
    public code:
      | "INVALID_THRESHOLD"
      | "UNKNOWN_ID"
      | "NO_VECTORS"
      | "INVALID_CONFIG"
      | "UNKNOWN_RELATION",
  ) {
    super(message);
    this.name = "PairsError";
  }
}

/**
 * Nominate candidate pairs. A pure read over the cache — the ledger is passed
 * in, and every candidate it covers is MARKED, never dropped, so a suppressed
 * pair is always one `--show-rejected` away and the count is always computable.
 */
export function nominatePairs(
  db: Database.Database,
  config: DocdogConfig,
  opts: NominateOptions = {},
): NominateResult {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    throw new PairsError(`threshold must be a cosine between -1 and 1, got ${threshold}`, "INVALID_THRESHOLD");
  }
  const settleTypes = [...(opts.settleTypes ?? DEFAULT_SETTLE_TYPES)];
  const showTypes = opts.showTypes ? [...opts.showTypes] : null;
  const closeTypes = [...(opts.closeTypes ?? settleTypes)];
  const withinFile = opts.withinFile ?? DEFAULT_WITHIN_FILE;
  const allow = opts.status && opts.status.length > 0 ? opts.status : null;

  // The default exclusion is a convention list, and a corpus may use none of
  // its words — `archived` means nothing here. Narrowed to the statuses the
  // corpus knows rather than refused, because nobody typed it; an exclusion
  // the caller DID type is validated in full by listRecords (FRICTION-038).
  // An allowlist replaces the default: naming what you want is the override.
  let exclude: string[];
  if (opts.excludeStatus !== undefined) {
    exclude = opts.excludeStatus;
  } else if (allow) {
    exclude = [];
  } else {
    const known = loadStatusVocabulary(db).known;
    exclude = DEFAULT_EXCLUDE_STATUSES.filter((s) => known.has(s));
  }

  const collections = opts.collections && opts.collections.length > 0 ? opts.collections : null;
  const filter = {
    status: allow ?? undefined,
    excludeStatus: exclude.length > 0 ? exclude : undefined,
  };
  const listed = collections
    ? collections.flatMap((collection) => listRecords(db, config, { ...filter, collection }))
    : listRecords(db, config, filter);

  const poolIds = new Set(listed.map((r) => r.id));
  if (opts.id) {
    const exists = db.prepare(`SELECT 1 FROM vertices WHERE id = ?`).get(opts.id);
    if (!exists) throw new PairsError(`no record has id ${opts.id}`, "UNKNOWN_ID");
    // The record just written is compared whatever its status: the write-time
    // use asks "what is this near", and the filter describes the partners.
    poolIds.add(opts.id);
  }

  const sides = loadSides(db, poolIds);
  const vectors = loadVectors(db, poolIds);
  const ids = [...poolIds].filter((id) => vectors.has(id)).sort();
  if (opts.id && !vectors.has(opts.id)) {
    throw new PairsError(
      `${opts.id} has no stored vector — run "docdog index" first`,
      "NO_VECTORS",
    );
  }

  const edges = loadEdgesBetween(db, poolIds);
  const settling = new Set(settleTypes);
  const shown = showTypes ? new Set(showTypes) : null;
  const ledger = verdictIndex(opts.verdicts ?? []);
  const structure = withinFile === "settle" ? loadFileStructure(db, settleTypes) : null;

  const candidates: PairCandidate[] = [];
  let settled = 0;
  let settledWithinFile = 0;
  for (let i = 0; i < ids.length; i++) {
    const x = ids[i];
    if (opts.id && x !== opts.id) {
      // Only the pair's other member iterates, keeping the scan linear.
      continue;
    }
    for (let j = opts.id ? 0 : i + 1; j < ids.length; j++) {
      const y = ids[j];
      if (y === x) continue;
      const cos = maxCosine(vectors.get(x)!, vectors.get(y)!);
      if (cos < threshold) continue;

      const between = edges.get(pairKey(x, y)) ?? [];
      if (between.some((e) => settling.has(e.type))) {
        settled++;
        continue;
      }
      if (structure && settledByFile(structure, sides.get(x)!, sides.get(y)!)) {
        settledWithinFile++;
        continue;
      }

      const [a, b] = x < y ? [x, y] : [y, x];
      const sideA = sides.get(a)!;
      const sideB = sides.get(b)!;
      const prior = ledger.get(pairKey(a, b));
      candidates.push({
        a: sideA,
        b: sideB,
        cosine: round3(cos),
        declared: shown ? between.filter((e) => shown.has(e.type)) : between,
        judged: prior
          ? {
              verdict: prior,
              stale: prior.hash_a !== sideA.hash || prior.hash_b !== sideB.hash,
            }
          : null,
      });
    }
  }

  candidates.sort(
    (p, q) => q.cosine - p.cosine || cmp(p.a.id, q.a.id) || cmp(p.b.id, q.b.id),
  );

  return {
    candidates,
    settings: {
      threshold,
      status: allow,
      excludeStatus: exclude,
      collections,
      settleTypes,
      showTypes,
      closeTypes,
      withinFile,
      id: opts.id ?? null,
    },
    pool: ids.length,
    settled,
    settledWithinFile,
  };
}

/**
 * What `within_file: settle` reads (FRICTION-062): for each record, the
 * records it is `part_of` inside its own file (transitively), and every
 * settling edge in the corpus as an unordered key. Loaded whole rather than
 * from the pool, because the record an entry's edge lives on — its head —
 * may be outside the pool (filtered by status, or holding no vector since
 * FRICTION-060) and still be the record that states the edge.
 */
interface FileStructure {
  containers: Map<string, string[]>;
  settlingKeys: Set<string>;
}

function loadFileStructure(db: Database.Database, settleTypes: readonly string[]): FileStructure {
  const parents = new Map<string, string[]>();
  const rows = db
    .prepare(
      `SELECT e.from_id AS child, e.to_id AS parent
         FROM edges e
         JOIN vertices c ON c.id = e.from_id
         JOIN vertices p ON p.id = e.to_id
        WHERE e.type = 'part_of' AND c.file_path = p.file_path`,
    )
    .all() as Array<{ child: string; parent: string }>;
  for (const r of rows) {
    if (!parents.has(r.child)) parents.set(r.child, []);
    parents.get(r.child)!.push(r.parent);
  }
  const containers = new Map<string, string[]>();
  for (const id of parents.keys()) {
    const seen = new Set<string>();
    const stack = [...parents.get(id)!];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (next === id || seen.has(next)) continue;
      seen.add(next);
      stack.push(...(parents.get(next) ?? []));
    }
    containers.set(id, [...seen]);
  }
  const settlingKeys = new Set<string>();
  if (settleTypes.length > 0) {
    const q = db.prepare(
      `SELECT from_id, to_id FROM edges WHERE type IN (${settleTypes.map(() => "?").join(", ")})`,
    );
    for (const e of q.all(...settleTypes) as Array<{ from_id: string; to_id: string }>) {
      settlingKeys.add(pairKey(e.from_id, e.to_id));
    }
  }
  return { containers, settlingKeys };
}

/** Same source file, or a settling edge between the records either side is
 * part of within its own file. Never lifts to the whole file: an entry's edge
 * to one row of a 261-row file must not settle its sections against the
 * other 260. */
function settledByFile(structure: FileStructure, a: PairSide, b: PairSide): boolean {
  if (a.source_file === b.source_file) return true;
  const up = (id: string): string[] => [id, ...(structure.containers.get(id) ?? [])];
  const as = up(a.id);
  const bs = up(b.id);
  if (as.length === 1 && bs.length === 1) return false; // the direct edge was already checked
  for (const x of as) {
    for (const y of bs) {
      if (structure.settlingKeys.has(pairKey(x, y))) return true;
    }
  }
  return false;
}

/** A candidate is offered unless a still-current verdict covers it. */
export function isOfferedPair(c: PairCandidate, showJudged: boolean): boolean {
  return showJudged || c.judged === null || c.judged.stale;
}

// ─── passages ───────────────────────────────────────────────────────────────

/** OBS-030's splitter, the one measured: blank-line blocks, fenced code whole,
 * headings and short blocks merged forward, merging capped. */
const MIN_BLOCK_CHARS = 200;
const MAX_BLOCK_CHARS = 4000;

/**
 * Split a body into blocks. Pure text mechanics (tier 1): it asserts nothing
 * about where an idea begins, and nothing reads the result except the
 * passage picker.
 */
export function splitBlocks(body: string): string[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const raw: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  const flush = (): void => {
    const text = current.join("\n").trim();
    if (text !== "") raw.push(text);
    current = [];
  };
  for (const line of lines) {
    const marker = /^\s*(```+|~~~+)/.exec(line);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
    }
    if (fence === null && line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  // Merge forward: a heading alone, or a fragment, says too little to embed.
  const merged: string[] = [];
  let carry: string | null = null;
  for (const block of raw) {
    const joined: string = carry === null ? block : `${carry}\n\n${block}`;
    const headingOnly = /^#{1,6}\s/.test(joined) && !joined.includes("\n");
    const small = joined.length < MIN_BLOCK_CHARS || headingOnly;
    if (small && joined.length < MAX_BLOCK_CHARS) {
      carry = joined;
      continue;
    }
    merged.push(joined);
    carry = null;
  }
  if (carry !== null) {
    if (merged.length > 0 && merged[merged.length - 1].length + carry.length < MAX_BLOCK_CHARS) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${carry}`;
    } else {
      merged.push(carry);
    }
  }
  return merged;
}

export interface AttachPassagesOptions {
  /** Override the embedder (tests). Default: the configured provider. */
  embed?: EmbedBatchFn;
  /** Progress sink — the embed can take a while on a large sweep. */
  log?: (message: string) => void;
}

/**
 * Attach each candidate's most similar passage pair, with one block of
 * context either side. Blocks are embedded for this run only and stored
 * nowhere (DP-004). One batch for every record involved, whatever the number
 * of pairs it appears in.
 *
 * The passages are a starting point for a judge, never a limit: a judge that
 * needs more reads the file. Docdog asserts nothing about them.
 */
export async function attachPassages(
  db: Database.Database,
  config: DocdogConfig,
  candidates: PairCandidate[],
  opts: AttachPassagesOptions = {},
): Promise<void> {
  if (candidates.length === 0) return;
  const ids = new Set<string>();
  for (const c of candidates) {
    ids.add(c.a.id);
    ids.add(c.b.id);
  }

  const bodyStmt = db.prepare(`SELECT body_text FROM vertices WHERE id = ?`);
  const blocks = new Map<string, string[]>();
  const texts: string[] = [];
  const owner: Array<{ id: string; index: number }> = [];
  for (const id of ids) {
    const row = bodyStmt.get(id) as { body_text: string } | undefined;
    const list = splitBlocks(row?.body_text ?? "");
    blocks.set(id, list);
    list.forEach((text, index) => {
      texts.push(text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text);
      owner.push({ id, index });
    });
  }

  opts.log?.(
    `Embedding ${texts.length} passage block(s) from ${ids.size} record(s) for this run — not stored.`,
  );
  const embed = opts.embed ?? (await defaultEmbedder());
  const raw = await embed(config, texts);
  const vectors = new Map<string, Float32Array[]>();
  raw.forEach((v, i) => {
    const { id } = owner[i];
    const list = vectors.get(id) ?? [];
    list.push(normalize(Float32Array.from(v)));
    vectors.set(id, list);
  });

  for (const c of candidates) {
    const va = vectors.get(c.a.id) ?? [];
    const vb = vectors.get(c.b.id) ?? [];
    let best = -Infinity;
    let bi = 0;
    let bj = 0;
    for (let i = 0; i < va.length; i++) {
      for (let j = 0; j < vb.length; j++) {
        if (va[i].length !== vb[j].length) continue;
        const s = dot(va[i], vb[j]);
        if (s > best) {
          best = s;
          bi = i;
          bj = j;
        }
      }
    }
    c.passages = {
      a: withContext(blocks.get(c.a.id) ?? [], bi),
      b: withContext(blocks.get(c.b.id) ?? [], bj),
    };
  }
}

function withContext(blocks: string[], i: number): string {
  if (blocks.length === 0) return "";
  return blocks.slice(Math.max(0, i - 1), Math.min(blocks.length, i + 2)).join("\n\n");
}

async function defaultEmbedder(): Promise<EmbedBatchFn> {
  const { generateEmbeddings } = await import("../engine/embedder.js");
  return generateEmbeddings;
}

// ─── cache reads ────────────────────────────────────────────────────────────

function loadSides(db: Database.Database, ids: ReadonlySet<string>): Map<string, PairSide> {
  const stmt = db.prepare(
    `SELECT id, title, collection, status, file_path, content_hash, length(body_text) AS chars
     FROM vertices WHERE id = ?`,
  );
  const out = new Map<string, PairSide>();
  for (const id of ids) {
    const r = stmt.get(id) as
      | {
          id: string;
          title: string | null;
          collection: string;
          status: string | null;
          file_path: string;
          content_hash: string;
          chars: number;
        }
      | undefined;
    if (!r) continue;
    out.set(id, {
      id: r.id,
      title: r.title ?? "",
      collection: r.collection,
      status: r.status ?? "current",
      source_file: r.file_path.replace(/\\/g, "/"),
      hash: r.content_hash,
      past_cap: r.chars > MAX_EMBED_CHARS,
    });
  }
  return out;
}

/** Every stored chunk vector per record, unit-normalized. Normally one per
 * record; a record with several scores as its best chunk pair, the same
 * max-cosine `vectorLeg` uses against a query. */
function loadVectors(db: Database.Database, ids: ReadonlySet<string>): Map<string, Float32Array[]> {
  const rows = db
    .prepare(`SELECT vertex_id, embedding FROM chunks WHERE embedding IS NOT NULL`)
    .all() as Array<{ vertex_id: string; embedding: Buffer }>;
  const out = new Map<string, Float32Array[]>();
  for (const row of rows) {
    if (!ids.has(row.vertex_id)) continue;
    const v = new Float32Array(
      row.embedding.buffer.slice(row.embedding.byteOffset, row.embedding.byteOffset + row.embedding.byteLength),
    );
    const list = out.get(row.vertex_id) ?? [];
    list.push(normalize(v));
    out.set(row.vertex_id, list);
  }
  return out;
}

function loadEdgesBetween(
  db: Database.Database,
  ids: ReadonlySet<string>,
): Map<string, DeclaredEdge[]> {
  const rows = db.prepare(`SELECT from_id, to_id, type FROM edges`).all() as Array<{
    from_id: string;
    to_id: string;
    type: string;
  }>;
  const out = new Map<string, DeclaredEdge[]>();
  for (const r of rows) {
    if (r.from_id === r.to_id || !ids.has(r.from_id) || !ids.has(r.to_id)) continue;
    const key = pairKey(r.from_id, r.to_id);
    const list = out.get(key) ?? [];
    list.push({ from: r.from_id, to: r.to_id, type: r.type });
    out.set(key, list);
  }
  return out;
}

/** Edges of the given types between two ids, in either direction — what
 * closes a defect (`pairs.edges.close`). */
export function edgesOfTypesBetween(
  db: Database.Database,
  x: string,
  y: string,
  types: readonly string[],
): DeclaredEdge[] {
  if (types.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT from_id, to_id, type FROM edges
       WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
         AND type IN (${types.map(() => "?").join(", ")})`,
    )
    .all(x, y, y, x, ...types) as Array<{ from_id: string; to_id: string; type: string }>;
  return rows.map((r) => ({ from: r.from_id, to: r.to_id, type: r.type }));
}

// ─── math ───────────────────────────────────────────────────────────────────

function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function maxCosine(xs: Float32Array[], ys: Float32Array[]): number {
  let best = -Infinity;
  for (const x of xs) {
    for (const y of ys) {
      // A dimension mismatch is a chunk from another model awaiting reindex —
      // skipped, as vectorLeg skips it, rather than compared as garbage.
      if (x.length !== y.length) continue;
      const s = dot(x, y);
      if (s > best) best = s;
    }
  }
  return best;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}


// ─── open defects ───────────────────────────────────────────────────────────

export interface OpenDefect {
  verdict: PairVerdict;
  /** True when either body changed since the verdict — the pair is being
   * re-offered, and the defect may already be fixed in prose. */
  stale: boolean;
  /** False when a side no longer exists in the cache. */
  present: boolean;
}

/**
 * Ledger rows whose defect is not `none` and whose pair no closing edge
 * (`pairs.edges.close`) joins yet. A defect leaves this list one way only — the edge that fixing it
 * produces — so an open defect cannot be suppressed by being judged.
 */
export function openDefects(
  db: Database.Database,
  verdicts: readonly PairVerdict[],
  closeTypes: readonly string[],
): OpenDefect[] {
  const hashStmt = db.prepare(`SELECT content_hash FROM vertices WHERE id = ?`);
  const out: OpenDefect[] = [];
  for (const v of verdicts) {
    if (v.defect === "none") continue;
    if (edgesOfTypesBetween(db, v.a, v.b, closeTypes).length > 0) continue;
    const ha = hashStmt.get(v.a) as { content_hash: string } | undefined;
    const hb = hashStmt.get(v.b) as { content_hash: string } | undefined;
    out.push({
      verdict: v,
      present: ha !== undefined && hb !== undefined,
      stale: ha?.content_hash !== v.hash_a || hb?.content_hash !== v.hash_b,
    });
  }
  return out;
}
