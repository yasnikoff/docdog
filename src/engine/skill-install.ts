/**
 * Injectable skills — discovery + rendering library.
 *
 * Invoked by `docdog skill install <name>`. Each registered skill
 * declares its template path, its allowed placeholder set, and a
 * discovery function that produces its substitutions from the live
 * corpus (or from nothing, for generic skills).
 *
 * `specs` used to emit a companion flat index too - a committed
 * `id | collection | path | summary` line per vertex, 159 KB on the corpus
 * that surfaced it. It is gone (FRICTION-043). It was a snapshot with no
 * invalidation path: regenerated only by re-running this command, stale on
 * the next spec write, and structurally undetectable by `docdog update`,
 * whose authority is the shipped template while that file authority was
 * the corpus. Its two jobs are done better by things that cannot go stale -
 * `rg` over the live scan paths, and `docdog list` for the exhaustive form
 * (FRICTION-036). Deleting the emitter was smaller than maintaining an
 * invalidation path for a file with no readers.
 *
 * Every operation here is tier-1 literal mechanics per DP-001. No
 * inference. Only tier-2 default is the outer-skill clobber safety
 * rail. Per-skill placeholder allowlists are enforced defensively:
 * a template that references a placeholder not in the skill's
 * allowlist, or a discovery function that produces substitutions
 * outside the allowlist, is a hard error.
 *
 * PROPOSAL-019 introduced the mechanism with a single `specs` skill.
 * PROPOSAL-020 added `navigate-specs` and factored `specs` to delegate to
 * it; PROPOSAL-044 merged the two back and made the whole population part of
 * the seed set, so `init` writes them and `docdog update` maintains them.
 * `renderInjectableSkill` is the seam that made that possible: one renderer,
 * three callers, and no timestamp in the output.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocdogConfig } from "../types/config.js";
import { getVertexCollections } from "../config/collections.js";
import { openCacheRead } from "../storage/cache.js";

export interface PrefixDiscovery {
  prefix: string;
  collection: string;
  count: number;
}

export interface SkillDiscoveryResult {
  /** Literal placeholder → value substitutions for template render. */
  substitutions: Record<string, string>;
  /** Discovered id prefixes (informational; surfaced to the CLI summary). */
  prefixes: PrefixDiscovery[];
  /**
   * False when this skill needed the corpus and the cache could not be read
   * — no `docdog index` has run, or the cache is unusable.
   *
   * Reported rather than resolved, because the two callers want opposite
   * things from it (PROPOSAL-044). At `init` there is no cache *yet* and
   * writing the skill with an empty roster is right. At `update` there is a
   * good file already on disk, and overwriting it with an empty roster
   * would destroy it in the name of updating it — so `update` skips and
   * says why. Always true for a skill that reads no corpus.
   */
  corpusAvailable: boolean;
}

export interface SkillProfile {
  /** Path to the outer-skill template, relative to the docdog repo root. */
  templateRel: string;
  /**
   * Directory name the skill is installed under, and therefore the name
   * agents invoke it by — a skill is `<name>/SKILL.md` and the directory
   * name *is* the name (FRICTION-040). Two consequences are load-bearing:
   *
   *   1. It carries the `docdog-` prefix, because the directory name is the
   *      only disambiguation a project-level skill has. `specs` is close to
   *      the worst available name for something installed into other
   *      people's repositories, and personal skills override project ones,
   *      so an unprefixed collision shadows silently.
   *   2. It is not the registry key. `docdog skill install specs` keeps
   *      naming the skill by what it is; the prefix is a packaging fact.
   */
  installName: string;
  /**
   * Exact set of placeholder names this skill may use. A template
   * that references a `{{name}}` outside this set is a hard error;
   * a discovery function that returns a key outside this set is a
   * hard error. Ordered for stable error messages.
   */
  allowedPlaceholders: readonly string[];
  /**
   * Produce substitutions for this skill.
   * Always runs even on `--dry-run` so the discovery counts can be
   * reported. Must not write to disk. Corpus-backed skills read the
   * cache under `projectRoot`, and report `corpusAvailable: false`
   * rather than throwing when no `docdog index` has run.
   *
   * Synchronous on purpose (PROPOSAL-044): `collectSeeds` is a sync
   * function called from a sync planner, and none of this work was ever
   * actually asynchronous — better-sqlite3 reads and string formatting.
   */
  discover: (
    config: DocdogConfig,
    templateRoot: string,
    projectRoot: string,
  ) => SkillDiscoveryResult;
}

