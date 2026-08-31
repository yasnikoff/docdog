/**
 * Parser system — indexer reads files via pluggable parsers (DD-067).
 *
 * Each parser takes a raw file and produces zero or more ParsedSection
 * objects. The indexer handles hashing, embedding, and upsertion.
 */
import type { DocdogConfig, ScanPathConfig } from "../../types/config.js";
import type { MdDoc } from "../../markdown/index.js";

export interface ParseInput {
  /** Absolute path to the file being parsed. */
  absPath: string;
  /** Repo-relative path (forward-slash). */
  repoRelPath: string;
  /** Raw file content. */
  raw: string;
  /**
   * `raw` already parsed, when the caller has it. Discovery parses every
   * file anyway to check its frontmatter (FRICTION-019), so it hands the
   * doc down rather than making each parser re-parse. Optional: a parser
   * must still work when given only `raw`.
   */
  doc?: MdDoc;
  /** Parser config from scan_paths entry. */
  parserConfig: ScanPathConfig;
  /** Full docdog config (for resolving collections, script paths, etc). */
  projectConfig: DocdogConfig;
  /** Project root (for resolving script paths). */
  projectRoot: string;
}

export interface ParsedSection {
  /**
   * Stable within-file identifier for change tracking on re-index.
   * Use frontmatter `id` when present; otherwise a heading-path key.
   * Null means "match by content hash only" (e.g. default parser with no id).
   */
  sectionKey: string | null;

  /** Human-readable id from frontmatter (DD-ARCH-01, FR-PROV-01, etc). */
  id: string | null;

  /** Section title — extracted from heading, frontmatter, or derived. */
  title: string;

  /** Markdown body (heading stripped for split parser; full file body for default). */
  content: string;

  /** Frontmatter for this section. May inherit from file frontmatter. */
  frontmatter: Record<string, unknown>;

  /** Target collection. Resolution order: this field → parser config → frontmatter → directory name → default_collection. */
  collection: string | null;
}

export interface Parser {
  /** Parse a file into zero or more sections. May be async (for script parsers). */
  parse(input: ParseInput): Promise<ParsedSection[]> | ParsedSection[];
}
