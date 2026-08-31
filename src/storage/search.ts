/**
 * Cache search — P-023 §7 step 4 (search on SQLite).
 *
 * Hybrid retrieval per PROPOSAL-023 §3: an FTS5/BM25 keyword leg (the
 * strict upgrade over v2's unranked CONTAINS) and a brute-force cosine
 * vector leg over `chunks.embedding` (the guaranteed path — sqlite-vec
 * is an optional accelerator, deliberately not wired). Legs are merged
 * with reciprocal-rank fusion. Ranking is Tier-1 mechanics per DP-001:
 * statistical, not judgmental.
 *
 * Options in and result shape out mirror v2's `search()`
 * (src/arango/queries.ts) so the step-5 tool retarget is a wiring
 * change, not an API change. Differences are deliberate:
 * - `_id` is the cache primary key (same value as `id`) — kept only so
 *   v2 consumers that render `_id` keep working until step 5 lands.
 * - `relevance.keyword_bm25` replaces the never-populated
 *   `keyword_match` (v2's keyword tier returned nothing).
 *
 * Query-embedding symmetry: documents were embedded through the same
 * provider path (`src/engine/embedder.ts`) with no search_query /
 * search_document prefix handling beyond what the provider itself
 * does, so the query must go through the identical function — do not
 * add prefixes here or cosine scores drift (session-4 handoff gotcha).
 */
import type Database from "better-sqlite3";
import type { DocdogConfig } from "../types/config.js";
import type { Relevance } from "../types/graph.js";
import { getVertexCollections } from "../config/collections.js";
import { generateEmbedding } from "../engine/embedder.js";
import { parseJsonObject } from "./vertices.js";
import { loadStatusVocabulary, type StatusVocabulary } from "./status-vocabulary.js";

/**
 * A search argument the corpus can't honor: a `collection` filter naming a
 * collection that doesn't exist (FRICTION-030), a `status` / `excludeStatus`
 * value nothing carries and nothing declares (FRICTION-038), a `where`
 * filter that is malformed (`WHERE_*`), or a presence filter naming a field
 * badly or naming the same field twice with opposite intent (`FIELD_*`).
 * Typed like `WriteError` so both surfaces can render it as a first-class
 * refusal instead of an empty result that reads as "no such content".
 *
 * The three `where` guards were plain `Error`s until FRICTION-050, which is
 * why the message that friction is named for rendered as
 *
 *     Error [LIST_ERROR]: Error: where.scope is not allowed — use the
 *     dedicated "scope" parameter.
 *       Cache missing or stale? Run "docdog index" first.
 *
 * — a doubled prefix and a remedy pointing at the cache, for a fact about
 * the argument. FRICTION-030's own comment on that catch says not to
 * misdirect the user to reindex; the `where` guards simply never reached the
 * branch where that was true. Two of the codes name a problem with the
 * argument alone and one (`WHERE_NOT_SCALAR`) needs the corpus to see it —
 * the distinction the guards themselves are ordered around.
 */
export class SearchError extends Error {
  constructor(
    message: string,
    public code:
      | "UNKNOWN_COLLECTION"
      | "UNKNOWN_STATUS"
      | "WHERE_RESERVED_KEY"
      | "WHERE_INVALID_KEY"
      | "WHERE_INVALID_VALUE"
      | "WHERE_NOT_SCALAR"
      | "FIELD_INVALID_KEY"
      | "FIELD_CONTRADICTION",
  ) {
    super(message);
    this.name = "SearchError";
  }
}