/**
 * Registry of injectable skills. Adding a new skill is a one-entry
 * change here + a new template file under `templates/injectable-skills/`.
 */
export const REGISTERED_INJECTABLE_SKILLS: Record<string, SkillProfile> = {
  /**
   * The reporter side of the feedback channel (PROPOSAL-043). Ships as a
   * skill and not as a command because every step of it is judgment —
   * whether a thing is worth reporting, whether someone else's issue is the
   * same one, what to redact — which is DP-001 tier 3 end to end.
   *
   * Kept separate from `specs` when those two merged (PROPOSAL-044),
   * because a skill's `description` is its trigger: this one has to fire
   * when docdog itself misbehaves, which is a different moment from
   * navigating a corpus and the one nobody goes looking for.
   */
  feedback: {
    templateRel: "templates/injectable-skills/feedback.md",
    installName: "docdog-feedback",
    allowedPlaceholders: ["docdog_version"],
    discover: discoverGeneric,
  },
  /**
   * The corpus manual — per-repo id prefixes and scan paths, plus docdog's
   * generic conventions. Those were two skills until PROPOSAL-044 merged
   * them along the seam the code already showed: `navigate_specs_path`
   * existed only so one could point at the other.
   *
   * PROPOSAL-020 split them so a convention change need only regenerate the
   * generic half. That premise was that regeneration is a manual per-repo
   * act worth minimizing; `docdog update` re-renders both in one run, so
   * the split had stopped buying anything.
   */
  specs: {
    templateRel: "templates/injectable-skills/specs.md",
    installName: "docdog-specs",
    allowedPlaceholders: ["id_prefixes", "file_conventions", "docdog_version"],
    discover: discoverSpecs,
  },
};

/**
 * Where a registered skill lands, relative to the repo root — the default
 * `--target` joined with the install name. This is the seed-set path and
 * the manifest key (PROPOSAL-044), so it lives beside the registry rather
 * than being spelled out at each call site.
 */
export function injectableSkillRelPath(name: string): string {
  const profile = REGISTERED_INJECTABLE_SKILLS[name];
  if (!profile) throw new Error(`Unknown injectable skill "${name}".`);
  return `${DEFAULT_SKILL_TARGET}/${profile.installName}/SKILL.md`;
}

/** Default `--target` for `skill install`, and the only path init/update use. */
export const DEFAULT_SKILL_TARGET = ".claude/skills";

export interface SkillInstallOptions {
  config: DocdogConfig;
  name: string;
  /** Target directory, **must be relative** to CWD (or the passed baseDir). */
  targetDir: string;
  force: boolean;
  dryRun: boolean;
  /** Base directory the relative target resolves against. Defaults to `process.cwd()`. */
  baseDir?: string;
  /**
   * Optional override for the docdog repo root (source of the template
   * file). Defaults to the ancestor of this module that contains
   * `templates/injectable-skills/`. Tests override this.
   */
  templateRoot?: string;
}

export interface SkillInstallResult {
  /** Registry name — what `docdog skill install <name>` was called with. */
  name: string;
  /** Directory name it was installed under, i.e. what an agent invokes. */
  installName: string;
  /** The skill's own directory: `<target>/<installName>/`. */
  skillDir: string;
  outerPath: string;
  outerWritten: boolean;
  outerSkipped: boolean;
  prefixes: PrefixDiscovery[];
  /** False when the skill needed the corpus and no cache could be read. */
  corpusAvailable: boolean;
}

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;
const ID_SHAPE = /^[A-Z][A-Z0-9-]*\d+$/;

