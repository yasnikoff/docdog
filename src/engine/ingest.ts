/**
 * Content operations engine: split multi-section files and add frontmatter.
 *
 * Two operations, exposed via the CLI as `docdog split` and `docdog add`:
 * - the plan round trip (`inspectFile` / `planForFile` / `applyPlan`): report a
 *   document's structure, emit a reviewable boundary list, execute it — into
 *   child *records* (`output: records`, DD-072) or into sibling *files* with a
 *   `.index.md` preserving the preamble (`output: files`, DD-053, DD-068).
 * - stampFiles: add/merge YAML frontmatter to existing individual files.
 *
 * Both produce files ready for `docdog index`.
 *
 * `splitFile` used to live here as a *second* executor: it took a rule
 * (`--on`, `--depth`) and applied it uniformly, producing files with no
 * review, no boundary-echo check, no all-or-nothing staging and no
 * unconditional coverage report. PROPOSAL-045 deleted that role. Its
 * section-writing body is the `files` branch of `applyPlan`, and the rules it
 * took are now pre-population selectors for `--format plan`.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, basename, dirname, extname } from "node:path";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import { parseSplitPattern, matchesAnyPattern } from "./split-pattern.js";
import {
  buildOutline,
  computeDescent,
  parsePlanDocument,
  renderPlanDocument,
  validatePlan,
  SplitPlanError,
  type DescentReport,
  type OutlineEntry,
  type PlanSelection,
  type SplitPlan,
  type SplitPlanOutput,
} from "./split-plan.js";
import { parse as parseMarkdown } from "../markdown/index.js";
import { MAX_EMBED_CHARS } from "../storage/embed-health.js";

// ─── Selectors (PROPOSAL-045 §1) ────────────────────────────────────────────

/**
 * A rule that *nominates* boundaries.
 *
 * `--on "## DD-"` and `--depth 3` used to execute: they asserted, uniformly
 * and unreviewably, that every matching heading begins a separate idea — the
 * same claim PROPOSAL-039 forbade descent from making. They now choose which
 * outline entries arrive pre-populated in the plan's `sections:`, which is
 * what a rule was always good for.
 *
 * `on` is a *list*: the predicate has been `matchesAnyPattern` over an array
 * since PROPOSAL-034 and config's `split_on` has accepted a list all along;
 * only the CLI passed a one-element array, so two `--on` flags silently took
 * the last one.
 */
export interface SplitSelector {
  on?: string[];
  depth?: number;
}

/** Human-readable form of whichever selector the caller gave. */
export function describeSelector(on: string[] | undefined, depth: number | undefined): string {
  if (on !== undefined && on.length > 0) {
    return on.map(p => `"${p}"`).join(" / ");
  }
  return `every H${depth} heading`;
}

/**
 * Apply a selector to the outline. Returns null when no selector was given,
 * which is how the renderer knows to fall back to descent's suggested depth.
 *
 * Matching is structural — depth from the `#` count, prefix against the
 * heading's *text* — via the same `split-pattern.ts` predicate the
 * indexer-time parser uses. That is FRICTION-039's repair, kept: a `## X`
 * inside a fenced code block is not a heading and a setext heading is, because
 * the outline is built from the AST rather than from a line scan.
 */
export function selectBoundaries(
  outline: OutlineEntry[],
  selector: SplitSelector,
): PlanSelection | null {
  const { on, depth } = selector;

  if (on !== undefined && on.length > 0) {
    const patterns = on.map(parseSplitPattern);
    return {
      describe: describeSelector(on, undefined),
      entries: outline.filter(e => matchesAnyPattern(e, patterns)),
    };
  }
  if (depth !== undefined) {
    return {
      describe: describeSelector(undefined, depth),
      entries: outline.filter(e => e.depth === depth),
    };
  }
  return null;
}

// ─── Plan (PROPOSAL-039, unified by PROPOSAL-045) ───────────────────────────

