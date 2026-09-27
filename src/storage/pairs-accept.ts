/**
 * The review file for `docdog pairs` — emit, read back, validate, apply
 * (PROPOSAL-049).
 *
 * Same round trip as PROPOSAL-028's suggest-edges loop, one question wider:
 * a row carries a structured verdict (relation, direction, defect, evidence,
 * note) rather than a context sentence, because OBS-029's typical pair was two
 * findings at once — PROPOSAL-045 amends DD-064 (an edge) and DD-064 is
 * therefore stale (a defect).
 *
 * The file is meant to be filled by a model as often as by a person, so
 * `--accept-from` VALIDATES before it applies, and every check is a fact:
 *
 *   1. evidence is verbatim — each quote occurs in its record's file;
 *   2. the relation is registered (DP-002) — never fuzzily corrected;
 *   3. both hashes are current — neither body moved since the file was emitted.
 *
 * A failed check refuses its row by name and the batch continues. OBS-030
 * measured why the first check is load-bearing: the cheapest judge
 * paraphrased 71% of its quotes. The check is what turns "a model said so"
 * into something safe to apply.
 *
 * There is no `contradicts` or `duplicates` relation, and there must never be:
 * an edge records a relationship that lasts, and a contradiction is a defect
 * waiting to be fixed. Defects go to the ledger, edges to `relationships:`.
 *
 * DP-001: every verdict is tier 3 and arrives in the file. Nothing here
 * infers, scores or auto-applies one, and no flag may.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CacheIndexerOptions } from "./indexer.js";
import { openCacheRead } from "./cache.js";
import { loadRegistryFromCache } from "./relations.js";
import { governingScanEntry, parseFile } from "../engine/discovery.js";
import {
  DEFECTS,
  PAIR_VERDICTS_FILE,
  loadPairVerdicts,
  mergePairVerdicts,
  orientVerdict,
  pairKey,
  savePairVerdicts,
  type Defect,
  type Direction,
  type PairVerdict,
} from "./pair-verdicts.js";
import {
  checkPairEdges,
  describePairEdges,
  isOfferedPair,
  type NominateResult,
  type PairEdgeSteps,
  type PairCandidate,
} from "./pairs.js";
import { relateManyFileFirst, type RelateInput, type RelateSkipReason } from "./writes.js";

export const PAIRS_REVIEW_FORMAT_VERSION = 1;

export class PairsAcceptError extends Error {
  constructor(
    message: string,
    public code: "UNREADABLE" | "MALFORMED_FILE" | "UNKNOWN_VERSION" | "INVALID_ROWS",
  ) {
    super(message);
    this.name = "PairsAcceptError";
  }
}

/** Relation names that cannot be a type: `none` is the verdict "no edge", and
 * the rest are relationship metadata keys (extract.ts reads past them). */
const RESERVED_RELATIONS = new Set(["none", "context", "anchor_text", "role"]);

/** Keys a row may carry. Everything the emitter writes is here, so a file can
 * be applied untouched; anything else is a typo, and a typo that parses —
 * `defct:` — would silently drop a verdict. */
const ROW_KEYS = new Set([
  "a",
  "b",
  "a_hash",
  "b_hash",
  "cosine",
  "a_title",
  "b_title",
  "a_file",
  "b_file",
  "a_status",
  "b_status",
  "a_past_cap",
  "b_past_cap",
  "declared",
  "passages",
  "relation",
  "direction",
  "defect",
  "evidence",
  "note",
]);

// ─── emit ───────────────────────────────────────────────────────────────────

export interface RenderPairsReviewOptions {
  commandLine?: string;
  fileName?: string;
  /** Registered relation types, listed in the header — the judge's vocabulary
   * comes from the project's concept records (DP-002). */
  relationTypes?: readonly string[];
  /** Candidates suppressed by a current verdict, for the header count. */
  suppressed?: number;
  /** Candidates past `--limit`, for the header count. */
  truncated?: number;
}

/**
 * Render the rows as the review document. Every row carries the pair, both
 * body hashes (read back: they are what makes a stale verdict detectable),
 * routing data a filler may use to decide how much judgment the row deserves
 * (cosine, status, past-cap — never read back), the passages, and empty
 * verdict fields. A previously judged pair comes back pre-filled with its old
 * verdict, so re-affirming it is leaving the row alone.
 */
