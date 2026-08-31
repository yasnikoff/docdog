/**
 * Shared heading parser — used by both `docdog split` (physical split
 * command in `src/engine/ingest.ts`) and the indexer-time `split`
 * parser in `src/engine/parsers/split.ts`.
 *
 * Recognizes four heading forms, in priority order:
 *
 *   1. `[ID] Title`                      — bracket form
 *       e.g. `### [TASK-004] Structured Logging Module`
 *   2. `ID: Title`                       — colon form (most common)
 *       e.g. `## DD-ARCH-01: Core Abstraction`
 *   3. `ID — Title` / `ID – Title`       — dash form (em-dash or en-dash)
 *       e.g. `## DP-01 — Core Abstraction`
 *   4. `ID`                              — bare form, no title
 *       e.g. `## BACKPORT-039`
 *
 * For bare form, `title` is set to the id itself so downstream
 * consumers (filename generation, frontmatter stamping, sectionKey)
 * have a stable non-empty value to work with.
 *
 * Headings with no recognizable id shape return `{ id: null, title }`
 * where `title` is the full heading text (heading markers stripped).
 */

export interface ParsedHeading {
  id: string | null;
  title: string;
}

const BRACKET_FORM = /^\[([A-Z][A-Z0-9-]*\d+)\]\s*(.+)$/;
const COLON_FORM = /^([A-Z][A-Z0-9-]*\d+):\s*(.+)$/;
const DASH_FORM = /^([A-Z][A-Z0-9-]*\d+)\s*[—–]\s*(.+)$/;
const BARE_FORM = /^([A-Z][A-Z0-9-]*\d+)$/;

export function parseHeading(line: string): ParsedHeading {
  // Strip leading `#` markers and whitespace.
  const text = line.replace(/^#+\s*/, "").trim();

  const bracket = text.match(BRACKET_FORM);
  if (bracket) return { id: bracket[1], title: bracket[2].trim() };

  const colon = text.match(COLON_FORM);
  if (colon) return { id: colon[1], title: colon[2].trim() };

  const dash = text.match(DASH_FORM);
  if (dash) return { id: dash[1], title: dash[2].trim() };

  const bare = text.match(BARE_FORM);
  if (bare) return { id: bare[1], title: bare[1] };

  return { id: null, title: text };
}
