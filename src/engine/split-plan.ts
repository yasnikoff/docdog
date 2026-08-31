/**
 * The plan file — the *only* executor of `docdog split` (PROPOSAL-039,
 * unified by PROPOSAL-045).
 *
 * Every other input the splitter accepts is a *rule*: `--on "## DD-"` and
 * `--depth 3` both describe a pattern. An agent that has read a document and
 * decided its boundaries semantically — merge these two, split that one at
 * its subheading, leave that one alone — had no way to say so. That is the
 * gap PROPOSAL-039 closed, and it is a missing *input shape*, not a missing
 * parser.
 *
 * PROPOSAL-045 finished the job by demoting the rules from actors to
 * *pre-population selectors*: `--on` and `--depth` now choose which outline
 * entries arrive in `sections:`, and the plan file executes. Which meant the
 * plan had to learn what pattern mode used to produce, so the header carries
 * `output: files | records` — the output shape is a property of the plan
 * rather than of which command you typed — and `parent_id` became optional,
 * because a foreign document being ingested has no id and files-mode children
 * mint no `part_of` (DD-072).
 *
 * DP-001 draws the line through the middle of this file. The tool owns
 * everything derivable from the document: the heading outline, the character
 * counts, the descent diagnostic, the offsets, the edges, the writes. The
 * agent owns everything that requires reading it: where the ideas divide,
 * what each one is called, what its description says. Nothing here scores a
 * boundary, and there is deliberately no mode that generates a plan and
 * applies it without review — that is the `--accept-all` analogue and it must
 * never be built.
 *
 * Both directions live here on purpose, which is PROPOSAL-028's proven
 * property restated: what the tool emits is exactly what it eats, so the
 * round trip cannot drift apart one release at a time.
 */
import { parse as parseYaml } from "yaml";
import { MAX_EMBED_CHARS } from "../storage/embed-health.js";
import { parseHeading } from "./parse-heading.js";
import { findHeadings, type MdDoc, type HeadingInfo } from "../markdown/index.js";

/** Bumped only when a row's meaning changes; an unknown version is a hard
 * error, never a guess (accept.ts's rule, same reasons). Version 2 added the
 * `output:` header key and made `parent_id` optional (PROPOSAL-045). */
export const SPLIT_PLAN_VERSION = 2;

/**
 * What a plan produces.
 *
 * - `records` — child records beside a parent that stays live: each child
 *   declares `part_of` the parent (DD-072), the parent is rewritten down to
 *   its framing prose plus a roster, and coverage is fixed *additively*.
 * - `files` — the pre-docdog bulk-ingest shape: sibling files with ids parsed
 *   from heading text, no edges, the source retired to `<base>.index.md` and
 *   deleted, and coverage fixed by a function that *removes* the source's own
 *   entry, which is correct here and only here.
 *
 * Two axes — who chooses the boundaries, and what comes out — used to be
 * bundled into one flag each. This is the second axis, declared.
 */
export type SplitPlanOutput = "files" | "records";

export const SPLIT_PLAN_OUTPUTS: SplitPlanOutput[] = ["files", "records"];

export class SplitPlanError extends Error {
  constructor(
    message: string,
    public code:
      | "UNREADABLE"
      | "MALFORMED_FILE"
      | "UNKNOWN_VERSION"
      | "INVALID_PLAN"
      | "NO_PARENT_ID"
      | "NO_MATCHES",
  ) {
    super(message);
    this.name = "SplitPlanError";
  }
}

// ─── outline ────────────────────────────────────────────────────────────────

/**
 * One heading, with the size of the section it owns. `n` is its 1-based
 * ordinal among *all* headings in the source and is the plan's boundary key:
 * heading text repeats across a document, ordinals do not.
 */
export interface OutlineEntry {
  n: number;
  depth: number;
  text: string;
  /** Chars from this heading through the next same-or-shallower one, or EOF. */
  chars: number;
  /** Offset of the heading marker itself. */
  startOffset: number;
  /** Offset just past the heading line — where the section's body begins. */
  headingEnd: number;
  /** Offset where the section ends: the next same-or-shallower heading, or EOF. */
  endOffset: number;
  /** No heading of any depth inside this section's span. */
  leaf: boolean;
}

