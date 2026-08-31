/**
 * `docdog relate <from> <to>` — the CLI counterpart of `docdog_relate`
 * (PROPOSAL-032). The one *write* in the parity set, included because
 * every input is a short scalar: two ids, a type, a one-line context.
 * Nothing here resists shell quoting, which is the test PROPOSAL-032
 * §"Where parity stops" applies (and which `create`/`update`, with
 * their markdown bodies, fail).
 *
 * File-first, like the MCP tool: patches the source record's
 * `relationships:` block and reindexes that file. The edge row is
 * derived by the indexer, never written directly (DD-043).
 */
import { Command } from "commander";
import { loadConfig, findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";

export function registerRelateCommand(program: Command): void {
  program
    .command("relate <from> <to>")
    .description("Record an outbound edge in <from>'s relationships: block")
    .requiredOption("--type <type>", "Relation type (e.g. references, supersedes, discussed_in)")
    .requiredOption("--context <text>", "Why the edge exists — one line")
    .option("--anchor-text <text>", "Anchor text the edge was sourced from")
    .option(
      "--allow-cross-visibility",
      "Write the edge even though <to> will not be in a clone of this repository",
    )
    .action(async (from: string, to: string, opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const config = loadConfig(projectRoot);

      // Hoisted so the error classes are in scope for the catch below.
      const { relateFileFirst, WriteError } = await import("../../storage/writes.js");
      const { FrontmatterPatchError } = await import("../../storage/frontmatter.js");

      try {
        const result = await relateFileFirst(
          { config, projectRoot },
          {
            fromId: from,
            toId: to,
            type: opts.type,
            context: opts.context,
            anchorText: opts.anchorText ?? null,
          },
          { allowCrossVisibility: opts.allowCrossVisibility === true },
        );

        console.log(`Edge recorded: ${from} --[${opts.type}]--> ${to}`);
        console.log(`File: ${result.filePath} (relationships: block patched, file reindexed)`);
        console.log(`Context: ${opts.context}`);

        // Unknown types and dangling targets are warnings, not errors —
        // the registry is advisory and a dangling edge is honest
        // frontmatter (same contract as the MCP tool).
        if (!result.typeKnown) {
          console.warn(
            `\n⚠ Type "${opts.type}" has no relation concept entry — run "docdog search relation --collection concepts" to see registered types.`,
          );
        }
        if (!result.targetKnown) {
          console.warn(
            `\n⚠ Target "${to}" is not in the index — the edge dangles until a record with that id is indexed.`,
          );
        }
      } catch (err) {
        if (err instanceof WriteError || err instanceof FrontmatterPatchError) {
          printError("RELATE_ERROR", err.message);
          process.exitCode = 1;
          return;
        }
        printError(
          "RELATE_ERROR",
          err instanceof Error ? err.message : String(err),
          'Cache missing or stale? Run "docdog index" first.',
        );
        process.exitCode = 1;
        return;
      }
    });
}
