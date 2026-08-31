/**
 * The review-file half of the suggest → review → accept loop —
 * PROPOSAL-028, closing the gap FRICTION-024 named (the same bulk-accept
 * step hand-scripted three times across two corpora).
 *
 * `suggest-edges --format review` renders candidates as a flat YAML
 * document; the agent writes a context sentence on each row it keeps and a
 * `reject:` reason on each row it refuses; `--accept-from` reads that same
 * document back, applies the kept rows as forward edges and records the
 * refused ones in the ledger (`rejections.ts`). Both directions live here on
 * purpose: the property that makes the loop work is round-trip symmetry —
 * what the tool emits is exactly what it eats.
 *
 * The row grew a second verdict rather than the loop growing a second file
 * (PROPOSAL-046). Deleting a row keeps its old meaning — defer, resurfaces
 * next sweep — so there are three moves over two keys and no new grammar.
 *
 * Only five keys per row are load-bearing (from, to, type, and then either
 * context or reject; plus an optional anchor_text). The source file path is
 * a comment, never data: the applier resolves every source from the cache,
 * so a stale or hand-edited path cannot steer a write somewhere unintended.
 * That whole class of drift is deleted by not representing it.
 *
 * DP-001: this module moves an agent's already-written judgment onto
 * disk. Which candidate is real, what its context sentence says, and why a
 * rejected one is not an edge are all decided before the tool runs — and the
 * reviewed file *is* the record of that decision. There is deliberately no
 * scoring, no auto-accept, no auto-reject, and no flag that would apply or
 * refuse a candidate nobody read; those would be Tier 3.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CacheIndexerOptions } from "./indexer.js";
import { openCacheRead } from "./cache.js";
import { isOffered, type SuggestionsForSource } from "./suggest.js";
import {
  loadRejections,
  mergeRejections,
  saveRejections,
  REJECTIONS_FILE,
  type Rejection,
} from "./rejections.js";
import {
  relateManyFileFirst,
  type RelateInput,
  type RelateManyResult,
  type RelateOutcome,
} from "./writes.js";

/**
 * Bumped only when a row's meaning changes; an unknown version is a hard
 * error, never a guess.
 *
 * PROPOSAL-046's `reject:` key did *not* bump it: adding a key changes no
 * existing row's meaning, and a bump would make every already-emitted file
 * unreadable to gain nothing. An older docdog handed a newer file refuses it
 * by name (`unknown key "reject"`), which is the honest direction to fail.
 */
export const REVIEW_FORMAT_VERSION = 1;

export class AcceptError extends Error {
  constructor(
    message: string,
    public code: "UNREADABLE" | "MALFORMED_FILE" | "UNKNOWN_VERSION" | "INVALID_ROWS",
  ) {
    super(message);
    this.name = "AcceptError";
  }
}

export interface ReviewEdge {
  from: string;
  to: string;
  type: string;
  context: string;
  anchor_text?: string | null;
}

/**
 * A row the reviewer refused, with the sentence saying why.
 *
 * No `type`: a rejection is keyed on the pair. The scanner only ever
 * suggests `references`, and "this mention is not an edge" says nothing
 * about which type it would otherwise have been.
 */
export interface ReviewRejection {
  from: string;
  to: string;
  reason: string;
}

/** Both verdicts a reviewed file carries. A row that is neither was deleted,
 * which still means *defer* — the third move, and the one that needs no
 * representation at all. */
export interface ReviewDocument {
  accepts: ReviewEdge[];
  rejects: ReviewRejection[];
}

/** Row keys with meaning. Anything else is a typo, and typos that parse
 * are the expensive kind — `contxt:` would silently empty the context, and
 * `rejct:` would silently accept what you meant to refuse. */
const ROW_KEYS = new Set(["from", "to", "type", "context", "anchor_text", "reject"]);