export interface SearchOptions {
  query: string;
  collection?: string;
  /**
   * Frontmatter `scope:`, with the DD-058 default applied — a record that
   * declares none counts as `shared`, so `scope: "shared"` returns them.
   * Omit for no filter. Free string, deliberately unvalidated: DD-058 makes
   * scope an open vocabulary with no enum and no registration, so an unused
   * value is an honest empty rather than the typo `collection` and `status`
   * refuse. `docdog status` rosters the values in use, which is the only way
   * to learn them when nothing can refuse you (FRICTION-050).
   */
  scope?: string;
  status?: string[]; // allowlist — return only vertices with one of these statuses
  excludeStatus?: string[]; // blocklist — exclude vertices with any of these statuses
  /**
   * Equality filters over arbitrary top-level frontmatter fields
   * (PROPOSAL-027), e.g. `{ severity: "blocks-work", is_outdated: true }`.
   * Records lacking the field never match. Keys with dedicated params
   * (collection, status, scope) are refused — one syntax path per filter.
   * So is a key the corpus stores as a list or an object, which equality
   * cannot compare against and which used to return a silent zero
   * (FRICTION-049).
   */
  where?: Record<string, string | number | boolean>;
  /**
   * Frontmatter fields that must be **present** with a value, and (`lacks`)
   * fields that must be **absent** (FRICTION-045).
   *
   * `where` compares a field against a scalar, so a record lacking the field
   * never matches — correctly, since there is nothing to compare. The
   * consequence was that absence was not a predicate at all: once a
   * convention writes an attribute onto some records, *which ones have not
   * got it yet* was unaskable, and the complement could not be subtracted by
   * hand either because every present value is different. That is the
   * operationally interesting half of any convention still being rolled out.
   *
   * These two **partition the corpus**, which is the property the whole
   * feature rests on: `has: [f]` and `lacks: [f]` are exact complements, so a
   * caller working a complement can trust the counts to sum. That is why a
   * field written with no value (`upstream_issue:`, which YAML reads as null)
   * counts as *lacking* — `json_extract` returns SQL NULL for a missing path
   * and for an explicit null alike, and splitting them would leave records in
   * neither set and silently under-report exactly the list this exists to
   * produce. It is not a claim about what an empty declaration meant.
   *
   * Deliberately **not** validated against the corpus's field vocabulary,
   * which is where the analogy with `status` (FRICTION-038) breaks: a field
   * no record carries is the *normal* first state of a new convention, and
   * `lacks: ["upstream_issue"]` returning everything on the day the field is
   * invented is the correct and useful answer rather than a query that failed
   * open. Reserved keys are not refused here either — `where.scope` is
   * refused because `--scope` says the same thing, and nothing else can ask
   * whether a record *declares* a scope at all.
   *
   * They read frontmatter, not the indexed columns, so `lacks: ["status"]` is
   * the 16 records that are `current` because the indexer defaults it rather
   * than because anyone wrote it — a question `--status current` cannot ask.
   */
  has?: string[];
  /** Fields that must be absent — see `has`. */
  lacks?: string[];
  limit?: number;
}

export interface SearchResult {
  /** Cache primary key — equals `id`. V2-shape compatibility alias. */
  _id: string;
  id: string;
  collection: string;
  title: string;
  description: string | null;
  /** Repo-relative source file (v2 field name; `vertices.file_path`). */
  source_file: string;
  status: string;
  /** Frontmatter `scope:`, defaulting to "shared" (DD-058 survival). */
  scope: string;
  /**
   * Mechanical body slice of `config.search.preview_length` chars.
   * `description` is the agent-authored summary when present — callers
   * decide which to surface (same contract as v2).
   */
  preview: string;
  relevance: Relevance;
}

/** Query-embedding signature — injectable so tests run without ONNX. */
export type EmbedQueryFn = (config: DocdogConfig, text: string) => Promise<number[]>;

/** Standard reciprocal-rank-fusion constant (Cormack et al.). */
const RRF_K = 60;

/**
 * Hybrid search over the cache. Both legs apply the same vertex-level
 * filters (plain WHERE clauses — cheaper than v2's per-collection AQL
 * loop); fusion ranks whatever survives. No score threshold: at docdog
 * scale every candidate participates and position carries the signal.
 */
