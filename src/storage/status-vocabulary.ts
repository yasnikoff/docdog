/**
 * The status values a filter may name (FRICTION-038).
 *
 * `--collection` has refused an unknown name since FRICTION-030; `--status`
 * and `--exclude-status` did not, and the two failed in opposite directions.
 * An allowlist naming nothing fails **closed** — an empty result that reads
 * as *no such records exist*. A blocklist naming nothing fails **open** —
 * the whole corpus comes back looking like a successful query, with no empty
 * screen to make anyone suspicious. `docdog list` exists precisely so a
 * filtered set can be treated as a completeness claim (FRICTION-036), which
 * makes it the command where a silently-inert filter does the most damage.
 *
 * The vocabulary is a union of two facts, and it needs both halves:
 *
 *   - **present** — `SELECT DISTINCT status`. Covers the value a record
 *     carries that no concept record ever declared (this corpus has one:
 *     `obsolete`). A registry is advisory (DISC-023); the corpus is not.
 *   - **declared** — the `status_vocabulary:` blocks on the `concepts`
 *     records DP-002 puts on disk. Covers the value that is legitimate and
 *     simply unused yet — `archived`, `draft`, `wont_fix` here — which is
 *     the same carve-out FRICTION-030 made when it kept a declared-but-empty
 *     collection returning an honest empty. A vocabulary entry nothing uses
 *     yet is not a typo.
 *
 * This is the first thing in v3 `src/` to *consume* those blocks, which have
 * shipped as data-only since PROPOSAL-026. Worth saying out loud rather than
 * sliding in: it gives an advisory registry teeth. They stay advisory in the
 * direction that matters — declaring a status never *requires* anything, and
 * a corpus with no concept records at all validates fine against `present`
 * alone.
 *
 * DP-001 tier 1 throughout: two SELECTs and a set membership test. The
 * forbidden move is the tempting one — deciding that `opne` meant `open` and
 * quietly correcting it, which is the alias map FRICTION-030 already refused.
 */
import type Database from "better-sqlite3";

export interface StatusVocabulary {
  /** Values some indexed record actually carries, with counts, by count desc. */
  present: Array<{ status: string; count: number }>;
  /** Values a collection concept declares but no record uses yet. */
  declaredUnused: string[];
  /** present ∪ declared — the set a filter may name. */
  known: Set<string>;
}

/**
 * Read the vocabulary out of the cache. Pure read, no config: both halves
 * are rows, which is what lets `search`, `list`, `suggest-edges` and
 * `status` share one answer instead of four approximations of it.
 */
export function loadStatusVocabulary(db: Database.Database): StatusVocabulary {
  // COALESCE mirrors the indexer, which materializes a missing frontmatter
  // `status:` as "current" (indexer.ts) — the NULL guards elsewhere in the
  // filters are defensive, and this must agree with them either way.
  const present = db
    .prepare(
      `SELECT COALESCE(status, 'current') AS status, COUNT(*) AS n
         FROM vertices
        GROUP BY COALESCE(status, 'current')
        ORDER BY n DESC, status ASC`,
    )
    .all() as Array<{ status: string; n: number }>;

  const inUse = new Set(present.map((r) => r.status));
  const declared = new Set<string>();

  // Same load path as the relations registry (storage/relations.ts): the
  // concepts rows are derived from the DP-002 records on disk, so nothing
  // seeds the database and a project that never adopted concepts simply
  // contributes none.
  const rows = db
    .prepare(`SELECT frontmatter_json FROM vertices WHERE collection = 'concepts'`)
    .all() as Array<{ frontmatter_json: string }>;
  for (const row of rows) {
    let fm: Record<string, unknown>;
    try {
      fm = JSON.parse(row.frontmatter_json) as Record<string, unknown>;
    } catch {
      continue;
    }
    const vocab = fm.status_vocabulary;
    if (typeof vocab !== "object" || vocab === null || Array.isArray(vocab)) continue;
    for (const name of Object.keys(vocab)) {
      if (name !== "") declared.add(name);
    }
  }

  return {
    present: present.map((r) => ({ status: r.status, count: r.n })),
    declaredUnused: [...declared].filter((d) => !inUse.has(d)).sort(),
    known: new Set([...inUse, ...declared]),
  };
}

/**
 * The roster, for `docdog status` — the surface that answers "what statuses
 * does this corpus use" *before* a filter is typed, the way the collection
 * counts already answer it for `--collection`. Without it, the only way to
 * learn the vocabulary was to guess wrong and read the refusal, or to pipe
 * `list --json` through a group-by (FRICTION-038's stated workaround).
 */
export function formatStatusVocabulary(vocab: StatusVocabulary): string[] {
  const lines = vocab.present.map((s) => `  ${s.status}: ${s.count}`);
  if (vocab.declaredUnused.length > 0) {
    lines.push(`  declared, unused: ${vocab.declaredUnused.join(", ")}`);
  }
  return lines;
}
