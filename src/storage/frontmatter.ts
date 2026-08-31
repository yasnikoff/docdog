/**
 * File-first frontmatter surgery — P-023 §7 step 5 (write half).
 *
 * The write tools (docdog_relate / docdog_create / docdog_update) edit
 * markdown record files; the cache indexer then derives rows from the
 * file (DD-043: edges are born only in `relationships:` frontmatter —
 * nothing here writes a database).
 *
 * Everything operates line-wise on the raw file text and only ever
 * inserts or replaces whole lines, so untouched content — key order,
 * comments, quoting style — survives byte-for-byte and diffs stay
 * minimal. New relationship entries go through the defaults-elide
 * serializer (P-022 §4, carried by P-023 §1.2): fields at their
 * default (null) are omitted, so the common edge stays
 * `- type: TARGET` + `context:`. The v2 provenance fields
 * (source/date/discovered_via/status) dissolved with the single-origin
 * edge model (P-023 §1.1) and are never written.
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { extractRelationships } from "../engine/relationships/extract.js";

/** Scalar values expressible as a top-level frontmatter field (PROPOSAL-027). */
export type FrontmatterScalar = string | number | boolean;

/** A relationship entry in the type-as-key frontmatter shape (PROPOSAL-003 §1). */
export interface RelationshipEntry {
  type: string;
  target: string;
  context?: string | null;
  anchor_text?: string | null;
  role?: string | null;
}

export class FrontmatterPatchError extends Error {
  constructor(
    message: string,
    public code:
      | "MALFORMED_FRONTMATTER"
      | "RELATIONSHIPS_NOT_A_LIST"
      | "RELATIONSHIPS_NOT_BLOCK_FORM"
      | "ENTRY_NOT_REWRITABLE"
      | "RESERVED_TYPE",
  ) {
    super(message);
    this.name = "FrontmatterPatchError";
  }
}

/** Metadata keys of a relationship entry — a type colliding with one
 * would misparse on ingest (extract.ts takes the first non-metadata
 * key as the type). */
const ENTRY_METADATA_KEYS = new Set(["context", "anchor_text", "role"]);

const FM_DELIMITER = "---";

type Eol = "\n" | "\r\n";

function detectEol(raw: string): Eol {
  return raw.includes("\r\n") ? "\r\n" : "\n";
}

function splitLines(raw: string): string[] {
  return raw.split(/\r\n|\n/);
}

/** Frontmatter block bounds as line indices of the two `---` delimiter
 * lines, or null when the file has no leading frontmatter block. */
function frontmatterBounds(lines: string[]): { open: number; close: number } | null {
  if (lines[0]?.trim() !== FM_DELIMITER) return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FM_DELIMITER) return { open: 0, close: i };
  }
  return null;
}

function parseFrontmatterObject(lines: string[], open: number, close: number): Record<string, unknown> {
  const text = lines.slice(open + 1, close).join("\n");
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new FrontmatterPatchError(
      `Frontmatter is not valid YAML — fix the file before patching: ${err instanceof Error ? err.message : String(err)}`,
      "MALFORMED_FRONTMATTER",
    );
  }
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FrontmatterPatchError(
      "Frontmatter does not parse to a map — fix the file before patching.",
      "MALFORMED_FRONTMATTER",
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * Serialize one relationship entry as indented block-list lines
 * (two-space indent under a top-level `relationships:` key), eliding
 * fields at their defaults. Deterministic: key order is fixed
 * (type, context, anchor_text, role) and long strings never wrap.
 */
export function serializeRelationshipEntry(entry: RelationshipEntry): string[] {
  if (ENTRY_METADATA_KEYS.has(entry.type)) {
    throw new FrontmatterPatchError(
      `"${entry.type}" is a reserved relationship metadata key and cannot be used as a type.`,
      "RESERVED_TYPE",
    );
  }
  const obj: Record<string, string> = { [entry.type]: entry.target };
  if (entry.context != null && entry.context !== "") obj.context = entry.context;
  if (entry.anchor_text != null && entry.anchor_text !== "") obj.anchor_text = entry.anchor_text;
  if (entry.role != null && entry.role !== "") obj.role = entry.role;

  return stringifyYaml([obj], { lineWidth: 0 })
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => `  ${line}`);
}

/**
 * Append a relationship entry to the file's `relationships:` block,
 * creating the key — or the whole frontmatter block — when absent.
 * Only inserts lines; every existing line survives verbatim.
 */
