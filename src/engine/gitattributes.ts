/**
 * The `.gitattributes` managed block — PROPOSAL-030 §4.
 *
 * The merge driver's scope is exactly the set of files docdog manages, so
 * it is *derived* from `config.yaml`'s `scan_paths` rather than
 * hand-written and left to rot. `docdog init` generates the block inside
 * delimiters (the same idea as the CLAUDE.md block: a user's own rules
 * outside the markers survive untouched); `docdog index` reports drift
 * and never rewrites a tracked file as a side effect of indexing.
 *
 * Pure string mechanics — DP-001 tier 1. Nothing here guesses which files
 * a user meant.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeScanPath } from "../config/defaults.js";
import type { ScanPathEntry } from "../types/config.js";

/** The merge driver's name, as `.gitattributes` and `.git/config` both spell it. */
export const MERGE_DRIVER_NAME = "docdog";

export const GITATTRIBUTES_START =
  "# >>> docdog managed — generated from .docdog/config.yaml scan_paths <<<";
export const GITATTRIBUTES_END = "# <<< docdog managed >>>";

/**
 * Turn scan paths into gitattributes patterns. A path that names a
 * markdown file is its own pattern; anything else is a directory, so it
 * matches the markdown beneath it. Order is preserved, duplicates dropped.
 */
export function gitattributesPatterns(scanPaths: ScanPathEntry[]): string[] {
  const patterns: string[] = [];
  for (const entry of scanPaths) {
    const path = normalizeScanPath(entry).path
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/\/+$/, "");
    const pattern =
      path === "" || path === "." ? "**/*.md"
      : path.endsWith(".md") ? path
      : `${path}/**/*.md`;
    if (!patterns.includes(pattern)) patterns.push(pattern);
  }
  return patterns;
}

/**
 * The managed block, markers included, for a given scan-path set.
 * Deterministic — the same config always renders the same bytes, which is
 * what makes drift detection a string comparison.
 */
export function renderGitattributesBlock(scanPaths: ScanPathEntry[]): string {
  const patterns = gitattributesPatterns(scanPaths);
  const width = patterns.reduce((max, p) => Math.max(max, p.length), 0);
  const rules = patterns.map((p) => `${p.padEnd(width)}  merge=${MERGE_DRIVER_NAME}`);
  return [GITATTRIBUTES_START, ...rules, GITATTRIBUTES_END].join("\n");
}

/** The managed block as it currently sits in the file, or null when there is none. */
export function readManagedBlock(gitattributesPath: string): string | null {
  if (!existsSync(gitattributesPath)) return null;
  const existing = readFileSync(gitattributesPath, "utf-8");
  const start = existing.indexOf(GITATTRIBUTES_START);
  const end = existing.indexOf(GITATTRIBUTES_END);
  if (start === -1 || end === -1 || end < start) return null;
  return existing.slice(start, end + GITATTRIBUTES_END.length);
}

/**
 * Write the managed block into `.gitattributes`, replacing an existing
 * one and preserving every line outside the markers. Idempotent: running
 * it twice on the same config leaves the file byte-identical.
 */
export function injectGitattributesBlock(gitattributesPath: string, block: string): void {
  if (!existsSync(gitattributesPath)) {
    writeFileSync(gitattributesPath, `${block}\n`, "utf-8");
    return;
  }
  const existing = readFileSync(gitattributesPath, "utf-8");
  const start = existing.indexOf(GITATTRIBUTES_START);
  const end = existing.indexOf(GITATTRIBUTES_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + GITATTRIBUTES_END.length);
    writeFileSync(gitattributesPath, before + block + after, "utf-8");
    return;
  }
  writeFileSync(gitattributesPath, `${existing.trimEnd()}\n\n${block}\n`, "utf-8");
}

export type GitattributesDrift =
  /** No managed block — the driver was never installed here. Not a problem to report. */
  | { kind: "absent" }
  | { kind: "ok" }
  | { kind: "drifted"; missing: string[]; extra: string[] };

/**
 * Compare the managed block against what `scan_paths` says it should be.
 * Reports; never mutates (the `suggest-edges` precedent — indexing must
 * not rewrite tracked files behind the user's back).
 */
export function gitattributesDrift(
  gitattributesPath: string,
  scanPaths: ScanPathEntry[],
): GitattributesDrift {
  const current = readManagedBlock(gitattributesPath);
  if (current === null) return { kind: "absent" };

  const expected = gitattributesPatterns(scanPaths);
  const actual = managedPatterns(current);
  const missing = expected.filter((p) => !actual.includes(p));
  const extra = actual.filter((p) => !expected.includes(p));
  if (missing.length === 0 && extra.length === 0) return { kind: "ok" };
  return { kind: "drifted", missing, extra };
}

/** The patterns a managed block currently declares for the docdog driver. */
function managedPatterns(block: string): string[] {
  const patterns: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const [pattern, ...attrs] = trimmed.split(/\s+/);
    if (attrs.includes(`merge=${MERGE_DRIVER_NAME}`)) patterns.push(pattern);
  }
  return patterns;
}