export function buildOutline(doc: MdDoc): OutlineEntry[] {
  const headings = findHeadings(doc);
  return headings.map((h, idx) => {
    const end = sectionEnd(headings, idx, doc.raw.length);
    const nested = headings.some(
      (other, j) => j > idx && other.startOffset < end,
    );
    return {
      n: idx + 1,
      depth: h.depth,
      text: h.text,
      chars: end - h.startOffset,
      startOffset: h.startOffset,
      headingEnd: h.endOffset,
      endOffset: end,
      leaf: !nested,
    };
  });
}

/** End offset of the section owned by `headings[idx]` — the next heading at
 * the same or a shallower depth, or EOF. Mirrors `sectionsByHeading`. */
function sectionEnd(headings: HeadingInfo[], idx: number, rawLength: number): number {
  for (let j = idx + 1; j < headings.length; j++) {
    if (headings[j].depth <= headings[idx].depth) return headings[j].startOffset;
  }
  return rawLength;
}

// ─── descent (PROPOSAL-038 §2, as amended by PROPOSAL-039) ──────────────────

export interface DescentLevel {
  depth: number;
  /** Pieces the document would break into at this depth, preamble included. */
  pieces: number;
  largest: number;
  overCap: number;
}

export interface DescentReport {
  cap: number;
  levels: DescentLevel[];
  /** Shallowest depth at which every piece clears the cap, or null if none does. */
  suggested: number | null;
  /** Over-cap sections with no deeper heading inside — §3's refusal set. */
  overCapLeaves: OutlineEntry[];
  totalChars: number;
  headings: number;
}

/**
 * Walk heading depths shallowest to deepest and measure what each level would
 * produce. **Reported, never applied.** PROPOSAL-038 shipped this as the
 * default action — pick a depth, split there — and PROPOSAL-039 demoted it,
 * because "every piece fits under the cap" is a fine fact and a poor decision:
 * it optimizes the one property OBS-019 measured does *not* predict retrieval
 * quality. It is the strongest input the agent reads and it is not the actor.
 */
export function computeDescent(
  outline: OutlineEntry[],
  rawLength: number,
  cap: number = MAX_EMBED_CHARS,
): DescentReport {
  const levels: DescentLevel[] = [];
  let suggested: number | null = null;

  for (let depth = 1; depth <= 6; depth++) {
    const boundaries = outline.filter(e => e.depth === depth);
    if (boundaries.length === 0) continue;

    // Boundaries **partition** the document, exactly as `--apply-plan` does:
    // each piece runs to the next boundary, and the preamble stays with the
    // parent. Measuring the partition rather than each heading's own section
    // is what makes these numbers the numbers you actually get — including
    // the unwelcome case where a shallower heading after the last boundary
    // is absorbed into the final piece. A parent whose framing prose is
    // itself over the cap is not fixed by descending further, which is why
    // the preamble is counted.
    const starts = boundaries.map(b => b.startOffset);
    const sizes = [starts[0]];
    for (let i = 0; i < starts.length; i++) {
      sizes.push((i + 1 < starts.length ? starts[i + 1] : rawLength) - starts[i]);
    }
    const overCap = sizes.filter(s => s > cap).length;
    levels.push({
      depth,
      pieces: sizes.length,
      largest: Math.max(...sizes),
      overCap,
    });
    if (overCap === 0 && suggested === null) suggested = depth;
  }

  return {
    cap,
    levels,
    suggested,
    overCapLeaves: outline.filter(e => e.leaf && e.chars > cap),
    totalChars: rawLength,
    headings: outline.length,
  };
}

// ─── emit ───────────────────────────────────────────────────────────────────

/**
 * A pre-population selector's *result*, not the selector itself.
 *
 * PROPOSAL-045 demoted `--on` / `--depth` from actors to nominators, and this
 * is the whole of what that demotion means mechanically: a rule chooses which
 * outline entries arrive in `sections:`, and stops there. The matching lives
 * in `ingest.ts` beside `split-pattern.ts`; this module takes the answer and
 * the label to print, so nothing here has to know what a pattern is.
 */
export interface PlanSelection {
  /** Human-readable form of the selector, for the plan's header comments. */
  describe: string;
  /** The entries the selector chose, in document order. */
  entries: OutlineEntry[];
}

