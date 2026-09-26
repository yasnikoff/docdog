/**
 * File discovery + parsing, shared by both indexers.
 *
 * Extracted from the v2 indexer (P-023 §7 step 3) so the SQLite cache
 * indexer (src/storage/indexer.ts) reuses the exact parse semantics —
 * pluggable parsers (DD-067), collection resolution (parser output →
 * directory inference → default_collection), section hashing — without
 * touching ArangoDB. This module is pure with respect to storage: it
 * reads disk and config, never a database.
 *
 * Collection *validation* (DD-057 warn-and-skip, --create-collections)
 * stays with each indexer: the v2 indexer may auto-create Arango
 * collections; the cache indexer validates against config only.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import type { DocdogConfig, ScanPathConfig, ScanPathEntry } from "../types/config.js";
import { getVertexCollections, getDefaultCollection } from "../config/collections.js";
import { normalizeScanPath } from "../config/defaults.js";
import { getParser } from "./parsers/index.js";
import { parserScriptHash } from "./parsers/script.js";
import type { ParsedSection } from "./parsers/types.js";
import { parse as parseMarkdown } from "../markdown/index.js";

export interface SectionToIndex {
  sectionKey: string;
  id: string | null;
  title: string;
  content: string;
  contentHash: string;
  frontmatter: Record<string, unknown>;
  collection: string;
}

export interface ParsedFile {
  absPath: string;
  repoRelPath: string;
  fileHash: string;
  sections: SectionToIndex[];
  /**
   * Everything that went wrong while parsing this file but did not stop it
   * from being indexed — malformed frontmatter, a parser that matched
   * nothing, a section with no resolvable collection. Callers own the
   * reporting channel (CLI stderr, MCP `Warnings:` block); discovery only
   * refuses to stay quiet (FRICTION-019, FRICTION-023).
   */
  warnings: string[];
}

/**
 * Discover every markdown file under the scan paths and parse it into
 * sections. Collections are resolved but NOT validated — callers filter
 * sections against their own collection registry.
 */
export async function discoverAndParseAll(
  projectRoot: string,
  scanPaths: ScanPathEntry[],
  config: DocdogConfig,
): Promise<ParsedFile[]> {
  // Refused before anything is read: two entries naming one path with two
  // parser configs is a contradiction, not a precedence question, and
  // indexing either reading would be docdog choosing one (FRICTION-057).
  assertNoConflictingScanEntries(config.scan_paths ?? []);
  assertNoConflictingScanEntries(scanPaths);

  const parsedFiles: ParsedFile[] = [];
  // A file reached by two entries is parsed ONCE. Before FRICTION-057 each
  // entry parsed it with its own config, both results carried one
  // repoRelPath, and the indexer's per-path reconcile made them delete each
  // other's rows — the file flipped between its two parses on every run.
  const seen = new Set<string>();

  for (const entry of scanPaths) {
    const pathConfig = normalizeScanPath(entry);
    const absPath = join(projectRoot, pathConfig.path);

    let stat;
    try {
      stat = statSync(absPath);
    } catch {
      // Not an error *here* — discovery has nowhere to say it, and a
      // half-configured project must still index the paths that do
      // exist. `findMissingScanPaths` is the surface that says it.
      continue;
    }

    const files: string[] = [];
    if (stat.isDirectory()) {
      collectMarkdownFiles(absPath, files);
    } else if (stat.isFile() && absPath.endsWith(".md")) {
      files.push(absPath);
    }

    for (const filePath of files) {
      const repoRelPath = relative(projectRoot, filePath).split(sep).join("/");
      if (seen.has(repoRelPath)) continue;
      seen.add(repoRelPath);
      const governing = governingScanEntry(config.scan_paths ?? [], repoRelPath) ?? pathConfig;
      const parsed = await parseFile(filePath, projectRoot, governing, config);
      if (parsed) parsedFiles.push(parsed);
    }
  }

  return parsedFiles;
}

/**
 * The scan entry whose parser config governs a file: the most specific
 * configured entry covering it (FRICTION-057). Longest matching path wins,
 * so a file entry beats a directory entry and a deeper directory beats a
 * shallower one — which is what makes "this one file is different" an
 * OVERRIDE of the directory's rule rather than a second, racing reading of
 * the file. List order plays no part. Pure prefix mechanics (DP-001 tier 1):
 * the author declared both entries; nothing here guesses which was meant.
 *
 * Resolved against the CONFIGURED entries, not the ones a run was handed:
 * `index --path spec/` names a scope, not a parser, and must parse
 * `spec/decisions.md` the way a full index does. A file no configured
 * entry covers returns null and the caller keeps the entry that found it
 * (a `--path` outside config, or the implicit `.docdog/local/`).
 *
 * The overlap is not reported. Under a specificity rule it is the normal way
 * to say "this one is different", and a warning about the normal case is a
 * warning that gets turned off.
 */
