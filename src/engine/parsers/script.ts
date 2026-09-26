/**
 * Script parser: user-provided parser function in .docdog/scripts/ (DD-067, DD-063).
 *
 * Escape hatch for formats that don't fit built-in parsers. The script
 * exports a default function:
 *
 *   export default function(input: ParseInput): ParsedSection[] | Promise<ParsedSection[]>
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Parser, ParseInput, ParsedSection } from "./types.js";

/** The script file a `script:` name resolves to, or null when there is none. */
export function resolveParserScript(projectRoot: string, scriptName: string): string | null {
  const scriptsDir = join(projectRoot, ".docdog", "scripts");
  const candidates = [join(scriptsDir, `${scriptName}.ts`), join(scriptsDir, `${scriptName}.js`)];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Hash of the script's own text, LF-normalized like every other content hash
 * (engine/discovery.ts). The scan entry holds only the script's NAME, so this
 * is the one input to a script parse that the entry's signature cannot see
 * (FRICTION-059). Imports the script makes are out of reach and stay so —
 * `--full` is the answer there.
 */
export function parserScriptHash(projectRoot: string, scriptName: string): string {
  const scriptPath = resolveParserScript(projectRoot, scriptName);
  if (!scriptPath) return "missing";
  let text: string;
  try {
    text = readFileSync(scriptPath, "utf-8");
  } catch {
    return "unreadable";
  }
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

export const scriptParser: Parser = {
  async parse(input: ParseInput): Promise<ParsedSection[]> {
    const { parserConfig, projectRoot, repoRelPath } = input;
    const scriptName = parserConfig.script;

    if (!scriptName) {
      throw new Error(`script parser requires 'script' config for path: ${repoRelPath}`);
    }

    const scriptPath = resolveParserScript(projectRoot, scriptName);
    if (!scriptPath) {
      throw new Error(
        `Parser script not found: ${scriptName}. Looked in: ${join(projectRoot, ".docdog", "scripts")}/`,
      );
    }

    // The content hash rides the URL so a long-running process (`serve`)
    // loads an edited script instead of the module it cached at first import.
    const absPath = resolve(scriptPath);
    const version = parserScriptHash(projectRoot, scriptName).slice(0, 16);
    const mod = await import(`file://${absPath.replace(/\\/g, "/")}?v=${version}`);

    if (typeof mod.default !== "function") {
      throw new Error(`Parser script must export default function: ${scriptName}`);
    }

    const result = await mod.default(input);
    if (!Array.isArray(result)) {
      throw new Error(`Parser script must return an array of ParsedSection: ${scriptName}`);
    }

    // The entry's `collection:` applies here as it does in every other
    // parser — the ParsedSection contract promises `this field → parser
    // config → …`, and this parser used to pass the script's nulls straight
    // through to directory inference (FRICTION-058). A collection the script
    // sets itself still wins.
    const entryCollection = parserConfig.collection ?? null;
    return (result as ParsedSection[]).map((s) =>
      s.collection ? s : { ...s, collection: entryCollection },
    );
  },
};
