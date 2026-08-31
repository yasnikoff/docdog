import { Command } from "commander";
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import type { DocdogConfig } from "../../types/config.js";
import { loadConfig } from "../../config/loader.js";
import { resolveTemplates } from "../../engine/template-engine.js";
import { CLAUDE_MD_BLOCK_TEMPLATE, injectClaudeMdBlock } from "../../engine/claude-md.js";
import { injectGitattributesBlock, renderGitattributesBlock } from "../../engine/gitattributes.js";
import {
  DOCDOG_CACHE_IGNORE_RULE,
  DOCDOG_LOCAL_IGNORE_RULE,
  DOCDOG_GITIGNORE_REL,
  ensureGitignoreRule,
} from "../../engine/docdog-gitignore.js";
import { mergeDriverManualCommands, registerMergeDriver } from "../../engine/merge-driver.js";
import { defaultConfig } from "../../config/defaults.js";
import { getTemplate, type ProjectTemplate } from "../../config/templates.js";
import {
  CLAUDE_PROVIDER_CONTENT,
  mcpServerEntry,
  findTemplatesRoot,
  stableJson,
} from "../../engine/seed-set.js";
import { describeInstall } from "../../engine/upgrade.js";
import { scanPathsCoverConcepts } from "../../engine/scan-reach.js";
import {
  REGISTERED_INJECTABLE_SKILLS,
  renderInjectableSkill,
} from "../../engine/skill-install.js";
import {
  docdogVersion,
  readSeedManifest,
  recordSeed,
  seedHash,
  writeSeedManifest,
  type SeedManifest,
} from "../../engine/seed-manifest.js";

/**
 * Records a file docdog just authored, so `docdog update` can later tell a
 * shipped file from an edited one without guessing (PROPOSAL-041). Paths are
 * repo-relative; the callback closes over the manifest and the running
 * version so every call site is a one-liner.
 */
