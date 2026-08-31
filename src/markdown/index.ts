/**
 * Thin wrapper over remark/unified — the one place in the codebase
 * that knows markdown is not a flat string. DISC-016.
 *
 * Parse once, then query the AST via the small helper surface below.
 * Format-specific adapters (orchestrator skills, historical archives,
 * etc.) consume these helpers; they never re-parse the source and
 * they never reach into the raw string for structural extraction.
 *
 * Body/section slicing is always performed against the *original
 * source* using node positional offsets — never via stringify. This
 * keeps bytes stable so sectionKey / content-hash stability holds
 * across reindexes.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import { parse as parseYaml } from "yaml";
import type { Root, Heading, Link, ListItem, Yaml, Node } from "mdast";

export interface MdDoc {
  ast: Root;
  raw: string;
  frontmatter: Record<string, unknown>;
  /** End offset (exclusive) of the frontmatter node in the source, or 0. */
  frontmatterEndOffset: number;
  /**
   * Set when a frontmatter block exists but does not yield a YAML map
   * (FRICTION-019). `frontmatter` degrades to `{}` so the body still
   * indexes; this field is how a caller can say so out loud instead of
   * silently dropping the file's declared id, description and edges.
   */
  frontmatterError: string | null;
}

export interface HeadingInfo {
  depth: number;
  text: string;
  node: Heading;
  startOffset: number;
  endOffset: number;
}

export interface LinkInfo {
  url: string;
  text: string;
  node: Link;
}

export interface TaskItemInfo {
  checked: boolean;
  text: string;
  node: ListItem;
}

export interface SectionSlice {
  heading: HeadingInfo;
  /** Source slice from heading start through end of section (next same-or-higher heading, or EOF). */
  content: string;
  /** Source slice of just the body (after the heading line), trimmed. */
  body: string;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm);

export function parse(raw: string): MdDoc {
  const ast = processor.parse(raw) as Root;

  let frontmatter: Record<string, unknown> = {};
  let frontmatterEndOffset = 0;
  let frontmatterError: string | null = null;

  const fmNode = ast.children[0];
  if (fmNode && fmNode.type === "yaml") {
    const yamlNode = fmNode as Yaml;
    if (yamlNode.value) {
      // Degrading to empty frontmatter keeps a broken file's prose
      // searchable, which is the right fallback — but the failure must
      // leave here on `frontmatterError` so the indexer can warn
      // (FRICTION-019). Silence is the bug, not the fallback.
      try {
        const parsed = parseYaml(yamlNode.value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          frontmatter = parsed as Record<string, unknown>;
        } else if (parsed !== null && parsed !== undefined) {
          frontmatterError = "frontmatter does not parse to a map";
        }
      } catch (err) {
        frontmatterError = firstLine(err instanceof Error ? err.message : String(err));
      }
    }
    frontmatterEndOffset = yamlNode.position?.end.offset ?? 0;
  }

  return { ast, raw, frontmatter, frontmatterEndOffset, frontmatterError };
}

/** YAML errors carry a multi-line source excerpt; the first line is the reason. */
function firstLine(message: string): string {
  return message.split("\n")[0].trim();
}

/** Raw body after frontmatter, with a single leading blank line trimmed. */
export function bodyAfterFrontmatter(doc: MdDoc): string {
  if (doc.frontmatterEndOffset === 0) return doc.raw;
  return doc.raw.slice(doc.frontmatterEndOffset).replace(/^\r?\n+/, "");
}

export function findHeadings(doc: MdDoc): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  visit(doc.ast, "heading", (node: Heading) => {
    const pos = node.position;
    if (!pos) return;
    out.push({
      depth: node.depth,
      text: mdastToString(node).trim(),
      node,
      startOffset: pos.start.offset ?? 0,
      endOffset: pos.end.offset ?? 0,
    });
  });
  return out;
}

export function findLinks(doc: MdDoc): LinkInfo[] {
  const out: LinkInfo[] = [];
  visit(doc.ast, "link", (node: Link) => {
    out.push({ url: node.url, text: mdastToString(node), node });
  });
  return out;
}

export function findTaskListItems(doc: MdDoc): TaskItemInfo[] {
  const out: TaskItemInfo[] = [];
  visit(doc.ast, "listItem", (node: ListItem) => {
    if (typeof node.checked !== "boolean") return;
    out.push({
      checked: node.checked,
      text: mdastToString(node).trim(),
      node,
    });
  });
  return out;
}

/**
 * Return section slices where `predicate(heading)` is true. Each section
 * runs from its heading through the next heading at the same-or-shallower
 * depth, or to EOF. Content and body are sliced directly from the source —
 * never round-tripped through AST stringify.
 */
export function sectionsByHeading(
  doc: MdDoc,
  predicate: (h: HeadingInfo) => boolean,
): SectionSlice[] {
  const headings = findHeadings(doc);
  const matches: { h: HeadingInfo; idx: number }[] = [];
  headings.forEach((h, idx) => {
    if (predicate(h)) matches.push({ h, idx });
  });

  const sections: SectionSlice[] = [];
  for (const { h, idx } of matches) {
    let endOffset = doc.raw.length;
    for (let j = idx + 1; j < headings.length; j++) {
      if (headings[j].depth <= h.depth) {
        endOffset = headings[j].startOffset;
        break;
      }
    }
    const content = doc.raw.slice(h.startOffset, endOffset).trimEnd();
    // Body = after heading line, trimmed of surrounding blank lines.
    const afterHeading = doc.raw.slice(h.endOffset, endOffset);
    const body = afterHeading.replace(/^\r?\n+/, "").trimEnd();
    sections.push({ heading: h, content, body });
  }
  return sections;
}

/** First heading of any depth, or null. */
export function firstHeading(doc: MdDoc): HeadingInfo | null {
  const hs = findHeadings(doc);
  return hs[0] ?? null;
}

/** Re-export for adapters that want to walk the AST directly. */
export { visit };
export type { Root, Heading, Link, ListItem, Node };