export function renderPairsReview(
  result: NominateResult,
  rows: PairCandidate[],
  opts: RenderPairsReviewOptions = {},
): string {
  const fileName = opts.fileName ?? "pairs.yaml";
  const s = result.settings;
  const lines: string[] = [];
  if (opts.commandLine) lines.push(`# ${opts.commandLine}`);
  lines.push(
    `# ${rows.length} candidate pair${plural(rows.length)} at cosine >= ${s.threshold} from ${result.pool} record${plural(result.pool)}.`,
  );
  lines.push(`# ${describeSettings(result)}`);
  if ((opts.suppressed ?? 0) > 0) {
    lines.push(
      `# ${opts.suppressed} more suppressed by ${PAIR_VERDICTS_FILE} — rerun with --show-rejected to review them too.`,
    );
  }
  if ((opts.truncated ?? 0) > 0) {
    lines.push(`# ${opts.truncated} more past --limit.`);
  }
  lines.push("#");
  lines.push("# Fill one verdict per row, or delete the row to defer it.");
  lines.push(
    `#   relation:  ${opts.relationTypes && opts.relationTypes.length > 0 ? opts.relationTypes.join(" | ") + " | none" : "a registered relation type, or none"}`,
  );
  lines.push("#   direction: a->b | b->a — required when relation is set; the edge is written on the source");
  lines.push(`#   defect:    ${DEFECTS.join(" | ")}`);
  lines.push("#   evidence:  a verbatim quote from each record's file — required unless relation");
  lines.push("#              and defect are both none; a quote that is not in the file refuses the row");
  lines.push("#   note:      free text; becomes the edge's context when relation is set");
  lines.push("# cosine, status, past_cap and passages are routing data — never read back.");
  lines.push("# The passages are a starting point: read the file when they are not enough.");
  lines.push(`# Apply with: docdog pairs --accept-from ${fileName}`);
  lines.push(`version: ${PAIRS_REVIEW_FORMAT_VERSION}`);

  if (rows.length === 0) {
    lines.push("pairs: []");
    return lines.join("\n") + "\n";
  }

  lines.push("pairs:");
  for (const c of rows) {
    const prior = c.judged ? orientVerdict(c.judged.verdict, c.a.id) : null;
    if (c.judged) {
      lines.push(
        c.judged.stale
          ? `  # previously judged, and a body has changed since — keep the verdict to re-affirm it, or change it`
          : `  # previously judged, and still current`,
      );
    }
    lines.push(`  - a: ${scalar(c.a.id)}`);
    lines.push(`    b: ${scalar(c.b.id)}`);
    lines.push(`    a_hash: ${scalar(c.a.hash)}`);
    lines.push(`    b_hash: ${scalar(c.b.hash)}`);
    lines.push(`    cosine: ${c.cosine.toFixed(3)}`);
    lines.push(`    a_title: ${JSON.stringify(c.a.title)}`);
    lines.push(`    b_title: ${JSON.stringify(c.b.title)}`);
    lines.push(`    a_file: ${JSON.stringify(c.a.source_file)}`);
    lines.push(`    b_file: ${JSON.stringify(c.b.source_file)}`);
    lines.push(`    a_status: ${scalar(c.a.status)}`);
    lines.push(`    b_status: ${scalar(c.b.status)}`);
    lines.push(`    a_past_cap: ${c.a.past_cap}`);
    lines.push(`    b_past_cap: ${c.b.past_cap}`);
    if (c.declared.length > 0) {
      lines.push(`    declared:          # edges already joining the pair (pairs.edges.show) — none of them settles it`);
      for (const e of c.declared) {
        lines.push(`      - ${JSON.stringify(`${e.from} ${e.type} ${e.to}`)}`);
      }
    }
    if (c.passages) {
      lines.push(`    passages:`);
      lines.push(...blockScalar("a", c.passages.a, 6));
      lines.push(...blockScalar("b", c.passages.b, 6));
    }
    lines.push(`    relation: ${prior ? scalar(prior.relation) : ""}`.trimEnd());
    lines.push(`    direction: ${prior?.direction ?? ""}`.trimEnd());
    lines.push(`    defect: ${prior ? prior.defect : ""}`.trimEnd());
    lines.push(`    evidence:`);
    lines.push(`      a: ${JSON.stringify(prior?.evidence.a ?? "")}`);
    lines.push(`      b: ${JSON.stringify(prior?.evidence.b ?? "")}`);
    lines.push(`    note: ${JSON.stringify(prior?.note ?? "")}`);
  }
  return lines.join("\n") + "\n";
}

