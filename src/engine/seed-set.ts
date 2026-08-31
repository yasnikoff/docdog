/**
 * The seed set — everything in an adopting repo that docdog authored
 * (PROPOSAL-041 §"What is in scope").
 *
 * One collector, used by two commands: `docdog init` writes the members
 * that are absent and records what it wrote, and `docdog update` classifies
 * every member against the manifest. Keeping the set in one place is the
 * point — the gap this fixes existed because `init` walked the *source* and
 * `templates refresh` walked the *destination*, so neither ever saw the
 * whole set.
 *
 * A member is a file or a marker-delimited block. Both reduce to the same
 * three facts — what docdog ships for this path, what the repo holds, and
 * how to put the former in place — which is all `classifySeed` needs.
 *
 * DP-001 tier 1 throughout: read files, resolve templates, compare strings.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DocdogConfig } from "../types/config.js";
import { getTemplate } from "../config/templates.js";
import { resolveTemplates } from "./template-engine.js";
import { CLAUDE_MD_BLOCK_TEMPLATE, CLAUDE_MD_START, CLAUDE_MD_END, injectClaudeMdBlock } from "./claude-md.js";
import { injectGitattributesBlock, readManagedBlock, renderGitattributesBlock } from "./gitattributes.js";
import {
  DOCDOG_CACHE_IGNORE_RULE,
  DOCDOG_GITIGNORE_REL,
  DOCDOG_LOCAL_IGNORE_RULE,
  ensureGitignoreRule,
  readGitignoreRule,
} from "./docdog-gitignore.js";
import {
  REGISTERED_INJECTABLE_SKILLS,
  renderInjectableSkill,
} from "./skill-install.js";
import { docdogVersion, type SeedState } from "./seed-manifest.js";

/** The `.claude/commands/docdog.md` entry point docdog writes at init. */
export const CLAUDE_PROVIDER_CONTENT = `# DocDog Context Management

This project uses [docdog](https://github.com/yasnikoff/docdog) for AI-native context management.
Docdog maintains a graph of all specs, decisions, requirements, and design principles —
queryable by any MCP-compatible agent. Markdown files are the source of truth; the
index is a disposable local cache rebuilt by \`docdog index\`.

## Skills

Skills are in \`.docdog/skills/\`. Read the relevant skill before performing operations.

## MCP Tools

When the MCP server is running (\`docdog serve\`), you have direct access to:

| Tool | Purpose |
|------|---------|
| \`docdog_search\` | Hybrid keyword + semantic search across records |
| \`docdog_get\` | Get a specific record by ID |
| \`docdog_traverse\` | Follow relationship edges from a record |
| \`docdog_relate\` | Record an outbound relationship (patches the source file) |
| \`docdog_create\` | Create a record file at a path you choose, then index it |
| \`docdog_update\` | Patch a record file, then reindex it |
| \`docdog_index\` | Re-index changed files into the cache |
| \`docdog_status\` | Cache/corpus statistics |

To delete a record: delete its file, then run \`docdog index\` (files + git are the archive).

## Configuration

- Scan paths and collections: \`.docdog/config.yaml\`
- Local overrides (gitignored): \`.docdog/config.local.yaml\`
`;

/**
 * The MCP server entry `docdog init` wires into `.mcp.json`.
 *
 * **Pinned, deliberately** (PROPOSAL-042 §1). An unpinned `npx -y
 * @yasnikoff/docdog` resolves once and npx records the resolved version as a
 * caret range in its cache directory — a range that its own resolution
 * satisfies, so the entry need never re-resolve. Measured on a neighbouring
 * package sitting four minor versions behind with no mechanism to notice
 * (FRICTION-044).
 *
 * A pin cannot serve the wrong version whatever npx does, because npx keys
 * its cache on the spec string. It also makes the upgrade a reviewable
 * one-line diff in a tracked file, and it is offline-deterministic — the spec
 * names exactly one tarball. `@latest` was rejected: it re-opens the cache
 * question and puts a version resolution in the startup path of a tool that
 * must work offline.
 *
 * The bump costs no machinery. `init` records this as the sub-document seed
 * `.mcp.json#mcpServers.docdog`, hashed with `stableJson`, so PROPOSAL-041's
 * four outcomes already apply: an untouched entry is updated, an entry the
 * user edited — pinned by hand, or pointed at a checkout — is reported and
 * left alone.
 */
export function mcpServerEntry(version: string = docdogVersion()) {
  return {
    type: "stdio",
    command: "npx",
    args: ["-y", `@yasnikoff/docdog@${version}`, "serve"],
  };
}

export interface SeedItem extends SeedState {
  /** Which surface this belongs to — groups the report. */
  group: SeedGroup;
  /** Put `shipped` in place. Only ever called for `add`, `update` and `--force`. */
  write: (content: string) => void;
}