/** A type colliding with a relationship metadata key would misparse on
 * ingest (extract.ts reads the first non-metadata key as the type). */
const RESERVED_TYPES = new Set(["context", "anchor_text", "role"]);

// ─── emit ───────────────────────────────────────────────────────────────────

export interface RenderReviewOptions {
  /** Echoed in the header so the file records how it was produced. */
  commandLine?: string;
  /** Echoed in the "Apply with:" line. */
  fileName?: string;
  /**
   * Emit rows the reject ledger already covers, pre-filled with their old
   * reason. Off by default (they are suppressed and counted in the header);
   * on, the document becomes a full re-review of everything the scan found.
   */
  showRejected?: boolean;
}

/**
 * Render candidates as the reviewable YAML document. Flat, not nested by
 * source: grouping is a comment, so deferring a candidate is deleting one
 * contiguous block — the operation the reviewer performs most.
 *
 * Three row shapes come out of one grammar (PROPOSAL-046). An unjudged
 * candidate gets `context: ""` to fill. A candidate whose rejection went
 * *stale* — the source body changed under the judgment — comes back
 * pre-filled with `reject:` and its old reason, so re-affirming it is
 * leaving the row alone. A candidate whose rejection is still live is
 * omitted and counted in the header, never dropped in silence.
 *
 * Non-recordable sources (split/table/script-parsed) are omitted with a
 * footer saying how many and why: they have no per-section frontmatter to
 * patch, so the applier would only refuse them row by row. `--format yaml`
 * is their path — a paste-ready fragment for a hand edit.
 */
export function renderReviewDocument(
  results: SuggestionsForSource[],
  opts: RenderReviewOptions = {},
): string {
  const recordable = results.filter((r) => r.recordable);
  const omitted = results.filter((r) => !r.recordable);
  const show = opts.showRejected === true;
  const offered = recordable
    .map((r) => ({ ...r, suggestions: r.suggestions.filter((s) => isOffered(s, show)) }))
    .filter((r) => r.suggestions.length > 0);
  const total = countSuggestions(offered);
  // Counted across every source, recordable or not: a candidate hidden by
  // the ledger is hidden whatever else was true about its file.
  const suppressed = countSuggestions(results) - countSuggestions(offered) - countSuggestions(omitted);
  const fileName = opts.fileName ?? "candidates.yaml";

  const lines: string[] = [];
  if (opts.commandLine) lines.push(`# ${opts.commandLine}`);
  lines.push(
    `# ${total} candidate${plural(total)} across ${offered.length} record${plural(offered.length)}.`,
  );
  if (suppressed > 0) {
    lines.push(
      `# ${suppressed} more suppressed by ${REJECTIONS_FILE} — rerun with --show-rejected to review them too.`,
    );
  }
  lines.push(
    "# Write a context: for each row you keep. Replace context: with reject: <why>",
  );
  lines.push("# to refuse one durably. Delete a row to defer it to the next sweep.");
  lines.push(`# Apply with: docdog suggest-edges --accept-from ${fileName}`);
  lines.push(`version: ${REVIEW_FORMAT_VERSION}`);

  if (total === 0) {
    lines.push("edges: []");
  } else {
    lines.push("edges:");
    for (const r of offered) {
      lines.push(`  # ${r.source_id} — ${posix(r.source_file)}`);
      for (const s of r.suggestions) {
        if (s.rejected) {
          lines.push(
            s.rejected.stale
              ? `  # previously rejected, and this record's body has changed since —`
              : `  # previously rejected, and still current —`,
          );
          lines.push(`  #   keep the row to re-affirm, or swap reject: for context: to accept`);
        }
        if (s.cross_visibility) {
          // Warned, never withheld and never pre-rejected: a filter and a
          // rejection are different claims (PROPOSAL-046), so this must not
          // arrive as a `reject:` the reviewer never wrote.
          lines.push(
            `  # ${s.target_id} lives in ${posix(s.cross_visibility.target_file)}, which will not be in a clone —`,
          );
          lines.push(
            `  #   accepting publishes its id; record it on ${s.target_id} instead, or apply with --allow-cross-visibility`,
          );
        }
        lines.push(`  - from: ${scalar(r.source_id)}`);
        lines.push(`    to: ${scalar(s.target_id)}`);
        lines.push(`    type: ${scalar(s.type)}`);
        lines.push(
          s.rejected ? `    reject: ${JSON.stringify(s.rejected.reason)}` : `    context: ""`,
        );
      }
    }
  }

  if (omitted.length > 0) {
    const n = countSuggestions(omitted);
    lines.push("");
    lines.push(
      `# ${n} candidate${plural(n)} from ${omitted.length} multi-record file${plural(omitted.length)} omitted —`,
    );
    lines.push("# split/table/script-parsed records have no per-section frontmatter to patch.");
    lines.push("# Re-run with --format yaml for a paste-ready fragment, or record the edge");
    lines.push("# on a citing default-parsed record instead:");
    for (const r of omitted) {
      lines.push(`#   ${r.source_id} — ${posix(r.source_file)} (${r.suggestions.length})`);
    }
  }

  return lines.join("\n") + "\n";
}

