/**
 * `docdog add <source>` — prepare files for indexing.
 *
 * Adds/merges YAML frontmatter to existing markdown files so they can
 * be indexed by docdog. The file stays where it is; docdog just makes
 * sure it has the metadata docdog needs.
 */
import { Command } from "commander";
import { stampFiles } from "../../engine/ingest.js";

export function registerAddCommand(program: Command): void {
  program
    .command("add <source>")
    .description("Prepare markdown files for indexing (add/merge frontmatter)")
    .requiredOption("--collection <name>", "Target collection")
    .option(
      "--id <value>",
      "Explicit semantic id to stamp onto the file (single-file use only; per DP-001, docdog never infers ids)",
    )
    .option("--output <dir>", "Output directory (default: modify in-place)")
    .option("--force", "Overwrite existing output files", false)
    .option("--dry-run", "Show what would be written without writing", false)
    .action((source, opts) => {
      const target = opts.output ?? source;
      console.log(`Adding frontmatter to ${source} → ${target}`);

      const result = stampFiles({
        source,
        collection: opts.collection,
        id: opts.id,
        output: opts.output,
        force: opts.force,
        dryRun: opts.dryRun,
      });

      const verb = opts.dryRun ? "Would stamp" : "Stamped";
      console.log(`  ${verb} ${result.stamped.length} file(s)`);
      if (result.skipped > 0) {
        console.log(`  Skipped ${result.skipped} (already exist, use --force to overwrite)`);
      }

      if (!opts.dryRun && result.stamped.length > 0) {
        console.log(`\nRun 'docdog index' to index the new sections.`);
      }
    });
}