type RecordSeeded = (repoRelPath: string, content: string) => void;

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize docdog in the current project")
    .option("--name <name>", "Project name (default: directory name)")
    .option("--provider <provider>", "AI provider to inject: claude (default)", "claude")
    .option("--scan <paths...>", "Paths to scan for section files (default: template-provided, falls back to specs/)")
    .option("--template <name>", "Project template: minimal, structured, workflows (default: minimal)")
    .action(async (opts) => {
      const projectRoot = process.cwd();
      const projectName = opts.name ?? projectRoot.split(/[/\\]/).pop() ?? "my-project";
      const provider: string = opts.provider ?? "claude";
      const template: string = opts.template ?? "minimal";

      console.log(`Initializing docdog in: ${projectRoot}`);

      // PROPOSAL-041: re-init merges into the existing manifest rather than
      // replacing it — a second init must not erase the provenance of files
      // an earlier one wrote and this one skips.
      const manifest: SeedManifest = readSeedManifest(projectRoot);
      const version = docdogVersion();
      const record: RecordSeeded = (rel, content) => recordSeed(manifest, rel, content, version);

      // 1. Create .docdog/ structure
      const docdogDir = join(projectRoot, ".docdog");
      mkdirSync(join(docdogDir, "skills"), { recursive: true });
      mkdirSync(join(docdogDir, "scripts"), { recursive: true });
      console.log("  Created .docdog/ structure");

      // 2. Write config.yaml (if not exists)
      const configPath = join(docdogDir, "config.yaml");
      if (!existsSync(configPath)) {
        const tmpl = getTemplate(template);
        // PROPOSAL-015: the template name is the source of truth for
        // shipped collections. `vertex_collections` holds only user
        // extensions (empty at init time). Sections are picked
        // explicitly so v2-era keys (arango, gc, code_refs) never
        // reach a fresh v3 config.
        const config = {
          project: { name: projectName },
          template,
          scan_paths: opts.scan ?? tmpl.defaultScanPaths ?? ["specs/"],
          vertex_collections: [],
          default_collection: tmpl.defaultCollection,
          git: defaultConfig.git,
          embed: defaultConfig.embed,
          search: defaultConfig.search,
        };
        writeFileSync(configPath, yamlStringify(config), "utf-8");
        console.log(`  Created .docdog/config.yaml (template: ${template})`);
      } else {
        console.log("  .docdog/config.yaml already exists, skipping");
      }

      // 3. Keep the cache out of version control (the cache is
      // disposable derived state — DD-070 §2).
      ensureGitignoreEntry(docdogDir, record);

      // 4. Install provider integration
      const projectConfig = loadConfig(projectRoot);

      // 4a. Install the relationships union merge driver (PROPOSAL-030).
      installMergeDriver(projectRoot, projectConfig, record);

      if (provider === "claude") {
        // Create .claude/commands/docdog.md skill entry point.
        // Written unconditionally until PROPOSAL-041: a re-init overwrote it
        // whatever the user had done to it. Now the manifest can say whether
        // the copy on disk is docdog's, so an edited one is left alone.
        const commandsDir = join(projectRoot, ".claude", "commands");
        mkdirSync(commandsDir, { recursive: true });
        const commandPath = join(commandsDir, "docdog.md");
        const commandContent = resolveTemplates(CLAUDE_PROVIDER_CONTENT, projectConfig);
        if (isUserOwned(commandPath, manifest, ".claude/commands/docdog.md")) {
          console.log("  .claude/commands/docdog.md has your edits, leaving it alone");
          console.log("    (docdog update --force .claude/commands/docdog.md takes the shipped one)");
        } else {
          writeFileSync(commandPath, commandContent, "utf-8");
          record(".claude/commands/docdog.md", commandContent);
          console.log("  Created .claude/commands/docdog.md");
        }

        // Inject CLAUDE.md block. Marker-delimited, so this replaces only
        // docdog's span and everything the user wrote around it survives.
        const resolvedBlock = resolveTemplates(CLAUDE_MD_BLOCK_TEMPLATE, projectConfig);
        injectClaudeMdBlock(join(projectRoot, "CLAUDE.md"), resolvedBlock);
        record("CLAUDE.md#docdog", resolvedBlock);
        console.log("  Injected docdog block into CLAUDE.md");

        // Write MCP server config to .mcp.json. Only claim authorship of the
        // entry when we actually wrote it — a user's own docdog entry stays
        // theirs, and `update` will report it rather than replace it.
        if (writeMcpConfig(projectRoot)) {
          record(".mcp.json#mcpServers.docdog", stableJson(mcpServerEntry()));
          console.log(`  Created .mcp.json with docdog MCP server, pinned to ${version}`);
          // The pin names exactly one tarball, which is the whole point
          // (FRICTION-044) — and the failure mode when that tarball does not
          // exist. A source checkout is the only copy whose version may never
          // have been published, and docdog cannot check without a socket
          // `init` must not open, so it discloses instead of guessing.
          if (describeInstall(projectRoot).shape === "source") {
            console.log(
              `  Note: this docdog is a source checkout, so ${version} may not be on the`,
            );
            console.log(
              "  registry. If npx cannot resolve it, point that entry at your checkout or",
            );
            console.log("  install a published version and re-run `docdog update`.");
          }
        } else {
          console.log("  .mcp.json already declares a docdog server, left as is");
        }
      }

      // 5. Copy package skills + scripts to .docdog/
      const templatesRoot = findTemplatesRoot();
      if (templatesRoot) {
        const skillsDest = join(docdogDir, "skills");
        const scriptsDest = join(docdogDir, "scripts");
        const tmpl = getTemplate(template);

        // Common skills (everyone gets these)
        const commonCopied = copyTemplateFiles(
          join(templatesRoot, "skills", "_common"),
          skillsDest,
          projectConfig,
          true,
          record,
          ".docdog/skills",
        );

        // Template-specific skills
        const templateSkillsCopied = copyTemplateFiles(
          join(templatesRoot, "skills", tmpl.skillsDir),
          skillsDest,
          projectConfig,
          true,
          record,
          ".docdog/skills",
        );

        const totalSkills = commonCopied + templateSkillsCopied;
        if (totalSkills > 0) console.log(`  Copied ${totalSkills} skill(s) to .docdog/skills/`);

        // Template-specific scripts (optional)
        if (tmpl.scriptsDir) {
          const scriptsCopied = copyTemplateFiles(
            join(templatesRoot, "scripts", tmpl.scriptsDir),
            scriptsDest,
            projectConfig,
            false,
            record,
            ".docdog/scripts",
          );
          if (scriptsCopied > 0) console.log(`  Copied ${scriptsCopied} script(s) to .docdog/scripts/`);
        }

        // Shipped relation vocabulary (PROPOSAL-025)
        const conceptsCopied = seedConcepts(templatesRoot, docdogDir, tmpl, record);
        if (conceptsCopied > 0) {
          console.log(`  Seeded ${conceptsCopied} concept record(s) to .docdog/concepts/`);
        }
        // Injectable skills (PROPOSAL-044). Written here so an adopter has
        // them without first learning that `docdog skill install` exists —
        // the reach half of the gap, and the larger half: nothing docdog
        // wrote into a fresh project used to mention them at all.
        seedInjectableSkills(projectRoot, projectConfig, templatesRoot, manifest, record);

        if (!scanPathsCoverConcepts(projectConfig.scan_paths ?? [])) {
          console.log('  Note: ".docdog/concepts/" is not in scan_paths — seeded concept records will not be indexed.');
          console.log('        Add ".docdog/concepts/" to scan_paths in .docdog/config.yaml.');
        }
      }

      // Record what was seeded, last, so a failure part-way through never
      // claims authorship of a file that was not written.
      writeSeedManifest(projectRoot, manifest);

      console.log(`\nProject "${projectName}" initialized.`);
      console.log("Next steps:");
      console.log("  1. Index your specs:  docdog index");
      console.log("  2. Start MCP server:  docdog serve");
    });
}