export interface InspectResult {
  outline: OutlineEntry[];
  descent: DescentReport;
  /** The parent's declared id, or null if its frontmatter carries none. */
  parentId: string | null;
  /** The parent's declared collection, or null. */
  collection: string | null;
}

/**
 * Read a file and report its structure: the heading outline, the sizes, and
 * descent's verdict. Writes nothing. This is what `docdog split <file>` with
 * no selector does, and what `--format plan` is built on.
 */
export function inspectFile(file: string): InspectResult {
  const raw = readFileSync(file, "utf-8");
  const doc = parseMarkdown(raw);
  const outline = buildOutline(doc);
  return {
    outline,
    descent: computeDescent(outline, raw.length),
    parentId: typeof doc.frontmatter.id === "string" ? doc.frontmatter.id : null,
    collection:
      typeof doc.frontmatter.collection === "string" ? doc.frontmatter.collection : null,
  };
}

export interface PlanForFileOptions extends SplitSelector {
  /** Overrides the source's declared collection. */
  collection?: string;
  /**
   * Override the output shape. Default: `records` when the source declares an
   * `id:`, `files` when it does not — a visible default printed in the plan
   * header, never an inference the reader has to reconstruct (DP-001 tier 2).
   */
  output?: SplitPlanOutput;
}

/**
 * Emit the plan document for a file. `collection` overrides whatever the
 * source's frontmatter declares; one of the two must resolve, because every
 * child needs a collection and inferring one would be a guess.
 *
 * The `NO_PARENT_ID` refusal that used to stand at the top is now scoped to
 * `output: records`. It was the one line blocking the unified path: a foreign
 * document being ingested declares no id, so plan mode could not run on the
 * ingest case at all — which is why "just use the plan file" was not an answer
 * to anything before PROPOSAL-045.
 */
export function planForFile(
  file: string,
  projectRoot: string,
  opts: PlanForFileOptions = {},
): string {
  const { outline, descent, parentId, collection: declared } = inspectFile(file);
  const output = opts.output ?? (parentId === null ? "files" : "records");

  if (output === "records" && parentId === null) {
    throw new SplitPlanError(
      `${relativePath(projectRoot, file)} declares no id in its frontmatter. A split child declares part_of its parent (DD-072), so the parent needs an id before it can have children. Emit an "output: files" plan instead to split it into sibling files.`,
      "NO_PARENT_ID",
    );
  }
  const resolved = opts.collection ?? declared;
  if (!resolved) {
    throw new SplitPlanError(
      `${relativePath(projectRoot, file)} declares no collection — pass --collection <name>.`,
      "INVALID_PLAN",
    );
  }

  const selection = selectBoundaries(outline, opts);

  // Zero matches for a selector the caller *asked for* is a failed request,
  // not a fact about the document: something is wrong with the pattern, and a
  // script or agent wrapping this must not see success. Zero matches with no
  // selector — descent found no depth that fits — stays an empty `sections:`
  // with the explanation in comments, because that is a fact.
  if (selection !== null && selection.entries.length === 0) {
    throw new SplitPlanError(
      `No headings in ${relativePath(projectRoot, file)} match ${selection.describe}. Nothing was written. Run 'docdog split ${relativePath(projectRoot, file)}' with no selector to see the outline.`,
      "NO_MATCHES",
    );
  }

  return renderPlanDocument({
    source: relativePath(projectRoot, file),
    parentId: output === "records" ? parentId : null,
    output,
    collection: resolved,
    outline,
    descent,
    selection: selection ?? undefined,
  });
}

export interface ApplyPlanOptions {
  /** Path to the edited plan file. */
  planFile: string;
  projectRoot: string;
  /** Directory for the child files (default: `<dirname>/<basename>/`). */
  outputDir?: string;
  force?: boolean;
  dryRun?: boolean;
  allowEmptyDescription?: boolean;
  /**
   * Edit `scan_paths` so the children are reached. Opt-in, and which function
   * runs depends on the plan's `output:` — **additive only** under `records`
   * (`addScanPath`), source-entry-removing under `files`
   * (`updateConfigAfterSplit`). Detection is unconditional on both.
   */
  updateConfig?: boolean;
}

