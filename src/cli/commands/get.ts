/**
 * `docdog get <id>` — the CLI counterpart of `docdog_get`
 * (PROPOSAL-032). A second thin adapter over `getVertexById`; the MCP
 * tool wraps the same function. No new semantics.
 */
import { Command } from "commander";
import { findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";

export function registerGetCommand(program: Command): void {
  program
    .command("get <id>")
    .description("Print a record by id (frontmatter summary + body)")
    .option("--json", "Output the raw record as JSON")
    .action(async (id: string, opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();

      try {
        const { openCacheRead } = await import("../../storage/cache.js");
        const { getVertexById } = await import("../../storage/vertices.js");

        const handle = openCacheRead(projectRoot);
        let vertex;
        try {
          vertex = getVertexById(handle.db, id);
        } finally {
          handle.close();
        }

        if (!vertex) {
          printError(
            "NOT_FOUND",
            `Record not found: ${id}`,
            'Stale cache, or the id does not exist? Run "docdog index".',
          );
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(vertex, null, 2));
          return;
        }

        console.log(`# ${vertex.title}`);
        console.log(`ID:         ${vertex.id}`);
        console.log(`Collection: ${vertex.collection}`);
        console.log(`Status:     ${vertex.status}`);
        console.log(`Source:     ${vertex.source_file}`);
        console.log();
        console.log(vertex.body_text);
      } catch (err) {
        printError("GET_ERROR", String(err), 'Cache missing or stale? Run "docdog index" first.');
        process.exitCode = 1;
        return;
      }
    });
}