export async function search(
  db: Database.Database,
  config: DocdogConfig,
  options: SearchOptions,
  embedQuery: EmbedQueryFn = generateEmbedding,
): Promise<SearchResult[]> {
  const { query, limit = 10 } = options;
  // A collection filter naming a collection the corpus never defines is a
  // typo, not an empty corpus — refuse it loudly rather than returning zero
  // as if the filter succeeded (FRICTION-030). Every other filter legitimately
  // matches nothing, so only `collection` is validated against the vocabulary.
  if (options.collection) assertKnownCollection(db, config, options.collection);
  assertKnownStatuses(db, options);
  const filter = vertexFilters("v", options);
  // After `vertexFilters`, deliberately: that call holds the guards that read
  // the argument alone, and an argument someone typed wrong should be reported
  // before a mismatch with the corpus (FRICTION-049).
  assertScalarWhereTargets(db, options);
  // Overscan so fusion has material beyond the requested page.
  const candidateLimit = Math.max(limit * 3, 20);

  const ftsHits = keywordLeg(db, query, filter, candidateLimit);
  const vectorHits = await vectorLeg(db, config, query, filter, candidateLimit, embedQuery);

  // Reciprocal-rank fusion across the two hit lists.
  interface Fused {
    rrf: number;
    bm25?: number;
    cosine?: number;
  }
  const fused = new Map<string, Fused>();
  const bump = (id: string, rank: number): Fused => {
    const entry = fused.get(id) ?? { rrf: 0 };
    entry.rrf += 1 / (RRF_K + rank);
    fused.set(id, entry);
    return entry;
  };
  ftsHits.forEach((hit, i) => {
    bump(hit.vertexId, i + 1).bm25 = -hit.rank; // FTS5 rank is negative-better
  });
  vectorHits.forEach((hit, i) => {
    bump(hit.vertexId, i + 1).cosine = hit.score;
  });

  const ranked = [...fused.entries()].sort(
    ([aId, a], [bId, b]) =>
      b.rrf - a.rrf || (b.cosine ?? -1) - (a.cosine ?? -1) || aId.localeCompare(bId),
  );

  const getVertex = db.prepare(
    `SELECT id, collection, status, title, description, file_path, frontmatter_json, body_text
     FROM vertices WHERE id = ?`,
  );

  const results: SearchResult[] = [];
  for (const [vertexId, signals] of ranked.slice(0, limit)) {
    const row = getVertex.get(vertexId) as
      | {
          id: string;
          collection: string;
          status: string | null;
          title: string | null;
          description: string | null;
          file_path: string;
          frontmatter_json: string;
          body_text: string;
        }
      | undefined;
    if (!row) continue;

    const relevance: Relevance = {};
    if (signals.cosine !== undefined) relevance.vector_search = signals.cosine;
    if (signals.bm25 !== undefined) relevance.keyword_bm25 = signals.bm25;

    results.push({
      _id: row.id,
      id: row.id,
      collection: row.collection,
      title: row.title ?? "",
      description: row.description,
      source_file: row.file_path,
      status: row.status ?? "current",
      scope: scopeOf(row.frontmatter_json),
      preview: makePreview(row.body_text, config.search.preview_length),
      relevance,
    });
  }
  return results;
}

// ─── Enumeration ────────────────────────────────────────────────────────────

/**
 * `listRecords` filters — `SearchOptions` minus the query and the limit's
 * default. Every field means exactly what it means in a search.
 */
export type ListOptions = VertexFilterOptions & {
  /** Omit for every match. A cap here is the caller's choice, never a default. */
  limit?: number;
};

/** A listed record: identity and metadata, no body and no preview. */
export interface ListResult {
  id: string;
  collection: string;
  title: string;
  description: string | null;
  status: string;
  scope: string;
  /** Repo-relative source file (`vertices.file_path`). */
  source_file: string;
}

/**
 * Enumerate every record matching a predicate — the query `search` cannot
 * express (FRICTION-036).
 *
 * Search ranks by recall against a text query, so it answers "what is most
 * relevant" and cannot answer "what are all of them": a record can carry
 * `status: open` and still rank below the limit, or below any given query's
 * recall, for a query it is semantically distant from. Filters narrow that
 * ranked set; they do not convert it into a list. The gap was patched with a
 * filesystem grep on every WF-006 survey, which is a completeness claim made
 * outside docdog.
 *
 * So: same filters, neither retrieval leg, no cap unless asked. Tier-1
 * mechanics (DP-001) — a SELECT with a WHERE and an ORDER BY, no judgment,
 * no relevance to report because none was computed. It is deliberately
 * synchronous: with no query to embed there is no reason to load ONNX.
 *
 * It shares `vertexFilters` with `search` rather than importing a copy,
 * on the same reasoning that keeps `findUnusedRows` shared between `status`
 * and `gc` — two implementations of one predicate drift, and the drift is
 * invisible until a record is missing from a list someone trusted.
 *
 * Order is `collection, id`: stable, locale-free, and grouped the way a
 * cross-collection listing is read. Ids sort lexicographically, which is
 * numeric ordering exactly while ids are zero-padded (PROPOSAL-037, DD-070);
 * an unpadded scheme would put id 10 before id 9. Natural-sorting them is a
 * defensible future default, not something to infer here.
 *
 * The returned shape carries no body and no preview. Enumeration is the
 * cheap half of a two-step — list to find the set, `get` to read one — and
 * a preview per record would make the whole-collection case expensive for
 * no gain, which is the property that made listing worth having.
 */