/**
 * Whether the children this run wrote will actually be indexed.
 *
 * Detection is mechanical and always runs, because the failure it catches is
 * silent: apply succeeds, `docdog index` says nothing, and the children simply
 * are not in the corpus while the parent's roster points at them.
 */
export interface ScanCoverage {
  /** Repo-relative output directory. */
  path: string;
  /** The `scan_paths` entry that already covers it, or null if none does. */
  coveredBy: string | null;
  /** True when this run added the entry (only ever under `updateConfig`). */
  added: boolean;
  /**
   * Entries this run removed because they named the retired source. Only ever
   * non-zero under `output: files` + `updateConfig`: there the source stops
   * being a record, so its own entry must go. Under `records` the parent stays
   * live at the same path and removing it would un-index a record every child
   * just declared `part_of` (DISC-035).
   */
  removed: number;
  /** Repo-relative config path, or null when the project has no config file. */
  configPath: string | null;
}

export interface ApplyPlanResult {
  /** What the plan declared it produces. */
  output: SplitPlanOutput;
  /** Null under `output: files` — nothing declares `part_of` a retired source. */
  parentId: string | null;
  /** Repo-relative path of the source, whatever became of it. */
  parentFile: string;
  /** `<base>.index.md`, under `output: files` only. */
  indexFile: string | null;
  outputDir: string;
  children: Array<{ id: string; title: string; filename: string; path: string; chars: number }>;
  /** Children still over the embed cap — reported, never cut (PROPOSAL-038 §3). */
  overCap: Array<{ id: string; chars: number }>;
  /** Whether `scan_paths` reaches the children, and whether this run fixed it. */
  coverage: ScanCoverage;
  dryRun: boolean;
}

/**
 * Execute a reviewed plan — the **one** executor `docdog split` has
 * (PROPOSAL-045).
 *
 * It branches on `plan.output` for exactly three things: the child frontmatter
 * shape, what happens to the source, and which coverage function runs.
 * Everything else is shared and stays shared — parse, validate, the partition
 * walk, in-memory staging, collision detection, the over-cap report, and
 * coverage *detection*, which is unconditional in both modes because the
 * failure it catches is silent in both.
 *
 *   output: records  one child record per boundary, each declaring `part_of`
 *                    the parent (DD-072); the parent is rewritten down to its
 *                    framing prose plus a roster of its parts.
 *   output: files    one sibling file per boundary, ids and titles parsed from
 *                    the heading text, no edges; the source is retired to
 *                    `<base>.index.md` and deleted.
 *
 * The boundaries **partition** the document in both modes. Everything from one
 * boundary to the next belongs to that child, which is what makes deleting an
 * entry mean "merge this section into the one above" — the operation the
 * reviewer performs most. Nothing is dropped: preamble plus every child body
 * reconstructs the source.
 *
 * Every write is computed in memory before any file is opened. PROPOSAL-028
 * established that and `applyPlan` adopted it; pattern mode never did, so a
 * files split that hit an existing name halfway left a half-written directory
 * and a source that may or may not still exist. That is now impossible on
 * either mode, which is the concrete thing the unification bought.
 */