export async function skillInstall(
  opts: SkillInstallOptions,
): Promise<SkillInstallResult> {
  const { config, name, targetDir, force, dryRun } = opts;
  const baseDir = opts.baseDir ?? process.cwd();

  const profile = REGISTERED_INJECTABLE_SKILLS[name];
  if (!profile) {
    const valid = Object.keys(REGISTERED_INJECTABLE_SKILLS).sort().join(", ");
    throw new Error(
      `Unknown injectable skill "${name}". Registered skills: ${valid}.`,
    );
  }

  // Relative-to-base-dir rail. Absolute paths are rejected to
  // prevent accidental writes outside the caller's project.
  if (isAbsolute(targetDir)) {
    throw new Error(
      `--target must be a relative path, got absolute: "${targetDir}"`,
    );
  }
  const resolvedTarget = resolve(baseDir, targetDir);
  // A skill is a *directory* containing SKILL.md (FRICTION-040). The flat
  // `<name>.md` this used to write landed in `.claude/skills/` as a file
  // nothing discovers:
  // no autocomplete, no `/name`, never loaded — and no error, because
  // writing a markdown file always succeeds.
  const skillDir = join(resolvedTarget, profile.installName);
  const outerPath = join(skillDir, "SKILL.md");

  const rendered = renderInjectableSkill({
    name,
    config,
    projectRoot: baseDir,
    templateRoot: opts.templateRoot,
  });

  const result: SkillInstallResult = {
    name,
    installName: profile.installName,
    skillDir,
    outerPath,
    outerWritten: false,
    outerSkipped: false,
    prefixes: rendered.prefixes,
    corpusAvailable: rendered.corpusAvailable,
  };

  if (dryRun) {
    return result;
  }

  mkdirSync(skillDir, { recursive: true });

  const outerExists = existsSync(outerPath);
  if (outerExists && !force) {
    result.outerSkipped = true;
  } else {
    writeFileSync(outerPath, rendered.content, "utf-8");
    result.outerWritten = true;
  }

  return result;
}

export interface RenderedSkill {
  /** Registry name. */
  name: string;
  /** Directory the skill installs under — what an agent invokes it by. */
  installName: string;
  /** Repo-relative path under the default target; the seed-set path. */
  relPath: string;
  /** The finished SKILL.md. */
  content: string;
  prefixes: PrefixDiscovery[];
  /** False when the skill needed the corpus and no cache could be read. */
  corpusAvailable: boolean;
}

/**
 * Render one injectable skill to its finished bytes. Reads; never writes.
 *
 * **The whole point of this function existing separately** (PROPOSAL-044):
 * it is what lets `collectSeeds` compute the *shipped* side of an injectable
 * skill. The seed manifest asks "is what is on disk still what docdog wrote,
 * and is what docdog writes now the same thing?" — and for a corpus-derived
 * file docdog can answer that only by re-rendering. `skill install`, `init`
 * and `update` are three callers of this one renderer, which is PROPOSAL-041's
 * one-collector shape applied a level in: the gap it fixed existed precisely
 * because two commands walked two different sets.
 */
export function renderInjectableSkill(opts: {
  name: string;
  config: DocdogConfig;
  /** Project root — where the cache is read from. */
  projectRoot: string;
  /** Override for the docdog repo root that holds `templates/`. */
  templateRoot?: string;
}): RenderedSkill {
  const profile = REGISTERED_INJECTABLE_SKILLS[opts.name];
  if (!profile) {
    const valid = Object.keys(REGISTERED_INJECTABLE_SKILLS).sort().join(", ");
    throw new Error(
      `Unknown injectable skill "${opts.name}". Registered skills: ${valid}.`,
    );
  }

  const templateRoot = opts.templateRoot ?? findTemplateRoot();
  const templatePath = join(templateRoot, profile.templateRel);
  if (!existsSync(templatePath)) {
    throw new Error(`Injectable skill template not found: ${templatePath}`);
  }
  const template = readFileSync(templatePath, "utf-8");

  // Per-skill placeholder allowlist: every `{{name}}` in the template must be
  // in the profile's set. Checked before discovery so a drifted template is
  // caught cheaply, and checked again on discovery's output so a discovery
  // function that drifted from its profile is caught too.
  assertTemplatePlaceholdersInAllowlist(template, profile);
  const discovered = profile.discover(opts.config, templateRoot, opts.projectRoot);
  assertSubstitutionsInAllowlist(discovered.substitutions, profile);

  return {
    name: opts.name,
    installName: profile.installName,
    relPath: injectableSkillRelPath(opts.name),
    content: renderTemplate(template, discovered.substitutions),
    prefixes: discovered.prefixes,
    corpusAvailable: discovered.corpusAvailable,
  };
}

