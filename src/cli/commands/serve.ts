/**
 * `docdog serve` — start the MCP server (PROPOSAL-033).
 *
 * The server is no longer bound to the repo that spawned it. What it resolves
 * here is a *default* project — the one a call acts on when it names no `root`.
 *
 *   - inside a docdog project  → that project is the default (today's behavior)
 *   - `--root <path>`          → pin the default explicitly, for launchers that
 *                                cannot control the working directory
 *   - outside any project      → no default; the server still starts, and every
 *                                call must pass `root`
 *
 * The last case is the machine-scope mode: register `docdog serve` once at user
 * scope and let each call name its project.
 *
 * `--read-only` (PROPOSAL-035) is the second flag in the same family: `--root`
 * constrains *which* corpus a call may touch, `--read-only` constrains *how*.
 * Both are resolved once here and handed to every handler.
 */
import { Command } from "commander";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start the docdog MCP server")
    .option("--stdio", "Use stdio transport (default for Claude Code MCP integration)", true)
    .option(
      "--root <path>",
      "Default project for calls that pass no root (default: the project containing the working directory, if any)",
    )
    .option(
      "--read-only",
      "Refuse the corpus writes: docdog_create, docdog_update, docdog_relate. Reads and indexing are unaffected. Refuses docdog's writes, not the filesystem's — sandboxing files is the host's job.",
    )
    .action(async (opts) => {
      let defaultRoot: string | null;

      if (opts.root) {
        const abs = isAbsolute(opts.root) ? resolve(opts.root) : resolve(process.cwd(), opts.root);
        if (!existsSync(abs)) {
          printError("ROOT_NOT_FOUND", `--root is not an existing directory: ${abs}`);
          process.exitCode = 1;
          return;
        }
        const found = findProjectRoot(abs);
        if (!found) {
          printError(
            "ROOT_NOT_A_PROJECT",
            `No .docdog/config.yaml at or above ${abs}.`,
            "--root must point at a docdog project (or a directory inside one).",
          );
          process.exitCode = 1;
          return;
        }
        defaultRoot = found;
      } else {
        // May be null — a server with no default project is legal, and every
        // call against it must then name its own `root`.
        defaultRoot = findProjectRoot();
      }

      const { startMcpServer } = await import("../../mcp/server.js");
      await startMcpServer({ defaultRoot, readOnly: opts.readOnly === true });
    });
}