export function applyPlan(options: ApplyPlanOptions): ApplyPlanResult {
  const { planFile, projectRoot, outputDir: outputOverride, force = false, dryRun = false } = options;

  let planText: string;
  try {
    planText = readFileSync(planFile, "utf-8");
  } catch (err) {
    throw new SplitPlanError(
      `Cannot read plan file ${planFile}: ${err instanceof Error ? err.message : String(err)}`,
      "UNREADABLE",
    );
  }

  const plan: SplitPlan = parsePlanDocument(planText);
  const sourcePath = join(projectRoot, plan.source);

  let raw: string;
  try {
    raw = readFileSync(sourcePath, "utf-8");
  } catch (err) {
    throw new SplitPlanError(
      `Plan names source ${plan.source}, which cannot be read: ${err instanceof Error ? err.message : String(err)}`,
      "UNREADABLE",
    );
  }

  const doc = parseMarkdown(raw);
  const outline = buildOutline(doc);
  const declaredId = typeof doc.frontmatter.id === "string" ? doc.frontmatter.id : null;

  validatePlan(plan, outline, declaredId, {
    allowEmptyDescription: options.allowEmptyDescription,
  });

  const records = plan.output === "records";
  const parentDir = dirname(sourcePath);
  const baseName = basename(sourcePath, extname(sourcePath));
  const outputDir = outputOverride ?? join(parentDir, baseName);
  const outputRel = relativePath(projectRoot, outputDir);
  const indexFilePath = join(parentDir, `${baseName}.index.md`);

  // ── compute every write, open nothing ──
  const planned: Array<{
    id: string;
    title: string;
    filename: string;
    path: string;
    content: string;
    chars: number;
  }> = [];

  const collisions: string[] = [];

  plan.sections.forEach((section, i) => {
    const entry = outline[section.heading - 1];
    const next = plan.sections[i + 1];
    const end = next ? outline[next.heading - 1].startOffset : raw.length;
    const body = raw.slice(entry.headingEnd, end).replace(/^\r?\n+/, "").trimEnd();

    // The one place the two modes disagree about a child: records carry a
    // description and a `part_of` edge; files carry whatever `**Status:**` /
    // `**Date:**` lines the body was hiding, and no edges at all.
    const child = records
      ? {
          fm: {
            id: section.id,
            title: section.title,
            collection: section.collection ?? plan.collection,
            description: section.description,
            relationships: [
              {
                part_of: plan.parentId,
                context:
                  section.context ??
                  `the "${entry.text}" section of ${basename(sourcePath)}, split out by docdog split`,
              },
            ],
          } as Record<string, unknown>,
          body,
        }
      : filesModeChild(section, body, plan.collection);

    const childId = section.id === "" ? null : section.id;
    const content = buildSectionFile(child.fm, section.title, child.body);
    const filename = generateFilename(childId, section.title) + ".md";
    const path = join(outputDir, filename);

    if (planned.some(p => p.filename === filename)) {
      collisions.push(
        `${section.id || section.title}: two sections both write ${filename}`,
      );
    }
    if (existsSync(path) && !force) {
      collisions.push(`${filename} already exists (use --force to overwrite)`);
    }

    planned.push({ id: section.id, title: section.title, filename, path, content, chars: content.length });
  });

  if (collisions.length > 0) {
    throw new SplitPlanError(
      `Plan would overwrite or collide — nothing was written:\n  ${collisions.join("\n  ")}`,
      "INVALID_PLAN",
    );
  }

  // What becomes of the source. Records: rewritten in place, down to its
  // framing prose plus a roster. Files: retired to `<base>.index.md` and
  // deleted, because it stops being a record at all.
  const firstBoundary = outline[plan.sections[0].heading - 1];
  const preamble = raw.slice(0, firstBoundary.startOffset);
  const sourceContent = records
    ? buildParentFile(
        preamble,
        outputRel,
        planned.map(p => ({ id: p.id, title: p.title, filename: p.filename })),
      )
    : buildIndexFile(preamble.trimEnd(), baseName);

  const configPath = join(projectRoot, ".docdog", "config.yaml");
  const hasConfig = existsSync(configPath);
  const coverage: ScanCoverage = {
    path: outputRel,
    coveredBy: hasConfig ? findScanPathCoverage(configPath, outputRel) : null,
    added: false,
    removed: 0,
    configPath: hasConfig ? relativePath(projectRoot, configPath) : null,
  };

  // ── nothing above this line touches disk ──
  if (!dryRun) {
    mkdirSync(outputDir, { recursive: true });
    for (const p of planned) writeFileSync(p.path, p.content, "utf-8");

    if (records) {
      writeFileSync(sourcePath, sourceContent, "utf-8");
    } else {
      writeFileSync(indexFilePath, sourceContent, "utf-8");
      if (sourcePath !== indexFilePath) {
        try {
          unlinkSync(sourcePath);
        } catch {
          // Source might already be gone.
        }
      }
    }

    if (options.updateConfig && hasConfig) {
      if (records) {
        // Additive only: the parent stays a live record at the same path.
        if (coverage.coveredBy === null) coverage.added = addScanPath(configPath, outputRel);
      } else {
        // The source stopped being a record, so its own entry must go with it.
        const update = updateConfigAfterSplit(configPath, sourcePath, outputDir, projectRoot);
        coverage.added = update.added;
        coverage.removed = update.removed;
      }
    }
  }

  return {
    output: plan.output,
    parentId: records ? plan.parentId : null,
    parentFile: relativePath(projectRoot, sourcePath),
    indexFile: records ? null : indexFilePath,
    outputDir,
    children: planned.map(({ id, title, filename, path, chars }) => ({
      id,
      title,
      filename,
      path,
      chars,
    })),
    overCap: planned
      .filter(p => p.chars > MAX_EMBED_CHARS)
      .map(p => ({ id: p.id, chars: p.chars })),
    coverage,
    dryRun,
  };
}

