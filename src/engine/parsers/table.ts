/**
 * Table parser: each row of a markdown table becomes a vertex (DD-067).
 *
 * For glossaries and term lists. Supports optional grouping by preceding
 * `## Heading` — the heading text becomes the vertex's `category` field.
 *
 * Expected table format:
 *   | Term | Definition |
 *   |------|------------|
 *   | **Node** | A physical server... |
 *   | **Pool** | A group of nodes... |
 */
import type { Parser, ParseInput, ParsedSection } from "./types.js";

export const tableParser: Parser = {
  parse(input: ParseInput): ParsedSection[] {
    const { raw, parserConfig } = input;
    const collection = parserConfig.collection ?? null;
    const groupByHeading = parserConfig.group_by_heading === true;

    const lines = raw.split("\n");
    const sections: ParsedSection[] = [];
    let currentCategory: string | null = null;
    let inTable = false;
    let tableHeaderSeen = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track category headings
      if (groupByHeading) {
        const headingMatch = line.match(/^##\s+(.+)$/);
        if (headingMatch) {
          currentCategory = headingMatch[1].trim();
          inTable = false;
          tableHeaderSeen = false;
          continue;
        }
      }

      // Detect table row (leading pipe, non-separator)
      const isRow = /^\|.+\|\s*$/.test(line);
      const isSeparator = /^\|[\s:|-]+\|\s*$/.test(line);

      if (isRow && !isSeparator) {
        if (!inTable) {
          // First row of a table is the header
          inTable = true;
          tableHeaderSeen = false;
          continue;
        }
        if (!tableHeaderSeen) {
          // Header row already consumed; waiting for separator
          continue;
        }
        // Actual data row
        const cells = line.split("|").slice(1, -1).map((c) => c.trim());
        if (cells.length < 2) continue;

        const rawTerm = cells[0];
        const definition = cells.slice(1).join(" | "); // Join remaining cells if > 2

        // Strip markdown bold from term
        const term = rawTerm.replace(/^\*\*|\*\*$/g, "").trim();
        if (!term || !definition) continue;

        const frontmatter: Record<string, unknown> = {
          title: term,
          term,
        };
        if (currentCategory) frontmatter.category = currentCategory;

        sections.push({
          sectionKey: `table:${input.repoRelPath}:${term}`,
          id: null,
          title: term,
          content: definition,
          frontmatter,
          collection,
        });
      } else if (isSeparator) {
        tableHeaderSeen = true;
      } else {
        // Non-table line — reset table state
        inTable = false;
        tableHeaderSeen = false;
      }
    }

    return sections;
  },
};
