/**
 * `docdog gc` — cache eviction (DD-070 §4).
 *
 * The only garbage in a disk-canonical project is derived state the
 * indexer keeps on purpose: embed store rows survive full reindexes so
 * embeddings are reused across rebuilds (DD-051), which means rows for
 * content that left the corpus accumulate until evicted here.
 * Everything v2 `gc` did beyond this — soft-delete enumeration,
 * hard-delete, restore, TTL sweeps — died with DD-070 §3 (deleting a
 * record means deleting its file; files + git are the archive).
 *
 * PROPOSAL-029 §5 gave the liveness test a precondition, because it asks
 * "does any live vertex still hash to this row?" — a question about *one*
 * working tree — against a store shared by all of them. It refused the
 * sweep whenever the store was shared, and `shared` means "git answered",
 * so it refused on every git-based project including single-worktree
 * ones. gc was unreachable, not careful (DISC-032). It now unions every
 * tree's cache instead (`storage/clone-liveness.ts`).
 *
 * OBS-026 found the three things that were still wrong once it was
 * reachable, and this file is the surface for all three:
 *
 *   - **nobody ran it.** Fixed elsewhere — `docdog index` now sweeps on
 *     its own (`embed.auto_gc`), which is why the mechanics moved to
 *     `engine/embed-gc.ts` and this file is rendering plus flags.
 *   - **it could not reclaim the biggest stratum.** A recipe change
 *     orphans the whole corpus at once and content-keyed liveness cannot
 *     see it — 50% of this repo's store, frozen, from one cap change.
 *     `--prune-recipes` is the opt-in sweep for it.
 *   - **it did not shrink the file.** Nothing ran `VACUUM`, so a sweep
 *     that evicted a sixth of the store left it exactly as large as it
 *     found it. Compaction is now implied by any deletion.
 *
 * Age-based *eviction* stays unbuilt and OBS-021 records why the obvious
 * version cannot work; `--retain-days` is the inverse comparison and a
 * different thing entirely (see `applyRetentionFloor`).
 */
import { Command } from "commander";
import { findProjectRoot, loadConfig } from "../../config/loader.js";
import {
  formatBytes,
  sweepEmbedStore,
  type SweepResult,
} from "../../engine/embed-gc.js";
import { EMBED_SCHEMA_VERSION } from "../../storage/embed-store.js";
import { printError } from "../output.js";