export interface RenderPlanOptions {
  /** Repo-relative source path, written into the plan as `source:`. */
  source: string;
  /**
   * The parent record's declared id — every child's `part_of` target under
   * `output: records`, and null under `output: files`, where the source stops
   * being a record and nothing declares `part_of` it.
   */
  parentId: string | null;
  /** Printed in the header either way: a visible default, never an inference. */
  output: SplitPlanOutput;
  collection: string;
  outline: OutlineEntry[];
  descent: DescentReport;
  /**
   * Pre-populate these boundaries instead of descent's suggested depth
   * (PROPOSAL-045 §1). Absent = today's behaviour.
   */
  selection?: PlanSelection;
}

/**
 * Render the plan document. The outline is emitted as *comments* and the
 * boundaries as data: the outline is derivable from the source, so putting it
 * in the data would create a second copy the agent has to keep in sync with
 * the file — and `--apply-plan` recomputes it from the same source anyway.
 *
 * `sections:` arrives pre-populated — at descent's suggested depth, or at
 * whatever a selector nominated. That is the PROPOSAL-028 shape — the tool
 * emits candidates, the agent prunes and edits — and under `output: records`
 * it is safe to pre-populate precisely because every description is empty, so
 * a plan applied without review is refused before it writes anything.
 */
export function renderPlanDocument(opts: RenderPlanOptions): string {
  const { source, parentId, output, collection, outline, descent, selection } = opts;
  const records = output === "records";
  const lines: string[] = [];

  lines.push(`# docdog split ${posix(source)} --format plan`);
  lines.push(
    `# ${descent.headings} heading${plural(descent.headings)}, ${fmt(descent.totalChars)} chars, embed cap ${fmt(descent.cap)}.`,
  );
  lines.push("#");
  lines.push("# Outline — the `n` of each heading is what `heading:` below refers to.");
  for (const e of outline) {
    const flag = e.chars > descent.cap ? "  ** over cap" : "";
    lines.push(
      `#   ${String(e.n).padStart(3)}  H${e.depth}  ${String(fmt(e.chars)).padStart(7)}  ${"  ".repeat(e.depth - 1)}${e.text}${flag}`,
    );
  }
  lines.push("#");
  for (const line of describeDescent(descent)) lines.push(`# ${line}`);
  lines.push("#");
  for (const line of describeOutput(output)) lines.push(`# ${line}`);
  lines.push("#");
  if (selection) {
    lines.push(
      `# Boundaries below were pre-populated by ${selection.describe} — ${selection.entries.length} heading${plural(selection.entries.length)}.`,
    );
    lines.push("# A selector nominates; it does not decide. Prune and edit freely.");
  }
  lines.push("# Every `heading:` must be a real heading in the source; a boundary the");
  lines.push("# tool did not emit is a hard error, never a best-effort match. Delete an");
  lines.push("# entry to merge that section into the one above it.");
  if (records) {
    lines.push("# Write a description for each entry you keep — an empty one is refused.");
  } else {
    lines.push("# A description is optional under `output: files`, and an empty `id:` means");
    lines.push("# the child gets no `id:` key at all — what pattern mode writes today.");
  }
  lines.push(`# Apply with: docdog split --apply-plan <this file>`);

  lines.push(`version: ${SPLIT_PLAN_VERSION}`);
  lines.push(`source: ${scalar(posix(source))}`);
  lines.push(`output: ${output}`);
  if (parentId !== null) lines.push(`parent_id: ${scalar(parentId)}`);
  lines.push(`collection: ${scalar(collection)}`);

  const suggested = descent.suggested;
  const boundaries = selection
    ? selection.entries
    : suggested === null
      ? []
      : outline.filter(e => e.depth === suggested);

  if (boundaries.length === 0) {
    lines.push("sections: []");
    lines.push("#");
    lines.push(
      suggested === null
        ? "# No heading depth breaks this document into pieces that all fit, so nothing"
        : "# No headings at the suggested depth, so nothing",
    );
    lines.push("# was pre-populated. Add entries by hand if the document should still split.");
    return lines.join("\n") + "\n";
  }

  lines.push("sections:");
  boundaries.forEach((b, i) => {
    // Under `output: files` the id and the title come from the heading text
    // itself, which is what pattern mode has always done: `[TASK-004] Foo`
    // yields id TASK-004 and title Foo, and a heading with no id shape yields
    // an empty id, meaning "no `id:` key in the child's frontmatter".
    const parsed = parseHeading(b.text);
    const childId = records ? derivedChildId(parentId as string, i + 1) : (parsed.id ?? "");
    const childTitle = records ? b.text : parsed.title;

    lines.push(`  # ${fmt(b.chars)} chars`);
    lines.push(`  - heading: ${b.n}`);
    lines.push(`    at: ${scalar(b.text)}`);
    lines.push(`    id: ${childId === "" ? '""' : scalar(childId)}`);
    lines.push(`    title: ${scalar(childTitle)}`);
    lines.push(`    description: ""`);
  });

  return lines.join("\n") + "\n";
}