export function governingScanEntry(
  scanPaths: ScanPathEntry[],
  repoRelPath: string,
): ScanPathConfig | null {
  const file = canonicalScanPath(repoRelPath);
  let best: ScanPathConfig | null = null;
  let bestLen = -1;
  for (const raw of scanPaths) {
    const entry = normalizeScanPath(raw);
    const prefix = canonicalScanPath(entry.path);
    const covers = prefix === "" || file === prefix || file.startsWith(`${prefix}/`);
    if (!covers || prefix.length <= bestLen) continue;
    best = entry;
    bestLen = prefix.length;
  }
  return best;
}

/**
 * Two entries naming the same path with different parser config. An
 * identical duplicate is harmless and passes; a differing one is refused
 * by name, both configs quoted, since which was meant is not in the file
 * (FRICTION-057's tie rule, FRICTION-038's refusal shape).
 */
export function assertNoConflictingScanEntries(scanPaths: ScanPathEntry[]): void {
  const byPath = new Map<string, { declared: string; signature: string }>();
  for (const raw of scanPaths) {
    const entry = normalizeScanPath(raw);
    const key = canonicalScanPath(entry.path);
    const signature = parserSignature(entry);
    const prior = byPath.get(key);
    if (!prior) {
      byPath.set(key, { declared: entry.path, signature });
      continue;
    }
    if (prior.signature !== signature) {
      throw new Error(
        `scan_paths declares "${entry.path}" twice with different parser config ` +
          `(${prior.signature} vs ${signature}) — docdog will not pick one. ` +
          `Keep one entry for that path in .docdog/config.yaml.`,
      );
    }
  }
}

/** `./spec/`, `spec\` and `spec` are one path. Repo-relative, forward-slashed. */
function canonicalScanPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "")
    .replace(/^\.$/, "");
}

/**
 * The scan_paths entries that point at nothing on disk.
 *
 * A declared path that does not exist is silently skipped by discovery,
 * which is the right behaviour for the run and the wrong one for the
 * project: the entry reads like a home for records and is not one, so a
 * file written there is on disk and in no corpus. This repo shipped
 * `.docdog/observations/` in its config for months while every OBS record
 * lived under `specs/`, and nothing ever said so.
 *
 * Report only — the same posture as `scanPathsCoverConcepts`. Creating the
 * directory and removing the entry are opposite fixes and which one is
 * wanted is not in the config (DP-001 tier 3); docdog names the fact and
 * quotes both.
 *
 * Pure string + stat mechanics. Returns the entries' declared paths, in
 * config order, so the message reads as the file does.
 */
/**
 * The one directory docdog scans without being told to (DISC-041).
 *
 * Records here are indexed and never committed — the home for reasoning you
 * want retrievable and not published. `.docdog/.gitignore` carries the
 * matching `local/` rule from `init` onward.
 */
export const LOCAL_DIR_REL = ".docdog/local";

/**
 * Append `.docdog/local/` to a scan path list when the directory exists.
 *
 * IMPLICIT, with no `scan_paths` entry, and the reason is the one failure
 * mode a config entry cannot avoid: **git cannot track an empty directory**.
 * An entry naming a directory nobody has used yet points at nothing on
 * disk in every fresh clone, so `findMissingScanPaths` would warn about the
 * normal case, on every run, in every project — and a warning that fires
 * when nothing is wrong is a warning that gets turned off. Creating the
 * directory at `init` does not help: git will not carry it either.
 *
 * The other half of the argument is that `update` never edits an adopter's
 * config, so an entry would reach existing projects only if each of them
 * added it by hand — which is exactly the step this destination exists to
 * remove.
 *
 * The cost is that the corpus gains records no config line accounts for, so
 * the indexer REPORTS the count whenever it is non-zero. Silence would be
 * the objectionable part; scanning a directory docdog owns, announced when
 * it holds anything, is not.
 *
 * Skipped when a configured entry already covers the path, so a project that
 * declares it explicitly is not scanned twice.
 */
export function withLocalScanPath(
  projectRoot: string,
  scanPaths: ScanPathEntry[],
): ScanPathEntry[] {
  const abs = join(projectRoot, ...LOCAL_DIR_REL.split("/"));
  try {
    if (!statSync(abs).isDirectory()) return scanPaths;
  } catch {
    return scanPaths;
  }

  for (const entry of scanPaths) {
    const declared = normalizeScanPath(entry).path.replace(/\\/g, "/").replace(/\/+$/, "");
    if (declared === LOCAL_DIR_REL || LOCAL_DIR_REL.startsWith(`${declared}/`)) return scanPaths;
  }
  return [...scanPaths, `${LOCAL_DIR_REL}/`];
}

/** True for a path inside the local directory. Repo-relative, forward-slashed. */
export function isLocalRecordPath(repoRelPath: string): boolean {
  return repoRelPath.replace(/\\/g, "/").startsWith(`${LOCAL_DIR_REL}/`);
}

export function findMissingScanPaths(projectRoot: string, scanPaths: ScanPathEntry[]): string[] {
  const missing: string[] = [];
  for (const entry of scanPaths) {
    const path = normalizeScanPath(entry).path;
    try {
      statSync(join(projectRoot, path));
    } catch {
      missing.push(path);
    }
  }
  return missing;
}