export type SeedGroup =
  | "skills"
  | "scripts"
  | "concepts"
  | "provider"
  | "skills-injectable"
  | "legacy";

/**
 * A member docdog ships but could not render on this run, with the reason.
 *
 * Distinct from every `SeedOutcome`, and deliberately so: an unrenderable
 * member has **no shipped side**, so it cannot be classified at all. Calling
 * it an orphan (`shipped: null`) would tell the user docdog no longer ships
 * it, which is false and invites them to delete a good file; leaving it out
 * silently would let `update` report success while skipping the one thing
 * that failed. It is reported as what it is — a skip, with a cause.
 */
export interface UnavailableSeed {
  path: string;
  group: SeedGroup;
  /** One sentence, ending in what the user can do about it. */
  reason: string;
}

export interface SeedCollection {
  items: SeedItem[];
  unavailable: UnavailableSeed[];
}

export interface CollectSeedsOptions {
  projectRoot: string;
  config: DocdogConfig;
  templatesRoot: string;
}

/**
 * Assemble the full seed set for a project. Reads; never writes.
 *
 * Returns two lists rather than one. `items` is everything docdog can put a
 * shipped side to right now; `unavailable` is everything it ships and could
 * not render on this run, with a reason. The second list exists because the
 * injectable skills joined the set (PROPOSAL-044) and one of them reads the
 * corpus — a member that cannot be rendered is not an orphan, not diverged,
 * and not fine, so it needs somewhere to be said out loud.
 */
export function collectSeeds(opts: CollectSeedsOptions): SeedCollection {
  const { projectRoot, config, templatesRoot } = opts;
  const tmpl = getTemplate(config.template ?? "minimal");
  const items: SeedItem[] = [];
  const unavailable: UnavailableSeed[] = [];

  const fileItem = (
    group: SeedItem["group"],
    relPath: string,
    shipped: string | null,
  ): SeedItem => {
    const abs = join(projectRoot, relPath);
    return {
      group,
      path: relPath,
      shipped,
      current: existsSync(abs) ? readFileSync(abs, "utf-8") : null,
      write: (content) => {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf-8");
      },
    };
  };

  // ── Seeded skills: templates/skills/_common + the template's own dir.
  // Resolved through the config, exactly as init resolves them, so an
  // unmodified skill compares equal instead of reading as user-edited.
  for (const [file, source] of templateFiles(join(templatesRoot, "skills", "_common"))) {
    items.push(fileItem("skills", `.docdog/skills/${file}`, renderSeed(source, file, config)));
  }
  for (const [file, source] of templateFiles(join(templatesRoot, "skills", tmpl.skillsDir))) {
    items.push(fileItem("skills", `.docdog/skills/${file}`, renderSeed(source, file, config)));
  }

  // ── Template scripts. Verbatim: template resolution is unsafe on code.
  if (tmpl.scriptsDir) {
    for (const [file, source] of templateFiles(join(templatesRoot, "scripts", tmpl.scriptsDir))) {
      items.push(fileItem("scripts", `.docdog/scripts/${file}`, source));
    }
  }

  // ── Seeded vocabulary (PROPOSAL-025/026). The population with the worst
  // blast radius: docdog's vocabulary lives in records, so a relation type
  // shipped after an adopter's init reached them by no path at all.
  for (const [file, source] of templateFiles(join(templatesRoot, "concepts", "_common"))) {
    items.push(fileItem("concepts", `.docdog/concepts/${file}`, source));
  }
  if (tmpl.conceptsDir) {
    for (const [file, source] of templateFiles(join(templatesRoot, "concepts", tmpl.conceptsDir))) {
      items.push(fileItem("concepts", `.docdog/concepts/${file}`, source));
    }
  }
  const collectionsDir = join(templatesRoot, "concepts", "collections");
  for (const name of tmpl.collections) {
    const file = `collection-${name}.md`;
    const source = join(collectionsDir, file);
    if (!existsSync(source)) continue; // a template name with no seed file
    items.push(fileItem("concepts", `.docdog/concepts/${file}`, readFileSync(source, "utf-8")));
  }

  // ── Provider wiring.
  items.push(
    fileItem("provider", ".claude/commands/docdog.md", resolveTemplates(CLAUDE_PROVIDER_CONTENT, config)),
  );
  items.push(claudeMdBlockItem(projectRoot, config));
  items.push(gitattributesBlockItem(projectRoot, config));
  items.push(mcpServerItem(projectRoot));
  items.push(cacheIgnoreItem(projectRoot));
  items.push(localIgnoreItem(projectRoot));

  // ── Injectable skills (PROPOSAL-044). These were outside the seed set on
  // the theory that a per-corpus file has "no shipped bytes to compare
  // against". It conflated *shipped* with *fixed*: the manifest needs what
  // docdog would write **now**, and for these that is one render away — the
  // same render `skill install` performs. So they are maintained like any
  // other seed, and an unedited one picks up a new collection in its roster
  // on the next update, which is the refresh a generated file has to have.
  const repoRoot = dirname(templatesRoot);
  for (const name of Object.keys(REGISTERED_INJECTABLE_SKILLS).sort()) {
    const profile = REGISTERED_INJECTABLE_SKILLS[name];
    // A templates tree without this skill's file ships nothing for it. Same
    // posture as `templateFiles` on a missing directory: absent is empty.
    if (!existsSync(join(repoRoot, ...profile.templateRel.split("/")))) continue;
    const rendered = renderInjectableSkill({ name, config, projectRoot, templateRoot: repoRoot });
    if (!rendered.corpusAvailable) {
      unavailable.push({
        group: "skills-injectable",
        path: rendered.relPath,
        reason:
          "needs the corpus for its id-prefix map and no cache could be read — run `docdog index`, then `docdog update` again",
      });
      continue;
    }
    items.push(fileItem("skills-injectable", rendered.relPath, rendered.content));
  }

  // ── Legacy shapes docdog wrote and no longer writes. `shipped: null`
  // makes these orphans wherever they still exist: reported with the path,
  // never deleted — removal is the user's call (files + git are the archive).
  // Enumerated, not derived from the registry: these are historical facts
  // about what docdog once wrote, and a new skill has no history. Deriving
  // them would claim a future `.claude/skills/<name>.md` as docdog's orphan
  // when it is just as likely to be the user's own skill of that name.
  for (const name of ["specs", "navigate-specs"]) {
    items.push(fileItem("legacy", `.claude/skills/${name}.md`, null));
    items.push(fileItem("legacy", `.claude/skills/${name}.index.md`, null));
  }
  // The flat index, in the directory layout FRICTION-040 moved it to and
  // FRICTION-043 stopped writing. Listed so an adopter who already has one is
  // told it is no longer shipped — `update` cannot classify it any other way,
  // since its authority was never the template.
  items.push(fileItem("legacy", ".claude/skills/docdog-specs/specs.index.md", null));
  // Merged into docdog-specs (PROPOSAL-044). Reported so an adopter is told
  // its content now lives in the sibling directory, and never deleted —
  // removal stays the user's call, as it does for every orphan.
  items.push(fileItem("legacy", ".claude/skills/docdog-navigate-specs/SKILL.md", null));

  return { items, unavailable };
}

