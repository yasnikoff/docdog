/**
 * Script context — passed to .docdog/scripts/ when run via `docdog run`.
 *
 * Scripts are project-level TypeScript/JS files for deterministic operations
 * that don't belong in docdog core (custom ingestion formats, bulk transforms,
 * project-specific reports).
 *
 * A script exports a default async function receiving this context:
 *
 * ```typescript
 * import type { ScriptContext } from "@yasnikoff/docdog";
 * export default async function(ctx: ScriptContext) {
 *   // ctx.config, ctx.projectRoot available
 * }
 * ```
 *
 * V3 (DD-070): records are markdown files — a script that creates or
 * edits records writes files under the scan paths, then the caller runs
 * `docdog index`. Scripts needing the derived index can open the cache
 * read-only at `.docdog/cache/index.db` (plain SQLite; disposable).
 */
import type { DocdogConfig } from "./config.js";

export interface ScriptContext {
  /** Resolved DocdogConfig (merged defaults + config.yaml + env). */
  config: DocdogConfig;
  /** Absolute path to the project root (parent of .docdog/). */
  projectRoot: string;
  /** Absolute path to .docdog/config.yaml. */
  configPath: string;
  /** Script arguments (everything after the script name on the CLI). */
  args: string[];
}
