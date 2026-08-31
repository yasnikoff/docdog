/**
 * Sweeping the embed store — the mechanism `docdog gc` renders and
 * `docdog index` invokes on its own (OBS-026).
 *
 * The store is grow-only by construction (PROPOSAL-029) and has been
 * sweepable since DISC-032 taught `gc` to union every worktree's liveness
 * instead of refusing whenever git answered. What OBS-026 measured is that
 * neither fact helps unless something runs the sweep, and that the growth
 * nobody could reclaim was not the growth anyone had modelled:
 *
 *   - **Edits, the assumed driver, are ~1.2 rows/day here — about 2 MB a
 *     year.** OBS-021's ~18 MB/year was extrapolated across a window that
 *     happened to contain a full re-embed, and the steady state is an
 *     order of magnitude below it.
 *   - **A recipe change orphans the whole corpus at once.** One cap change
 *     left 390 rows / 1.7 MB frozen and unreachable — half the file, and
 *     ~1.4 years of edit churn, in a day. Content-keyed `gc` cannot touch
 *     any of it, by design (FRICTION-033 retains it so reverting is free).
 *   - **Deleting rows did not shrink the file.** Nothing in `src/` ran
 *     `VACUUM`, so the freed pages stayed on SQLite's freelist and the
 *     only symptom anyone reports went unaddressed by the only command
 *     that addressed it.
 *
 * So this module is four things that compose rather than one policy: a
 * liveness sweep (DISC-032), a retention floor over it (DISC-032 item 3),
 * an opt-in recipe prune (the stratum above), and compaction (so the file
 * reflects any of it). Each is separately switchable, and the caller —
 * a flag, or a config default — decides which run.
 *
 * Every failure is a value rather than a throw. `index` calls this for its
 * own reasons and must not fail because a sweep did; and every row here is
 * derived state, so the worst outcome of any wrong answer is a re-embed
 * (DD-070 §2) — CPU, never data.
 */
import type { DocdogConfig } from "../types/config.js";
import { openCacheRead } from "../storage/cache.js";
import { collectCloneLiveness, type WorktreeLiveness } from "../storage/clone-liveness.js";
import { MAX_EMBED_CHARS, embedRecipe } from "../storage/embed-health.js";
import {
  compactStore,
  deleteSupersededRecipeRows,
  evictStaleEmbeddings,
  findOtherVintages,
  findUnusedRows,
  openEmbedStore,
  retentionCutoff,
  DEFAULT_RETAIN_DAYS as RETAIN_DAYS_DEFAULT,
  type CompactionResult,
  type EmbedStoreVintage,
} from "../storage/embed-store.js";

/**
 * Default for `embed.auto_gc`, applied wherever config omits it. Its
 * sibling `DEFAULT_RETAIN_DAYS` lives in `storage/embed-store.ts` beside
 * the floor it parameterizes, so `status` can report the floor without
 * importing this module (which would point storage/ at engine/).
 */
export const DEFAULT_AUTO_GC = true;
export { DEFAULT_RETAIN_DAYS } from "../storage/embed-store.js";

export interface SweepOptions {
  /** Compute and report, write nothing. */
  dryRun?: boolean;
  /** Override `embed.retain_days`. 0 disables the floor. */
  retainDays?: number;
  /**
   * Also delete rows keyed to a superseded recipe (`gc --prune-recipes`).
   * Never set by the automatic path — it spends the free-revert property
   * FRICTION-033 bought, and spending it is a decision, not a default.
   */
  pruneRecipes?: boolean;
  /** Skip the VACUUM. Compaction is otherwise implied by any deletion. */
  noCompact?: boolean;
  /**
   * Delete nothing if any working tree has no readable cache — such a tree
   * contributes no hashes to the union, so its own live rows look dead.
   *
   * The automatic path sets it and `gc` does not, which is the whole
   * difference between the two: `gc` names the blind trees and lets a
   * human weigh a cost it states out loud, while a sweep riding on a
   * command typed for another reason has nobody to ask and so declines.
   * Liveness is collected either way, so the report still says what it saw.
   */
  abortIfBlind?: boolean;
  /** Injected for tests; the retention floor is measured against it. */
  now?: Date;
}