/** `{{config:*}}` expansion, applied to markdown only — code is copied verbatim. */
function renderSeed(source: string, file: string, config: DocdogConfig): string {
  return file.endsWith(".md") ? resolveTemplates(source, config) : source;
}

/** filename → file contents, for every .md/.js in a template directory. */
function templateFiles(dir: string): Array<[string, string]> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") || f.endsWith(".js"))
    .sort()
    .map((f) => [f, readFileSync(join(dir, f), "utf-8")] as [string, string]);
}

// ─── Marker-delimited blocks ───────────────────────────────────────────────

/**
 * The CLAUDE.md block. The manifest key names the block rather than the
 * file, because the file is overwhelmingly the user's and only the span
 * between the markers is docdog's.
 */
function claudeMdBlockItem(projectRoot: string, config: DocdogConfig): SeedItem {
  const abs = join(projectRoot, "CLAUDE.md");
  let current: string | null = null;
  if (existsSync(abs)) {
    const content = readFileSync(abs, "utf-8");
    const start = content.indexOf(CLAUDE_MD_START);
    const end = content.indexOf(CLAUDE_MD_END);
    if (start !== -1 && end !== -1 && end > start) {
      current = content.slice(start, end + CLAUDE_MD_END.length);
    }
  }
  return {
    group: "provider",
    path: "CLAUDE.md#docdog",
    shipped: resolveTemplates(CLAUDE_MD_BLOCK_TEMPLATE, config),
    current,
    write: (content) => injectClaudeMdBlock(abs, content),
  };
}

/**
 * The `.gitattributes` merge-driver block (PROPOSAL-030). `docdog index`
 * already reports its drift and never rewrites it; this is where the fix
 * belongs, and it inherits the same posture — a block the user edited is
 * reported, not replaced.
 */
function gitattributesBlockItem(projectRoot: string, config: DocdogConfig): SeedItem {
  const abs = join(projectRoot, ".gitattributes");
  return {
    group: "provider",
    path: ".gitattributes#docdog",
    shipped: renderGitattributesBlock(config.scan_paths ?? []),
    current: readManagedBlock(abs),
    write: (content) => injectGitattributesBlock(abs, content),
  };
}