export function listRecords(
  db: Database.Database,
  config: DocdogConfig,
  options: ListOptions = {},
): ListResult[] {
  // Same refusal as search: an unknown collection name is a typo, not an
  // empty corpus, and a list that silently returns nothing is worse here —
  // its whole promise is completeness (FRICTION-030).
  if (options.collection) assertKnownCollection(db, config, options.collection);
  assertKnownStatuses(db, options);

  const filter = vertexFilters("v", options);
  // Same order, and the stakes are higher here: an empty enumeration is a
  // completeness claim (FRICTION-049).
  assertScalarWhereTargets(db, options);
  const limitSql = options.limit !== undefined ? " LIMIT ?" : "";
  const params = options.limit !== undefined ? [...filter.params, options.limit] : filter.params;

  const rows = db
    .prepare(
      `SELECT v.id, v.collection, v.status, v.title, v.description, v.file_path, v.frontmatter_json
       FROM vertices v
       WHERE 1=1 ${filter.sql}
       ORDER BY v.collection, v.id${limitSql}`,
    )
    .all(...params) as Array<{
    id: string;
    collection: string;
    status: string | null;
    title: string | null;
    description: string | null;
    file_path: string;
    frontmatter_json: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    collection: row.collection,
    title: row.title ?? "",
    description: row.description,
    status: row.status ?? "current",
    scope: scopeOf(row.frontmatter_json),
    source_file: row.file_path,
  }));
}

// ─── Legs ───────────────────────────────────────────────────────────────────

interface FtsHit {
  vertexId: string;
  /** FTS5 bm25 rank — negative, more negative = better. */
  rank: number;
}

function keywordLeg(
  db: Database.Database,
  query: string,
  filter: VertexFilter,
  candidateLimit: number,
): FtsHit[] {
  const match = toFtsQuery(query);
  if (!match) return [];

  const rows = db
    .prepare(
      `SELECT fts.vertex_id AS vertex_id, fts.rank AS rank
       FROM fts JOIN vertices v ON v.id = fts.vertex_id
       WHERE fts MATCH ? ${filter.sql}
       ORDER BY fts.rank
       LIMIT ?`,
    )
    .all(match, ...filter.params, candidateLimit) as Array<{ vertex_id: string; rank: number }>;

  return rows.map((r) => ({ vertexId: r.vertex_id, rank: r.rank }));
}

interface VectorHit {
  vertexId: string;
  /** Cosine similarity vs the query embedding. */
  score: number;
}

/**
 * Brute-force cosine over every embedded chunk that passes the vertex
 * filters. A vertex with several chunks scores as its best chunk
 * (max-cosine), so index-time multi-chunking slots in without a search
 * change. Sub-millisecond at 10²–10⁴ chunks (PROPOSAL-023 §2).
 */