/**
 * Write every registered injectable skill into `.claude/skills/docdog-<name>/`.
 *
 * Additive, like the rest of init: a skill the user has edited is left alone
 * and named, and `docdog update --force <path>` is the way to take docdog's
 * version instead. The manifest entry recorded here is what lets `update`
 * maintain the file afterwards.
 *
 * A fresh project has no cache, so the corpus-backed skill renders with its
 * id-prefix map reading "not read yet". That is the right call *here* and the
 * wrong one in `update`, which is why the decision sits at the call site: at
 * init the file does not exist and 95% of it is useful immediately; at update
 * a good file is already on disk and an empty roster would destroy it.
 */
function seedInjectableSkills(
  projectRoot: string,
  config: DocdogConfig,
  templatesRoot: string,
  manifest: SeedManifest,
  record: RecordSeeded,
): void {
  const repoRoot = dirname(templatesRoot);
  for (const name of Object.keys(REGISTERED_INJECTABLE_SKILLS).sort()) {
    const profile = REGISTERED_INJECTABLE_SKILLS[name];
    if (!existsSync(join(repoRoot, ...profile.templateRel.split("/")))) continue;
    const rendered = renderInjectableSkill({ name, config, projectRoot, templateRoot: repoRoot });
    const abs = join(projectRoot, ...rendered.relPath.split("/"));
    if (isUserOwned(abs, manifest, rendered.relPath)) {
      console.log(`  ${rendered.relPath} has your edits, leaving it alone`);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, rendered.content, "utf-8");
    record(rendered.relPath, rendered.content);
    console.log(`  Installed skill /${rendered.installName}`);
    if (!rendered.corpusAvailable) {
      console.log("    its id-prefix map fills in after `docdog index`, then `docdog update`");
    }
  }
}

/**
 * Gitignore the cache directory. Appends to .docdog/.gitignore (created
 * if missing) so the rule ships with the .docdog folder itself.
 *
 * Recorded as the sub-document seed `.docdog/.gitignore#cache`, so `docdog
 * update` can put the rule back if it is ever deleted — the whole file is
 * not docdog's, only this line is. Authorship is claimed only when this
 * call actually wrote, the same rule `.mcp.json` follows: a `cache/` the
 * user put there themselves stays theirs, and `update` reports it rather
 * than adopting it.
 */
function ensureGitignoreEntry(docdogDir: string, record: RecordSeeded): void {
  const gitignorePath = join(docdogDir, ".gitignore");
  if (ensureGitignoreRule(gitignorePath, DOCDOG_CACHE_IGNORE_RULE)) {
    record(`${DOCDOG_GITIGNORE_REL}#cache`, DOCDOG_CACHE_IGNORE_RULE);
    console.log("  Gitignored .docdog/cache/");
  }
  // Written before the directory exists, on purpose: a destination you have
  // to remember to ignore is one you will forget to ignore once.
  if (ensureGitignoreRule(gitignorePath, DOCDOG_LOCAL_IGNORE_RULE)) {
    record(`${DOCDOG_GITIGNORE_REL}#local`, DOCDOG_LOCAL_IGNORE_RULE);
    console.log(
      "  Gitignored .docdog/local/ — markdown put there is indexed and never committed",
    );
  }
}

/**
 * Install the union merge driver (PROPOSAL-030 §4–§5): the tracked
 * `.gitattributes` block names the driver for every path docdog manages,
 * and the two `git config` keys define it.
 *
 * Git will not let a repository ship an executable merge driver — cloning
 * would be arbitrary code execution — so the definition has to be local
 * config. `git config --local` writes to the *shared* `.git/config`, so
 * one install covers every present and future worktree of the clone.
 *
 * A clone that never runs this gets git's default text merge: an ordinary
 * conflict, i.e. exactly today's behavior. That is the only direction an
 * optional feature is allowed to fail in, so a repo-less directory just
 * skips the config half and says so.
 */