export function registerGcCommand(program: Command): void {
  program
    .command("gc")
    .description("Evict stale cache state (embed store rows with no live vertex)")
    .option("--dry-run", "Report what would be evicted without writing", false)
    .option(
      "--prune-recipes",
      "Also delete rows under a superseded embed recipe — reclaims the unreachable stratum, and makes reverting the model/cap/dtype cost a re-embed",
      false,
    )
    .option(
      "--retain-days <n>",
      "Never evict rows younger than this many days (0 = no floor; default: embed.retain_days)",
      (v) => Number.parseInt(v, 10),
    )
    .option("--no-compact", "Skip the VACUUM that returns freed pages to the filesystem")
    .action((opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const config = loadConfig(projectRoot);

      if (opts.retainDays !== undefined && Number.isNaN(opts.retainDays)) {
        printError("GC_ERROR", "--retain-days expects a whole number of days");
        process.exitCode = 1;
        return;
      }

      try {
        const result = sweepEmbedStore(projectRoot, config, {
          dryRun: opts.dryRun,
          pruneRecipes: opts.pruneRecipes,
          retainDays: opts.retainDays,
          // `--no-compact` makes commander set `compact` false.
          noCompact: opts.compact === false,
          // Never set by `gc`: a blind worktree is a cost this command
          // states out loud and lets the human weigh (DISC-032). Only the
          // automatic path, which has no human to ask, declines.
          abortIfBlind: false,
        });
        for (const line of formatSweep(result, { dryRun: opts.dryRun })) console.log(line);
      } catch (err) {
        printError("GC_ERROR", err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }
    });
}

/**
 * Render a sweep as `gc` reports it: what was seen, what went, what was
 * held back and why, and what the file gave back.
 *
 * Shared with the automatic path's one-line summary only in spirit — this
 * one is verbose because someone typed the command and is waiting for it.
 */
export function formatSweep(result: SweepResult, opts: { dryRun?: boolean } = {}): string[] {
  const lines: string[] = [];

  if (result.trees.length > 1) {
    lines.push(`Liveness unioned across ${result.trees.length} working trees of this clone:`);
    for (const tree of result.trees) {
      const mark = tree.current ? " (this tree)" : "";
      const seen = tree.readable
        ? `${tree.hashes} live hash(es)`
        : "no readable cache — its records are invisible to this sweep";
      lines.push(`  ${tree.path}${mark}: ${seen}`);
    }
  }

  if (result.declined) {
    lines.push(`Swept nothing: ${result.declined}`);
    return lines;
  }

  const verb = opts.dryRun ? "Would evict" : "Evicted";
  lines.push(
    `${verb} ${result.evicted} stale embedding(s) — ${result.kept} live, ${result.scanned} scanned.`,
  );

  if (result.retained > 0) {
    lines.push(
      `  ${result.retained} unused row(s) kept by the ${result.retainDays}-day retention floor ` +
        `(--retain-days 0 to ignore it).`,
    );
  }

  if (result.recipesPruned !== null) {
    const pruneVerb = opts.dryRun ? "Would prune" : "Pruned";
    if (result.recipesPruned > 0) {
      lines.push(
        `${pruneVerb} ${result.recipesPruned} row(s) under a superseded recipe — ` +
          `reverting the model, cap or dtype now costs a re-embed rather than being free.`,
      );
    } else {
      lines.push("No rows under a superseded recipe — every vector matches the current one.");
    }
  }

  if (result.compaction) {
    const { before, after, error } = result.compaction;
    if (error) {
      // The rows are already gone; only the space is deferred. Worth a line
      // because the file size will not have moved and that would otherwise
      // read as the eviction having failed.
      lines.push(
        `  Could not compact the store (${error}) — the rows are evicted; ` +
          `the freed pages are reclaimed by the next sweep that can take the lock.`,
      );
    } else {
      lines.push(
        `  Compacted ${formatBytes(before)} → ${formatBytes(after)} ` +
          `(reclaimed ${formatBytes(Math.max(0, before - after))}).`,
      );
    }
  }

  // FRICTION-034 traded a destructive whole-file reset for coexisting
  // vintages, and the price of that trade is disk. Naming the files is
  // the whole remedy: each is one database whose path is right here, so
  // `rm` reaches it — unlike a superseded RECIPE, which lives inside the
  // current file and is why `--prune-recipes` had to be built. Keeping a
  // vintage is what makes rolling docdog back free, so spending it should
  // read as a decision rather than as hygiene.
  if (result.vintages.length > 0) {
    const bytes = result.vintages.reduce((n, v) => n + v.bytes, 0);
    lines.push("");
    lines.push(
      `${result.vintages.length} store(s) from another schema version sit beside this one ` +
        `(${formatBytes(bytes)}); this docdog writes v${EMBED_SCHEMA_VERSION}:`,
    );
    for (const v of result.vintages) {
      lines.push(`  v${v.version}  ${formatBytes(v.bytes)}  ${v.path}`);
    }
    lines.push(
      "  Kept so an older docdog still finds its own vectors. Delete one by hand when you are done with that version.",
    );
  }

  // The cost of being wrong, stated rather than guarded against.
  // Deliberately a count and not a duration: the evicted rows carry only a
  // hash, so their content — and therefore what re-embedding them would
  // cost — is exactly what is no longer knowable here (DISC-032).
  if (result.evicted > 0 && result.blind.length > 0) {
    lines.push(
      `\n${result.blind.length} tree(s) had no readable cache. If one of them still holds ` +
        `records among the ${result.evicted} evicted row(s), it re-embeds them on its next ` +
        `"docdog index" — the vectors are derived, so this costs time, never data.`,
    );
    for (const tree of result.blind) {
      lines.push(`  ${tree.path} — run "docdog index" there to include it next time`);
    }
  }

  return lines;
}
