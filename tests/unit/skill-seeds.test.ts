/**
 * Packaging check for the skills every project inherits at init.
 *
 * PROPOSAL-026's mechanism, applied to `templates/skills/_common/` instead of
 * to `templates/concepts/`: the shipped set is enumerated here, so adding or
 * removing a common skill is a template edit plus a test update, and a skill
 * that exists in the repo but never reaches `.docdog/skills/` — the failure
 * PROPOSAL-025 hit when a seed silently stopped shipping — fails the check
 * instead of shipping quietly.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const COMMON_SKILLS_DIR = join(process.cwd(), "templates", "skills", "_common");

/** Every skill `docdog init` copies into a fresh project, whatever template. */
const SHIPPED_COMMON_SKILLS = [
  "compose.md",
  "index.md",
  "ingest.md",
  "populate.md",
  "relate.md",
  "search.md",
];

describe("templates/skills/_common", () => {
  it("ships exactly the enumerated set", () => {
    expect(readdirSync(COMMON_SKILLS_DIR).sort()).toEqual(SHIPPED_COMMON_SKILLS);
  });

  it("gives every skill the frontmatter the skill loader reads", () => {
    for (const file of SHIPPED_COMMON_SKILLS) {
      const raw = readFileSync(join(COMMON_SKILLS_DIR, file), "utf-8");
      expect(raw.startsWith("---\n"), `${file} has no frontmatter`).toBe(true);
      expect(raw, `${file} declares no name`).toMatch(/\nname: \S+/);
      expect(raw, `${file} declares no description`).toMatch(/\ndescription: \S+/);
    }
  });

  it("ships the composition skill with the plan round trip in it (PROPOSAL-039)", () => {
    const raw = readFileSync(join(COMMON_SKILLS_DIR, "compose.md"), "utf-8");
    expect(raw).toContain("--format plan");
    expect(raw).toContain("--apply-plan");
    // The two things the skill exists to carry beyond the mechanics: the
    // plural test, and "leave it alone" as an outcome it genuinely reaches.
    expect(raw).toContain("is the tail a different idea");
    expect(raw).toContain('"Leave it alone" is a real answer');
  });

  it("is inside a packaged directory, so an adopting project actually gets it", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    expect(pkg.files).toContain("templates/");
  });
});