async function vectorLeg(
  db: Database.Database,
  config: DocdogConfig,
  query: string,
  filter: VertexFilter,
  candidateLimit: number,
  embedQuery: EmbedQueryFn,
): Promise<VectorHit[]> {
  const queryVector = await embedQuery(config, query);

  const rows = db
    .prepare(
      `SELECT c.vertex_id AS vertex_id, c.embedding AS embedding
       FROM chunks c JOIN vertices v ON v.id = c.vertex_id
       WHERE c.embedding IS NOT NULL ${filter.sql}`,
    )
    .all(...filter.params) as Array<{ vertex_id: string; embedding: Buffer }>;

  const best = new Map<string, number>();
  for (const row of rows) {
    const vector = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4,
    );
    // Dimension mismatch = chunk embedded under a different model and
    // not reindexed yet; skip rather than compute garbage.
    if (vector.length !== queryVector.length) continue;
    const score = cosine(vector, queryVector);
    const prior = best.get(row.vertex_id);
    if (prior === undefined || score > prior) best.set(row.vertex_id, score);
  }

  return [...best.entries()]
    .map(([vertexId, score]) => ({ vertexId, score }))
    .sort((a, b) => b.score - a.score || a.vertexId.localeCompare(b.vertexId))
    .slice(0, candidateLimit);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sanitize free text into an FTS5 MATCH expression: each whitespace
 * token becomes a quoted phrase (neutralizing FTS5 operator syntax),
 * OR-joined so BM25 ranks partial matches instead of AND dropping
 * them. Tokens with no letter/digit tokenize to nothing and are
 * dropped. Returns null when nothing searchable remains.
 */
export function toFtsQuery(query: string): string | null {
  const tokens = query
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  return tokens.length > 0 ? tokens.join(" OR ") : null;
}

interface VertexFilter {
  /** Zero or more `AND …` clauses against the given vertices alias. */
  sql: string;
  params: unknown[];
}

/**
 * Refuse a `collection` filter naming a collection this corpus has no
 * concept of (FRICTION-030). Known = the declared vocabulary (config's
 * shipped ∪ user collections) ∪ whatever is actually present in the cache
 * (covers `--create-collections` records whose collection isn't in config).
 * A declared-but-empty collection therefore validates and returns an honest
 * empty result; only a name in neither set is the typo we reject.
 *
 * The listing is the present set — the same non-empty collections
 * `docdog status` prints — since those are the actionable alternatives.
 */
function assertKnownCollection(
  db: Database.Database,
  config: DocdogConfig,
  collection: string,
): void {
  const present = (
    db.prepare(`SELECT DISTINCT collection FROM vertices ORDER BY collection`).all() as Array<{
      collection: string;
    }>
  ).map((r) => r.collection);
  const known = new Set<string>([...getVertexCollections(config), ...present]);
  if (known.has(collection)) return;

  const list = present.length > 0 ? present.join(", ") : "(none — the corpus is empty)";
  throw new SearchError(
    `no collection named "${collection}" in this corpus. ` +
      `Collections with content: ${list}. Omit the collection filter to search everything.`,
    "UNKNOWN_COLLECTION",
  );
}

/**
 * Refuse a `status` / `excludeStatus` value no record carries and no
 * collection concept declares (FRICTION-038).
 *
 * The same argument as `assertKnownCollection` one column over, with one
 * difference that decides how loud this has to be: an unknown collection
 * always fails closed, while an unknown *exclusion* fails **open** — the
 * whole corpus comes back, which looks like a successful query rather than
 * a suspicious one. So the message names which direction the filter failed
 * in, because "returns everything" is the failure a reader will not notice
 * on their own.
 *
 * Validation is corpus-wide even when a `collection` filter is present. Per
 * collection would be stricter and is the wrong strictness: `list
 * --collection notes --status shipped` legitimately asks "are there any",
 * and answering it with a refusal would make the tool argue about a question
 * it can just answer. The typo this catches is a value nothing in the whole
 * corpus knows about.
 */
export function assertKnownStatuses(
  db: Database.Database,
  options: { status?: string[]; excludeStatus?: string[] },
): void {
  const hasAllow = options.status !== undefined && options.status.length > 0;
  const hasBlock = options.excludeStatus !== undefined && options.excludeStatus.length > 0;
  if (!hasAllow && !hasBlock) return;

  const vocab = loadStatusVocabulary(db);
  if (hasAllow) rejectUnknown(options.status!, vocab, "allow");
  if (hasBlock) rejectUnknown(options.excludeStatus!, vocab, "block");
}

/** One filter's worth of the check — everything unknown at once, so a CSV
 * with two typos costs one round trip rather than two. */
