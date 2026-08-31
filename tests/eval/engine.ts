/**
 * Retrieval-eval engine — the five systems, the grep reimplementation, and
 * the metrics, shared by every runner.
 *
 * Two runners use it: `run-retrieval-eval.ts` (this repo's own frozen set,
 * golds are record ids) and `run-external-eval.ts` (an adopting project's
 * frozen set, golds are file paths). They MUST share this file rather than
 * fork it — a measurement whose two corpora ran different code is not a
 * comparison, and the whole point of running the harness on someone else's
 * corpus is that the only variable is the corpus.
 *
 * The isolated legs MIRROR src/storage/search.ts's SQL rather than importing
 * internals from it (session-7 handoff guardrail: the eval must not grow the
 * prod surface). If search.ts's legs change, update the mirrors here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { search, toFtsQuery } from "../../src/storage/search.js";
import { generateEmbedding } from "../../src/engine/embedder.js";
import type { DocdogConfig } from "../../src/types/config.js";
import type Database from "better-sqlite3";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EvalQuery {
  id: string;
  query: string;
  /** Record ids or repo-relative file paths, per the runner's gold mode. */
  gold: string[];
  category: string;
  note?: string;
}

/** One system's answer to one query: ranked record ids (or file paths for
 * rg hits on non-record files), plus optional tokens-to-locate. */
export interface SystemResult {
  /** Ranked list, best first. Entries are vertex ids, or `(file) <path>`
   * for rg hits that map to no indexed record. */
  ranked: string[];
  /** 1-based rank of the first gold, null if not in the list. */
  goldRank: number | null;
  /** Approximate tokens the consumer scans until the first gold appears. */
  tokensToLocate: number | null;
}

export interface QueryOutcome {
  q: EvalQuery;
  systems: Record<SystemName, SystemResult>;
}

export type SystemName = "hybrid" | "fts" | "vector" | "rg-rank" | "rg-walk";
export const SYSTEMS: SystemName[] = ["hybrid", "fts", "vector", "rg-rank", "rg-walk"];
export const K = 10; // depth for all ranked lists and MRR

/**
 * How a query's `gold` entries name their answers.
 *
 * `id` — gold is a record id (this repo's set, frozen against a corpus whose
 * ids are stable). `path` — gold is a repo-relative file path, which is what
 * an adopting project can freeze *before* `docdog init` runs, when it has no
 * docdog ids yet. Path mode expands to every record the file holds, so a
 * split-parsed section counts as a hit on its source file.
 */
export type GoldMode = "id" | "path";

