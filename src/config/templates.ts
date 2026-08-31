/**
 * Shipped project templates — shared between `docdog init` (write time)
 * and `getVertexCollections` (runtime).
 *
 * PROPOSAL-015: the template name is persisted to `.docdog/config.yaml`
 * as `template: <name>`; at runtime, `getVertexCollections` unions the
 * template's shipped set with `config.vertex_collections` (which now
 * holds only user-added collections). This mirrors how shipped
 * `dd_edges_*` already work via `SYSTEM_EDGE_COLLECTIONS`.
 */

export interface ProjectTemplate {
  collections: string[];
  defaultCollection: string | null;
  /** Subdirectory under templates/skills/ for template-specific skills (beyond _common). */
  skillsDir: string;
  /** Subdirectory under templates/scripts/ for template-specific scripts. Optional. */
  scriptsDir?: string;
  /**
   * Subdirectory under templates/concepts/ for template-specific concept
   * seeds copied on top of concepts/_common at init time (PROPOSAL-025).
   * Optional.
   */
  conceptsDir?: string;
  /**
   * Default `scan_paths` seeded into `.docdog/config.yaml` at init time
   * when the user does not pass `--scan`. Omit to fall back to
   * `["specs/"]`. DD-035 uses this to give the workflow template
   * `.docdog/`-scoped paths for workflows/observations/reconciliations,
   * so shipped docdog-native collections don't collide with project
   * vocabulary (FRICTION-010). PROPOSAL-025 adds `.docdog/concepts/`
   * everywhere so the seeded relation vocabulary gets indexed.
   */
  defaultScanPaths?: string[];
}

export const TEMPLATES: Record<string, ProjectTemplate> = {
  minimal: {
    collections: ["notes", "concepts"],
    defaultCollection: "notes",
    skillsDir: "minimal",
    defaultScanPaths: ["specs/", ".docdog/concepts/"],
  },
  structured: {
    collections: [
      "decisions",
      "requirements",
      "principles",
      "guidelines",
      "terms",
      "domain",
      "constraints",
      "integrations",
      "notes",
      "concepts",
    ],
    defaultCollection: "notes",
    skillsDir: "structured",
    defaultScanPaths: ["specs/", ".docdog/concepts/"],
  },
  workflows: {
    collections: [
      "decisions",
      "requirements",
      "principles",
      "guidelines",
      "terms",
      "domain",
      "constraints",
      "integrations",
      "features",
      "tasks",
      "workflows",
      "reconciliations",
      "conversations",
      "notes",
      "concepts",
    ],
    defaultCollection: "notes",
    skillsDir: "workflows",
    scriptsDir: "workflows",
    conceptsDir: "workflows",
    defaultScanPaths: [
      "specs/",
      ".docdog/workflows/",
      ".docdog/observations/",
      ".docdog/reconciliations/",
      ".docdog/concepts/",
    ],
  },
};

export type TemplateName = keyof typeof TEMPLATES;

export const DEFAULT_TEMPLATE: TemplateName = "minimal";

export function getTemplate(name: string): ProjectTemplate {
  return TEMPLATES[name] ?? TEMPLATES[DEFAULT_TEMPLATE];
}

/**
 * Shipped vertex collections for a given template name.
 * Unknown template → empty list (callers fall back to `minimal` at the
 * union level and emit a warning via consistency check).
 */
export function getTemplateCollections(name: string | undefined): string[] {
  if (!name) return [];
  const tmpl = TEMPLATES[name];
  return tmpl ? [...tmpl.collections] : [];
}

export function isKnownTemplate(name: string | undefined): name is TemplateName {
  return name !== undefined && name in TEMPLATES;
}
