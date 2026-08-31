import { Command } from "commander";
import { join } from "node:path";
import { loadConfig, findProjectRoot } from "../../config/loader.js";
import { formatBytes, shouldAutoSweep, sweepEmbedStore } from "../../engine/embed-gc.js";
import { gitattributesDrift } from "../../engine/gitattributes.js";

export function registerIndexCommand(program: Command): void {
  program
    .command("index")
    .description("Index or re-index section files into the embedded cache (.docdog/cache/index.db)")
    .option("--full", "Full rebuild (wipe derived rows, reindex everything)")
    .option("--path <path>", "Index only this path (overrides config scan_paths)")
    .option("--create-collections", "Index sections with unknown collections instead of skipping (does not update config)")
    .action(async (opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const config = loadConfig(projectRoot);

      // P-023 §7 step 5: the cache indexer is THE indexer. The v2
      // Arango pass (and its --no-cache / --dry-run flags) is gone.
      const { runCacheIndexer } = await import("../../storage/indexer.js");
      await runCacheIndexer({
        config,
        projectRoot,
        full: opts.full ?? false,
        // Left undefined without --path so the indexer can tell a
        // whole-corpus run from a scoped one: `--full` wipes the cache,
        // `--full --path X` wipes only X (FRICTION-022).
        paths: opts.path ? [opts.path] : undefined,
        createCollections: opts.createCollections ?? false,
      });

      warnOnGitattributesDrift(projectRoot, config.scan_paths ?? []);
      autoSweepEmbedStore(projectRoot, config, { scoped: Boolean(opts.path) });
    });
}

/**
 * OBS-026: sweep the embed store at the end of a full-scope index.
 *
 * The store is grow-only (PROPOSAL-029) and `gc` has been able to sweep it
 * since DISC-032 — but a command nobody runs reclaims nothing, and that,
 * rather than any safety question, is what left the file growing. So the
 * sweep rides the command people already run, on the reasoning that the
 * moment the growth happens is the moment to pay for it.
 *
 * Gated in `shouldAutoSweep` and by `abortIfBlind`, and every failure is
 * swallowed: `docdog index` is here to index, and an exit code that
 * blames a successful reindex for a housekeeping hiccup would be worse
 * than the megabytes. `docdog gc` remains the surface that reports
 * properly and can be made to try harder.
 */
function autoSweepEmbedStore(
  projectRoot: string,
  config: Parameters<typeof shouldAutoSweep>[0],
  opts: { scoped: boolean },
): void {
  const gate = shouldAutoSweep(config, opts);
  if (!gate.sweep) {
    if (gate.reason) console.log(`\nEmbed store: not swept — ${gate.reason}.`);
    return;
  }

  try {
    const result = sweepEmbedStore(projectRoot, config, { abortIfBlind: true });

    if (result.declined) {
      console.log(`\nEmbed store: not swept — ${result.declined}.`);
      return;
    }
    if (result.evicted === 0) {
      // Silence on a clean store: an index run should not narrate work it
      // did not have to do. The retained count is still worth a line —
      // otherwise a user watching the number in `docdog status` refuse to
      // fall has nothing to explain it.
      if (result.retained > 0) {
        console.log(
          `\nEmbed store: ${result.retained} unused vector(s) held by the ` +
            `${result.retainDays}-day retention floor.`,
        );
      }
      return;
    }

    const reclaimed = result.compaction && !result.compaction.error
      ? `, reclaimed ${formatBytes(Math.max(0, result.compaction.before - result.compaction.after))}`
      : "";
    console.log(
      `\nEmbed store: swept ${result.evicted} stale vector(s)${reclaimed} — ${result.kept} live.`,
    );
    if (result.retained > 0) {
      console.log(
        `  ${result.retained} more held by the ${result.retainDays}-day retention floor.`,
      );
    }
  } catch {
    // No cache to read, a lock we lost, a store we could not open. The
    // index itself succeeded; the sweep is the part that can wait.
  }
}

/**
 * PROPOSAL-030 §4: the merge driver's scope is derived from `scan_paths`,
 * so it can go stale when scan_paths changes. Indexing is the moment we
 * are already reading both — so report the drift here, and *only* report
 * it: rewriting a tracked file as a side effect of an index run would be
 * exactly the silent mutation `suggest-edges` refuses to do.
 *
 * Silent when the block is absent — a project that never installed the
 * driver is a project git merges the ordinary way, which is fine.
 */
function warnOnGitattributesDrift(
  projectRoot: string,
  scanPaths: Parameters<typeof gitattributesDrift>[1],
): void {
  const drift = gitattributesDrift(join(projectRoot, ".gitattributes"), scanPaths);
  if (drift.kind !== "drifted") return;

  console.warn("\n⚠ .gitattributes no longer matches scan_paths (PROPOSAL-030):");
  for (const pattern of drift.missing) {
    console.warn(`    missing: ${pattern}  (a scan path the merge driver does not cover)`);
  }
  for (const pattern of drift.extra) {
    console.warn(`    stale:   ${pattern}  (no longer a scan path)`);
  }
  console.warn('  Run "docdog init" to regenerate the managed block.');
}
