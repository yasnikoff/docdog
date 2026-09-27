/**
 * The pair-verdict ledger — PROPOSAL-049's durable half.
 *
 * `docdog pairs` nominates similar record pairs; something outside docdog
 * judges them; `--accept-from` validates the verdicts and stores each applied
 * one here. A stored verdict keeps its pair out of later runs while both
 * bodies are unchanged, which is what stops the next run re-judging the same
 * thirty pairs (OBS-029's scratch script had no memory at all).
 *
 * Two differences from PROPOSAL-046's reject ledger, both deliberate:
 *
 * - **Keyed on both bodies.** A rejected mention is a claim only its source
 *   makes, so `rejected-edges.yaml` keys on the source hash. A pair's defect can
 *   begin with an edit to either side, so a row here expires when EITHER body
 *   changes, and the pair comes back carrying its old verdict pre-filled.
 * - **A defect row is not a rejection.** It stays listed by `pairs --defects`
 *   until a closing edge (`pairs.edges.close`) joins the pair, and adding that edge is what fixing
 *   the defect produces. Being judged cannot make an open defect go quiet.
 *
 * The file is tracked, beside the corpus, never in the disposable cache.
 *
 * DP-001: this module reads and writes rows a judge wrote, and compares hashes.
 * Nothing here decides a verdict, and no future flag may.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";

/** Bumped only when a row's meaning changes; an unknown version is a hard
 * error, never a guess (the `rejections.ts` rule). */
export const PAIR_VERDICTS_FORMAT_VERSION = 1;

/** Repo-relative, fixed — one corpus, one ledger. */
export const PAIR_VERDICTS_FILE = ".docdog/pair-verdicts.yaml";

/** The closed defect vocabulary. `none` is a verdict too: "judged, no defect". */
export const DEFECTS = ["none", "contradiction", "duplicate", "stale"] as const;
export type Defect = (typeof DEFECTS)[number];

/** `a->b`: a is the source of the edge. Always relative to the row's own a/b. */
export type Direction = "a->b" | "b->a";

export class PairVerdictsError extends Error {
  constructor(
    message: string,
    public code: "UNREADABLE" | "MALFORMED_FILE" | "UNKNOWN_VERSION" | "INVALID_ROWS",
  ) {
    super(message);
    this.name = "PairVerdictsError";
  }
}

export interface PairVerdict {
  /** The lexically smaller id — rows are stored canonically (see `canonicalVerdict`). */
  a: string;
  b: string;
  /** `vertices.content_hash` of each side when the verdict was applied: body
   * only, LF-normalized, frontmatter excluded — so writing the verdict's own
   * edge cannot expire it, and editing either body does. */
  hash_a: string;
  hash_b: string;
  /** A registered relation type, or `none`. */
  relation: string;
  /** Present exactly when `relation` is not `none`. */
  direction: Direction | null;
  defect: Defect;
  /** Verbatim quotes, one per side. Empty when relation and defect are both none. */
  evidence: { a: string; b: string };
  note: string;
}

const ROW_KEYS = new Set([
  "a",
  "b",
  "hash_a",
  "hash_b",
  "relation",
  "direction",
  "defect",
  "evidence",
  "note",
]);

/** Pair identity, order-independent. */
export function pairKey(x: string, y: string): string {
  return x < y ? `${x} ${y}` : `${y} ${x}`;
}

export function verdictIndex(rows: readonly PairVerdict[]): Map<string, PairVerdict> {
  const index = new Map<string, PairVerdict>();
  for (const r of rows) index.set(pairKey(r.a, r.b), r);
  return index;
}

/**
 * Store every row with a < b. A row written the other way round is the same
 * verdict, so its hashes and evidence swap sides and its direction flips.
 */
export function canonicalVerdict(v: PairVerdict): PairVerdict {
  if (v.a <= v.b) return v;
  return {
    ...v,
    a: v.b,
    b: v.a,
    hash_a: v.hash_b,
    hash_b: v.hash_a,
    direction: v.direction === null ? null : v.direction === "a->b" ? "b->a" : "a->b",
    evidence: { a: v.evidence.b, b: v.evidence.a },
  };
}

/**
 * The verdict as seen from a pair whose `a` is `a` — the inverse of
 * `canonicalVerdict`, used to pre-fill a re-offered row in the row's own order.
 */
