/**
 * `docdog run <name> [args...]` — execute a project-level script.
 *
 * Resolves .docdog/scripts/<name>.ts (or .js), loads config, and calls
 * the script's default export with a ScriptContext. If the script has
 * no default export, it's treated as a self-contained side-effect
 * module.
 */
import { Command } from "commander";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { findProjectRoot, loadConfig } from "../../config/loader.js";
import type { ScriptContext } from "../../types/scripts.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run <name> [args...]")
    .description("Run a project script from .docdog/scripts/")
    .allowUnknownOption(true)
    .action(async (name: string, args: string[], _opts: unknown, _cmd: Command) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const scriptsDir = join(projectRoot, ".docdog", "scripts");

      // Resolve script path (.ts preferred, then .js)
      const candidates = [
        join(scriptsDir, `${name}.ts`),
        join(scriptsDir, `${name}.js`),
        join(scriptsDir, name), // exact name with extension
      ];
      const scriptPath = candidates.find((p) => existsSync(p));

      if (!scriptPath) {
        console.error(`Script not found: ${name}`);
        console.error(`  Looked in: ${scriptsDir}/`);
        console.error(`  Available: ${listScripts(scriptsDir)}`);
        process.exitCode = 1;
        return;
      }

      // Load config
      const config = loadConfig(projectRoot);
      const configPath = join(projectRoot, ".docdog", "config.yaml");

      const ctx: ScriptContext = {
        config,
        projectRoot,
        configPath,
        args: args ?? [],
      };

      console.log(`Running script: ${name}`);

      // Dynamic import of the script
      const absPath = resolve(scriptPath);
      const mod = await import(`file://${absPath.replace(/\\/g, "/")}`);

      if (typeof mod.default === "function") {
        await mod.default(ctx);
      }
      // If no default export, the import itself ran the script (side-effect)
    });
}

function listScripts(dir: string): string {
  if (!existsSync(dir)) return "(none — directory does not exist)";
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const files = readdirSync(dir).filter(
    (f: string) => f.endsWith(".ts") || f.endsWith(".js"),
  );
  return files.length > 0 ? files.join(", ") : "(none)";
}