/** A query's gold, resolved against the live corpus, in both currencies. */
export interface GoldTargets {
  ids: Set<string>;
  files: Set<string>;
  /** Gold entries that resolve to nothing indexed — see `checkGold`. */
  unresolved: string[];
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export interface EngineOptions {
  projectRoot: string;
  config: DocdogConfig;
  db: Database.Database;
  goldMode: GoldMode;
}

export interface Engine {
  /** file_path (forward-slash, repo-relative) → one vertex id, for labels. */
  fileToId: Map<string, string>;
  /** id → file_path. */
  idToFile: Map<string, string>;
  /** Every record count, for the report header. */
  recordCount: number;
  /** Files and bytes the grep baseline walks — the corpus scale that matters
   * for tokens-to-locate, and the number the ranked systems are flat in. */
  grepFileCount: number;
  grepBytes: number;
  resolveGold(q: EvalQuery): GoldTargets;
  run(q: EvalQuery): Promise<Record<SystemName, SystemResult>>;
}

export function createEngine(opts: EngineOptions): Engine {
  const { projectRoot, config, db, goldMode } = opts;

  const fileToId = new Map<string, string>();
  const fileToIds = new Map<string, string[]>();
  const idToFile = new Map<string, string>();
  for (const row of db
    .prepare(`SELECT id, file_path FROM vertices`)
    .all() as Array<{ id: string; file_path: string }>) {
    const file = row.file_path.replace(/\\/g, "/");
    if (!fileToId.has(file)) fileToId.set(file, row.id);
    let siblings = fileToIds.get(file);
    if (siblings === undefined) fileToIds.set(file, (siblings = []));
    siblings.push(row.id);
    idToFile.set(row.id, file);
  }

  const scanPaths = config.scan_paths.map((e) => (typeof e === "string" ? e : e.path));

  // ── Gold resolution ──────────────────────────────────────────────────────

  function resolveGold(q: EvalQuery): GoldTargets {
    const ids = new Set<string>();
    const files = new Set<string>();
    const unresolved: string[] = [];
    for (const g of q.gold) {
      if (goldMode === "id") {
        const file = idToFile.get(g);
        if (file === undefined) {
          unresolved.push(g);
          continue;
        }
        ids.add(g);
        files.add(file);
      } else {
        const file = g.replace(/\\/g, "/").replace(/^\.\//, "");
        const hits = fileToIds.get(file);
        if (hits === undefined) {
          // The file may exist on disk and simply not be in a scan path —
          // which is a corpus-config gap, not a retrieval miss. Either way
          // nothing indexed can answer, so the runner reports it rather than
          // scoring it as a search failure (OBS-013's Q22 lesson).
          unresolved.push(g);
          continue;
        }
        files.add(file);
        for (const id of hits) ids.add(id);
      }
    }
    return { ids, files, unresolved };
  }

  // ── Docdog routes ────────────────────────────────────────────────────────

  async function hybridRoute(q: EvalQuery, gold: GoldTargets): Promise<SystemResult> {
    const results = await search(db, config, { query: q.query, limit: K });
    const ranked = results.map((r) => r.id);
    const goldRank = firstGoldRank(ranked, gold.ids);

    // Tokens: replicate the MCP text rendering (src/mcp/tools/search.ts) —
    // that is the shape an agent actually reads.
    let tokensToLocate: number | null = null;
    if (goldRank !== null) {
      let chars = 0;
      for (let i = 0; i < goldRank; i++) {
        const r = results[i];
        const signals: string[] = [];
        if (r.relevance.vector_search !== undefined)
          signals.push(`vector_search=${r.relevance.vector_search.toFixed(3)}`);
        if (r.relevance.keyword_bm25 !== undefined)
          signals.push(`keyword_bm25=${r.relevance.keyword_bm25.toFixed(2)}`);
        const relevanceNote =
          signals.length > 0
            ? `${signals.join(", ")} (hybrid RRF — informative, not authoritative)`
            : `(no relevance signal)`;
        const entry = [
          `${i + 1}. [${r.id}] **${r.title}** (${r.collection}${r.scope !== "shared" ? `, scope:${r.scope}` : ""})`,
          `   _id: ${r._id}`,
          `   file: ${r.source_file}`,
          `   relevance: ${relevanceNote}`,
          `   ${(r.description ?? r.preview).replace(/\n/g, " ")}`,
        ].join("\n");
        chars += entry.length + 2; // + blank-line separator
      }
      tokensToLocate = Math.ceil(chars / 4);
    }
    return { ranked, goldRank, tokensToLocate };
  }

  /** Mirror of search.ts keywordLeg (no vertex filters in the eval). */
  function ftsRoute(q: EvalQuery, gold: GoldTargets): SystemResult {
    const match = toFtsQuery(q.query);
    const ranked = match
      ? (
          db
            .prepare(
              `SELECT fts.vertex_id AS vertex_id
               FROM fts JOIN vertices v ON v.id = fts.vertex_id
               WHERE fts MATCH ?
               ORDER BY fts.rank
               LIMIT ?`,
            )
            .all(match, K) as Array<{ vertex_id: string }>
        ).map((r) => r.vertex_id)
      : [];
    return { ranked, goldRank: firstGoldRank(ranked, gold.ids), tokensToLocate: null };
  }

  /** Mirror of search.ts vectorLeg: brute-force cosine, best chunk per vertex. */
  async function vectorRoute(q: EvalQuery, gold: GoldTargets): Promise<SystemResult> {
    const queryVector = await generateEmbedding(config, q.query);
    const rows = db
      .prepare(
        `SELECT c.vertex_id AS vertex_id, c.embedding AS embedding
         FROM chunks c JOIN vertices v ON v.id = c.vertex_id
         WHERE c.embedding IS NOT NULL`,
      )
      .all() as Array<{ vertex_id: string; embedding: Buffer }>;

    const best = new Map<string, number>();
    for (const row of rows) {
      const vector = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.embedding.byteLength / 4,
      );
      if (vector.length !== queryVector.length) continue;
      let dot = 0,
        normA = 0,
        normB = 0;
      for (let i = 0; i < vector.length; i++) {
        dot += vector[i] * queryVector[i];
        normA += vector[i] * vector[i];
        normB += queryVector[i] * queryVector[i];
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      const score = denom === 0 ? 0 : dot / denom;
      const prior = best.get(row.vertex_id);
      if (prior === undefined || score > prior) best.set(row.vertex_id, score);
    }
    const ranked = [...best.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, K)
      .map(([id]) => id);
    return { ranked, goldRank: firstGoldRank(ranked, gold.ids), tokensToLocate: null };
  }

  // ── Ripgrep baseline ─────────────────────────────────────────────────────

  /**
   * The grep corpus: every *.md file under the config scan paths, path-sorted
   * (= `rg --sort path` order), loaded once. Lines are pre-lowercased so each
   * term scan is a plain indexOf sweep — identical match semantics to
   * `rg --ignore-case --fixed-strings`.
   */
  const grepCorpus: GrepFile[] = [...new Set(scanPaths.flatMap((e) => collectMdFiles(projectRoot, e)))]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((path) => {
      const lines = readFileSync(join(projectRoot, path), "utf8").split(/\r?\n/);
      return { path, lines, lowerLines: lines.map((l) => l.toLowerCase()) };
    });
  const grepBytes = grepCorpus.reduce(
    (acc, f) => acc + f.lines.reduce((a, l) => a + l.length + 1, 0),
    0,
  );

  function labelFor(file: string): string {
    return fileToId.get(file) ?? `(file) ${file}`;
  }

  /**
   * rg-rank: per extracted term, a `rg --count-matches`-equivalent pass over
   * the corpus; files ranked by (distinct terms matched desc, total matches
   * desc, path asc). The generous mechanical reading of "agent ranks grep
   * results".
   */
  function rgRankRoute(q: EvalQuery, gold: GoldTargets, terms: string[]): SystemResult {
    const distinct = new Map<string, number>();
    const total = new Map<string, number>();
    for (const term of terms) {
      for (const file of grepCorpus) {
        let fileCount = 0;
        for (const line of file.lowerLines) fileCount += countOccurrences(line, term);
        if (fileCount > 0) {
          distinct.set(file.path, (distinct.get(file.path) ?? 0) + 1);
          total.set(file.path, (total.get(file.path) ?? 0) + fileCount);
        }
      }
    }
    const rankedFiles = [...distinct.keys()].sort(
      (a, b) =>
        (distinct.get(b) ?? 0) - (distinct.get(a) ?? 0) ||
        (total.get(b) ?? 0) - (total.get(a) ?? 0) ||
        a.localeCompare(b),
    );
    const goldIdx = rankedFiles.findIndex((f) => gold.files.has(f));
    return {
      ranked: rankedFiles.slice(0, K).map(labelFor),
      goldRank: goldIdx >= 0 && goldIdx < K ? goldIdx + 1 : null,
      tokensToLocate: null, // rank list is not a reading transcript; see README
    };
  }

  /**
   * rg-walk: the honest single-command transcript — `rg -in` with all terms
   * OR-ed, output in path-sorted order ("path:line:text" lines). Gold rank =
   * position of the gold file among distinct files in output order; tokens =
   * transcript chars consumed until the first gold-file line.
   */
  function rgWalkRoute(q: EvalQuery, gold: GoldTargets, terms: string[]): SystemResult {
    if (terms.length === 0) return { ranked: [], goldRank: null, tokensToLocate: null };
    const filesInOrder: string[] = [];
    let chars = 0;
    let goldChars: number | null = null;
    for (const file of grepCorpus) {
      let fileListed = false;
      for (let i = 0; i < file.lines.length; i++) {
        if (!terms.some((t) => file.lowerLines[i].includes(t))) continue;
        chars += `${file.path}:${i + 1}:${file.lines[i]}`.length + 1;
        if (!fileListed) {
          fileListed = true;
          filesInOrder.push(file.path);
        }
        if (goldChars === null && gold.files.has(file.path)) goldChars = chars;
      }
    }
    const goldIdx = filesInOrder.findIndex((f) => gold.files.has(f));
    return {
      ranked: filesInOrder.slice(0, K).map(labelFor),
      goldRank: goldIdx >= 0 && goldIdx < K ? goldIdx + 1 : null,
      tokensToLocate: goldChars === null ? null : Math.ceil(goldChars / 4),
    };
  }

  async function run(q: EvalQuery): Promise<Record<SystemName, SystemResult>> {
    const gold = resolveGold(q);
    const terms = extractTerms(q.query);
    return {
      hybrid: await hybridRoute(q, gold),
      fts: ftsRoute(q, gold),
      vector: await vectorRoute(q, gold),
      "rg-rank": rgRankRoute(q, gold, terms),
      "rg-walk": rgWalkRoute(q, gold, terms),
    };
  }

  return {
    fileToId,
    idToFile,
    recordCount: idToFile.size,
    grepFileCount: grepCorpus.length,
    grepBytes,
    resolveGold,
    run,
  };
}

// ─── Grep corpus helpers ────────────────────────────────────────────────────

interface GrepFile {
  /** Repo-relative, forward-slash. */
  path: string;
  lines: string[];
  lowerLines: string[];
}

function collectMdFiles(projectRoot: string, entry: string): string[] {
  const abs = join(projectRoot, entry);
  if (!statSync(abs, { throwIfNoEntry: false })?.isDirectory()) {
    return entry.toLowerCase().endsWith(".md") ? [entry.replace(/\/+$/, "")] : [];
  }
  const found: string[] = [];
  for (const item of readdirSync(abs, { recursive: true, withFileTypes: true })) {
    if (!item.isFile() || !item.name.toLowerCase().endsWith(".md")) continue;
    const rel = join(item.parentPath ?? (item as { path?: string }).path ?? abs, item.name)
      .slice(projectRoot.length + 1)
      .replace(/\\/g, "/");
    found.push(rel);
  }
  return found;
}

/** Non-overlapping occurrences of `needle` in `haystack` (both lowercase). */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/**
 * Mechanical keyword extraction — the stand-in for "an agent picks grep terms
 * from the question". Lowercase, keep id-shaped tokens whole (hyphens and
 * underscores survive), drop stopwords and single chars. Fixed list, frozen
 * with the harness.
 */
const STOPWORDS = new Set(
  (
    "a an the is are was were be been being do does did done doing have has had " +
    "can could should would will shall may might must what which where when why " +
    "how who whom whose whether that this these those there here it its itself " +
    "i we you they them us our your their my me he she his her of in on at by " +
    "for to from with without within into onto over under between across about " +
    "after before during through against and or nor not no yes but if then else " +
    "than as so such too very also just only even still yet ever never again " +
    "more most less least own same different other another any some all each " +
    "few both several like unlike via per vs versus etc up down out off " +
    "get gets got go goes went going come comes came use uses used using " +
    "make makes made let lets allowed allow allows supposed instead somewhere " +
    "anything something nothing everything someone anyone ended end ends " +
    // contraction fragments left behind by tokenization ("doesn't" → doesn + t)
    "doesn isn aren wasn weren didn don won couldn shouldn wouldn hasn haven"
  ).split(/\s+/),
);

export function extractTerms(query: string): string[] {
  const tokens = query.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const t of tokens) {
    if (t.length < 2 || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    terms.push(t);
  }
  return terms;
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export function firstGoldRank(ranked: string[], gold: Set<string>): number | null {
  const idx = ranked.findIndex((id) => gold.has(id));
  return idx >= 0 ? idx + 1 : null;
}

export function hitAt(outcomes: QueryOutcome[], system: SystemName, k: number): number {
  return outcomes.filter((o) => {
    const r = o.systems[system].goldRank;
    return r !== null && r <= k;
  }).length;
}

export function mrr(outcomes: QueryOutcome[], system: SystemName): number {
  const sum = outcomes.reduce((acc, o) => {
    const r = o.systems[system].goldRank;
    return acc + (r !== null ? 1 / r : 0);
  }, 0);
  return sum / outcomes.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function pct(n: number, total: number): string {
  return `${((100 * n) / total).toFixed(0)}%`;
}

// ─── Report ─────────────────────────────────────────────────────────────────

export interface ReportOptions {
  title: string;
  /** Header lines placed under the title (corpus, embed model, query set). */
  provenance: string[];
  outcomes: QueryOutcome[];
  /** Queries whose gold resolves to nothing indexed, reported not scored. */
  unresolved: Array<{ q: EvalQuery; entries: string[] }>;
}

export function buildReport(opts: ReportOptions): string {
  const { outcomes } = opts;
  const total = outcomes.length;
  const lines: string[] = [];
  lines.push(`# ${opts.title}`);
  lines.push("");
  for (const p of opts.provenance) {
    lines.push(p);
    lines.push("");
  }

  lines.push(`## Aggregate`);
  lines.push("");
  lines.push(
    `| system | Hit@1 | Hit@3 | Hit@5 | Hit@10 | MRR@10 | median tokens-to-locate | misses |`,
  );
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const s of SYSTEMS) {
    const tokens = outcomes
      .map((o) => o.systems[s].tokensToLocate)
      .filter((t): t is number => t !== null);
    const misses = total - hitAt(outcomes, s, K);
    lines.push(
      `| ${s} | ${pct(hitAt(outcomes, s, 1), total)} | ${pct(hitAt(outcomes, s, 3), total)} | ` +
        `${pct(hitAt(outcomes, s, 5), total)} | ${pct(hitAt(outcomes, s, K), total)} | ` +
        `${mrr(outcomes, s).toFixed(3)} | ${median(tokens) ?? "—"} | ${misses} |`,
    );
  }
  lines.push("");

  lines.push(`## By category (hybrid vs rg-rank, Hit@5 / MRR@10)`);
  lines.push("");
  lines.push(`| category | n | hybrid | rg-rank |`);
  lines.push(`|---|---|---|---|`);
  const categories = [...new Set(outcomes.map((o) => o.q.category))];
  for (const cat of categories) {
    const sub = outcomes.filter((o) => o.q.category === cat);
    const cell = (s: SystemName) =>
      `${pct(hitAt(sub, s, 5), sub.length)} / ${mrr(sub, s).toFixed(2)}`;
    lines.push(`| ${cat} | ${sub.length} | ${cell("hybrid")} | ${cell("rg-rank")} |`);
  }
  lines.push("");

  lines.push(`## Per query`);
  lines.push("");
  lines.push(
    `Gold rank per system (— = not in top ${K}). Tokens: approximate (chars/4) consumer reading until the first gold.`,
  );
  lines.push("");
  lines.push(
    `| q | category | query | gold | hybrid | fts | vector | rg-rank | rg-walk | tok hybrid | tok rg-walk |`,
  );
  lines.push(`|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const o of outcomes) {
    const r = (s: SystemName) => o.systems[s].goldRank ?? "—";
    const t = (s: SystemName) => o.systems[s].tokensToLocate ?? "—";
    const queryShort = o.q.query.length > 58 ? o.q.query.slice(0, 55) + "…" : o.q.query;
    lines.push(
      `| ${o.q.id} | ${o.q.category} | ${queryShort} | ${o.q.gold.join(", ")} | ` +
        `${r("hybrid")} | ${r("fts")} | ${r("vector")} | ${r("rg-rank")} | ${r("rg-walk")} | ` +
        `${t("hybrid")} | ${t("rg-walk")} |`,
    );
  }
  lines.push("");

  if (opts.unresolved.length > 0) {
    lines.push(`## Unscored — gold resolves to nothing indexed`);
    lines.push("");
    lines.push(
      `A gold the corpus does not contain cannot fail informatively: the query is a corpus-config gap, not a retrieval miss, and is excluded from every number above (OBS-013's Q22 lesson).`,
    );
    lines.push("");
    for (const u of opts.unresolved) {
      lines.push(`- ${u.q.id} "${u.q.query}" — unresolved gold: ${u.entries.join(", ")}`);
    }
    lines.push("");
  }

  lines.push(`## Misses`);
  lines.push("");
  for (const s of ["hybrid", "rg-rank"] as SystemName[]) {
    const missed = outcomes.filter((o) => o.systems[s].goldRank === null);
    lines.push(`**${s}** (${missed.length}):`);
    lines.push("");
    if (missed.length === 0) {
      lines.push(`- none`);
    } else {
      for (const o of missed) {
        const top3 = o.systems[s].ranked.slice(0, 3).join(", ") || "(no results)";
        lines.push(`- ${o.q.id} "${o.q.query}" (gold: ${o.q.gold.join(", ")}) — top-3: ${top3}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

export function printSummary(outcomes: QueryOutcome[]): void {
  const total = outcomes.length;
  console.log(`\n${"─".repeat(72)}`);
  for (const s of SYSTEMS) {
    console.log(
      `${s.padEnd(8)} Hit@1 ${pct(hitAt(outcomes, s, 1), total).padStart(4)}  ` +
        `Hit@5 ${pct(hitAt(outcomes, s, 5), total).padStart(4)}  ` +
        `Hit@10 ${pct(hitAt(outcomes, s, K), total).padStart(4)}  ` +
        `MRR ${mrr(outcomes, s).toFixed(3)}`,
    );
  }
}