function rejectUnknown(
  values: string[],
  vocab: StatusVocabulary,
  kind: "allow" | "block",
): void {
  const unknown = values.filter((v) => !vocab.known.has(v));
  if (unknown.length === 0) return;

  const label = kind === "allow" ? "status allowlist" : "exclude-status blocklist";
  const named = unknown.map((v) => JSON.stringify(v)).join(", ");
  const inUse =
    vocab.present.length > 0
      ? vocab.present.map((s) => s.status).sort().join(", ")
      : "(none — the corpus is empty)";

  const parts = [
    `the ${label} names ${unknown.length} value(s) no record carries and no ` +
      `collection concept declares: ${named}. In use: ${inUse}.`,
  ];
  if (vocab.declaredUnused.length > 0) {
    parts.push(`Declared but unused: ${vocab.declaredUnused.join(", ")}.`);
  }
  parts.push(
    kind === "allow"
      ? "An allowlist matching nothing returns an empty result, which reads as \"no such records exist\"."
      : "An exclusion matching nothing returns the whole corpus, which reads as a query that worked.",
  );

  // A rejected value containing whitespace is almost always one specific
  // accident: PowerShell parses an unquoted `a,b,c` as an array expression
  // and hands the child process one space-joined argv entry, so the CSV
  // never had a comma to split on. Naming the shape is a fact about the
  // input; guessing that it meant `a`, `b`, `c` and splitting on the space
  // would be the tier-3 correction this whole check refuses to make.
  const spaced = unknown.find((v) => /\s/.test(v));
  if (spaced !== undefined) {
    parts.push(
      `${JSON.stringify(spaced)} contains whitespace — quote comma-separated values ` +
        `(--status "a,b"), since some shells join an unquoted list into one argument.`,
    );
  }

  throw new SearchError(parts.join(" "), "UNKNOWN_STATUS");
}

/**
 * json_type values an equality filter cannot be compared against.
 *
 * `json_extract` returns a container as its JSON *text*, so the bound
 * parameter is tested against `["a","b"]` rather than against any member.
 * Everything else json_type can return — text, integer, real, true, false,
 * null — is a scalar the comparison is at least meaningful about.
 */
const WHERE_CONTAINER_TYPES = new Set(["array", "object"]);

/**
 * Refuse a `where` filter aimed at a field this corpus stores as a list or
 * an object (FRICTION-049).
 *
 * This is the third guard on the same argument, and it is the one that needs
 * the corpus. The other three — a reserved key, a key that is not a top-level
 * identifier, a value that is not a scalar — are decidable from the argument
 * alone and live in `vertexFilters`. The container mismatch slips between them
 * because **every one of those checks the argument and none checks the stored
 * field**: `--where topics=logging` has an identifier key and a string value
 * and is well-formed in every way that can be seen without opening the cache.
 * The mismatch only exists once it meets a record.
 *
 * So it was the single path through this filter that returned *output* rather
 * than a refusal, and the output was `No results found.` and exit 0 — which is
 * also the correct answer to a well-formed query, and is therefore the one
 * thing a caller cannot tell apart from data. The established behaviour of
 * this function is to refuse rather than mislead; this makes the last case
 * behave like the other three.
 *
 * **Refusing is tier 1 and matching is not.** Comparing two json_type strings
 * docdog already has is mechanics. Deciding that `topics=logging` means
 * *logging is one of the topics* is a convention someone chooses — a real and
 * probably good one, and `json_each` would implement it in a line — but it is
 * a semantic default, so it belongs in a proposal that states the rule rather
 * than in the fix for a silent answer.
 *
 * `has` / `lacks` are deliberately exempt: presence never compares against
 * the value, so `has: ["topics"]` answers correctly for a list field and is
 * now the way to reach one at all (FRICTION-045).
 *
 * The mixed case is the reason this fires on *any* container row rather than
 * only when the field is a container everywhere. A field stored as a list in
 * 32 records and a string in 4 makes the filter answer for the 4 and stay
 * silent about the 32, which is the same defect wearing a plausible number.
 */
