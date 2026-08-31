/**
 * Corpus/cache statistics — the engine half of `docdog_status` (MCP)
 * and `docdog status` (CLI, PROPOSAL-032).
 *
 * The stats used to be inlined in the MCP handler, which made `status`
 * the one kernel tool with no engine function to wrap — so the CLI
 * counterpart had nowhere to attach. Both surfaces are now adapters
 * over `collectStatus`: the MCP tool renders it as markdown, the CLI as
 * plain lines or JSON. Rendering is the only thing that differs.
 *
 * Read-only throughout: an absent embed store is a state to report, not
 * a file to create, so this never opens one `docdog index` has not
 * already written (PROPOSAL-029 §2).
 */
import { existsSync, statSync } from "node:fs";
import type { DocdogConfig } from "../types/config.js";
import { openCacheRead, getMeta } from "./cache.js";
import {
  MAX_EMBED_CHARS,
  checkEmbedHealth,
  embedRecipe,
  type EmbedHealthReport,
} from "./embed-health.js";
import {
  applyRetentionFloor,
  countSupersededRecipeRows,
  findUnusedRows,
  liveContentHashes,
  openEmbedStore,
  resolveEmbedStorePath,
  retentionCutoff,
  DEFAULT_RETAIN_DAYS,
} from "./embed-store.js";
import { readContestedIds, type ContestedId } from "./renumber.js";
import { loadStatusVocabulary, type StatusVocabulary } from "./status-vocabulary.js";
import { scopeExpr } from "./search.js";
import { META_KEYS } from "./schema.js";
import { describeInstall, type InstallReport } from "../engine/upgrade.js";

export interface EmbedStoreReport {
  path: string;
  /** True when the store lives in the git common dir, shared by every worktree. */
  shared: boolean;
  exists: boolean;
  /** Null until `docdog index` has created the store. */
  vectors: number | null;
  sizeMb: number | null;
  /**
   * Vectors no live vertex in *this* working tree hashes to (OBS-021).
   * The store is grow-only by design, so every edit orphans its
   * predecessor and this number climbs with revision volume rather than
   * with corpus size — reported because that growth is otherwise
   * invisible until someone notices the file.
   *
   * Not "evictable" on its own: on a shared store these rows may be live
   * in a sibling worktree, so `docdog gc` unions every working tree's
   * liveness before it sweeps (DISC-032) and evicts the complement of
   * that union, not of this number. Null until the store exists.
   */
  unused: number | null;
  /**
   * How many of `unused` the retention floor would currently hold back
   * (`embed.retain_days`, OBS-026). Reported so that the number status
   * names and the number `gc` actually evicts cannot disagree — the same
   * invariant that put the liveness query behind one shared
   * `findUnusedRows` (OBS-021). Without it, status points at a command
   * that then evicts fewer rows than status just described, which is the
   * quiet mismatch this file exists to prevent rather than create.
   *
   * Zero when the floor is off or nothing is young enough to hold.
   */
  retainedByFloor: number | null;
  /**
   * Vectors keyed to a recipe other than the current one (FRICTION-035) —
   * the store's *unreachable* stratum. `unused` counts rows nothing
   * *hashes* to; this counts rows nothing can *reach*. They were the same
   * set until a recipe (model, cap, or dtype) first changed and then
   * diverged: a superseded-recipe row whose content is still live is
   * counted as USED by `unused` though no lookup will ever return it.
   *
   * Disclosure only, and deliberately so: these rows are retained rather
   * than swept because that retention is exactly what makes reverting the
   * recipe free (FRICTION-033), so `status` states the cost as the
   * embed-cap warning does and leaves it. Not a subset of `unused` and does
   * not sum with it. Null until the store exists.
   */
  supersededRecipe: number | null;
}