/**
 * The child `output: files` writes — the shape pattern mode has produced since
 * DD-053, moved here verbatim rather than reinvented.
 *
 * `**Status:**` / `**Date:**` lines are lifted out of the body into
 * frontmatter, which is why the frontmatter and the body are computed
 * together. An empty `id:` means no `id:` key, which is what a heading with no
 * id shape has always produced. A `description:` appears only if the reviewer
 * wrote one — pattern mode never had a place to put one, and requiring one
 * here would refuse the artifact this mode exists to reproduce.
 */
function filesModeChild(
  section: { id: string; title: string; description: string; collection?: string },
  body: string,
  planCollection: string,
): { fm: Record<string, unknown>; body: string } {
  const { body: cleanBody, metadata } = extractMetadata(body.trim());
  const fm: Record<string, unknown> = {
    id: section.id === "" ? undefined : section.id,
    title: section.title,
    collection: section.collection ?? planCollection,
  };
  if (metadata.status) fm.status = metadata.status;
  if (metadata.date) fm.date = metadata.date;
  if (section.description.trim() !== "") fm.description = section.description;
  return { fm, body: cleanBody };
}

/**
 * The `scan_paths` entry that reaches `repoRelDir`, or null.
 *
 * Only a *directory* entry can cover a subdirectory, and that falls out of the
 * normalization rather than needing a check: `normalizeForCoverage` gives every
 * entry a trailing slash, so a file entry becomes `CONTRIBUTING.md/`, which no
 * directory path can start with. Directory scanning itself recurses
 * (`collectMarkdownFiles`), so a prefix match is the whole test.
 */
export function findScanPathCoverage(configPath: string, repoRelDir: string): string | null {
  if (!existsSync(configPath)) return null;

  const doc = (yamlParse(readFileSync(configPath, "utf-8")) as Record<string, unknown>) ?? {};
  const entries = (doc.scan_paths ?? []) as Array<string | Record<string, unknown>>;
  const target = normalizeForCoverage(repoRelDir);

  for (const entry of entries) {
    const path = typeof entry === "string" ? entry : ((entry.path as string) ?? "");
    if (path && target.startsWith(normalizeForCoverage(path))) return path;
  }
  return null;
}

