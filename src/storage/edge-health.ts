/**
 * Corpus-wide edge checks, run after indexing (FRICTION-028).
 *
 * The per-entry guard in engine/relationships/extract.ts catches the one
 * malformed shape it can recognize from a single entry. These two checks are
 * the general net, and they need what no single entry knows: the registered
 * relation vocabulary, and the set of ids that actually exist. Both are only
 * true once every file is in the cache, so this runs as a post-pass — the same
 * shape as `recordContestedIds`, for the same reason.
 *
 * Both checks are mechanical (DP-001 tier 1): membership in a *declared*
 * registry, and the existence of a row. Neither judges whether an edge is the
 * *right* one — that is the semantic call FRICTION-012 correctly kept out of
 * code. A type is unregistered or it is not; a target resolves or it does not.
 *
 * Warnings only — nothing is persisted and nothing is bumped. Contested ids
 * earned a table because the losing record is otherwise *invisible*: no query
 * reaches it, so a scrolled-past warning was its only trace. A bad edge is not
 * invisible — it sits in the frontmatter the author is looking at, and
 * `traverse` shows it. The warning fires at the moment of authoring, which is
 * the moment it can be acted on.
 */
import type Database from "better-sqlite3";
import type { RelationsRegistry } from "../engine/relations-registry.js";
import { buildVisibilityIndex, isCrossVisibilityLeak } from "./visibility.js";

export interface UnknownTypeIssue {
  type: string;
  count: number;
  /** Up to a few `FROM_ID (file)` strings — enough to go fix it. */
  examples: string[];
}

export interface DanglingTargetIssue {
  fromId: string;
  toId: string;
  type: string;
  filePath: string;
}

/**
 * An edge from a record a clone WILL have to one it will NOT (PROPOSAL-047).
 * Two defects at once, and only the first is about privacy: the target's id
 * is published, and the edge dangles for every other clone.
 */
export interface CrossVisibilityIssue {
  fromId: string;
  toId: string;
  type: string;
  /** Tracked. */
  fromPath: string;
  /** Ignored, or outside the working tree. */
  toPath: string;
}

export interface EdgeHealthReport {
  unknownTypes: UnknownTypeIssue[];
  danglingTargets: DanglingTargetIssue[];
  /** Total edges carrying an unregistered type (not the number of types). */
  unknownTypeEdges: number;
  /** Edges crossing from in-clone to out-of-clone. Empty outside a git repo. */
  crossVisibility: CrossVisibilityIssue[];
}

const MAX_EXAMPLES = 3;

interface EdgeRow {
  from_id: string;
  to_id: string;
  type: string;
  file_path: string;
}

export function checkEdgeHealth(
  db: Database.Database,
  registry: RelationsRegistry,
  /**
   * Required, not optional: the cross-visibility check is skipped when git
   * cannot answer, and an omitted argument would look exactly like that from
   * the outside. A caller that forgot it would silently lose the check —
   * the failure shape FRICTION-050 was filed about.
   */
  projectRoot: string,
): EdgeHealthReport {
  const report: EdgeHealthReport = {
    unknownTypes: [],
    danglingTargets: [],
    unknownTypeEdges: 0,
    crossVisibility: [],
  };

  // An empty registry means the project has no relation concept records at
  // all — a corpus that predates the DP-002 seeds, or one that deleted them.
  // Every type would be "unknown" and the warning would be a wall of noise
  // saying nothing. No registry, no opinion.
  if (registry.size() > 0) {
    const rows = db
      .prepare(
        `SELECT e.from_id, e.to_id, e.type, v.file_path
           FROM edges e
           JOIN vertices v ON v.id = e.from_id
          ORDER BY e.type, v.file_path, e.from_id`,
      )
      .all() as EdgeRow[];

    const byType = new Map<string, UnknownTypeIssue>();
    for (const row of rows) {
      if (registry.has(row.type)) continue;
      let issue = byType.get(row.type);
      if (!issue) {
        issue = { type: row.type, count: 0, examples: [] };
        byType.set(row.type, issue);
      }
      issue.count++;
      report.unknownTypeEdges++;
      if (issue.examples.length < MAX_EXAMPLES) {
        issue.examples.push(`${row.from_id} (${row.file_path})`);
      }
    }
    report.unknownTypes = [...byType.values()].sort((a, b) => b.count - a.count);
  }

  // A target with no vertices row. The indexer's header calls this "just a
  // dangling row — exactly what the frontmatter says", and that stays true:
  // the row is still written. It is now also *reported*, because in practice
  // it means a typo'd id or, as this repo's own corpus showed, a sentence
  // where an id belonged.
  report.danglingTargets = db
    .prepare(
      `SELECT e.from_id, e.to_id, e.type, v.file_path
         FROM edges e
         JOIN vertices v ON v.id = e.from_id
         LEFT JOIN vertices t ON t.id = e.to_id
        WHERE t.id IS NULL
        ORDER BY v.file_path, e.from_id, e.to_id`,
    )
    .all()
    .map((r) => {
      const row = r as EdgeRow;
      return {
        fromId: row.from_id,
        toId: row.to_id,
        type: row.type,
        filePath: row.file_path,
      };
    });

  report.crossVisibility = checkCrossVisibility(db, projectRoot);

  return report;
}