export interface StatusReport {
  /**
   * The installation rather than the corpus: version, how this copy was
   * installed, and the registry verdict `update --check` last cached.
   *
   * First field because it is the first thing a reader needs — and because
   * `docdog status --json` is the environment block PROPOSAL-043's issue
   * template requires, where a report with no version is a round-trip to ask
   * for one. Read from disk; nothing here opens a socket (PROPOSAL-042 §3).
   */
  install: InstallReport;
  collections: Array<{ collection: string; count: number }>;
  /**
   * The status values a filter may name (FRICTION-038) — the same service
   * the collection counts above perform for `--collection`. Without it the
   * only ways to learn the vocabulary were to guess wrong and read the
   * refusal, or to group `list --json` by hand.
   */
  statuses: StatusVocabulary;
  /**
   * The visibility scopes in use, with counts, by count desc (FRICTION-050).
   *
   * The same service `collections` and `statuses` perform for their filters,
   * and more load-bearing than either: DD-058 makes scope an open vocabulary
   * — free string, no enum, no registration — so `--scope` cannot refuse an
   * unknown value the way `--collection` and `--status` do. There is no
   * wrong-guess path that teaches you the vocabulary, because a wrong guess
   * is indistinguishable from a right one with no matches. This roster is
   * the only way to learn it.
   *
   * Computed through `scopeExpr`, the same expression the filter uses, so
   * the default a record inherits here is the default it is matched by.
   */
  scopes: Array<{ scope: string; count: number }>;
  files: number;
  edges: number;
  embeddedChunks: number;
  embedModel: string;
  cachePath: string;
  cacheSizeMb: number;
  embedStore: EmbedStoreReport;
  scanPaths: string[];
  /**
   * Ids two or more files claim (PROPOSAL-031). Health, which is what
   * status is for: every loser here is a record the cache cannot show you.
   */
  contested: ContestedId[];
  /**
   * Records whose tail is past the embed cap. The same kind of fact as
   * `contested` — a part of the corpus a query cannot reach — differing only
   * in that the unreachable part is a record's tail rather than a whole
   * record, and that the vector leg loses it while FTS does not.
   */
  embedHealth: EmbedHealthReport;
}

/**
 * Gather the report. Throws when no usable cache exists — an unindexed
 * project is a state each surface reports in its own voice, not an
 * error this function can render.
 */
export function collectStatus(projectRoot: string, config: DocdogConfig): StatusReport {
  const handle = openCacheRead(projectRoot);
  try {
    const db = handle.db;
    const collections = db
      .prepare(
        `SELECT collection, COUNT(*) AS n FROM vertices GROUP BY collection ORDER BY collection`,
      )
      .all() as Array<{ collection: string; n: number }>;
    const scopes = db
      .prepare(
        `SELECT ${scopeExpr("v")} AS scope, COUNT(*) AS n
           FROM vertices v
          GROUP BY scope
          ORDER BY n DESC, scope ASC`,
      )
      .all() as Array<{ scope: string; n: number }>;
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

    return {
      install: describeInstall(projectRoot),
      collections: collections.map((c) => ({ collection: c.collection, count: c.n })),
      statuses: loadStatusVocabulary(db),
      scopes: scopes.map((r) => ({ scope: r.scope, count: r.n })),
      files: count(`SELECT COUNT(*) AS n FROM files`),
      edges: count(`SELECT COUNT(*) AS n FROM edges`),
      embeddedChunks: count(`SELECT COUNT(*) AS n FROM chunks WHERE embedding IS NOT NULL`),
      embedModel: getMeta(db, META_KEYS.embedModel) ?? config.embed.model,
      cachePath: handle.path,
      cacheSizeMb: statSync(handle.path).size / 1024 / 1024,
      embedStore: describeEmbedStore(config, projectRoot, db),
      scanPaths: config.scan_paths.map((p) => (typeof p === "string" ? p : p.path)),
      contested: readContestedIds(db),
      embedHealth: checkEmbedHealth(db),
    };
  } finally {
    handle.close();
  }
}

/**
 * The one fiddly line both surfaces print identically.
 *
 * When there are unused vectors it gains a second line, because the fact
 * and what (if anything) to do about it are different sentences. The
 * remedy differs by scope and is stated rather than performed: an
 * unshared store names the command that sweeps it, a shared one names
 * why no command will (DP-001 tier 1 — report the state, leave the
 * retention policy to a human).
 */