export function appendRelationship(raw: string, entry: RelationshipEntry): string {
  const eol = detectEol(raw);
  const lines = splitLines(raw);
  const entryLines = serializeRelationshipEntry(entry);

  const bounds = frontmatterBounds(lines);
  if (!bounds) {
    const block = [FM_DELIMITER, "relationships:", ...entryLines, FM_DELIMITER, ""];
    return [...block, ...lines].join(eol);
  }

  const { open, close } = bounds;
  const fm = parseFrontmatterObject(lines, open, close);
  if (fm.relationships != null && !Array.isArray(fm.relationships)) {
    throw new FrontmatterPatchError(
      "`relationships:` exists but is not a list — fix the file before patching.",
      "RELATIONSHIPS_NOT_A_LIST",
    );
  }

  const keyLine = findTopLevelKey(lines, open, close, "relationships");
  if (keyLine === -1) {
    lines.splice(close, 0, "relationships:", ...entryLines);
    return lines.join(eol);
  }

  const inline = lines[keyLine].slice("relationships:".length).trim();
  if (inline === "[]") {
    lines.splice(keyLine, 1, "relationships:", ...entryLines);
    return lines.join(eol);
  }
  // Any other inline remnant (comment-only is fine; parse above already
  // guaranteed the value is a list or null).
  const insertAt = keySpanEnd(lines, keyLine, close) + 1;
  lines.splice(insertAt, 0, ...entryLines);
  return lines.join(eol);
}

/** One entry of a `relationships:` block, with the source lines it occupies. */
export interface RelationshipSourceEntry {
  entry: RelationshipEntry;
  /** The entry's verbatim lines, in file order — replayed as-is by the merge driver. */
  lines: string[];
}

/**
 * The `relationships:` block as it sits in the file (PROPOSAL-030 §2) —
 * the read half of the surgery `appendRelationship` writes.
 */
export interface RelationshipsBlock {
  /** Line index of the `relationships:` key inside the frontmatter, or -1 when absent. */
  keyLine: number;
  /** Last line of the key's span; equals `keyLine` when the key is absent or empty. */
  spanEnd: number;
  /** Lines between the key and its first entry — comments, kept on replay. */
  preamble: string[];
  entries: RelationshipSourceEntry[];
}

/**
 * Read the `relationships:` block, pairing each parsed entry with the
 * source lines it came from. Returns null when the file has no
 * frontmatter block at all.
 *
 * Throws when the block is not replayable line-wise: malformed YAML, a
 * non-list `relationships:`, or a flow-style (`[{...}]`) list whose
 * entries have no lines of their own. Callers that patch files must be
 * able to put a block back exactly as they found it; when they can't,
 * refusing is the only safe answer.
 */
export function readRelationshipsBlock(raw: string): RelationshipsBlock | null {
  const lines = splitLines(raw);
  const bounds = frontmatterBounds(lines);
  if (!bounds) return null;

  const { open, close } = bounds;
  const fm = parseFrontmatterObject(lines, open, close);
  if (fm.relationships != null && !Array.isArray(fm.relationships)) {
    throw new FrontmatterPatchError(
      "`relationships:` exists but is not a list — fix the file before patching.",
      "RELATIONSHIPS_NOT_A_LIST",
    );
  }

  const keyLine = findTopLevelKey(lines, open, close, "relationships");
  if (keyLine === -1) {
    return { keyLine: -1, spanEnd: -1, preamble: [], entries: [] };
  }

  const spanEnd = keySpanEnd(lines, keyLine, close);
  const { tuples } = extractRelationships(fm);

  // Split the key's span into per-entry line runs. A list item opens with
  // a `-` bullet; everything up to the next bullet belongs to it.
  const preamble: string[] = [];
  const runs: string[][] = [];
  for (let i = keyLine + 1; i <= spanEnd; i++) {
    const line = lines[i];
    if (/^\s*-\s/.test(line)) runs.push([line]);
    else if (runs.length === 0) preamble.push(line);
    else runs[runs.length - 1].push(line);
  }

  if (runs.length !== tuples.length) {
    throw new FrontmatterPatchError(
      `\`relationships:\` is not a block list of ${tuples.length} entries (found ${runs.length} bullets) — ` +
        "rewrite it as one `- type: TARGET` item per entry before patching.",
      "RELATIONSHIPS_NOT_BLOCK_FORM",
    );
  }

  const entries: RelationshipSourceEntry[] = tuples.map((tuple, i) => ({
    entry: {
      type: tuple.type,
      target: tuple.target_id,
      context: tuple.context,
      anchor_text: tuple.anchor_text,
      role: tuple.role,
    },
    lines: runs[i],
  }));

  return { keyLine, spanEnd, preamble, entries };
}