/** What `output:` means, in the plan the reader is about to edit. Printed on
 * both modes so the default never has to be reconstructed (DP-001 tier 2). */
export function describeOutput(output: SplitPlanOutput): string[] {
  if (output === "records") {
    return [
      "output: records — each boundary becomes a child record declaring part_of",
      `${" ".repeat(2)}the parent (DD-072). The parent stays live at its own path, keeping its`,
      `${" ".repeat(2)}id and framing prose plus a roster of its parts. Change to \`files\` for`,
      `${" ".repeat(2)}sibling files with no edges and a retired source.`,
    ];
  }
  return [
    "output: files — each boundary becomes a sibling file, ids parsed from the",
    `${" ".repeat(2)}heading text and no edges minted. The source is retired to`,
    `${" ".repeat(2)}<base>.index.md and deleted. Change to \`records\` (and add parent_id:)`,
    `${" ".repeat(2)}to keep the source as a live parent with part_of children instead.`,
  ];
}

/**
 * The commands the no-selector report ends with.
 *
 * Extracted for the same reason `describeDescent` was: a line the report
 * prints is a line something has to be able to check. It became one when the
 * unified report dropped `--collection` from the command it suggests — a
 * source with no declared collection cannot emit a plan without being told
 * one, so the very first command an agent copied out of the report failed,
 * and the failing case was the *foreign document* this path exists to serve.
 * A suggested command that does not run is worse than no suggestion.
 */
export function describeNextSteps(
  file: string,
  source: { parentId: string | null; collection: string | null },
): string[] {
  const out: string[] = [];
  if (source.parentId === null) {
    out.push("This file declares no id, so a plan for it defaults to `output: files`:");
    out.push("sibling files with no edges, and the source retired to .index.md.");
  } else {
    out.push(
      `This file declares ${source.parentId}, so a plan for it defaults to \`output: records\`:`,
    );
    out.push("child records declaring part_of it, and the parent left live (DD-072).");
  }
  out.push("");

  const collectionArg = source.collection === null ? " --collection <name>" : "";
  out.push(`Emit a plan:  docdog split ${file} --format plan${collectionArg} > plan.yaml`);
  out.push(`   at a depth:  ... --format plan --depth <n>`);
  out.push(`   on a pattern: ... --format plan --on "## DD-"   (repeatable)`);
  if (collectionArg) {
    out.push(`(this file declares no collection, so one must be named)`);
  }
  out.push("");
  out.push("Then edit the boundaries, titles and descriptions — and `output:` if the");
  out.push("default is not what you want — and apply:");
  out.push("      docdog split --apply-plan plan.yaml");
  return out;
}

/** Human-readable descent verdict — shared by the plan header and the
 * no-selector report so the two can never say different things. */