export function formatEmbedStore(store: EmbedStoreReport): string {
  const scope = store.shared ? "shared across worktrees" : "project-local";
  if (!store.exists) return `${store.path} (${scope}, not created yet)`;

  const head = `${store.path} (${store.vectors} vector(s), ${store.sizeMb!.toFixed(1)} MB, ${scope})`;
  const pct = (n: number) => Math.round((n / store.vectors!) * 100);
  const lines: string[] = [];

  if (store.unused) {
    // A shared store no longer refuses the sweep — DISC-032 replaced that
    // refusal with a union across every working tree, because `shared` means
    // "git answered" and so the refusal fired on every git project including
    // single-worktree ones. What survives is the weaker true statement: this
    // count is one tree's answer, and gc evicts the complement of the union,
    // which is a subset of it.
    const held = store.retainedByFloor ?? 0;
    const remedy =
      held >= store.unused
        ? // Everything unused is too young to sweep. Naming gc here would
          // send someone to a command that evicts nothing (OBS-026).
          "all of them held by the retention floor for now (embed.retain_days)"
        : store.shared
          ? 'run "docdog gc" to evict them — it unions every worktree first, so it may keep some of these'
          : 'run "docdog gc" to evict them';
    lines.push(`  ${store.unused} (${pct(store.unused)}%) unused by this working tree — ${remedy}`);
    if (held > 0 && held < store.unused) {
      lines.push(`    ${held} of those are held by the retention floor (embed.retain_days)`);
    }
  }

  if (store.supersededRecipe) {
    // Disclosure, not a call to action (FRICTION-035): these rows are keyed
    // to a recipe no lookup will produce again, so they are unreachable — but
    // keeping them is exactly what makes reverting the model/cap/dtype free
    // (FRICTION-033). So status states the cost and stops, as the embed-cap
    // warning does; it does NOT point at gc, which keys on content and would
    // not sweep these anyway.
    lines.push(
      `  ${store.supersededRecipe} (${pct(store.supersededRecipe)}%) written under a superseded recipe — ` +
        `unreachable until it reverts; kept (not swept) so reverting stays free`,
    );
  }

  return lines.length > 0 ? `${head}\n${lines.join("\n")}` : head;
}

/**
 * A contested id as both surfaces report it: who holds the id, who lost it,
 * and the one command that resolves the loser. The resolution names a
 * placeholder id, never a computed one — picking the winner is the agent's
 * call, and so is the id the loser gets (PROPOSAL-031).
 */
/**
 * The scope roster's lines — empty when the corpus uses one scope.
 *
 * `collections` and `statuses` always print because they always vary. Scope
 * usually does not: on a corpus where nothing declares one, DD-058's default
 * makes every record `shared`, and `shared: 356` is a line that teaches
 * nobody anything about a filter with one possible value. It appears when
 * there is something to learn, which is exactly when `--scope` becomes worth
 * typing (FRICTION-050). `--json` carries the roster unconditionally: a
 * consumer that groups by scope wants the one-scope answer too.
 */
export function formatScopes(scopes: Array<{ scope: string; count: number }>): string[] {
  if (scopes.length < 2) return [];
  return scopes.map((s) => `  ${s.scope}: ${s.count}`);
}

export function formatContestedId(entry: ContestedId): string[] {
  const lines = [
    `  ${entry.id}: indexed from ${entry.winner ?? "(none — no cache row)"}`,
  ];
  for (const loser of entry.losers) {
    lines.push(`    also claimed by ${loser} — this record is invisible to search, get and traverse`);
  }
  const loser = entry.losers[0];
  if (loser) {
    lines.push(`    resolve: docdog renumber ${entry.id} <new-id> --file ${loser}  (or renumber the other one)`);
  }
  return lines;
}

function describeEmbedStore(
  config: DocdogConfig,
  projectRoot: string,
  indexDb: import("better-sqlite3").Database,
): EmbedStoreReport {
  const location = resolveEmbedStorePath(projectRoot, config);

  if (!existsSync(location.path)) {
    return {
      path: location.path,
      shared: location.shared,
      exists: false,
      vectors: null,
      sizeMb: null,
      unused: null,
      retainedByFloor: null,
      supersededRecipe: null,
    };
  }

  const store = openEmbedStore(projectRoot, config);
  try {
    const vectors = (
      store.db.prepare(`SELECT COUNT(*) AS n FROM embed_cache`).get() as { n: number }
    ).n;
    // This tree's hashes only — status reports what *this* worktree can
    // see, and says so in its wording. gc unions every tree before it
    // deletes (DISC-032).
    const unused = findUnusedRows(store.db, liveContentHashes(indexDb));
    // The floor gc would apply, computed here so the remedy status prints
    // matches what that command would actually do (OBS-026).
    const retainDays = config.embed?.retain_days ?? DEFAULT_RETAIN_DAYS;
    const { retained } = applyRetentionFloor(unused, retentionCutoff(retainDays));

    return {
      path: location.path,
      shared: location.shared,
      exists: true,
      vectors,
      sizeMb: statSync(location.path).size / 1024 / 1024,
      unused: unused.length,
      retainedByFloor: retained.length,
      // The current recipe is the one a lookup would compose now — same
      // inputs resolveEmbeddings uses (config model + cap + dtype), so every
      // row keyed to anything else is unreachable (FRICTION-035).
      supersededRecipe: countSupersededRecipeRows(
        store.db,
        embedRecipe(config.embed.model, MAX_EMBED_CHARS, config.embed.dtype),
      ),
    };
  } finally {
    store.close();
  }
}