function installMergeDriver(projectRoot: string, config: DocdogConfig, record: RecordSeeded): void {
  const block = renderGitattributesBlock(config.scan_paths ?? []);
  injectGitattributesBlock(join(projectRoot, ".gitattributes"), block);
  record(".gitattributes#docdog", block);
  console.log("  Wrote .gitattributes block (relationships union merge — PROPOSAL-030)");

  if (registerMergeDriver(projectRoot)) {
    console.log("  Registered the docdog merge driver in .git/config (shared by every worktree)");
  } else {
    console.log("  Note: could not write git config — not a git repository, or git is not on PATH.");
    console.log("        Merges of records will use git's default text merge until you run:");
    for (const cmd of mergeDriverManualCommands()) console.log(`          ${cmd}`);
  }
}

/**
 * True when the file exists and is not, byte for byte, what docdog recorded
 * writing there — i.e. the user has touched it (or it predates the manifest).
 * The conservative reading of "no provenance" is "the file is the user's",
 * which is the only answer that can never destroy work (PROPOSAL-041).
 */
function isUserOwned(absPath: string, manifest: SeedManifest, key: string): boolean {
  if (!existsSync(absPath)) return false;
  const entry = manifest.entries[key];
  if (!entry) return true;
  return entry.hash !== seedHash(readFileSync(absPath, "utf-8"));
}

/** Returns true when this call wrote the docdog server entry. */
function writeMcpConfig(projectRoot: string): boolean {
  const mcpPath = join(projectRoot, ".mcp.json");
  let config: Record<string, unknown> = {};

  if (existsSync(mcpPath)) {
    try {
      config = JSON.parse(readFileSync(mcpPath, "utf-8")) as Record<string, unknown>;
    } catch {
      // Malformed — start fresh
    }
  }

  const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
  if (!servers.docdog) {
    servers.docdog = mcpServerEntry();
    config.mcpServers = servers;
    writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    return true;
  }
  return false;
}

/**
 * Seed the shipped vocabulary (PROPOSAL-025/026): copy concept records
 * into .docdog/concepts/ — relations from templates/concepts/_common
 * plus the template-specific subdirectory (tmpl.conceptsDir), and one
 * collection record per template-shipped collection from
 * templates/concepts/collections/ (the template's collections list is
 * the source of truth; a name without a seed file is skipped).
 * Verbatim copy, no {{config:*}} expansion. Copy-if-missing repair
 * semantics: an edited seed is never overwritten; a deleted one
 * reappears only if init is re-run.
 */
export function seedConcepts(
  templatesRoot: string,
  docdogDir: string,
  tmpl: ProjectTemplate,
  record?: RecordSeeded,
): number {
  const dest = join(docdogDir, "concepts");
  const rel = ".docdog/concepts";
  mkdirSync(dest, { recursive: true });
  let copied = copyTemplateFiles(join(templatesRoot, "concepts", "_common"), dest, null, false, record, rel);
  if (tmpl.conceptsDir) {
    copied += copyTemplateFiles(join(templatesRoot, "concepts", tmpl.conceptsDir), dest, null, false, record, rel);
  }
  const collectionsDir = join(templatesRoot, "concepts", "collections");
  for (const name of tmpl.collections) {
    const file = `collection-${name}.md`;
    const source = join(collectionsDir, file);
    const destPath = join(dest, file);
    if (!existsSync(source) || existsSync(destPath)) continue;
    const content = readFileSync(source, "utf-8");
    writeFileSync(destPath, content, "utf-8");
    record?.(`${rel}/${file}`, content);
    copied++;
  }
  return copied;
}

/**
 * Copy files from a template subdirectory to a destination.
 * - .md files: optionally run through resolveTemplates() for {{config:*}} expansion
 * - .js files: copied verbatim (template resolution is unsafe on code)
 * - Silently skips if source directory doesn't exist (empty templates are valid)
 * - Skips files that already exist in dest (idempotent init)
 */
function copyTemplateFiles(
  sourceDir: string,
  destDir: string,
  projectConfig: DocdogConfig | null,
  applyResolveTemplates: boolean,
  record?: RecordSeeded,
  relDir?: string,
): number {
  if (!existsSync(sourceDir)) return 0;
  const files = readdirSync(sourceDir).filter(
    (f: string) => f.endsWith(".md") || f.endsWith(".js"),
  );
  let copied = 0;
  for (const file of files) {
    const destPath = join(destDir, file);
    if (existsSync(destPath)) continue;
    const rawContent = readFileSync(join(sourceDir, file), "utf-8");
    const content = applyResolveTemplates && projectConfig && file.endsWith(".md")
      ? resolveTemplates(rawContent, projectConfig)
      : rawContent;
    writeFileSync(destPath, content, "utf-8");
    if (relDir) record?.(`${relDir}/${file}`, content);
    copied++;
  }
  return copied;
}