export function describeDescent(d: DescentReport): string[] {
  const out: string[] = [];
  if (d.levels.length === 0) {
    out.push("No headings — there is nothing to split on.");
    return out;
  }

  out.push("depth  pieces  largest  over cap");
  for (const l of d.levels) {
    const mark = l.depth === d.suggested ? "   <- every piece fits" : "";
    out.push(
      `   H${l.depth}  ${String(l.pieces).padStart(6)}  ${String(fmt(l.largest)).padStart(7)}  ${String(l.overCap).padStart(8)}${mark}`,
    );
  }
  out.push("");

  if (d.suggested === null) {
    out.push("No depth breaks this document into pieces that all clear the cap.");
  } else {
    out.push(
      `Descent suggests H${d.suggested}. That is a size fact, not a boundary decision —`,
    );
    out.push("where a document divides into ideas is yours to choose (PROPOSAL-039).");
  }

  if (d.overCapLeaves.length > 0) {
    out.push("");
    out.push(
      `${d.overCapLeaves.length} section${plural(d.overCapLeaves.length)} over the cap with no subheading to descend into:`,
    );
    for (const e of d.overCapLeaves) {
      out.push(`  H${e.depth} ${JSON.stringify(e.text)} — ${fmt(e.chars)} chars`);
    }
    out.push("These are not split mechanically: slicing prose at an arbitrary offset is");
    out.push("where a tool would start making semantic decisions (DP-001 tier 3).");
  }

  return out;
}

/** `DD-070` + 1 → `DD-070-01`. Mechanical, traceable and collision-free
 * without consulting a next-free-id that goes stale within a session;
 * `docdog renumber` (PROPOSAL-031) is the promotion path for a child that
 * later earns a first-class id. */
export function derivedChildId(parentId: string, ordinal: number): string {
  return `${parentId}-${String(ordinal).padStart(2, "0")}`;
}

// ─── parse ──────────────────────────────────────────────────────────────────

export interface PlanSection {
  /** 1-based ordinal into the source's heading outline. */
  heading: number;
  /** Echo of the heading text, verified against the outline at apply time. */
  at: string;
  /**
   * The child's id. Under `output: files` this may be the empty string,
   * meaning "no `id:` key in the child's frontmatter" — what a heading with
   * no id shape produces today. Under `output: records` it is required,
   * because `part_of` needs both ends.
   */
  id: string;
  title: string;
  description: string;
  /** Per-section override of the plan's `collection:`. */
  collection?: string;
  /** Per-section override of the mechanical `part_of` context. */
  context?: string;
}

export interface SplitPlan {
  version: number;
  source: string;
  output: SplitPlanOutput;
  /** Null under `output: files`, where nothing declares `part_of` the source. */
  parentId: string | null;
  collection: string;
  sections: PlanSection[];
}

const PLAN_KEYS = new Set([
  "version",
  "source",
  "output",
  "parent_id",
  "collection",
  "sections",
]);
const SECTION_KEYS = new Set([
  "heading",
  "at",
  "id",
  "title",
  "description",
  "collection",
  "context",
]);

/**
 * Read the edited plan back. Structural validation only — every problem is
 * collected and reported at once rather than one per run, and nothing has
 * touched disk by the time this throws.
 */
