/**
 * The `cache/` rule in `.docdog/.gitignore` — the one line docdog claims in
 * a file that is otherwise the adopter's.
 *
 * The cache is disposable derived state (DD-070 §2), so keeping it out of
 * version control is docdog's job; the file the rule lives in is not
 * docdog's to own, because an adopter's own ignores sit in it beside the
 * rule. So this module exposes the same reader/writer pair `claude-md.ts`
 * and `gitattributes.ts` expose for their blocks: read tells you whether
 * docdog's line is there, write puts it there and touches nothing else.
 *
 * Pure string mechanics — DP-001 tier 1. Nothing here decides what an
 * adopter meant by any other line in the file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The rule docdog writes. Compared trimmed, so indentation is not an edit. */
export const DOCDOG_CACHE_IGNORE_RULE = "cache/";

/**
 * The second rule: `.docdog/local/`, the home for records that are indexed
 * and never committed (DISC-041).
 *
 * Written whether or not the directory exists, and that is the point — the
 * whole value of a sanctioned destination is that nobody has to remember to
 * ignore it first. Create the directory when you want it; the rule is
 * already there.
 */
export const DOCDOG_LOCAL_IGNORE_RULE = "local/";

/** Repo-relative path of the file that carries it. */
export const DOCDOG_GITIGNORE_REL = ".docdog/.gitignore";

/**
 * The rule as it currently stands in the file, or null when the file is
 * missing or holds no such line. Returns the rule rather than a boolean so
 * it can be a `SeedItem.current` directly.
 */
export function readGitignoreRule(
  gitignorePath: string,
  rule: string = DOCDOG_CACHE_IGNORE_RULE,
): string | null {
  if (!existsSync(gitignorePath)) return null;
  const existing = readFileSync(gitignorePath, "utf-8");
  const present = existing.split(/\r?\n/).some((line) => line.trim() === rule);
  return present ? rule : null;
}

/**
 * Append the rule when it is absent, creating the file (and `.docdog/`)
 * when it is missing. Idempotent, and every other line survives verbatim —
 * a file the user has filled with their own ignores gains one line and
 * loses nothing. Returns whether it wrote, so callers can report only a
 * real change.
 */
export function ensureGitignoreRule(
  gitignorePath: string,
  rule: string = DOCDOG_CACHE_IGNORE_RULE,
): boolean {
  if (readGitignoreRule(gitignorePath, rule) !== null) return false;
  mkdirSync(dirname(gitignorePath), { recursive: true });
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
  // A file that does not end in a newline would otherwise swallow the rule
  // into its last line; an empty one must not gain a leading blank.
  const before = existing === "" ? "" : existing.replace(/\n?$/, "\n");
  writeFileSync(gitignorePath, `${before}${rule}\n`, "utf-8");
  return true;
}