// ─── parse ──────────────────────────────────────────────────────────────────

/**
 * Read the reviewed document back. Every row is validated here, before
 * anything touches disk — a malformed file exits having written nothing,
 * and reports *all* of its bad rows at once rather than one per run.
 *
 * Returns both verdicts. A row carries `context:` (accept) or `reject:`
 * (refuse); the rows that carry neither are the ones that are not there.
 */
export function parseReviewDocument(text: string): ReviewDocument {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    throw new AcceptError(
      `Review file is not valid YAML: ${err instanceof Error ? err.message : String(err)}`,
      "MALFORMED_FILE",
    );
  }

  if (doc == null) {
    throw new AcceptError("Review file is empty — nothing to apply.", "MALFORMED_FILE");
  }
  if (typeof doc !== "object" || Array.isArray(doc)) {
    throw new AcceptError(
      'Review file must be a map with "version" and "edges" keys — re-emit it with: docdog suggest-edges --format review',
      "MALFORMED_FILE",
    );
  }

  const map = doc as Record<string, unknown>;
  if (map.version !== REVIEW_FORMAT_VERSION) {
    throw new AcceptError(
      `Unsupported review-file version ${JSON.stringify(map.version ?? null)} — this docdog reads version ${REVIEW_FORMAT_VERSION}. Re-emit the candidates with: docdog suggest-edges --format review`,
      "UNKNOWN_VERSION",
    );
  }

  const rows = map.edges ?? [];
  if (!Array.isArray(rows)) {
    throw new AcceptError('"edges" must be a list of rows.', "MALFORMED_FILE");
  }

  const problems: string[] = [];
  const edges: ReviewEdge[] = [];
  const rejects: ReviewRejection[] = [];

  rows.forEach((row, i) => {
    const where = `row ${i + 1}`;
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      problems.push(`${where}: not a map — expected from / to / type / context keys`);
      return;
    }
    const r = row as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (!ROW_KEYS.has(key)) {
        problems.push(
          `${where}: unknown key "${key}" — a row carries from, to, type, then context or reject, and optionally anchor_text, nothing else`,
        );
      }
    }

    const from = nonEmptyString(r.from);
    if (!from) problems.push(`${where}: "from" is required — the source record's id`);
    const to = nonEmptyString(r.to);
    if (!to) problems.push(`${where}: "to" is required — the target record's id`);

    // The verdict fork. `reject:` present at all means this row is a
    // rejection, whatever else it carries — a reviewer who typed a reason
    // meant to refuse, and quietly reading that as an accept is the one
    // misinterpretation that writes a lie into the graph.
    if ("reject" in r) {
      const reason = nonEmptyString(r.reject);
      if (r.reject != null && typeof r.reject !== "string") {
        problems.push(`${where}: "reject" must be a string — the reason this is not an edge`);
      } else if (!reason) {
        // No --allow-empty-reason, and there must never be one. An empty
        // context has a use (accept now, contextualize later); an empty
        // reason recreates exactly the amnesia the ledger exists to end.
        problems.push(
          `${where}: "reject" needs a reason — a reasonless rejection is what this file exists to stop being`,
        );
      }
      // `context: ""` alongside is what the emitter itself wrote, so it
      // carries no information and is tolerated. A context with words in it
      // is two verdicts, and the row does not say which one is meant.
      const ctx = r.context;
      if (typeof ctx === "string" && ctx.trim() !== "") {
        problems.push(
          `${where}: carries both a context and a reject — one row, one verdict; delete whichever is not meant`,
        );
        return;
      }
      // `type` is not required here and is ignored: a rejection is keyed on
      // the pair, so which type it would have been is not a fact about it.
      if (from && to && reason) rejects.push({ from, to, reason });
      return;
    }

    const type = nonEmptyString(r.type);
    if (!type) problems.push(`${where}: "type" is required — e.g. references`);
    else if (RESERVED_TYPES.has(type)) {
      problems.push(
        `${where}: "${type}" is a reserved relationship metadata key and cannot be a relation type`,
      );
    }

    const context = r.context == null ? "" : r.context;
    if (typeof context !== "string") problems.push(`${where}: "context" must be a string`);

    const anchor = r.anchor_text ?? null;
    if (anchor !== null && typeof anchor !== "string") {
      problems.push(`${where}: "anchor_text" must be a string`);
    }

    if (from && to && type && !RESERVED_TYPES.has(type) && typeof context === "string" && (anchor === null || typeof anchor === "string")) {
      edges.push({ from, to, type, context, anchor_text: anchor });
    }
  });

  if (problems.length > 0) {
    throw new AcceptError(
      `Review file has ${problems.length} problem${plural(problems.length)} — nothing was applied:\n  ${problems.join("\n  ")}`,
      "INVALID_ROWS",
    );
  }

  return { accepts: edges, rejects };
}

