/**
 * Undeclared-edge suggestion scanner — PROPOSAL-024, resurrecting
 * v2's PROPOSAL-010 scanner (OBS-003 proved the loop) over the v3
 * cache.
 *
 * For each vertex's body text, find mentions of other known record
 * ids (DD-070, FRICTION-016, DD-ARCH-01, ...). Drop self-references
 * and mentions the source already has an outbound edge to; report
 * the residuals as suggestions.
 *
 * DP-001 compliance: the scan is mechanical (regex + set diff). The
 * suggested type is always `references` — a visible Tier-2 default
 * the accepting agent overrides at will. Nothing is written; the
 * agent+user loop decides what to do with each suggestion
 * (docdog_relate records accepted ones).
 */
import type Database from "better-sqlite3";
import type { DocdogConfig } from "../types/config.js";
import { matchScanEntry } from "./indexer.js";
import { assertKnownStatuses } from "./search.js";
import { rejectionIndex, rejectionKey, type Rejection } from "./rejections.js";
import { isCrossVisibilityLeak, type VisibilityIndex } from "./visibility.js";

/**
 * Mention grammar: uppercase dash-joined segments ending in digits —
 * multi-segment ids included (DD-ARCH-01, FR-ADMIN-01), matched
 * whole so a DD-ARCH-01 mention can never be read as ARCH-01 (a v2
 * bug: its `[A-Z][A-Z0-9]*-\d+` could match the tail of a
 * multi-segment id). Lookalikes that happen to match (UTF-8,
 * SHA-256) are filtered by the known-id intersection, never
 * reported on their own.
 *
 * A trailing `/<digits>` run belongs to the mention: authors write
 * sibling ids as `OQ-18/19/21` and `PROPOSAL-025/026`, and the bare
 * numbers repeat the stem of the id in front of them (see
 * `expandMention`). Matching only the head hid the siblings and left
 * the report offering an edge to OQ-18 but not OQ-19 or OQ-21 — the
 * scanner manufacturing the arbitrary-subset shape its own triage
 * taxonomy tells reviewers to reject (OBS-011 §3, OBS-014).
 */
const MENTION_REGEX = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+(?:\/\d+)*\b/g;

/**
 * A fresh matcher over the same grammar, for callers that need match
 * positions rather than a set of ids (`docdog renumber`'s prose report,
 * PROPOSAL-031). One grammar, two readers: the mention scanner is the
 * only place that decides what counts as naming a record, and renumber
 * must rewrite exactly what suggest-edges would have seen.
 */
export function mentionMatcher(): RegExp {
  return new RegExp(MENTION_REGEX.source, "g");
}

/** Visible Tier-2 default (DP-001) — the agent overrides per edge. */
const SUGGESTED_TYPE = "references";

/**
 * Expand one raw match into the ids it names: `OQ-18/19/21` →
 * OQ-18, OQ-19, OQ-21; `DD-ARCH-01/02` → DD-ARCH-01, DD-ARCH-02.
 * Each `/<digits>` group re-uses the head's stem — everything up to
 * and including its final dash.
 *
 * Purely lexical (DP-001 Tier 1): it decides nothing about whether an
 * expansion is real, and cannot. `DD-070/2` expands to DD-2 the same
 * way, and the known-id intersection in `suggestEdges` drops it —
 * the same net that already catches UTF-8 and SHA-256.
 */
export function expandMention(raw: string): string[] {
  const [head, ...tails] = raw.split("/");
  if (tails.length === 0) return [head];
  const stem = head.slice(0, head.lastIndexOf("-") + 1);
  return [head, ...tails.map((digits) => stem + digits)];
}