/**
 * Replace the whole `relationships:` block — key line and value — with
 * `blockLines`, or insert them before the closing delimiter when the key
 * is absent. An empty `blockLines` removes the key entirely.
 *
 * Used by the merge driver to swap the block for a sentinel before the
 * text merge and to put the merged block back after (PROPOSAL-030 §2).
 */
export function spliceRelationshipsBlock(raw: string, blockLines: string[]): string {
  const eol = detectEol(raw);
  const lines = splitLines(raw);
  const bounds = frontmatterBounds(lines);
  if (!bounds) {
    throw new FrontmatterPatchError(
      "File has no frontmatter block — nothing to splice.",
      "MALFORMED_FRONTMATTER",
    );
  }

  const { open, close } = bounds;
  const keyLine = findTopLevelKey(lines, open, close, "relationships");
  if (keyLine === -1) {
    lines.splice(close, 0, ...blockLines);
    return lines.join(eol);
  }
  const spanEnd = keySpanEnd(lines, keyLine, close);
  lines.splice(keyLine, spanEnd - keyLine + 1, ...blockLines);
  return lines.join(eol);
}

/**
 * Point every relationship entry that targets `oldTarget` at
 * `newTarget` — the inbound half of `docdog renumber` (PROPOSAL-031).
 *
 * Line-surgical on purpose: only the one token holding the target id is
 * replaced, in place, keeping its quoting style. The entry's context,
 * anchor_text, comments and key order survive byte-for-byte, so
 * renumbering a hub id touches one token per citing record and nothing
 * else. (An id mentioned inside a *context string* is prose, not a
 * target — renumber's prose pass reports it; this function leaves it.)
 *
 * Throws when the block cannot be replayed line-wise (the same refusals
 * `readRelationshipsBlock` makes) or when an entry's target cannot be
 * located on a line of its own — a caller that cannot rewrite exactly
 * must not rewrite at all.
 */
export function retargetRelationships(
  raw: string,
  oldTarget: string,
  newTarget: string,
): { content: string; rewritten: number } {
  const block = readRelationshipsBlock(raw);
  if (!block || block.keyLine === -1 || block.entries.length === 0) {
    return { content: raw, rewritten: 0 };
  }

  const lines = splitLines(raw);
  let rewritten = 0;
  // Entry runs partition the key's span: keyLine, preamble, then one
  // contiguous run per bullet (readRelationshipsBlock builds them that way).
  let cursor = block.keyLine + 1 + block.preamble.length;

  for (const { entry, lines: run } of block.entries) {
    if (entry.target !== oldTarget) {
      cursor += run.length;
      continue;
    }
    const offset = run.findIndex((line) => isKeyValueLine(line, entry.type, oldTarget));
    if (offset === -1) {
      throw new FrontmatterPatchError(
        `Cannot rewrite the "${entry.type}: ${oldTarget}" entry — its target is not on a line of its own ` +
          "(flow style, or a trailing comment). Edit the file directly, then run docdog index.",
        "ENTRY_NOT_REWRITABLE",
      );
    }
    lines[cursor + offset] = replaceKeyValue(run[offset], newTarget);
    rewritten++;
    cursor += run.length;
  }

  return { content: lines.join(detectEol(raw)), rewritten };
}