export interface SweepResult {
  /** Every working tree of the clone, in git's order. */
  trees: WorktreeLiveness[];
  /** Trees with no readable cache — the liveness union's blind spots. */
  blind: WorktreeLiveness[];
  scanned: number;
  /** Unused *and* past the retention floor. Deleted unless `dryRun`. */
  evicted: number;
  /** Unused but younger than the floor — kept this round. */
  retained: number;
  /** Rows a live vertex still hashes to. */
  kept: number;
  /** Rows under a superseded recipe; null when `pruneRecipes` was off. */
  recipesPruned: number | null;
  /** Null when nothing was deleted, or compaction was skipped. */
  compaction: CompactionResult | null;
  /** The floor actually applied, for reporting. 0 = none. */
  retainDays: number;
  /**
   * Why nothing was deleted, when `abortIfBlind` stopped the sweep.
   * Null on every run that proceeded, including one that found nothing.
   */
  declined: string | null;
  /**
   * Store files beside this one under a different schema version — the
   * disk that versioned file names trade the repeated CPU for
   * (FRICTION-034). Reported, never deleted: a vintage is a whole file
   * whose path is printed, so `rm` reaches it, and keeping it is what
   * makes rolling docdog back free. Empty until the day
   * EMBED_SCHEMA_VERSION first moves off 1.
   */
  vintages: EmbedStoreVintage[];
}

/**
 * Sweep this project's store. Opens the cache, unions every worktree's
 * liveness, and deletes what nothing can reach.
 *
 * Throws only if *this* tree has no readable cache — the one unindexed
 * tree the caller can actually fix, and the one case where continuing
 * would mean treating an empty liveness set as "nothing is live".
 */
export function sweepEmbedStore(
  projectRoot: string,
  config: DocdogConfig,
  opts: SweepOptions = {},
): SweepResult {
  // Probe before anything else: an unreadable cache here would otherwise
  // contribute an empty hash set to the union and make the entire store
  // look dead. That is the one failure mode this whole module must never
  // have, so it is an exception rather than a value.
  openCacheRead(projectRoot).close();

  const liveness = collectCloneLiveness(projectRoot);
  const retainDays = opts.retainDays ?? config.embed?.retain_days ?? RETAIN_DAYS_DEFAULT;
  const cutoff = retentionCutoff(retainDays, opts.now);

  const store = openEmbedStore(projectRoot, config);
  try {
    const scanned = (
      store.db.prepare(`SELECT COUNT(*) AS n FROM embed_cache`).get() as { n: number }
    ).n;

    if (opts.abortIfBlind && liveness.blind.length > 0) {
      const unused = findUnusedRows(store.db, liveness.live);
      return {
        trees: liveness.trees,
        blind: liveness.blind,
        scanned,
        evicted: 0,
        retained: 0,
        kept: scanned - unused.length,
        recipesPruned: null,
        compaction: null,
        retainDays,
        declined:
          `${liveness.blind.length} worktree(s) have no readable cache, so their records are ` +
          `invisible to the liveness union — run "docdog gc" to sweep anyway`,
        vintages: findOtherVintages(store.path),
      };
    }

    const eviction = evictStaleEmbeddings(liveness.live, store.db, {
      dryRun: opts.dryRun,
      retainSince: cutoff,
    });

    // Deliberately after the liveness sweep and deliberately unfiltered by
    // it: the two sets overlap (a dead-content row under an old recipe is
    // in both) and neither contains the other. Running the content sweep
    // first just means this one has less to do.
    const recipesPruned = opts.pruneRecipes
      ? deleteSupersededRecipeRows(
          store.db,
          embedRecipe(config.embed.model, MAX_EMBED_CHARS, config.embed.dtype),
          { dryRun: opts.dryRun },
        )
      : null;

    const deleted = eviction.evicted + (recipesPruned ?? 0);
    const compaction =
      !opts.dryRun && !opts.noCompact && deleted > 0 ? compactStore(store.db) : null;

    return {
      trees: liveness.trees,
      blind: liveness.blind,
      scanned,
      evicted: eviction.evicted,
      retained: eviction.retained,
      kept: eviction.kept,
      recipesPruned,
      compaction,
      retainDays,
      declined: null,
      vintages: findOtherVintages(store.path),
    };
  } finally {
    store.close();
  }
}

/**
 * Whether a `docdog index` run should sweep on its own — the two gates
 * decidable before any database is opened. The third (blind worktrees)
 * lives inside the sweep as `abortIfBlind`, because answering it requires
 * the liveness pass the sweep already runs.
 *
 *   - **the config flag** — `embed.auto_gc: false` opts out entirely, and
 *     silently: someone who turned it off does not need telling.
 *   - **scoped** — `index --path X` looked at part of the corpus, so its
 *     cache says nothing about the rest, exactly as `sweepGhostFiles` is
 *     scope-limited for the same reason (OBS-021). Reported, because a
 *     user who expected a sweep should learn why they did not get one.
 */
export function shouldAutoSweep(
  config: DocdogConfig,
  opts: { scoped: boolean },
): { sweep: boolean; reason: string | null } {
  if ((config.embed?.auto_gc ?? DEFAULT_AUTO_GC) === false) return { sweep: false, reason: null };
  if (opts.scoped) {
    return {
      sweep: false,
      reason: 'a --path run sees only part of the corpus; "docdog gc" considers all of it',
    };
  }
  return { sweep: true, reason: null };
}

/** Bytes as a short human string, for the one-line sweep reports. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