export function orientVerdict(v: PairVerdict, a: string): PairVerdict {
  if (v.a === a) return v;
  return {
    ...v,
    a: v.b,
    b: v.a,
    hash_a: v.hash_b,
    hash_b: v.hash_a,
    direction: v.direction === null ? null : v.direction === "a->b" ? "b->a" : "a->b",
    evidence: { a: v.evidence.b, b: v.evidence.a },
  };
}

// ─── read ───────────────────────────────────────────────────────────────────

export function pairVerdictsPath(projectRoot: string): string {
  return join(projectRoot, PAIR_VERDICTS_FILE);
}

/** A project that has judged nothing has no file, and that is not an error. */
export function loadPairVerdicts(projectRoot: string): PairVerdict[] {
  const path = pairVerdictsPath(projectRoot);
  if (!existsSync(path)) return [];
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (err) {
    throw new PairVerdictsError(
      `Cannot read ${PAIR_VERDICTS_FILE}: ${err instanceof Error ? err.message : String(err)}`,
      "UNREADABLE",
    );
  }
  return parsePairVerdicts(text);
}

/**
 * Parse the ledger. Every bad row is reported at once and nothing is returned
 * on any failure: a half-read ledger would half-suppress, which is
 * indistinguishable from a corpus with fewer candidates.
 */
export function parsePairVerdicts(text: string): PairVerdict[] {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    throw new PairVerdictsError(
      `${PAIR_VERDICTS_FILE} is not valid YAML: ${err instanceof Error ? err.message : String(err)}`,
      "MALFORMED_FILE",
    );
  }
  if (doc == null) return [];
  if (typeof doc !== "object" || Array.isArray(doc)) {
    throw new PairVerdictsError(
      `${PAIR_VERDICTS_FILE} must be a map with "version" and "verdicts" keys.`,
      "MALFORMED_FILE",
    );
  }
  const map = doc as Record<string, unknown>;
  if (map.version !== PAIR_VERDICTS_FORMAT_VERSION) {
    throw new PairVerdictsError(
      `Unsupported ${PAIR_VERDICTS_FILE} version ${JSON.stringify(map.version ?? null)} — this docdog reads version ${PAIR_VERDICTS_FORMAT_VERSION}.`,
      "UNKNOWN_VERSION",
    );
  }
  const rows = map.verdicts ?? [];
  if (!Array.isArray(rows)) {
    throw new PairVerdictsError(`"verdicts" must be a list of rows.`, "MALFORMED_FILE");
  }

  const problems: string[] = [];
  const parsed: PairVerdict[] = [];
  // One pair, one row: verdictIndex keeps the last and openDefects reads
  // them all, so a duplicate would mean two different things to two readers.
  const firstRow = new Map<string, number>();
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
    const hashA = str(r.hash_a);
    const hashB = str(r.hash_b);
    const relation = str(r.relation);
    const defect = str(r.defect);
    const direction = str(r.direction);
    if (!a) problems.push(`${where}: "a" is required`);
    if (!b) problems.push(`${where}: "b" is required`);
    if (a && b && a === b) problems.push(`${where}: "a" and "b" are the same record, ${a}`);
    if (a && b && a !== b) {
      const key = pairKey(a, b);
      const first = firstRow.get(key);
      if (first !== undefined) problems.push(`${where}: repeats the pair ${a} ~ ${b} from row ${first} — one row per pair`);
      else firstRow.set(key, i + 1);
    }
    if (!hashA || !hashB) {
      problems.push(
        `${where}: "hash_a" and "hash_b" are required — without them nothing can tell a live verdict from a stale one`,
      );
    }
    if (!relation) problems.push(`${where}: "relation" is required — a type, or none`);
    if (!defect || !(DEFECTS as readonly string[]).includes(defect)) {
      problems.push(`${where}: "defect" must be one of ${DEFECTS.join(", ")}`);
    }
    if (relation && relation !== "none" && direction !== "a->b" && direction !== "b->a") {
      problems.push(`${where}: "direction" must be a->b or b->a when relation is set`);
    }
    const ev = r.evidence;
    if (ev != null) {
      if (typeof ev !== "object" || Array.isArray(ev)) {
        problems.push(`${where}: "evidence" must be a map with "a" and "b" quotes`);
      } else {
        for (const side of ["a", "b"] as const) {
          const q = (ev as Record<string, unknown>)[side];
          if (q != null && typeof q !== "string") problems.push(`${where}: evidence.${side} must be a quoted string`);
        }
      }
    }
    const evidence =
      ev != null && typeof ev === "object" && !Array.isArray(ev)
        ? {
            a: typeof (ev as Record<string, unknown>).a === "string" ? ((ev as Record<string, unknown>).a as string) : "",
            b: typeof (ev as Record<string, unknown>).b === "string" ? ((ev as Record<string, unknown>).b as string) : "",
          }
        : { a: "", b: "" };
    if (a && b && a !== b && hashA && hashB && relation && defect && (DEFECTS as readonly string[]).includes(defect)) {
      parsed.push(
        canonicalVerdict({
          a,
          b,
          hash_a: hashA,
          hash_b: hashB,
          relation,
          direction: relation === "none" ? null : (direction as Direction),
          defect: defect as Defect,
          evidence,
          note: typeof r.note === "string" ? r.note : "",
        }),
      );
    }
  });

  if (problems.length > 0) {
    throw new PairVerdictsError(
      `${PAIR_VERDICTS_FILE} has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`,
      "INVALID_ROWS",
    );
  }
  return parsed;
}