function assertScalarWhereTargets(
  db: Database.Database,
  options: VertexFilterOptions,
): void {
  const keys = Object.keys(options.where ?? {});
  if (keys.length === 0) return;

  const typesOf = db.prepare(
    `SELECT kind, COUNT(*) AS n
       FROM (SELECT json_type(frontmatter_json, ?) AS kind FROM vertices)
      WHERE kind IS NOT NULL
      GROUP BY kind
      ORDER BY n DESC`,
  );
  const tally = (rows: Array<{ kind: string; n: number }>): string =>
    rows.map((r) => `${r.kind} in ${r.n}`).join(", ");

  // Every offending key at once — a `--where` with two list fields costs one
  // refusal, the same reason `rejectUnknown` names every unknown status.
  const offenders: string[] = [];
  let anyMixed = false;
  for (const key of keys) {
    const rows = typesOf.all(`$.${key}`) as Array<{ kind: string; n: number }>;
    const containers = rows.filter((r) => WHERE_CONTAINER_TYPES.has(r.kind));
    if (containers.length === 0) continue;

    const scalars = rows.filter((r) => !WHERE_CONTAINER_TYPES.has(r.kind));
    if (scalars.length > 0) anyMixed = true;
    offenders.push(
      `where.${key} (${tally(containers)} record(s)` +
        (scalars.length > 0 ? `, ${tally(scalars)} record(s)` : "") +
        ")",
    );
  }
  if (offenders.length === 0) return;

  const parts = [
    `${offenders.length === 1 ? "this filter targets a field" : "these filters target fields"} ` +
      `this corpus stores as a container: ${offenders.join("; ")}.`,
    "An equality filter compares against the field's JSON text, so it can never match a " +
      "member and would return an empty result — indistinguishable from \"no such records exist\".",
  ];
  if (anyMixed) {
    parts.push(
      "One of these is a container in some records and a scalar in others, so the filter " +
        "would have answered for part of the corpus and said nothing about the rest.",
    );
  }
  parts.push(
    "Equality against a list is not membership. Filter on a scalar field, or search for " +
      "the value and narrow by reading.",
  );

  throw new SearchError(parts.join(" "), "WHERE_NOT_SCALAR");
}

/** `where` keys must be plain top-level identifiers — no dotted paths. */
const WHERE_KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Fields with dedicated search params — one syntax path per filter
 * (PROPOSAL-027).
 *
 * Membership here is a *promise*, not just a refusal: `where.x is not allowed
 * — use the dedicated "x" parameter` is only true if that parameter exists on
 * the surface the caller is standing on. `scope` was in this set for months
 * with a full implementation below and no parameter on CLI `search`, CLI
 * `list` or `docdog_search` — the dedicated parameter the message named
 * existed only on the *writes*, so the message was right about the vocabulary
 * and wrong about the surface, and the one path to the working filter was the
 * one it closed (FRICTION-050).
 *
 * Exported so that obligation is checkable rather than remembered:
 * `tests/unit/dedicated-params.test.ts` walks this set against every read
 * surface. Adding a name here without adding its parameter now fails a test
 * instead of producing an error message that lies.
 */
export const WHERE_DEDICATED_PARAMS: ReadonlySet<string> = new Set([
  "collection",
  "status",
  "scope",
]);

/**
 * The filter subset — everything both `search` and `listRecords` accept,
 * minus the parts only one of them has (a query to rank against, a limit
 * whose default differs). Naming it is what lets one predicate serve both.
 */
export type VertexFilterOptions = Omit<SearchOptions, "query" | "limit">;