/**
 * The `cache/` rule in `.docdog/.gitignore`. Without it the disposable
 * SQLite cache gets committed, and until this seed existed nothing could put
 * it back: `init` wrote the rule and recorded nothing, so a rule deleted —
 * or a repo adopted before the rule existed — stayed deleted through every
 * `docdog update`.
 *
 * A **sub-document** member, for the same reason `CLAUDE.md` is tracked by
 * block and not by file: `.docdog/.gitignore` may carry the adopter's own
 * ignores, and a whole-file seed would read those as `diverged` and let
 * `--force` clobber them. Naming the line instead makes exactly one line
 * docdog's and leaves the rest of the file invisible to the comparison.
 *
 * It rides in `provider` rather than earning a group for one line — the
 * group exists to shape the report, and this belongs with the other pieces
 * of repo wiring init lays down.
 */
function cacheIgnoreItem(projectRoot: string): SeedItem {
  const abs = join(projectRoot, ...DOCDOG_GITIGNORE_REL.split("/"));
  return {
    group: "provider",
    path: `${DOCDOG_GITIGNORE_REL}#cache`,
    shipped: DOCDOG_CACHE_IGNORE_RULE,
    current: readGitignoreRule(abs),
    write: (content) => ensureGitignoreRule(abs, content),
  };
}

/**
 * The `local/` rule in `.docdog/.gitignore` — the sanctioned home for
 * records docdog indexes and git never carries (DISC-041).
 *
 * A separate sub-document member rather than a second line on the cache
 * seed, because the two are independent: an adopter may delete one and keep
 * the other, and a seed that bundled them would report a half-edited file
 * as wholly diverged. Same shape, same reasoning, one line each.
 *
 * Seeded unconditionally, including in projects with no `.docdog/local/`
 * directory. The rule costs one line and removes a step someone would
 * otherwise have to remember at exactly the moment they are writing
 * something they did not want published.
 */
function localIgnoreItem(projectRoot: string): SeedItem {
  const abs = join(projectRoot, ...DOCDOG_GITIGNORE_REL.split("/"));
  return {
    group: "provider",
    path: `${DOCDOG_GITIGNORE_REL}#local`,
    shipped: DOCDOG_LOCAL_IGNORE_RULE,
    current: readGitignoreRule(abs, DOCDOG_LOCAL_IGNORE_RULE),
    write: (content) => ensureGitignoreRule(abs, content),
  };
}

/**
 * The `.mcp.json` docdog server entry. Serialized with sorted keys on both
 * sides so a formatting difference in the user's file cannot masquerade as
 * an edit, and merged rather than overwritten so other servers survive.
 */
function mcpServerItem(projectRoot: string): SeedItem {
  const abs = join(projectRoot, ".mcp.json");
  const doc = readJsonObject(abs);
  const servers = (doc?.mcpServers ?? null) as Record<string, unknown> | null;
  const existing = servers && servers.docdog !== undefined ? servers.docdog : undefined;
  return {
    group: "provider",
    path: ".mcp.json#mcpServers.docdog",
    shipped: stableJson(mcpServerEntry()),
    current: existing === undefined ? null : stableJson(existing),
    write: (content) => {
      const target = readJsonObject(abs) ?? {};
      const nextServers = (target.mcpServers ?? {}) as Record<string, unknown>;
      nextServers.docdog = JSON.parse(content);
      target.mcpServers = nextServers;
      writeFileSync(abs, `${JSON.stringify(target, null, 2)}\n`, "utf-8");
    },
  };
}

function readJsonObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null; // malformed — treated as absent, exactly as init treats it
  }
}

/** Key-sorted JSON, so comparison sees content and not key order. */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

// ─── config.yaml: report only ──────────────────────────────────────────────

/**
 * Top-level keys `docdog init` writes into a fresh `config.yaml` that this
 * project's file does not have. **Named, never written** — config is the
 * user's file, and a default that appears silently is worse than one that
 * is announced. Absent keys are harmless at runtime (the loader merges
 * defaults); the value here is telling the user the key now exists.
 */
export function missingConfigKeys(projectRoot: string): string[] {
  const path = join(projectRoot, ".docdog", "config.yaml");
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  const present = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):/);
    if (m) present.add(m[1]);
  }
  const shipped = [
    "project",
    "template",
    "scan_paths",
    "vertex_collections",
    "default_collection",
    "git",
    "embed",
    "search",
    "ingest",
  ];
  return shipped.filter((k) => !present.has(k));
}

// ─── Template root ─────────────────────────────────────────────────────────

/**
 * Locate the templates/ directory — at repo root in dev, or shipped in the
 * npm tarball.
 */
export function findTemplatesRoot(): string | null {
  const moduleDir = import.meta.dirname ?? ".";
  const candidates = [
    join(moduleDir, "..", "..", "templates"), // dist-relative
    join(moduleDir, "..", "..", "..", "templates"), // src-relative
    join(process.cwd(), "templates"), // cwd fallback
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}