export function collectMarkdownFiles(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(absPath, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.endsWith(".index.md")) {
      acc.push(absPath);
    }
  }
}

export async function parseFile(
  absPath: string,
  projectRoot: string,
  parserConfig: ScanPathConfig,
  config: DocdogConfig,
): Promise<ParsedFile | null> {
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }

  // Line endings are a checkout policy, not content. Under core.autocrlf a
  // worktree holds CRLF where the tree it was cut from holds LF — same record,
  // different bytes, so the (content_hash, model) key of PROPOSAL-029's shared
  // embed store missed on every lookup and re-embedded the whole corpus.
  // Canonicalizing here makes every derived artifact (content hash, file hash,
  // body_text, FTS, embed input) EOL-agnostic. Disk is untouched; only what we
  // derive from it is normalized.
  raw = raw.replace(/\r\n/g, "\n");

  const repoRelPath = relative(projectRoot, absPath).split(sep).join("/");

  // The file hash is the cache's dirty check, so it must cover every input
  // the derivation depends on — content AND the scan entry that decides how
  // the content is parsed. Hashing content alone made parser-config edits
  // invisible to an incremental index (FRICTION-021): the file was skipped,
  // the new parser never ran, and only hand-deleting cache rows fixed it.
  const fileHash = `sha256:${createHash("sha256")
    .update(raw)
    .update("\u0000")
    .update(parserSignature(parserConfig, projectRoot))
    .digest("hex")}`;

  const warnings: string[] = [];

  // Parse once here and hand the doc to the parser: discovery needs the
  // frontmatter diagnostic (FRICTION-019) and the parsers need the AST.
  const doc = parseMarkdown(raw);
  if (doc.frontmatterError) {
    warnings.push(
      `${repoRelPath}: frontmatter is not valid YAML — indexed body-only, so its ` +
        `declared id, description and relationships were ignored (${doc.frontmatterError})`,
    );
  }

  const parser = getParser(parserConfig.parser);
  const rawSections: ParsedSection[] = await parser.parse({
    absPath,
    repoRelPath,
    raw,
    doc,
    parserConfig,
    projectConfig: config,
    projectRoot,
  });

  if (rawSections.length === 0) {
    // A file that yields nothing is not indexed at all — no vertex, no body,
    // no FTS row. Tolerable for navigation stubs, a silent coverage hole for
    // anything else, so say it out loud (FRICTION-023).
    warnings.push(
      `${repoRelPath}: parser "${parserConfig.parser ?? "default"}" matched no sections — file not indexed`,
    );
  }

  // Resolve collection for each section (parser output → directory inference → default_collection)
  const defaultCol = getDefaultCollection(config);
  const knownCollections = getVertexCollections(config);
  const sections: SectionToIndex[] = [];

  for (const rs of rawSections) {
    let collection = rs.collection;
    if (!collection) {
      // Fall back to directory-based inference (default parser case)
      collection = inferCollectionFromPath(absPath, knownCollections) ?? defaultCol;
    }
    if (!collection) {
      warnings.push(`${repoRelPath}: no collection for section "${rs.title}" — section skipped`);
      continue;
    }

    const contentHash = `sha256:${createHash("sha256").update(rs.content).digest("hex")}`;

    sections.push({
      sectionKey: rs.sectionKey ?? `default:${repoRelPath}`,
      id: rs.id,
      title: rs.title,
      content: rs.content,
      contentHash,
      frontmatter: rs.frontmatter,
      collection,
    });
  }

  return { absPath, repoRelPath, fileHash, sections, warnings };
}

/**
 * The part of a scan entry that changes how a file parses. `path` is excluded
 * on purpose: the same file is described by the scan root during a full scan
 * (`specs/`) and by its own path during a single-file reindex, and those two
 * must hash identically or every write would look like a config change.
 */
function parserSignature(parserConfig: ScanPathConfig, projectRoot?: string): string {
  const { path: _path, ...rest } = parserConfig;
  const keys = Object.keys(rest).sort();
  const pairs: Array<[string, unknown]> = keys.map((k) => [k, (rest as Record<string, unknown>)[k]]);
  // A script entry's config names its parser and does not contain it, so the
  // script's text joins the signature — editing it dirties exactly the files
  // this entry governs (FRICTION-059, FRICTION-021's semantics extended).
  if (projectRoot && parserConfig.parser === "script" && parserConfig.script) {
    pairs.push(["(script sha256)", parserScriptHash(projectRoot, parserConfig.script)]);
  }
  return JSON.stringify(pairs);
}

// Aliases for common directory names → collection names
const DIRECTORY_ALIASES: Record<string, string> = {
  glossary: "terms",
  design: "decisions",
};

export function inferCollectionFromPath(absPath: string, knownCollections: string[]): string | null {
  const parts = absPath.split(/[/\\]/);
  for (const part of [...parts].reverse()) {
    if (knownCollections.includes(part)) return part;
    const alias = DIRECTORY_ALIASES[part];
    if (alias && knownCollections.includes(alias)) return alias;
  }
  return null;
}