/** The run's tier-2 defaults, as one line every surface prints. */
export function describeSettings(result: NominateResult): string {
  const s = result.settings;
  const parts: string[] = [];
  if (s.id) parts.push(`pairs containing ${s.id}`);
  if (s.collections) parts.push(`collections: ${s.collections.join(", ")}`);
  if (s.status) parts.push(`status: ${s.status.join(", ")}`);
  parts.push(`excluding status: ${s.excludeStatus.length > 0 ? s.excludeStatus.join(", ") : "(none)"}`);
  parts.push(`edges — ${describePairEdges({ settle: s.settleTypes, show: s.showTypes, close: s.closeTypes })}`);
  return parts.join("; ");
}

/** Pairs a render would offer, and how many a current verdict suppressed. */
export function offeredPairs(
  result: NominateResult,
  showJudged: boolean,
): { offered: PairCandidate[]; suppressed: number } {
  const offered = result.candidates.filter((c) => isOfferedPair(c, showJudged));
  return { offered, suppressed: result.candidates.length - offered.length };
}

// ─── parse ──────────────────────────────────────────────────────────────────

/** One row of a filled review file, as written — nothing validated but shape. */
export interface PairsReviewRow {
  /** 1-based position, for naming the row in a refusal. */
  index: number;
  a: string;
  b: string;
  a_hash: string;
  b_hash: string;
  relation: string | null;
  direction: string | null;
  defect: string | null;
  evidence: { a: string; b: string };
  note: string;
}

/**
 * Read the document back. Shape problems — not YAML, unknown keys, a row
 * with no pair or no hashes — refuse the whole file with every problem listed,
 * before anything is read from the corpus. Verdict problems are per row, and
 * are `acceptPairsFromFile`'s business.
 */
export function parsePairsReview(text: string): PairsReviewRow[] {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    throw new PairsAcceptError(
      `Review file is not valid YAML: ${err instanceof Error ? err.message : String(err)}`,
      "MALFORMED_FILE",
    );
  }
  if (doc == null) {
    throw new PairsAcceptError("Review file is empty — nothing to apply.", "MALFORMED_FILE");
  }
  if (typeof doc !== "object" || Array.isArray(doc)) {
    throw new PairsAcceptError(
      'Review file must be a map with "version" and "pairs" keys — re-emit it with: docdog pairs --format review',
      "MALFORMED_FILE",
    );
  }
  const map = doc as Record<string, unknown>;
  if (map.version !== PAIRS_REVIEW_FORMAT_VERSION) {
    throw new PairsAcceptError(
      `Unsupported review-file version ${JSON.stringify(map.version ?? null)} — this docdog reads version ${PAIRS_REVIEW_FORMAT_VERSION}.`,
      "UNKNOWN_VERSION",
    );
  }
  const rows = map.pairs ?? [];
  if (!Array.isArray(rows)) {
    throw new PairsAcceptError('"pairs" must be a list of rows.', "MALFORMED_FILE");
  }

  const problems: string[] = [];
  const parsed: PairsReviewRow[] = [];
  rows.forEach((row, i) => {
    const where = `row ${i + 1}`;
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      problems.push(`${where}: not a map`);
      return;
    }
    const r = row as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (!ROW_KEYS.has(key)) problems.push(`${where}: unknown key "${key}"`);
    }
    const a = str(r.a);
    const b = str(r.b);
    const aHash = str(r.a_hash);
    const bHash = str(r.b_hash);
    if (!a || !b) problems.push(`${where}: "a" and "b" are required — the pair's record ids`);
    if (a && b && a === b) problems.push(`${where}: "a" and "b" are the same record`);
    if (!aHash || !bHash) {
      problems.push(
        `${where}: "a_hash" and "b_hash" are required — they are how a stale verdict is caught; re-emit the file rather than deleting them`,
      );
    }
    for (const key of ["relation", "direction", "defect", "note"] as const) {
      if (r[key] != null && typeof r[key] !== "string") problems.push(`${where}: "${key}" must be a string`);
    }
    let evidence = { a: "", b: "" };
    if (r.evidence != null) {
      if (typeof r.evidence !== "object" || Array.isArray(r.evidence)) {
        problems.push(`${where}: "evidence" must be a map with a and b`);
      } else {
        const ev = r.evidence as Record<string, unknown>;
        for (const key of Object.keys(ev)) {
          if (key !== "a" && key !== "b") problems.push(`${where}: unknown evidence key "${key}"`);
        }
        if ((ev.a != null && typeof ev.a !== "string") || (ev.b != null && typeof ev.b !== "string")) {
          problems.push(`${where}: evidence quotes must be strings`);
        }
        evidence = {
          a: typeof ev.a === "string" ? ev.a : "",
          b: typeof ev.b === "string" ? ev.b : "",
        };
      }
    }
    if (a && b && a !== b && aHash && bHash) {
      parsed.push({
        index: i + 1,
        a,
        b,
        a_hash: aHash,
        b_hash: bHash,
        relation: str(r.relation),
        direction: str(r.direction),
        defect: str(r.defect),
        evidence,
        note: typeof r.note === "string" ? r.note.trim() : "",
      });
    }
  });

  if (problems.length > 0) {
    throw new PairsAcceptError(
      `Review file has ${problems.length} problem${plural(problems.length)} — nothing was applied:\n  ${problems.join("\n  ")}`,
      "INVALID_ROWS",
    );
  }
  return parsed;
}