// ─── apply ──────────────────────────────────────────────────────────────────

export interface AcceptOptions {
  /** Classify and report, write nothing — neither edges nor ledger. */
  dryRun?: boolean;
  /** Apply rows whose context is empty (default: skip them). */
  allowEmptyContext?: boolean;
  /** Apply rows whose target will not be in a clone (default: skip them). */
  allowCrossVisibility?: boolean;
}

/** Why a reject row did not reach the ledger. One reason so far, and it is
 * the accept side's `source_not_found` wearing its own name. */
export type RejectSkipReason = "source_not_found";

export interface RejectOutcome {
  rejection: ReviewRejection;
  /** True when the row was stored — or, under dryRun, would have been. */
  recorded: boolean;
  skipReason: RejectSkipReason | null;
}

export interface AcceptReport extends RelateManyResult {
  /** Accept rows the file carried — applied + skipped. */
  edgesRead: number;
  /** Reject rows the file carried — recorded + skipped. */
  rejectionsRead: number;
  rejectionOutcomes: RejectOutcome[];
  /** Pairs the ledger did not carry before this run. */
  rejectionsAdded: number;
  /** Pairs it did, whose reason or source hash this run moved — the ordinary
   * shape of re-affirming a stale rejection. */
  rejectionsRefreshed: number;
  /** Repo-relative ledger path, set only when this run wrote it. */
  rejectionsFile: string | null;
  dryRun: boolean;
}

/**
 * Read a reviewed candidate file and apply both of its verdicts.
 *
 * Order matters in one place: the source body hashes every rejection is
 * keyed to are read *before* any edge is written. Appending to a
 * `relationships:` block does not change a body hash — frontmatter is
 * outside it — but reading first means that stays a fact about the data
 * rather than a dependency on the write path never changing.
 */