/** `- references: DD-070`, `  references: "DD-070"` — bullet optional, quotes optional. */
const KEY_VALUE_RE = /^(\s*(?:-\s+)?)(['"]?)([A-Za-z_][A-Za-z0-9_-]*)\2\s*:\s*(.*)$/;

function isKeyValueLine(line: string, key: string, value: string): boolean {
  const m = KEY_VALUE_RE.exec(line);
  return m !== null && m[3] === key && unquote(m[4].trim()) === value;
}

/** Replace the value of a `key: value` line, keeping its indent and quoting. */
function replaceKeyValue(line: string, value: string): string {
  const m = KEY_VALUE_RE.exec(line)!;
  const rawValue = m[4];
  const head = line.slice(0, line.length - rawValue.length);
  const quote = rawValue.trim()[0] === '"' || rawValue.trim()[0] === "'" ? rawValue.trim()[0] : "";
  return `${head}${quote}${value}${quote}`;
}

function unquote(value: string): string {
  const quoted = /^(['"])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

/**
 * Set a top-level frontmatter field to a scalar or flat scalar list,
 * replacing the existing key's lines or inserting before the closing
 * delimiter. Creates the frontmatter block when the file has none.
 * List values serialize as block lists (PROPOSAL-027).
 */
export function setFrontmatterField(
  raw: string,
  key: string,
  value: FrontmatterScalar | FrontmatterScalar[],
): string {
  const eol = detectEol(raw);
  const lines = splitLines(raw);
  const fieldLines = stringifyYaml({ [key]: value }, { lineWidth: 0 })
    .replace(/\n$/, "")
    .split("\n");

  const bounds = frontmatterBounds(lines);
  if (!bounds) {
    const block = [FM_DELIMITER, ...fieldLines, FM_DELIMITER, ""];
    return [...block, ...lines].join(eol);
  }

  const { open, close } = bounds;
  parseFrontmatterObject(lines, open, close); // refuse to patch malformed YAML

  const keyLine = findTopLevelKey(lines, open, close, key);
  if (keyLine === -1) {
    lines.splice(close, 0, ...fieldLines);
    return lines.join(eol);
  }

  const spanEnd = keySpanEnd(lines, keyLine, close);
  lines.splice(keyLine, spanEnd - keyLine + 1, ...fieldLines);
  return lines.join(eol);
}

/**
 * Remove a top-level frontmatter field, block value and all. Returns
 * the input unchanged when the file has no frontmatter block or the
 * key is absent — deletion is idempotent (PROPOSAL-027).
 */
export function removeFrontmatterField(raw: string, key: string): string {
  const lines = splitLines(raw);
  const bounds = frontmatterBounds(lines);
  if (!bounds) return raw;

  const { open, close } = bounds;
  parseFrontmatterObject(lines, open, close); // refuse to patch malformed YAML

  const keyLine = findTopLevelKey(lines, open, close, key);
  if (keyLine === -1) return raw;

  const eol = detectEol(raw);
  const spanEnd = keySpanEnd(lines, keyLine, close);
  lines.splice(keyLine, spanEnd - keyLine + 1);
  return lines.join(eol);
}

/**
 * Replace everything after the frontmatter block (or the whole file
 * when there is none) with the new body. Emits exactly one blank line
 * after the closing delimiter and a single trailing newline.
 */
export function replaceBody(raw: string, content: string): string {
  const eol = detectEol(raw);
  const lines = splitLines(raw);
  const body = content.replace(/\r\n/g, "\n").trimEnd();

  const bounds = frontmatterBounds(lines);
  if (!bounds) {
    return body.split("\n").join(eol) + eol;
  }
  const head = lines.slice(0, bounds.close + 1);
  return [...head, "", ...body.split("\n")].join(eol) + eol;
}

/**
 * Compose a fresh record file: frontmatter block + blank line + body.
 * Key order follows the given object's insertion order; long values
 * never wrap. New files are LF.
 */
export function composeRecordFile(frontmatter: Record<string, unknown>, content: string): string {
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
  const body = content.replace(/\r\n/g, "\n").trimEnd();
  return `${FM_DELIMITER}\n${yaml}${FM_DELIMITER}\n\n${body}\n`;
}

/** Line index of a top-level `key:` inside the frontmatter block, or -1. */
function findTopLevelKey(lines: string[], open: number, close: number, key: string): number {
  for (let i = open + 1; i < close; i++) {
    if (lines[i].startsWith(`${key}:`)) return i;
  }
  return -1;
}

/**
 * Last line of the block value that starts at `keyLine` — the last
 * non-blank indented line before the next top-level key or the closing
 * delimiter. Returns `keyLine` itself for an inline or empty value.
 */
function keySpanEnd(lines: string[], keyLine: number, close: number): number {
  let last = keyLine;
  for (let i = keyLine + 1; i < close; i++) {
    const line = lines[i];
    if (line.trim() === "") continue; // blank lines inside a block are allowed
    if (!/^\s/.test(line)) break; // next top-level key
    last = i;
  }
  return last;
}