// ─── validate + apply ───────────────────────────────────────────────────────

export type PairRefusal =
  | "record_not_found"
  | "duplicate_row"
  | "invalid_defect"
  | "reserved_relation"
  | "unregistered_relation"
  | "missing_direction"
  | "stale_hash"
  | "missing_evidence"
  | "evidence_not_found"
  | RelateSkipReason;

export interface PairRowOutcome {
  row: PairsReviewRow;
  /** True when the verdict was applied — or, under dryRun, would have been. */
  applied: boolean;
  refusal: PairRefusal | null;
  /** Names the side and the text for refusals that have one. */
  detail: string | null;
  /** The edge written for this row, when relation named a type. */
  edge: RelateInput | null;
  /** The ledger row this verdict became. */
  verdict: PairVerdict | null;
  /** True when the row's own edge is a closing type and its defect is not
   * none: the defect is closed the moment it is recorded. Reported, because
   * the banner on the stale side is still the author's to write. */
  closesOwnDefect: boolean;
}

export interface PairsAcceptOptions {
  dryRun?: boolean;
  allowEmptyContext?: boolean;
  allowCrossVisibility?: boolean;
  /** `pairs.edges`, resolved — the applier reads `close`, to report rows
   * whose own edge closes their defect, and checks every set as the scan does. */
  edges?: PairEdgeSteps;
}

export interface PairsAcceptReport {
  rowsRead: number;
  /** Rows with no verdict filled — deferred, exactly like a deleted row. */
  deferred: number;
  outcomes: PairRowOutcome[];
  edgesApplied: number;
  filesWritten: string[];
  verdictsAdded: number;
  verdictsRefreshed: number;
  /** Repo-relative ledger path, set only when this run wrote it. */
  verdictsFile: string | null;
  dryRun: boolean;
}

interface CurrentSide {
  hash: string;
  /** The record's whole file, LF-normalized and whitespace-collapsed. */
  haystack: string;
  file: string;
}