/**
 * Add a directory to `scan_paths`. **Additive only, and deliberately so.**
 *
 * `updateConfigAfterSplit` removes the entry matching the source, which is
 * right under `output: files` — the source becomes `.index.md` and stops being
 * a record. Under `output: records` the parent stays a live record at the same
 * path, so removing its coverage would un-index it and dangle every inbound
 * `part_of` the same run just wrote. That is DISC-035's un-index hazard, and
 * the two modes need different functions rather than a shared one with a flag:
 * a flag is a place for a caller to pass the wrong value, and the wrong value
 * here silently deletes a live record from the corpus.
 *
 * Returns false when something already covers the path.
 */
export function addScanPath(configPath: string, repoRelDir: string): boolean {
  if (findScanPathCoverage(configPath, repoRelDir) !== null) return false;

  const doc = (yamlParse(readFileSync(configPath, "utf-8")) as Record<string, unknown>) ?? {};
  const entries = (doc.scan_paths ?? []) as Array<string | Record<string, unknown>>;
  entries.push(normalizeForCoverage(repoRelDir));
  doc.scan_paths = entries;
  writeFileSync(configPath, yamlStringify(doc), "utf-8");
  return true;
}

/**
 * The parent keeps its frontmatter and its framing prose, and gains a list of
 * its parts. The list is prose, not edges: the children declare `part_of` and
 * the parent declares nothing (DD-072), and a same-typed reciprocal is not a
 * second relationship.
 *
 * DISC-035's hazard (d) is that a parent reduced to a pure table of contents
 * is about everything its children are about and contains none of it, which
 * makes it a natural distractor. The tool cannot fix that — writing framing
 * prose is the author's job, and the composition skill says so.
 */
function buildParentFile(
  head: string,
  outputRel: string,
  children: Array<{ id: string; title: string; filename: string }>,
): string {
  const trimmed = head.trimEnd();
  const lines = [
    "",
    "",
    "## Sections",
    "",
    ...children.map(c => `- [${c.title}](${outputRel}/${c.filename}) — \`${c.id}\``),
    "",
  ];
  return trimmed + lines.join("\n");
}

/**
 * Update scan_paths in .docdog/config.yaml after an `output: files` split.
 * Removes any entry whose path matches the source file — including the
 * `parser: split` entry an adopting project may have pointed at it — and adds
 * the new output directory if not already covered. The removal is what makes
 * this the wrong function for `output: records`; see `addScanPath`.
 */
export function updateConfigAfterSplit(
  configPath: string,
  sourceFile: string,
  outputDir: string,
  projectRoot: string,
): { removed: number; added: boolean } {
  if (!existsSync(configPath)) return { removed: 0, added: false };

  const raw = readFileSync(configPath, "utf-8");
  const doc = (yamlParse(raw) as Record<string, unknown>) ?? {};
  const entries = (doc.scan_paths ?? []) as Array<string | Record<string, unknown>>;

  const repoRelSource = relativePath(projectRoot, sourceFile);
  const repoRelOutput = relativePath(projectRoot, outputDir);

  // Remove entries that match the source file (either plain string or object with path)
  let removed = 0;
  const keptEntries = entries.filter((entry) => {
    const path = typeof entry === "string" ? entry : ((entry.path as string) ?? "");
    if (pathMatches(path, repoRelSource)) {
      removed++;
      return false;
    }
    return true;
  });

  // Check if the output dir is already covered by any remaining entry
  const normalizedOutput = normalizeForCoverage(repoRelOutput);
  const covered = keptEntries.some((entry) => {
    const path = typeof entry === "string" ? entry : ((entry.path as string) ?? "");
    const normalized = normalizeForCoverage(path);
    return normalizedOutput.startsWith(normalized);
  });

  let added = false;
  if (!covered) {
    keptEntries.push(repoRelOutput + "/");
    added = true;
  }

  if (removed > 0 || added) {
    doc.scan_paths = keptEntries;
    writeFileSync(configPath, yamlStringify(doc), "utf-8");
  }

  return { removed, added };
}

