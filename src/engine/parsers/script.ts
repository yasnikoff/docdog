/**
 * Script parser: user-provided parser function in .docdog/scripts/ (DD-067, DD-063).
 *
 * Escape hatch for formats that don't fit built-in parsers. The script
 * exports a default function:
 *
 *   export default function(input: ParseInput): ParsedSection[] | Promise<ParsedSection[]>
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Parser, ParseInput, ParsedSection } from "./types.js";

export const scriptParser: Parser = {
  async parse(input: ParseInput): Promise<ParsedSection[]> {
    const { parserConfig, projectRoot, repoRelPath } = input;
    const scriptName = parserConfig.script;

    if (!scriptName) {
      throw new Error(`script parser requires 'script' config for path: ${repoRelPath}`);
    }

    const scriptsDir = join(projectRoot, ".docdog", "scripts");
    const candidates = [
      join(scriptsDir, `${scriptName}.ts`),
      join(scriptsDir, `${scriptName}.js`),
    ];
    const scriptPath = candidates.find((p) => existsSync(p));

    if (!scriptPath) {
      throw new Error(`Parser script not found: ${scriptName}. Looked in: ${scriptsDir}/`);
    }

    const absPath = resolve(scriptPath);
    const mod = await import(`file://${absPath.replace(/\\/g, "/")}`);

    if (typeof mod.default !== "function") {
      throw new Error(`Parser script must export default function: ${scriptName}`);
    }

    const result = await mod.default(input);
    if (!Array.isArray(result)) {
      throw new Error(`Parser script must return an array of ParsedSection: ${scriptName}`);
    }

    return result as ParsedSection[];
  },
};