// ─── write ──────────────────────────────────────────────────────────────────

export interface VerdictMergeResult {
  rows: PairVerdict[];
  /** Pairs the ledger did not carry before. */
  added: number;
  /** Pairs it did, whose verdict or hashes this run changed — re-affirming a
   * stale verdict is this, not an edge case. */
  refreshed: number;
}

/** Fold new verdicts in, last writer wins per pair. */
export function mergePairVerdicts(
  existing: readonly PairVerdict[],
  incoming: readonly PairVerdict[],
): VerdictMergeResult {
  const index = verdictIndex(existing);
  let added = 0;
  let refreshed = 0;
  for (const raw of incoming) {
    const row = canonicalVerdict(raw);
    const key = pairKey(row.a, row.b);
    const prior = index.get(key);
    if (!prior) added++;
    else if (JSON.stringify(prior) !== JSON.stringify(row)) refreshed++;
    else continue;
    index.set(key, row);
  }
  return { rows: sortVerdicts([...index.values()]), added, refreshed };
}

/** Stable order so the tracked file's diff shows the row that changed. */
export function sortVerdicts(rows: readonly PairVerdict[]): PairVerdict[] {
  return [...rows].sort((x, y) => (x.a === y.a ? cmp(x.b, y.b) : cmp(x.a, y.a)));
}

/** LF, UTF-8, no BOM. */
export function renderPairVerdicts(rows: readonly PairVerdict[]): string {
  const lines = [
    "# Similar-pair verdicts — docdog pairs will not re-offer a pair while both",
    "# bodies are unchanged (PROPOSAL-049). When either body changes, the pair",
    "# comes back carrying the verdict below, pre-filled.",
    "#",
    "# A row with a defect other than none stays listed by `docdog pairs --defects`",
    "# until a closing edge (pairs.edges.close) joins the pair. Delete a row to have its pair judged again.",
    `version: ${PAIR_VERDICTS_FORMAT_VERSION}`,
  ];
  if (rows.length === 0) {
    lines.push("verdicts: []");
  } else {
    lines.push("verdicts:");
    for (const v of sortVerdicts(rows.map(canonicalVerdict))) {
      lines.push(`  - a: ${scalar(v.a)}`);
      lines.push(`    b: ${scalar(v.b)}`);
      lines.push(`    hash_a: ${scalar(v.hash_a)}`);
      lines.push(`    hash_b: ${scalar(v.hash_b)}`);
      lines.push(`    relation: ${scalar(v.relation)}`);
      if (v.direction) lines.push(`    direction: ${v.direction}`);
      lines.push(`    defect: ${v.defect}`);
      if (v.evidence.a !== "" || v.evidence.b !== "") {
        lines.push(`    evidence:`);
        lines.push(`      a: ${JSON.stringify(v.evidence.a)}`);
        lines.push(`      b: ${JSON.stringify(v.evidence.b)}`);
      }
      if (v.note !== "") lines.push(`    note: ${JSON.stringify(v.note)}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function savePairVerdicts(projectRoot: string, rows: readonly PairVerdict[]): string {
  const path = pairVerdictsPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderPairVerdicts(rows), "utf-8");
  return path;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function scalar(value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9.:_/-]*$/.test(value) ? value : JSON.stringify(value);
}