// ─── Discovery: generic (no corpus) ────────────────────────────────────────

/** No corpus to discover: the generic skills only need their own vintage. */
function discoverGeneric(
  _config: DocdogConfig,
  templateRoot: string,
  _projectRoot: string,
): SkillDiscoveryResult {
  return {
    substitutions: { docdog_version: readDocdogVersion(templateRoot) },
    prefixes: [],
    corpusAvailable: true,
  };
}

// ─── Discovery: specs (empirical over indexed corpus) ──────────────────────

function discoverSpecs(
  config: DocdogConfig,
  templateRoot: string,
  projectRoot: string,
): SkillDiscoveryResult {
  const collections = getVertexCollections(config);
  const prefixes = discoverCorpus(projectRoot, collections);
  return {
    substitutions: {
      id_prefixes: formatPrefixList(prefixes),
      file_conventions: formatFileConventions(config),
      docdog_version: readDocdogVersion(templateRoot),
    },
    prefixes: prefixes ?? [],
    corpusAvailable: prefixes !== null,
  };
}

interface RawVertex {
  id: string;
  collection: string;
}

/**
 * Id prefixes actually present in the corpus, or **null** when the cache
 * cannot be read at all. Null is not an empty corpus: an empty corpus is a
 * fact ("nothing has an id yet"), an unreadable cache is an absence of
 * facts, and only the caller knows whether that is expected (`init`, always)
 * or a reason to leave the existing file alone (`update`).
 */
function discoverCorpus(
  projectRoot: string,
  collections: string[],
): PrefixDiscovery[] | null {
  let handle: ReturnType<typeof openCacheRead>;
  try {
    handle = openCacheRead(projectRoot);
  } catch {
    return null;
  }
  let vertices: RawVertex[];
  try {
    const rows = handle.db
      .prepare(
        `SELECT id, collection, frontmatter_json FROM vertices`,
      )
      .all() as Array<{
      id: string;
      collection: string;
      frontmatter_json: string;
    }>;
    vertices = rows
      .filter((r) => collections.includes(r.collection))
      // Only records with a declared id. Id-less sections carry
      // parser-generated keys as their cache id, so they contribute no
      // prefix.
      .filter((r) => hasDeclaredId(r.frontmatter_json))
      .map((r) => ({ id: r.id, collection: r.collection }));
  } catch {
    // A cache file that opens but has no `vertices` table is the same
    // absence of facts as no cache at all — an index that never finished.
    return null;
  } finally {
    handle.close();
  }

  const prefixMap = new Map<string, PrefixDiscovery>();
  for (const v of vertices) {
    if (!ID_SHAPE.test(v.id)) continue;
    const prefix = extractPrefix(v.id);
    if (!prefix) continue;
    const key = `${v.collection}::${prefix}`;
    const existing = prefixMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      prefixMap.set(key, { prefix, collection: v.collection, count: 1 });
    }
  }
  const prefixes = [...prefixMap.values()].sort((a, b) => {
    if (a.collection !== b.collection) return a.collection < b.collection ? -1 : 1;
    return a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0;
  });

  return prefixes;
}

function hasDeclaredId(frontmatterJson: string): boolean {
  try {
    const fm = JSON.parse(frontmatterJson) as Record<string, unknown>;
    return typeof fm.id === "string" && fm.id !== "";
  } catch {
    return false;
  }
}

/**
 * Extract an id prefix by stripping the trailing run of digits.
 *
 * Examples:
 *   DP-01        → "DP-"
 *   FR-PROV-06   → "FR-PROV-"
 *   DD-ARCH-01   → "DD-ARCH-"
 *   TASK-052     → "TASK-"
 *   TASK-L0      → "TASK-L"      (consistent literal rule, no inference)
 */
export function extractPrefix(id: string): string | null {
  const m = id.match(/^(.*?)\d+$/);
  if (!m) return null;
  return m[1] || null;
}

// ─── Template rendering + placeholder allowlist ────────────────────────────

