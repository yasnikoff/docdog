/**
 * Shared `split_on` pattern parsing — used by the indexer-time split parser
 * (`src/engine/parsers/split.ts`) and by the `docdog split` command
 * (`src/engine/ingest.ts`).
 *
 * A pattern like `## DD-` means *a heading node at depth 2 whose text starts
 * with `DD-`* — never "a line starting with the string `## DD-`". The two
 * paths derived heading selection separately until FRICTION-039; the command's
 * half was a raw line scan, so it split inside fenced code blocks, could not
 * see setext headings, and had no concept of depth at all.
 *
 * Heading text here is post-mdast `toString()`, i.e. markers already stripped,
 * which is why the prefix is compared against `h.text` and not against a line.
 */
/**
 * The matcher needs a depth and a text and nothing else, so that is what it
 * asks for. `HeadingInfo` satisfies it, and so does `OutlineEntry` — which is
 * what lets `--on` nominate plan boundaries (PROPOSAL-045 §1) without either
 * duplicating the predicate or dragging an mdast node through the plan file.
 */
export interface HeadingLike {
  depth: number;
  text: string;
}

export interface SplitPattern {
  /** Heading level, from the count of `#` markers in the pattern. */
  depth: number;
  /** Literal prefix the heading text must start with. May be empty. */
  prefix: string;
}

/**
 * Parse a pattern like `## DD-` or `### [TASK-` into `{depth, prefix}`.
 * The prefix may include literal brackets; an empty prefix (`## `) matches
 * every heading at that depth.
 */
export function parseSplitPattern(pattern: string): SplitPattern {
  const match = pattern.match(/^(#+)\s*(.*)$/);
  if (!match) {
    throw new Error(`split pattern must start with '#' markers: ${pattern}`);
  }
  return { depth: match[1].length, prefix: match[2] };
}

/**
 * A heading matches if it matches ANY declared pattern (PROPOSAL-034):
 * a file with `### FR-` and `### NFR-` cohorts splits both.
 */
export function matchesAnyPattern(h: HeadingLike, patterns: SplitPattern[]): boolean {
  return patterns.some(p => h.depth === p.depth && h.text.startsWith(p.prefix));
}