export function parsePlanDocument(text: string): SplitPlan {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    throw new SplitPlanError(
      `Plan file is not valid YAML: ${err instanceof Error ? err.message : String(err)}`,
      "MALFORMED_FILE",
    );
  }

  if (doc == null) {
    throw new SplitPlanError("Plan file is empty — nothing to apply.", "MALFORMED_FILE");
  }
  if (typeof doc !== "object" || Array.isArray(doc)) {
    throw new SplitPlanError(
      'Plan file must be a map with version / source / output / collection / sections keys — re-emit it with: docdog split <file> --format plan',
      "MALFORMED_FILE",
    );
  }

  const map = doc as Record<string, unknown>;
  if (map.version !== SPLIT_PLAN_VERSION) {
    throw new SplitPlanError(
      `Unsupported plan-file version ${JSON.stringify(map.version ?? null)} — this docdog reads version ${SPLIT_PLAN_VERSION}. Re-emit the plan with: docdog split <file> --format plan`,
      "UNKNOWN_VERSION",
    );
  }

  // `output:` is required rather than defaulted, and an unrecognized value is
  // a hard error for the same reason an unknown version is: the key decides
  // whether the source survives this run, so guessing it is the one mistake
  // that cannot be reviewed after the fact.
  const outputRaw = map.output;
  if (typeof outputRaw !== "string" || !SPLIT_PLAN_OUTPUTS.includes(outputRaw as SplitPlanOutput)) {
    throw new SplitPlanError(
      `Plan file's "output" is ${JSON.stringify(outputRaw ?? null)} — it must be one of ${SPLIT_PLAN_OUTPUTS.map(o => JSON.stringify(o)).join(" / ")}. It decides whether the source is retired, so it is never inferred. Re-emit the plan with: docdog split <file> --format plan`,
      "INVALID_PLAN",
    );
  }
  const output = outputRaw as SplitPlanOutput;
  const records = output === "records";

  const problems: string[] = [];
  for (const key of Object.keys(map)) {
    if (!PLAN_KEYS.has(key)) problems.push(`unknown top-level key "${key}"`);
  }

  const source = nonEmptyString(map.source);
  if (!source) problems.push('"source" is required — the path of the file being split');
  // Optional under `output: files`: a foreign document being ingested has no
  // id, files-mode children mint no part_of, and refusing here is what kept
  // the unified path from covering the ingest case at all (PROPOSAL-045 §2).
  // A leftover parent_id under `files` is accepted and unused — flipping
  // `output:` on an emitted plan is the documented override, and making the
  // reader also delete a key would turn that one-word edit into a trap.
  const parentId = nonEmptyString(map.parent_id);
  if (!parentId && records) {
    problems.push(
      '"parent_id" is required under output: records — every child declares part_of it',
    );
  }
  const collection = nonEmptyString(map.collection);
  if (!collection) problems.push('"collection" is required');

  const rows = map.sections ?? [];
  if (!Array.isArray(rows)) problems.push('"sections" must be a list of entries');

  const sections: PlanSection[] = [];
  if (Array.isArray(rows)) {
    rows.forEach((row, i) => {
      const where = `section ${i + 1}`;
      if (row == null || typeof row !== "object" || Array.isArray(row)) {
        problems.push(`${where}: not a map — expected heading / at / id / title / description`);
        return;
      }
      const r = row as Record<string, unknown>;
      for (const key of Object.keys(r)) {
        if (!SECTION_KEYS.has(key)) {
          problems.push(
            `${where}: unknown key "${key}" — an entry carries heading, at, id, title, description and optionally collection, context`,
          );
        }
      }

      const heading = r.heading;
      if (typeof heading !== "number" || !Number.isInteger(heading) || heading < 1) {
        problems.push(`${where}: "heading" must be the 1-based outline ordinal of a heading`);
      }
      const at = nonEmptyString(r.at);
      if (!at) problems.push(`${where}: "at" is required — the heading's text, as emitted`);

      // Relaxation 2 (PROPOSAL-045 §2), scoped to files mode: an empty id
      // means "no `id:` key in the child's frontmatter", which is what
      // `fm.id = id ?? undefined` produces today for a heading carrying none.
      const idTypeOk = r.id === undefined || r.id === null || typeof r.id === "string";
      if (!idTypeOk) problems.push(`${where}: "id" must be a string`);
      const id = nonEmptyString(r.id) ?? "";
      if (!id && records) problems.push(`${where}: "id" is required under output: records`);

      const title = nonEmptyString(r.title);
      if (!title) problems.push(`${where}: "title" is required`);

      const description = r.description == null ? "" : r.description;
      if (typeof description !== "string") problems.push(`${where}: "description" must be a string`);

      const sectionCollection = r.collection === undefined ? undefined : nonEmptyString(r.collection);
      if (r.collection !== undefined && !sectionCollection) {
        problems.push(`${where}: "collection" must be a non-empty string when given`);
      }
      const context = r.context === undefined ? undefined : r.context;
      if (context !== undefined && typeof context !== "string") {
        problems.push(`${where}: "context" must be a string`);
      }

      if (
        typeof heading === "number" &&
        Number.isInteger(heading) &&
        heading >= 1 &&
        at &&
        idTypeOk &&
        (!records || id) &&
        title &&
        typeof description === "string" &&
        (context === undefined || typeof context === "string")
      ) {
        sections.push({
          heading,
          at,
          id,
          title,
          description,
          collection: sectionCollection ?? undefined,
          context: context as string | undefined,
        });
      }
    });
  }

  if (problems.length > 0) {
    throw new SplitPlanError(
      `Plan file has ${problems.length} problem${plural(problems.length)} — nothing was applied:\n  ${problems.join("\n  ")}`,
      "INVALID_PLAN",
    );
  }

  return {
    version: SPLIT_PLAN_VERSION,
    source: source as string,
    output,
    parentId: parentId ?? null,
    collection: collection as string,
    sections,
  };
}

