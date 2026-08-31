/**
 * Split parser: multi-section files split on a heading pattern (DD-067).
 *
 * For files like architecture.md with `## DD-ARCH-NN: Title` sections.
 * Structural parsing is delegated to src/markdown/ (DISC-016); this
 * file derives the heading depth and id-prefix from the configured
 * `split_on` string, slices sections by AST position, and runs the
 * inline-metadata extractor over each body.
 */
import type { Parser, ParseInput, ParsedSection } from "./types.js";
import { parseHeading } from "../parse-heading.js";
import { parseSplitPattern, matchesAnyPattern } from "../split-pattern.js";
import { parse as parseMarkdown, sectionsByHeading } from "../../markdown/index.js";
import { defaultParser } from "./default.js";

export const splitParser: Parser = {
  parse(input: ParseInput): ParsedSection[] {
    const { raw, parserConfig } = input;

    const patterns = normalizePatterns(parserConfig.split_on).map(parseSplitPattern);
    if (patterns.length === 0) {
      throw new Error(`split parser requires 'split_on' config for path: ${input.repoRelPath}`);
    }

    const collection = parserConfig.collection ?? null;

    const doc = input.doc ?? parseMarkdown(raw);
    const slices = sectionsByHeading(doc, h => matchesAnyPattern(h, patterns));

    // No heading matched. Default is to return nothing (discovery warns and
    // the file is not indexed, FRICTION-023). `fallback: whole-file` keeps the
    // file instead, as one vertex via the default parser (PROPOSAL-034) — so a
    // split entry can cover a folder that mixes id-bearing and prose files.
    if (slices.length === 0 && parserConfig.fallback === "whole-file") {
      // defaultParser is synchronous; the `Parser` return type is the sync/async
      // union, so narrow it back to keep this parser's own signature sync.
      return defaultParser.parse(input) as ParsedSection[];
    }

    const sections: ParsedSection[] = [];
    for (const slice of slices) {
      const { id, title } = parseHeading(slice.heading.text);
      const { body: cleanBody, metadata } = extractMetadata(slice.body);

      const frontmatter: Record<string, unknown> = { id, title };
      if (metadata.status) frontmatter.status = metadata.status;
      if (metadata.date) frontmatter.date = metadata.date;

      const sectionKey = id ?? `split:${input.repoRelPath}:${title}`;

      sections.push({
        sectionKey,
        id,
        title,
        content: cleanBody,
        frontmatter,
        collection,
      });
    }

    return sections;
  },
};

/**
 * Normalize `split_on` (a string, a list, or unset) to a list of
 * non-empty pattern strings (PROPOSAL-034). A single string stays a
 * one-element list; blank entries are dropped so an empty or
 * whitespace-only config surfaces as the "requires split_on" error.
 */
function normalizePatterns(splitOn: string | string[] | undefined): string[] {
  const list = splitOn === undefined ? [] : Array.isArray(splitOn) ? splitOn : [splitOn];
  return list.filter(p => typeof p === "string" && p.trim().length > 0);
}

function extractMetadata(body: string): { body: string; metadata: { status?: string; date?: string } } {
  const metadata: { status?: string; date?: string } = {};
  const lines = body.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const statusMatch = line.match(/^\*\*Status:\*\*\s*(.+)/i);
    if (statusMatch) {
      metadata.status = statusMatch[1].trim().toLowerCase();
      continue;
    }
    const dateMatch = line.match(/^\*\*Date:\*\*\s*(.+)/i);
    if (dateMatch) {
      metadata.date = dateMatch[1].trim().replace(/,.*$/, "").trim();
      continue;
    }
    kept.push(line);
  }

  const cleaned = kept.join("\n").replace(/^\n+/, "").trimEnd();
  return { body: cleaned, metadata };
}