/** Every id named in a body, in reading order, deduped. */
export function mentionedIds(body: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_REGEX)) {
    for (const id of expandMention(match[0])) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export interface SuggestOptions {
  /** Only scan sources in these collections. */
  collections?: string[];
  /** Only scan sources whose id matches this glob-ish pattern (`*` wildcard, e.g. "DD-*"). */
  idPattern?: string;
  /** Only scan sources whose file path contains this substring. */
  pathFilter?: string;
  /**
   * Allowlist: only scan sources whose status is one of these. Same
   * vocabulary as `search --status`.
   */
  status?: string[];
  /**
   * Blocklist: skip sources whose status is one of these — the mechanical
   * half of FRICTION-025. A superseded record should not be growing new
   * outbound edges, so `excludeStatus: ["superseded"]` drops the largest
   * standing-rule prune (117 of 138 in OBS-014) with no judgment. Matches
   * `search --exclude-status` clause-for-clause, `status IS NULL` guard
   * included: the indexer materializes a missing status as "current"
   * (indexer.ts), so that branch is belt-and-suspenders here as it is there,
   * kept for parity rather than a live path.
   */
  excludeStatus?: string[];
  /**
   * The agent-authored reject ledger (PROPOSAL-046). Candidates it covers are
   * *marked*, never dropped: the scan returns everything it found and the
   * renderers decide what to show, so a suppressed candidate is always one
   * `--show-rejected` away and the count is always computable.
   *
   * Passed in rather than loaded here — reading a file is the caller's job,
   * and this function stays a pure read over the cache.
   */
  rejections?: readonly Rejection[];
  /**
   * Git-derived visibility over the corpus (PROPOSAL-047). Candidates whose
   * target will not be in a clone are *marked*, never dropped — the same
   * line the ledger is held to, for the same reason: the scanner reports,
   * the agent decides.
   *
   * Passed in rather than built here, matching `rejections`: shelling out to
   * git is the caller's job and this function stays a pure read over the
   * cache. Absent, or unavailable, means nothing is marked.
   */
  visibility?: VisibilityIndex;
}

/** A ledger row's verdict on one candidate, resolved against the source's
 * current body hash. */
export interface RejectionMark {
  reason: string;
  /**
   * True when the source body has changed since the judgment was made, so
   * the rejection no longer covers the text the mention now sits in. A stale
   * mark is re-offered rather than suppressed — the invalidation FRICTION-025
   * asked for — and carries its reason along so re-affirming is a glance.
   */
  stale: boolean;
}

/** Set when accepting this candidate would write an edge out of the clone. */
export interface CrossVisibilityMark {
  /** The target's file — ignored, or outside the working tree. */
  target_file: string;
}

export interface EdgeSuggestion {
  type: string;
  target_id: string;
  /** Set when the ledger names this pair. Absent means never judged. */
  rejected?: RejectionMark;
  /**
   * Set when the source is in the clone and the target is not. Unlike
   * `rejected`, this NEVER suppresses: a rejection is a judgment someone
   * made about this pair, while this is a fact about two files, and the
   * reviewer may still want the relationship — recorded on the other side.
   */
  cross_visibility?: CrossVisibilityMark;
}

export interface SuggestionsForSource {
  source_id: string;
  source_title: string | null;
  source_collection: string;
  source_file: string;
  /**
   * False when the source file is split/table/script-parsed: those
   * records have no per-section frontmatter, so relate/update refuse
   * them (see storage/writes.ts). The edge must be recorded on a
   * default-parsed record instead, or the file edited directly.
   */
  recordable: boolean;
  suggestions: EdgeSuggestion[];
}

/**
 * Scan every indexed vertex (or the filtered subset) for undeclared
 * id mentions. Pure cache read — requires a populated index, writes
 * nothing.
 *
 * Sources without a frontmatter id participate too (their vertex id
 * is the path-derived fallback key): their outbound references are
 * as recordable as anyone's — v2 skipped them, v3 doesn't.
 */
export function suggestEdges(
  db: Database.Database,
  config: DocdogConfig,
  opts: SuggestOptions = {},
): SuggestionsForSource[] {
  // Same refusal as `search` and `list` (FRICTION-038). This command's
  // status filters exist to prune a drain — `--exclude-status superseded`
  // took 117 of 138 candidates in OBS-014 — so a value that matches nothing
  // hands back a candidate set that looks pruned and is not.
  assertKnownStatuses(db, opts);

  // id -> file, not just the id set: the cross-visibility mark needs the
  // target's file to ask the visibility index about it.
  const knownIds = new Map<string, string>(
    (
      db.prepare(`SELECT id, file_path FROM vertices`).all() as Array<{
        id: string;
        file_path: string;
      }>
    ).map((r) => [r.id, r.file_path]),
  );

  // All declared outbound edges in one pass — corpus scale makes a
  // full load cheaper and simpler than per-source queries. Dangling
  // targets (edge to a missing vertex) still count as declared: the
  // author already recorded intent; re-suggesting it would nag.
  const outbound = new Map<string, Set<string>>();
  const edgeRows = db.prepare(`SELECT from_id, to_id FROM edges`).all() as Array<{
    from_id: string;
    to_id: string;
  }>;
  for (const e of edgeRows) {
    let targets = outbound.get(e.from_id);
    if (!targets) {
      targets = new Set();
      outbound.set(e.from_id, targets);
    }
    targets.add(e.to_id);
  }

  // Filters compose with AND, mirroring search's clause vocabulary so the
  // two commands read the same (status IS NULL survives an exclude, per
  // search.ts). idPattern and pathFilter stay in the loop below: they are
  // glob/substring, not SQL columns.
  const clauses: string[] = [];
  const params: string[] = [];
  if (opts.collections && opts.collections.length > 0) {
    clauses.push(`collection IN (${opts.collections.map(() => "?").join(", ")})`);
    params.push(...opts.collections);
  }
  if (opts.status && opts.status.length > 0) {
    clauses.push(`status IN (${opts.status.map(() => "?").join(", ")})`);
    params.push(...opts.status);
  }
  if (opts.excludeStatus && opts.excludeStatus.length > 0) {
    clauses.push(
      `(status IS NULL OR status NOT IN (${opts.excludeStatus.map(() => "?").join(", ")}))`,
    );
    params.push(...opts.excludeStatus);
  }
  let sql = `SELECT id, title, collection, file_path, content_hash, body_text FROM vertices`;
  if (clauses.length > 0) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += ` ORDER BY collection, id`;

  const sources = db.prepare(sql).all(...params) as Array<{
    id: string;
    title: string | null;
    collection: string;
    file_path: string;
    content_hash: string;
    body_text: string;
  }>;

  // Parser resolution is per file, and split files carry many
  // vertices — resolve once per path.
  const recordableByPath = new Map<string, boolean>();
  const isRecordable = (filePath: string): boolean => {
    const normalized = filePath.replace(/\\/g, "/");
    let known = recordableByPath.get(normalized);
    if (known === undefined) {
      const entry = matchScanEntry(config.scan_paths, normalized);
      known = (entry?.parser ?? "default") === "default";
      recordableByPath.set(normalized, known);
    }
    return known;
  };

  const rejected = rejectionIndex(opts.rejections ?? []);

  const results: SuggestionsForSource[] = [];
  for (const src of sources) {
    if (opts.idPattern && !matchPattern(src.id, opts.idPattern)) continue;
    if (opts.pathFilter && !src.file_path.replace(/\\/g, "/").includes(opts.pathFilter)) continue;

    const declared = outbound.get(src.id);
    const suggestions: EdgeSuggestion[] = [];
    for (const id of mentionedIds(src.body_text)) {
      if (id === src.id) continue;
      if (!knownIds.has(id)) continue;
      if (declared?.has(id)) continue;
      // A rejection annotates; it never removes. Dropping the row here would
      // put the ledger's effect out of reach of every caller including
      // --json, and "suppression must be visible" is the line DP-001 draws
      // between recording a judgment and deciding what the agent may see.
      const judged = rejected.get(rejectionKey(src.id, id));
      const targetFile = knownIds.get(id);
      const leaks =
        opts.visibility?.available === true &&
        targetFile !== undefined &&
        isCrossVisibilityLeak(opts.visibility.of(src.file_path), opts.visibility.of(targetFile));
      suggestions.push({
        type: SUGGESTED_TYPE,
        target_id: id,
        ...(judged
          ? { rejected: { reason: judged.reason, stale: judged.source_hash !== src.content_hash } }
          : {}),
        ...(leaks ? { cross_visibility: { target_file: targetFile as string } } : {}),
      });
    }

    if (suggestions.length > 0) {
      results.push({
        source_id: src.id,
        source_title: src.title,
        source_collection: src.collection,
        source_file: src.file_path,
        recordable: isRecordable(src.file_path),
        suggestions,
      });
    }
  }

  return results;
}

/** Simple glob: `*` matches anything; no `?` or character classes. */
function matchPattern(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

// ─── ledger-aware views ─────────────────────────────────────────────────────

/**
 * Is this candidate offered for review?
 *
 * Three states, and only the first is hidden: a *fresh* rejection (the body
 * it was judged against is the body on disk) is suppressed; a *stale* one is
 * re-offered, because the text moved under the judgment; an unjudged
 * candidate is offered as it always was. `showRejected` sees through all of
 * it — the tier-2 override that keeps the default from being a decision.
 */
export function isOffered(s: EdgeSuggestion, showRejected = false): boolean {
  return showRejected || !s.rejected || s.rejected.stale;
}

/**
 * The scan as a renderer should show it. Sources left with nothing to offer
 * drop out entirely, so a fully-rejected source does not print as an empty
 * heading.
 */
export function offeredSuggestions(
  results: readonly SuggestionsForSource[],
  showRejected = false,
): SuggestionsForSource[] {
  const kept: SuggestionsForSource[] = [];
  for (const r of results) {
    const suggestions = r.suggestions.filter((s) => isOffered(s, showRejected));
    if (suggestions.length > 0) kept.push({ ...r, suggestions });
  }
  return kept;
}

/** How many candidates the ledger is currently hiding. Printed on every run
 * that hides any — the count is what makes the suppression visible. */
export function suppressedCount(results: readonly SuggestionsForSource[]): number {
  let n = 0;
  for (const r of results) {
    for (const s of r.suggestions) if (s.rejected && !s.rejected.stale) n++;
  }
  return n;
}

/** Ledger rows matching no candidate in this scan — the mention was removed,
 * the edge was declared by hand, a record was deleted, or `renumber` moved an
 * id out from under the row. Reported, never reaped: which of those it is is
 * not in the data, and a dead row costs one line. */
/**
 * How many offered candidates would write an edge out of the clone.
 *
 * Distinct from `suppressedCount` in the one way that matters: these are
 * *shown*, so this is a count of what the reviewer is looking at rather than
 * of what was held back.
 */
export function crossVisibilityCount(results: readonly SuggestionsForSource[]): number {
  let n = 0;
  for (const r of results) {
    for (const s of r.suggestions) if (s.cross_visibility) n++;
  }
  return n;
}

export function orphanRejections(
  results: readonly SuggestionsForSource[],
  rejections: readonly Rejection[],
): Rejection[] {
  const seen = new Set<string>();
  for (const r of results) {
    for (const s of r.suggestions) seen.add(rejectionKey(r.source_id, s.target_id));
  }
  return rejections.filter((r) => !seen.has(rejectionKey(r.from, r.to)));
}
