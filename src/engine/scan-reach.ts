/**
 * Does `scan_paths` reach the records docdog just wrote?
 *
 * A seeded record that no scan path covers is on disk and in no corpus:
 * the write succeeds, `docdog index` says nothing, and search, get and
 * traverse cannot see it. That failure is silent, so every command that
 * seeds records reports it — `init` did from the start, `update` did not,
 * and `split --apply-plan` reports the same fact about its children
 * (PROPOSAL-039).
 *
 * Report only. Nothing here writes `.docdog/config.yaml`: the config is
 * the user's file, the same reasoning `missingConfigKeys` states.
 *
 * Lives in `engine/` rather than beside either command because both of
 * them need it, and a CLI command importing from another CLI command is
 * the wrong direction.
 */
import type { ScanPathEntry } from "../types/config.js";

/**
 * True when any scan path already covers `.docdog/concepts` — exact
 * entry, a parent directory, or the repo root. Pure string mechanics;
 * used to warn (not fix) when seeded concepts would go unindexed.
 */
export function scanPathsCoverConcepts(scanPaths: ScanPathEntry[]): boolean {
  for (const entry of scanPaths) {
    const raw = typeof entry === "string" ? entry : entry.path;
    const norm = raw.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (norm === "" || norm === ".") return true;
    if (norm === ".docdog/concepts" || ".docdog/concepts".startsWith(`${norm}/`)) return true;
  }
  return false;
}