/** Vertex filters as WHERE clauses on a `vertices` alias. */
function vertexFilters(alias: string, options: VertexFilterOptions): VertexFilter {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.collection) {
    clauses.push(`AND ${alias}.collection = ?`);
    params.push(options.collection);
  }
  if (options.scope) {
    clauses.push(`AND ${scopeExpr(alias)} = ?`);
    params.push(options.scope);
  }
  if (options.status && options.status.length > 0) {
    clauses.push(`AND ${alias}.status IN (${options.status.map(() => "?").join(", ")})`);
    params.push(...options.status);
  }
  if (options.excludeStatus && options.excludeStatus.length > 0) {
    clauses.push(
      `AND (${alias}.status IS NULL OR ${alias}.status NOT IN (${options.excludeStatus.map(() => "?").join(", ")}))`,
    );
    params.push(...options.excludeStatus);
  }
  for (const [key, value] of Object.entries(options.where ?? {})) {
    if (WHERE_DEDICATED_PARAMS.has(key)) {
      const hint = key === "status" ? `"status" / "excludeStatus" parameters` : `"${key}" parameter`;
      throw new SearchError(
        `where.${key} is not allowed — use the dedicated ${hint}.`,
        "WHERE_RESERVED_KEY",
      );
    }
    if (!WHERE_KEY_RE.test(key)) {
      throw new SearchError(
        `where key "${key}" is not a top-level frontmatter identifier ([A-Za-z_][A-Za-z0-9_-]*).`,
        "WHERE_INVALID_KEY",
      );
    }
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new SearchError(
        `where.${key}: value must be a string, number, or boolean.`,
        "WHERE_INVALID_VALUE",
      );
    }
    clauses.push(`AND json_extract(${alias}.frontmatter_json, ?) = ?`);
    // json_extract surfaces JSON true/false as 1/0 — bind to match.
    params.push(`$.${key}`, typeof value === "boolean" ? (value ? 1 : 0) : value);
  }

  // Presence and absence (FRICTION-045). `IS NULL` covers a missing path and
  // an explicitly null field alike, which is what makes the two sets exact
  // complements — see `SearchOptions.has`.
  const has = new Set(options.has ?? []);
  const lacks = new Set(options.lacks ?? []);
  for (const key of [...has, ...lacks]) {
    if (!WHERE_KEY_RE.test(key)) {
      throw new SearchError(
        `field "${key}" is not a top-level frontmatter identifier ([A-Za-z_][A-Za-z0-9_-]*).`,
        "FIELD_INVALID_KEY",
      );
    }
    // Asking for a field to be present and absent at once returns nothing,
    // and an empty result is the one answer a caller cannot tell apart from
    // data (FRICTION-049). Decidable from the argument alone, so it is
    // refused here rather than measured against the corpus.
    if (has.has(key) && lacks.has(key)) {
      throw new SearchError(
        `field "${key}" is required to be both present and absent — that set is empty by construction.`,
        "FIELD_CONTRADICTION",
      );
    }
  }
  for (const key of has) {
    clauses.push(`AND json_extract(${alias}.frontmatter_json, ?) IS NOT NULL`);
    params.push(`$.${key}`);
  }
  for (const key of lacks) {
    clauses.push(`AND json_extract(${alias}.frontmatter_json, ?) IS NULL`);
    params.push(`$.${key}`);
  }

  return { sql: clauses.length > 0 ? ` ${clauses.join(" ")}` : "", params };
}

/**
 * A record's effective scope in SQL — frontmatter `scope:`, defaulting to
 * `shared` when it is absent (DD-058).
 *
 * Shared rather than written twice, on the lesson `findUnusedRows` carries
 * between `status` and `gc` (OBS-021): two spellings of one default drift,
 * and the drift is invisible until a record is missing from a filtered set
 * someone trusted. The second caller is `collectStatus`, which rosters the
 * scopes this corpus uses — a roster computed off a different default would
 * advertise a value the filter cannot match.
 *
 * `NULLIF` is here because `scopeOf` below — the JS half, which decides what
 * every result *reports* — treats an explicit empty string as absent too. A
 * record with `scope: ""` was reported as `shared` and not returned by
 * `--scope shared`, which is only reachable now that a read surface can ask.
 */
export function scopeExpr(alias: string): string {
  return `COALESCE(NULLIF(json_extract(${alias}.frontmatter_json, '$.scope'), ''), 'shared')`;
}

/** Frontmatter `scope:`, defaulting to "shared" (DD-058). */
function scopeOf(frontmatterJson: string): string {
  const fm = parseJsonObject(frontmatterJson);
  return typeof fm.scope === "string" && fm.scope !== "" ? fm.scope : "shared";
}

function cosine(a: Float32Array, b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Truncate body to preview_length chars at a word boundary — ported
 * verbatim from v2 (src/arango/queries.ts) so previews are identical
 * across the storage swap.
 */
function makePreview(content: string, maxChars: number): string {
  if (!content) return "";
  if (content.length <= maxChars) return content;
  const slice = content.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.8 ? slice.slice(0, lastSpace) : slice) + "…";
}