export async function acceptPairsFromFile(
  options: CacheIndexerOptions,
  filePath: string,
  opts: PairsAcceptOptions = {},
): Promise<PairsAcceptReport> {
  const absPath = isAbsolute(filePath) ? filePath : join(options.projectRoot, filePath);
  let text: string;
  try {
    text = readFileSync(absPath, "utf-8");
  } catch (err) {
    throw new PairsAcceptError(
      `Cannot read review file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      "UNREADABLE",
    );
  }
  const rows = parsePairsReview(text);
  const judged = rows.filter((r) => r.relation !== null || r.defect !== null);
  const deferred = rows.length - judged.length;

  // Registry and file locations from the cache; hashes and text from DISK.
  // A hash read from the cache would pass a row whose file was edited after
  // the last index, which is exactly the case the check exists for.
  const ids = new Set(judged.flatMap((r) => [r.a, r.b]));
  const { registry, files } = (() => {
    const handle = openCacheRead(options.projectRoot, { filePath: options.cacheFilePath });
    try {
      const stmt = handle.db.prepare(`SELECT file_path FROM vertices WHERE id = ?`);
      const files = new Map<string, string>();
      for (const id of ids) {
        const row = stmt.get(id) as { file_path: string } | undefined;
        if (row) files.set(id, row.file_path);
      }
      return { registry: loadRegistryFromCache(handle.db), files };
    } finally {
      handle.close();
    }
  })();
  // The scan refuses an unregistered name in any step; the applier reads only
  // `close`, and must refuse it the same way rather than quietly never
  // reporting a defect closed.
  const closeTypes = opts.edges ? checkPairEdges(opts.edges, new Set(registry.names())).close : [];
  const current = await readCurrentSides(options, files);

  const outcomes: PairRowOutcome[] = [];
  const pending: Array<{ outcome: PairRowOutcome; input: RelateInput }> = [];
  const seen = new Set<string>();
  const closing = new Set(closeTypes);

  for (const row of judged) {
    const outcome: PairRowOutcome = {
      row,
      applied: false,
      refusal: null,
      detail: null,
      edge: null,
      verdict: null,
      closesOwnDefect: false,
    };
    outcomes.push(outcome);
    const refuse = (refusal: PairRefusal, detail: string | null = null): void => {
      outcome.refusal = refusal;
      outcome.detail = detail;
    };

    const key = pairKey(row.a, row.b);
    if (seen.has(key)) {
      refuse("duplicate_row", `${row.a} ~ ${row.b} already has a verdict earlier in this file`);
      continue;
    }
    seen.add(key);

    const sideA = current.get(row.a);
    const sideB = current.get(row.b);
    if (!sideA || !sideB) {
      refuse("record_not_found", [!sideA ? row.a : null, !sideB ? row.b : null].filter(Boolean).join(", "));
      continue;
    }

    const defect = (row.defect ?? "none") as Defect;
    if (!(DEFECTS as readonly string[]).includes(defect)) {
      refuse("invalid_defect", `"${row.defect}" — one of ${DEFECTS.join(", ")}`);
      continue;
    }
    const relation = row.relation ?? "none";
    let direction: Direction | null = null;
    if (relation !== "none") {
      if (RESERVED_RELATIONS.has(relation)) {
        refuse("reserved_relation", `"${relation}" is relationship metadata, not a type`);
        continue;
      }
      if (!registry.has(relation)) {
        refuse(
          "unregistered_relation",
          `"${relation}" has no relation concept in .docdog/concepts/ — register it, or pick a registered type`,
        );
        continue;
      }
      if (row.direction !== "a->b" && row.direction !== "b->a") {
        refuse(
          "missing_direction",
          row.direction ? `"${row.direction}" — a->b or b->a` : "a->b or b->a — which record makes the claim",
        );
        continue;
      }
      direction = row.direction;
    }

    const staleSides = [
      sideA.hash !== row.a_hash ? row.a : null,
      sideB.hash !== row.b_hash ? row.b : null,
    ].filter((x): x is string => x !== null);
    if (staleSides.length > 0) {
      refuse(
        "stale_hash",
        `${staleSides.join(" and ")} changed since the file was emitted — the pair is re-offered on the next run`,
      );
      continue;
    }

    const needsEvidence = relation !== "none" || defect !== "none";
    if (needsEvidence) {
      const missing = [
        row.evidence.a.trim() === "" ? "a" : null,
        row.evidence.b.trim() === "" ? "b" : null,
      ].filter(Boolean);
      if (missing.length > 0) {
        refuse("missing_evidence", `evidence.${missing.join(" and evidence.")} is empty`);
        continue;
      }
      const notFound: string[] = [];
      if (!sideA.haystack.includes(collapse(row.evidence.a))) notFound.push(`a (${row.a}, ${sideA.file})`);
      if (!sideB.haystack.includes(collapse(row.evidence.b))) notFound.push(`b (${row.b}, ${sideB.file})`);
      if (notFound.length > 0) {
        refuse("evidence_not_found", `not verbatim in ${notFound.join(" and ")}`);
        continue;
      }
    }

    outcome.verdict = {
      a: row.a,
      b: row.b,
      hash_a: sideA.hash,
      hash_b: sideB.hash,
      relation,
      direction,
      defect,
      evidence: needsEvidence ? { a: row.evidence.a, b: row.evidence.b } : { a: "", b: "" },
      note: row.note,
    };
    outcome.closesOwnDefect = relation !== "none" && defect !== "none" && closing.has(relation);

    if (relation === "none") {
      outcome.applied = true;
      continue;
    }
    const [from, to] = direction === "a->b" ? [row.a, row.b] : [row.b, row.a];
    const input: RelateInput = { fromId: from, toId: to, type: relation, context: row.note };
    outcome.edge = input;
    pending.push({ outcome, input });
  }

  // Edges through the one batch path `suggest-edges --accept-from` uses, so the
  // cross-visibility guard (PROPOSAL-047), the recordable-source check and the
  // one-write-per-file economy all come along unchanged.
  const relate = await relateManyFileFirst(
    options,
    pending.map((p) => p.input),
    {
      dryRun: opts.dryRun,
      allowEmptyContext: opts.allowEmptyContext,
      allowCrossVisibility: opts.allowCrossVisibility,
    },
  );
  relate.outcomes.forEach((o, i) => {
    const { outcome } = pending[i];
    // An edge already on disk is the verdict already applied — the ledger row
    // is what this run adds. Any other skip leaves the verdict unapplied, so
    // no ledger row either: the pair must come back.
    if (o.applied || o.skipReason === "already_declared") {
      outcome.applied = true;
    } else {
      outcome.refusal = o.skipReason;
      outcome.detail = o.detail;
      outcome.verdict = null;
      outcome.closesOwnDefect = false;
    }
  });

  const incoming = outcomes.filter((o) => o.applied && o.verdict).map((o) => o.verdict!);
  const merged = mergePairVerdicts(loadPairVerdicts(options.projectRoot), incoming);
  let verdictsFile: string | null = null;
  if (!opts.dryRun && merged.added + merged.refreshed > 0) {
    savePairVerdicts(options.projectRoot, merged.rows);
    verdictsFile = PAIR_VERDICTS_FILE;
  }

  return {
    rowsRead: rows.length,
    deferred,
    outcomes,
    edgesApplied: relate.edgesApplied,
    filesWritten: relate.filesWritten,
    verdictsAdded: merged.added,
    verdictsRefreshed: merged.refreshed,
    verdictsFile,
    dryRun: opts.dryRun === true,
  };
}

/**
 * Each record's CURRENT body hash, computed from disk by the same parser the
 * indexer runs, plus its whole file as an evidence haystack.
 */
async function readCurrentSides(
  options: CacheIndexerOptions,
  files: Map<string, string>,
): Promise<Map<string, CurrentSide>> {
  const out = new Map<string, CurrentSide>();
  const byFile = new Map<string, string[]>();
  for (const [id, file] of files) {
    const list = byFile.get(file) ?? [];
    list.push(id);
    byFile.set(file, list);
  }
  for (const [file, ids] of byFile) {
    const absPath = join(options.projectRoot, file);
    const entry = governingScanEntry(options.config.scan_paths ?? [], file) ?? {
      path: file,
      parser: "default" as const,
    };
    const parsed = await parseFile(absPath, options.projectRoot, entry, options.config);
    if (!parsed) continue;
    let raw: string;
    try {
      raw = readFileSync(absPath, "utf-8");
    } catch {
      continue;
    }
    const haystack = collapse(raw);
    for (const id of ids) {
      // `id ?? sectionKey` is the indexer's own rule (indexer.ts), so an
      // id-less record — a skill, `default:<path>` — resolves here too.
      const section = parsed.sections.find((s) => (s.id ?? s.sectionKey) === id);
      if (section) out.set(id, { hash: section.contentHash, haystack, file });
    }
  }
  return out;
}

/** LF-normalized, whitespace-collapsed — the only liberty the verbatim check
 * takes. Rewrapping a line is not paraphrase; rewording one is. */
export function collapse(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

// ─── helpers ────────────────────────────────────────────────────────────────

function blockScalar(key: string, text: string, indent: number): string[] {
  const pad = " ".repeat(indent);
  if (text === "") return [`${pad}${key}: ""`];
  const body = text.split("\n");
  // An explicit indentation indicator when the first line starts with a
  // space, which a literal block would otherwise read as its indentation.
  const header = /^\s/.test(body[0]) ? `|2-` : `|-`;
  return [`${pad}${key}: ${header}`, ...body.map((l) => (l === "" ? "" : `${pad}  ${l}`))];
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function scalar(value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9.:_/-]*$/.test(value) ? value : JSON.stringify(value);
}