interface ResolvedEdgeRow {
  from_id: string;
  to_id: string;
  type: string;
  from_path: string;
  to_path: string;
}

/**
 * Edges whose target will not be in a clone of this repository while their
 * source will (PROPOSAL-047).
 *
 * Inner-joined on both ends, so an edge with no target row is left to the
 * dangling-target check above rather than reported twice under two names.
 *
 * Silent outside a git repository, with no git binary, or on any git failure
 * — an optional guard over an optional integration has one safe direction to
 * fail in. `undecided` on either end is never a violation: an uncommitted
 * record is work in progress, not a leak.
 */
function checkCrossVisibility(db: Database.Database, projectRoot: string): CrossVisibilityIssue[] {
  const rows = db
    .prepare(
      `SELECT e.from_id, e.to_id, e.type,
              vf.file_path AS from_path, vt.file_path AS to_path
         FROM edges e
         JOIN vertices vf ON vf.id = e.from_id
         JOIN vertices vt ON vt.id = e.to_id
        ORDER BY vf.file_path, e.from_id, e.to_id`,
    )
    .all() as ResolvedEdgeRow[];
  if (rows.length === 0) return [];

  const paths = new Set<string>();
  for (const row of rows) {
    paths.add(row.from_path);
    paths.add(row.to_path);
  }
  const visibility = buildVisibilityIndex(projectRoot, [...paths]);
  if (!visibility.available) return [];

  const issues: CrossVisibilityIssue[] = [];
  for (const row of rows) {
    if (!isCrossVisibilityLeak(visibility.of(row.from_path), visibility.of(row.to_path))) continue;
    issues.push({
      fromId: row.from_id,
      toId: row.to_id,
      type: row.type,
      fromPath: row.from_path,
      toPath: row.to_path,
    });
  }
  return issues;
}

/** Render the report as warning lines. Empty when the corpus is clean. */
export function formatEdgeHealthWarnings(report: EdgeHealthReport): string[] {
  const lines: string[] = [];

  for (const issue of report.unknownTypes) {
    const shown = issue.examples.join(", ");
    const more = issue.count - issue.examples.length;
    lines.push(
      `  Cache: relation type "${issue.type}" is not registered — ` +
        `${issue.count} edge(s): ${shown}${more > 0 ? `, +${more} more` : ""}. ` +
        `Registered types are the \`name:\` of the relation concept records in .docdog/concepts/.`,
    );
  }

  if (report.danglingTargets.length > 0) {
    const shown = report.danglingTargets
      .slice(0, MAX_EXAMPLES)
      .map((d) => `${d.fromId} --[${d.type}]--> "${d.toId}" (${d.filePath})`);
    const more = report.danglingTargets.length - shown.length;
    lines.push(
      `  Cache: ${report.danglingTargets.length} edge(s) point at an id no record declares: ` +
        `${shown.join("; ")}${more > 0 ? `; +${more} more` : ""}.`,
    );
  }

  if (report.crossVisibility.length > 0) {
    const shown = report.crossVisibility
      .slice(0, MAX_EXAMPLES)
      .map((c) => `${c.fromId} --[${c.type}]--> ${c.toId} (${c.fromPath} -> ${c.toPath})`);
    const more = report.crossVisibility.length - shown.length;
    lines.push(
      `  Cache: ${report.crossVisibility.length} edge(s) point from a tracked record to one ` +
        `that will not be in a clone — the target's id is published and the edge dangles for ` +
        `everyone else: ${shown.join("; ")}${more > 0 ? `; +${more} more` : ""}. ` +
        `Record the relationship on the other side instead — traverse reads inbound edges.`,
    );
  }

  return lines;
}