// ─── Stamp ──────────────────────────────────────────────────────────────────

export interface StampOptions {
  /** Source file or directory. */
  source: string;
  /** Target collection name. */
  collection: string;
  /**
   * Explicit semantic id to stamp onto the file's frontmatter. Only valid
   * when stamping a single file — refused for multi-file runs since one
   * id can't apply to many records. Per DP-001, docdog never infers ids
   * from filenames; this is the only way `docdog add` sets `id:` for you.
   */
  id?: string;
  /** Output directory. If omitted, writes in-place (modifies source files). */
  output?: string;
  /** Overwrite existing output files. */
  force?: boolean;
  /** Show what would be done without writing. */
  dryRun?: boolean;
}

export interface StampResult {
  stamped: Array<{ filename: string; path: string; title: string }>;
  skipped: number;
}

/**
 * Add or merge YAML frontmatter onto existing markdown files.
 *
 * If the file already has frontmatter, merges (adds collection if missing,
 * doesn't overwrite existing fields). If no frontmatter, creates one with
 * title extracted from first heading, collection, and any extractable metadata.
 */
export function stampFiles(options: StampOptions): StampResult {
  const { source, collection, id: explicitId, output, force = false, dryRun = false } = options;

  // Collect files to process
  const files: string[] = [];
  const stat = statSync(source);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(source)) {
      const full = join(source, entry);
      if (entry.endsWith(".md") && statSync(full).isFile()) {
        files.push(full);
      }
    }
  } else if (stat.isFile() && source.endsWith(".md")) {
    files.push(source);
  }

  // FRICTION-005: one id can't apply to many files. Refuse early.
  if (explicitId && files.length > 1) {
    throw new Error(
      `--id cannot be used with multiple files (${files.length} found under ${source}). ` +
        `Stamp each file individually, or omit --id and edit frontmatter after.`,
    );
  }

  if (output && !dryRun) {
    mkdirSync(output, { recursive: true });
  }

  const result: StampResult = { stamped: [], skipped: 0 };

  for (const filePath of files) {
    const raw = readFileSync(filePath, "utf-8");
    const { frontmatter: existingFm, body: rawBody } = splitFrontmatter(raw);

    // Extract title from first heading if not in frontmatter
    const title = existingFm.title
      ? String(existingFm.title)
      : extractFirstHeading(rawBody) ?? basename(filePath, extname(filePath));

    // Extract metadata from body
    const { body: cleanBody, metadata } = extractMetadata(rawBody);

    // Build merged frontmatter
    const fm: Record<string, unknown> = { ...existingFm };
    if (!fm.title) fm.title = title;
    if (!fm.collection) fm.collection = collection;
    if (!fm.status && metadata.status) fm.status = metadata.status;
    if (!fm.date && metadata.date) fm.date = metadata.date;
    // FRICTION-005 / DP-001: docdog does NOT infer ids from filenames —
    // that's a Tier-3 judgment call (previous inference produced
    // collisions on date-prefixed names like "2026-04-10-*" → "2026").
    // The only way `docdog add` stamps an id is via the explicit
    // `--id <value>` flag. Agents / users pick the id; docdog stamps.
    if (!fm.id && explicitId) {
      fm.id = explicitId;
    }

    // Reorder frontmatter keys for readability
    const ordered: Record<string, unknown> = {};
    for (const key of ["id", "title", "collection", "status", "date", "description"]) {
      if (fm[key] !== undefined) ordered[key] = fm[key];
    }
    for (const [k, v] of Object.entries(fm)) {
      if (!(k in ordered)) ordered[k] = v;
    }

    const content = `---\n${yamlStringify(ordered).trim()}\n---\n\n${cleanBody}\n`;

    const outPath = output ? join(output, basename(filePath)) : filePath;
    if (existsSync(outPath) && output && !force) {
      result.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry-run] Would write: ${outPath}`);
    } else {
      if (output) mkdirSync(output, { recursive: true });
      writeFileSync(outPath, content, "utf-8");
    }

    result.stamped.push({ filename: basename(outPath), path: outPath, title });
  }

  return result;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

// parseHeading lives in src/engine/parse-heading.ts — shared with the
// indexer-time split parser (src/engine/parsers/split.ts).

interface ExtractedMetadata {
  status?: string;
  date?: string;
}

/**
 * Extract known metadata patterns from body text and return cleaned body.
 * Currently extracts: **Status:** and **Date:** lines.
 */
function extractMetadata(body: string): { body: string; metadata: ExtractedMetadata } {
  const metadata: ExtractedMetadata = {};
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
      metadata.date = dateMatch[1].trim().replace(/,.*$/, "").trim(); // Take first date if "2026-03-24, updated 2026-03-27"
      continue;
    }

    kept.push(line);
  }

  // Collapse leading blank lines left by extraction
  const cleaned = kept.join("\n").replace(/^\n+/, "").trimEnd();
  return { body: cleaned, metadata };
}

function splitFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: raw };

  const yamlBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trimStart();

  let frontmatter: Record<string, unknown> = {};
  try {
    frontmatter = (yamlParse(yamlBlock) as Record<string, unknown>) ?? {};
  } catch {
    // Malformed — proceed without it
  }

  return { frontmatter, body };
}

function extractFirstHeading(body: string): string | null {
  const match = body.match(/^#+\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function generateFilename(id: string | null, title: string): string {
  const titleSlug = slugify(title);
  if (id) {
    const idSlug = id
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!titleSlug) return idSlug;
    // Avoid duplication if the title slug already starts with the id slug —
    // e.g. a heading like "DD-ARCH-01 DD-ARCH-01" would otherwise produce
    // "dd-arch-01-dd-arch-01-..." which is noisy.
    if (titleSlug === idSlug || titleSlug.startsWith(`${idSlug}-`)) {
      return titleSlug.slice(0, 80);
    }
    return `${idSlug}-${titleSlug}`.slice(0, 80);
  }
  return titleSlug || "section";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function buildSectionFile(fm: Record<string, unknown>, title: string, body: string): string {
  // Reorder frontmatter for readability
  const ordered: Record<string, unknown> = {};
  for (const key of ["id", "title", "collection", "status", "date", "description"]) {
    if (fm[key] !== undefined) ordered[key] = fm[key];
  }
  for (const [k, v] of Object.entries(fm)) {
    if (!(k in ordered)) ordered[k] = v;
  }

  const fmStr = yamlStringify(ordered).trim();
  return `---\n${fmStr}\n---\n\n# ${title}\n\n${body}\n`;
}

function buildIndexFile(preamble: string, baseName: string): string {
  const trimmed = preamble.trimEnd();
  const footer = `\n\n<!-- Sections split into ./${baseName}/ by docdog split -->\n`;
  if (!trimmed) {
    return `<!-- Split from ${baseName}.md; sections in ./${baseName}/ -->\n`;
  }
  return trimmed + footer;
}

function relativePath(from: string, to: string): string {
  // Simple relative path (forward slashes) — avoids pulling in node:path for this
  // one helper and keeps behavior predictable on Windows.
  const fromNorm = from.replace(/\\/g, "/").replace(/\/$/, "");
  const toNorm = to.replace(/\\/g, "/");
  if (toNorm.startsWith(fromNorm + "/")) {
    return toNorm.slice(fromNorm.length + 1);
  }
  return toNorm;
}

function pathMatches(a: string, b: string): boolean {
  return normalizeForCoverage(a).replace(/\/$/, "") === normalizeForCoverage(b).replace(/\/$/, "");
}

function normalizeForCoverage(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/?$/, "/");
}