/**
 * Literal `{{key}}` substitution. No conditionals, no loops. Throws
 * on any leftover `{{...}}` placeholder after substitution — unknown
 * placeholders are a build-time error per PROPOSAL-019 §3.
 */
export function renderTemplate(
  template: string,
  substitutions: Record<string, string>,
): string {
  const replaced = template.replace(PLACEHOLDER_REGEX, (_, key: string) => {
    if (!(key in substitutions)) {
      throw new Error(`Unknown placeholder "{{${key}}}" in skill template.`);
    }
    return substitutions[key];
  });
  const leftover = replaced.match(PLACEHOLDER_REGEX);
  if (leftover) {
    throw new Error(`Unresolved placeholders in skill template: ${leftover.join(", ")}`);
  }
  return replaced;
}

/**
 * Enforce that every `{{name}}` referenced in the template is in the
 * skill's allowedPlaceholders set. Reported before discovery runs so
 * a drifted template is caught cheaply.
 */
function assertTemplatePlaceholdersInAllowlist(
  template: string,
  profile: SkillProfile,
): void {
  const allowed = new Set(profile.allowedPlaceholders);
  const found = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER_REGEX)) {
    found.add(m[1]);
  }
  const disallowed = [...found].filter((k) => !allowed.has(k)).sort();
  if (disallowed.length > 0) {
    throw new Error(
      `Template references placeholders not in the skill's allowlist: ${disallowed
        .map((k) => `{{${k}}}`)
        .join(", ")}. Allowed: ${profile.allowedPlaceholders.join(", ")}.`,
    );
  }
}

/**
 * Enforce that the discovery function's substitution keys are a
 * subset of the profile's allowedPlaceholders. Catches a discovery
 * function that drifted away from its profile declaration.
 */
function assertSubstitutionsInAllowlist(
  substitutions: Record<string, string>,
  profile: SkillProfile,
): void {
  const allowed = new Set(profile.allowedPlaceholders);
  const extras = Object.keys(substitutions).filter((k) => !allowed.has(k)).sort();
  if (extras.length > 0) {
    throw new Error(
      `Discovery returned substitutions not in the skill's allowlist: ${extras.join(
        ", ",
      )}. Allowed: ${profile.allowedPlaceholders.join(", ")}.`,
    );
  }
}

function formatPrefixList(prefixes: PrefixDiscovery[] | null): string {
  // The two absences are different and read differently. No cache is the
  // normal state at `docdog init`, where the corpus has not been indexed
  // yet, so it names the two commands that fill this in. An indexed corpus
  // with no ids is a fact about the corpus.
  if (prefixes === null) {
    return "_(not read yet — the corpus has not been indexed. Run `docdog index`, then `docdog update` to fill this in.)_";
  }
  if (prefixes.length === 0) {
    return "_(none — no indexed record declares an id matching `[A-Z][A-Z0-9-]*\\d+`)_";
  }
  // No counts: they are corpus state, so they are wrong on the next write
  // while earning nothing - no lookup needs them and a reader who trusts
  // them is misled about corpus size (FRICTION-043). The prefix-to-collection
  // map is the part with navigational value, and it is fairly stable.
  return prefixes
    .map((p) => `- \`${p.prefix}\` — found in: \`${p.collection}\``)
    .join("\n");
}

function formatFileConventions(config: DocdogConfig): string {
  if (!config.scan_paths || config.scan_paths.length === 0) {
    return "_(none — no `scan_paths` configured)_";
  }
  return config.scan_paths
    .map((entry) => {
      if (typeof entry === "string") return `- \`${entry}\` — default parser`;
      const parser = entry.parser ?? "default";
      const coll = entry.collection ? ` → \`${entry.collection}\`` : "";
      return `- \`${entry.path}\` — ${parser} parser${coll}`;
    })
    .join("\n");
}

// ─── Paths ─────────────────────────────────────────────────────────────────

function findTemplateRoot(): string {
  const start = dirname(fileURLToPath(import.meta.url));
  let current = start;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(current, "templates", "injectable-skills"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    `Could not locate templates/injectable-skills/ walking up from ${start}`,
  );
}

function readDocdogVersion(templateRoot: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(templateRoot, "package.json"), "utf-8"),
    );
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
