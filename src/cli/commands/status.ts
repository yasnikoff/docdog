/**
 * `docdog status` — the CLI counterpart of `docdog_status`
 * (PROPOSAL-032). Renders `collectStatus` as plain lines; the MCP tool
 * renders the same report as markdown. A missing cache is a state, not
 * a crash — it reports and points at `docdog index`.
 */
import { Command } from "commander";
import { loadConfig, findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";
import { describeInstall, formatUpdateLine, installWords } from "../../engine/upgrade.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Cache and corpus statistics (records, edges, embeddings, paths)")
    .option("--json", "Output the raw report as JSON")
    .action(async (opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const config = loadConfig(projectRoot);

      const { collectStatus, formatEmbedStore, formatContestedId, formatScopes } = await import(
        "../../storage/status.js"
      );
      const { formatStatusVocabulary } = await import("../../storage/status-vocabulary.js");
      const { formatEmbedHealth } = await import("../../storage/embed-health.js");

      const install = describeInstall(projectRoot);

      let report;
      try {
        report = collectStatus(projectRoot, config);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // An unindexed project still has to be describable. PROPOSAL-043's
        // issue template requires this JSON as its environment block, and the
        // frictions most worth reporting are exactly the ones where `index`
        // did not finish — so the no-cache path emits the installation and
        // says what is missing rather than exiting with nothing.
        if (opts.json) {
          console.log(JSON.stringify({ install, cache: null, error: msg }, null, 2));
          return;
        }
        printError("NO_CACHE", `No usable cache: ${msg}`, 'Run "docdog index" to build it from disk.');
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log("Docdog status");
      console.log();
      // The package's vintage, not the session's — so unlike PROPOSAL-037's
      // Server block this belongs on the CLI too, and on the surface that can
      // actually act on it. Stated unconditionally: the update line names the
      // version only when you are behind, and "which version am I on" is the
      // question every report starts with. Read from disk; never fetched here.
      console.log(`docdog ${install.version} — ${installWords(install.shape)}`);
      console.log(formatUpdateLine(install.version, install.check).replace(/\*\*/g, ""));
      console.log();
      console.log("Records by collection:");
      if (report.collections.length === 0) {
        console.log("  (none indexed)");
      }
      for (const c of report.collections) {
        console.log(`  ${c.collection}: ${c.count}`);
      }

      // The `--status` half of the same question the block above answers for
      // `--collection` (FRICTION-038).
      console.log();
      console.log("Records by status:");
      if (report.statuses.present.length === 0) {
        console.log("  (none indexed)");
      }
      for (const line of formatStatusVocabulary(report.statuses)) console.log(line);

      // Only when the corpus has more than one (FRICTION-050) — and unlike
      // the two blocks above, this roster is the *only* way to learn the
      // vocabulary: scope is a free string (DD-058), so `--scope` cannot
      // refuse a wrong guess the way `--collection` and `--status` do.
      const scopeLines = formatScopes(report.scopes);
      if (scopeLines.length > 0) {
        console.log();
        console.log("Records by scope:");
        for (const line of scopeLines) console.log(line);
      }

      console.log();
      console.log(`Files indexed:    ${report.files}`);
      console.log(`Edges:            ${report.edges}`);
      console.log(`Embedded chunks:  ${report.embeddedChunks}`);

      if (report.contested.length > 0) {
        console.log();
        console.log(`Contested ids: ${report.contested.length}`);
        for (const entry of report.contested) {
          for (const line of formatContestedId(entry)) console.log(line);
        }
      }

      if (report.embedHealth.oversized.length > 0) {
        const records = report.collections.reduce((n, c) => n + c.count, 0);
        console.log();
        console.log(`Records past the embed cap: ${report.embedHealth.oversized.length} of ${records}`);
        for (const line of formatEmbedHealth(report.embedHealth)) console.log(line);
      }

      console.log();
      console.log(`Embed model:  ${report.embedModel}`);
      console.log(`Cache:        ${report.cachePath} (${report.cacheSizeMb.toFixed(1)} MB, disposable)`);
      console.log(`Embed store:  ${formatEmbedStore(report.embedStore)}`);
      console.log(`Scan paths:   ${report.scanPaths.join(", ")}`);
    });
}