export interface ValidatePlanOptions {
  /** Apply entries whose description is empty (default: refuse). */
  allowEmptyDescription?: boolean;
}

/**
 * Check the plan against the outline the tool computes from the source *now*.
 *
 * This is OBS-014's validator lesson transposed from edges to boundaries: the
 * check lives outside the agent, because an agent that invents a boundary has
 * to be caught the same way one that invented an edge was. A `heading:` the
 * tool did not emit is a hard error; so is an `at:` that no longer matches the
 * heading at that ordinal, which is how an edited-then-stale plan surfaces
 * instead of silently writing the wrong span.
 */
export function validatePlan(
  plan: SplitPlan,
  outline: OutlineEntry[],
  parentFrontmatterId: string | null,
  opts: ValidatePlanOptions = {},
): void {
  const problems: string[] = [];
  const records = plan.output === "records";

  // Only records mode has a parent. Under `files` the source is retired to
  // `<base>.index.md` and deleted, nothing declares part_of it, and whether
  // it happened to carry an id is not this run's business.
  if (records) {
    if (plan.parentId === null) {
      problems.push('output: records requires parent_id — every child declares part_of it');
    } else if (parentFrontmatterId === null) {
      problems.push(
        `${posix(plan.source)} declares no id in its frontmatter — a child cannot declare part_of a record that has no id (DD-072)`,
      );
    } else if (parentFrontmatterId !== plan.parentId) {
      problems.push(
        `plan's parent_id is ${JSON.stringify(plan.parentId)} but ${posix(plan.source)} declares ${JSON.stringify(parentFrontmatterId)} — refusing rather than guessing which is meant`,
      );
    }
  }

  if (plan.sections.length === 0) {
    problems.push("plan has no sections — nothing to write");
  }

  const seenHeadings = new Set<number>();
  const seenIds = new Set<string>();
  let previous = 0;

  plan.sections.forEach((s, i) => {
    const where = `section ${i + 1}`;
    const entry = outline[s.heading - 1];
    if (!entry) {
      problems.push(
        `${where}: heading ${s.heading} is not in ${posix(plan.source)} — the outline has ${outline.length} heading${plural(outline.length)}`,
      );
    } else if (entry.text !== s.at) {
      problems.push(
        `${where}: heading ${s.heading} is ${JSON.stringify(entry.text)}, but the plan says ${JSON.stringify(s.at)} — the source changed since the plan was emitted, or the ordinal is wrong`,
      );
    }

    if (seenHeadings.has(s.heading)) {
      problems.push(`${where}: heading ${s.heading} is used twice`);
    }
    seenHeadings.add(s.heading);

    if (s.heading <= previous) {
      problems.push(
        `${where}: heading ${s.heading} comes after heading ${previous} in the plan but before it in the document — boundaries must be in source order`,
      );
    }
    previous = s.heading;

    // An empty id is legal under `files` and means "no id key", so several
    // sections may share it; only declared ids can collide.
    if (s.id !== "") {
      if (seenIds.has(s.id)) {
        problems.push(`${where}: id ${JSON.stringify(s.id)} is used by more than one section`);
      }
      seenIds.add(s.id);

      if (records && s.id === plan.parentId) {
        problems.push(`${where}: id ${JSON.stringify(s.id)} collides with the parent's own id`);
      }
    }

    // A description-free child is worse than a bare edge: fts5 indexes the
    // field, and the record has nothing to say for itself. PROPOSAL-028 made
    // this call after OBS-011's context backfill.
    //
    // Relaxation 1 (PROPOSAL-045 §2), scoped to records mode: a files-mode
    // child is the artifact pattern mode writes today, which carries no
    // description at all, and nothing declares part_of it.
    if (records && s.description.trim() === "" && !opts.allowEmptyDescription) {
      problems.push(
        `${where} (${s.id}): description is empty — write one, or pass --allow-empty-description`,
      );
    }
  });

  if (problems.length > 0) {
    throw new SplitPlanError(
      `Plan is not applicable — nothing was written:\n  ${problems.join("\n  ")}`,
      "INVALID_PLAN",
    );
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Quote anything that is not a plain identifier so the emitted document
 * always parses back — heading text routinely contains `:` and `#`. */
function scalar(value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) ? value : JSON.stringify(value);
}
