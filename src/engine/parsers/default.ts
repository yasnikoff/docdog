/**
 * Default parser: one file = one vertex (DD-053).
 *
 * Reads frontmatter and body as-is. The most common case for simple projects
 * where each markdown file is one conceptual section. Structural parsing is
 * delegated to src/markdown/ (DISC-016) — this file only pulls typed fields
 * out of the parsed doc and shapes a ParsedSection.
 */
import type { Parser, ParseInput, ParsedSection } from "./types.js";
import { parse as parseMarkdown, firstHeading } from "../../markdown/index.js";

export const defaultParser: Parser = {
  parse(input: ParseInput): ParsedSection[] {
    const { raw, parserConfig } = input;
    const doc = input.doc ?? parseMarkdown(raw);
    const { frontmatter } = doc;

    const body = doc.frontmatterEndOffset > 0
      ? raw.slice(doc.frontmatterEndOffset).trimStart()
      : raw;

    const title = (frontmatter.title as string | undefined)
      ?? firstHeading(doc)?.text
      ?? "Untitled";

    const id = (frontmatter.id as string | undefined) ?? null;
    const collection = (frontmatter.collection as string | undefined)
      ?? parserConfig.collection
      ?? null;

    return [{
      sectionKey: id ?? `default:${input.repoRelPath}`,
      id,
      title,
      content: body,
      frontmatter,
      collection,
    }];
  },
};