export async function acceptEdgesFromFile(
  options: CacheIndexerOptions,
  filePath: string,
  opts: AcceptOptions = {},
): Promise<AcceptReport> {
  const absPath = isAbsolute(filePath) ? filePath : join(options.projectRoot, filePath);
  let text: string;
  try {
    text = readFileSync(absPath, "utf-8");
  } catch (err) {
    throw new AcceptError(
      `Cannot read review file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      "UNREADABLE",
    );
  }

  const { accepts, rejects } = parseReviewDocument(text);

  const { outcomes: rejectionOutcomes, rows: newRows } = resolveRejections(options, rejects);

  const inputs: RelateInput[] = accepts.map((e) => ({
    fromId: e.from,
    toId: e.to,
    type: e.type,
    context: e.context,
    anchorText: e.anchor_text ?? null,
  }));

  const result = await relateManyFileFirst(options, inputs, {
    dryRun: opts.dryRun,
    allowEmptyContext: opts.allowEmptyContext,
    allowCrossVisibility: opts.allowCrossVisibility,
  });

  const merged = mergeRejections(loadRejections(options.projectRoot), newRows);
  let rejectionsFile: string | null = null;
  if (!opts.dryRun && merged.added + merged.refreshed > 0) {
    saveRejections(options.projectRoot, merged.rows);
    rejectionsFile = REJECTIONS_FILE;
  }

  return {
    ...result,
    edgesRead: inputs.length,
    rejectionsRead: rejects.length,
    rejectionOutcomes,
    rejectionsAdded: merged.added,
    rejectionsRefreshed: merged.refreshed,
    rejectionsFile,
    dryRun: opts.dryRun === true,
  };
}

/**
 * Pair each reject row with the source body it is being judged against.
 *
 * A row whose source has no cache row is skipped, not stored with a blank
 * hash: without a hash nothing could ever tell the rejection from a stale
 * one, so it would suppress the candidate forever — the one outcome this
 * design refuses to allow anywhere.
 */
function resolveRejections(
  options: CacheIndexerOptions,
  rejects: readonly ReviewRejection[],
): { outcomes: RejectOutcome[]; rows: Rejection[] } {
  const outcomes: RejectOutcome[] = [];
  const rows: Rejection[] = [];
  if (rejects.length === 0) return { outcomes, rows };

  const handle = openCacheRead(options.projectRoot, { filePath: options.cacheFilePath });
  try {
    const stmt = handle.db.prepare(`SELECT content_hash FROM vertices WHERE id = ?`);
    for (const rejection of rejects) {
      const row = stmt.get(rejection.from) as { content_hash: string } | undefined;
      if (!row) {
        outcomes.push({ rejection, recorded: false, skipReason: "source_not_found" });
        continue;
      }
      outcomes.push({ rejection, recorded: true, skipReason: null });
      rows.push({ ...rejection, source_hash: row.content_hash });
    }
  } finally {
    handle.close();
  }
  return { outcomes, rows };
}

/** Rows that warn but apply anyway: the registry is advisory (DP-002),
 * and an edge to an unknown id dangles honestly rather than refusing. */
export function warningsFor(outcomes: RelateOutcome[]): {
  unregisteredType: RelateOutcome[];
  danglingTarget: RelateOutcome[];
} {
  const applied = outcomes.filter((o) => o.applied);
  return {
    unregisteredType: applied.filter((o) => !o.typeKnown),
    danglingTarget: applied.filter((o) => !o.targetKnown),
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function countSuggestions(results: SuggestionsForSource[]): number {
  return results.reduce((n, r) => n + r.suggestions.length, 0);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Ids are plain identifiers in practice; quote anything else so the
 * emitted document always parses back. */
function scalar(value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) ? value : JSON.stringify(value);
}
