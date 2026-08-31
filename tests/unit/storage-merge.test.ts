/**
 * The union merge driver — PROPOSAL-030.
 *
 * Two layers, tested apart:
 *   - `mergeRelationships` — the set arithmetic, pure.
 *   - `runMergeDriver` — the driver end-to-end on real files that really
 *     conflict, with the real `git merge-file` underneath. Gated on git
 *     being present, like the embed-store worktree tests.
 *
 * The claim under test is narrow and load-bearing: two branches each
 * appending an edge to the same record must come out with *both* edges and
 * *no* conflict, while anything that needs a judgment call must still
 * conflict.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runMergeDriver } from "../../src/cli/commands/merge-driver.js";
import type { RelationshipEntry } from "../../src/storage/frontmatter.js";
import { mergeRelationships } from "../../src/storage/merge.js";
import { extractRelationships } from "../../src/engine/relationships/extract.js";
import { parse as parseMarkdown } from "../../src/markdown/index.js";

const e = (type: string, target: string, context?: string): RelationshipEntry => ({
  type,
  target,
  context: context ?? null,
});

describe("mergeRelationships (three-way set merge on (type, target))", () => {
  it("unions the edges two branches each appended — the whole point", () => {
    const base = [e("references", "DD-070", "the kernel")];
    const ours = [...base, e("references", "DD-051", "ours")];
    const theirs = [...base, e("supersedes", "PROPOSAL-021", "theirs")];

    const result = mergeRelationships(base, ours, theirs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.actions).toEqual([{ kind: "keep" }, { kind: "keep" }]);
    expect(result.plan.append).toEqual([e("supersedes", "PROPOSAL-021", "theirs")]);
  });

  it("treats the same edge added by both sides with the same context as one edge", () => {
    const base: RelationshipEntry[] = [];
    const ours = [e("references", "DP-001", "tier walk")];
    const theirs = [e("references", "DP-001", "tier walk")];

    const result = mergeRelationships(base, ours, theirs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.append).toEqual([]);
    expect(result.plan.actions).toEqual([{ kind: "keep" }]);
  });

  it("refuses the same edge added by both sides with different contexts", () => {
    const ours = [e("references", "DP-001", "because agent-first")];
    const theirs = [e("references", "DP-001", "because tier 3 forbids it")];

    const result = mergeRelationships([], ours, theirs);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("references: DP-001");
  });

  it("keeps a deletion: an entry theirs removed does not survive on ours' untouched copy", () => {
    const base = [e("references", "DD-070"), e("references", "DD-051")];
    const ours = [...base];
    const theirs = [e("references", "DD-070")];

    const result = mergeRelationships(base, ours, theirs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.actions).toEqual([{ kind: "keep" }, { kind: "drop" }]);
  });

  it("does not resurrect an entry ours deleted, even though theirs still lists it", () => {
    const base = [e("references", "DD-070")];
    const ours: RelationshipEntry[] = [];
    const theirs = [e("references", "DD-070")];

    const result = mergeRelationships(base, ours, theirs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.append).toEqual([]);
  });

  it("takes a one-sided context edit", () => {
    const base = [e("references", "DD-070", "old")];
    const ours = [e("references", "DD-070", "old")];
    const theirs = [e("references", "DD-070", "sharper")];

    const result = mergeRelationships(base, ours, theirs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.actions).toEqual([
      { kind: "replace", entry: e("references", "DD-070", "sharper") },
    ]);
  });

  it("keeps ours when ours is the side that edited the context", () => {
    const base = [e("references", "DD-070", "old")];
    const ours = [e("references", "DD-070", "sharper")];
    const theirs = [e("references", "DD-070", "old")];

    const result = mergeRelationships(base, ours, theirs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.actions).toEqual([{ kind: "keep" }]);
  });

  it("refuses when both sides rewrote the same edge's context differently", () => {
    const base = [e("references", "DD-070", "old")];
    const ours = [e("references", "DD-070", "ours")];
    const theirs = [e("references", "DD-070", "theirs")];

    const result = mergeRelationships(base, ours, theirs);
    expect(result.ok).toBe(false);
  });

  it("treats the same target under two types as two edges", () => {
    const base: RelationshipEntry[] = [];
    const ours = [e("references", "DD-070", "a")];
    const theirs = [e("supersedes", "DD-070", "b")];

    const result = mergeRelationships(base, ours, theirs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.append).toEqual([e("supersedes", "DD-070", "b")]);
  });
});

// ---------------------------------------------------------------------------
// The driver, on real files, through real git.
// ---------------------------------------------------------------------------

const gitAvailable = (() => {
  try {
    return spawnSync("git", ["--version"], { encoding: "utf-8" }).status === 0;
  } catch {
    return false;
  }
})();

const RECORD = (rels: string, body = "The body.") => `---
id: DD-001
title: A decision
status: current
relationships:
${rels}---

# A decision

${body}
`;

const REL = (type: string, target: string, context: string) =>
  `  - ${type}: ${target}\n    context: "${context}"\n`;

/** The edges an agent (or the indexer) would read back out of the merged file. */
function edgesOf(raw: string): string[] {
  const doc = parseMarkdown(raw);
  return extractRelationships(doc.frontmatter).tuples.map(
    (t) => `${t.type}:${t.target_id}:${t.context ?? ""}`,
  );
}

describe.skipIf(!gitAvailable)("runMergeDriver (end-to-end, real git merge-file)", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** Lay the three sides out on disk and merge them, returning ours' new content. */
  function merge(base: string, ours: string, theirs: string) {
    const dir = mkdtempSync(join(tmpdir(), "docdog-driver-"));
    dirs.push(dir);
    const paths = {
      basePath: join(dir, "base.md"),
      oursPath: join(dir, "ours.md"),
      theirsPath: join(dir, "theirs.md"),
    };
    writeFileSync(paths.basePath, base, "utf-8");
    writeFileSync(paths.oursPath, ours, "utf-8");
    writeFileSync(paths.theirsPath, theirs, "utf-8");

    const outcome = runMergeDriver({ ...paths, markerSize: 7, path: "specs/dd-001.md" });
    return { outcome, result: readFileSync(paths.oursPath, "utf-8") };
  }

  it("unions two adjacent appends that git alone calls a conflict", () => {
    const base = RECORD(REL("references", "DD-070", "the kernel"));
    const ours = RECORD(REL("references", "DD-070", "the kernel") + REL("references", "DD-051", "ours"));
    const theirs = RECORD(
      REL("references", "DD-070", "the kernel") + REL("supersedes", "PROPOSAL-021", "theirs"),
    );

    const { outcome, result } = merge(base, ours, theirs);
    // "merged" is itself the premise: the driver only engages on a merge
    // git already failed, so reaching it proves git alone conflicted here.
    expect(outcome.status).toBe("merged");
    expect(result).not.toContain("<<<<<<<");
    expect(edgesOf(result)).toEqual([
      "references:DD-070:the kernel",
      "references:DD-051:ours",
      "supersedes:PROPOSAL-021:theirs",
    ]);
  });

  it("changes nothing but the appended edge — no reformatting, no churn", () => {
    const base = RECORD(REL("references", "DD-070", "the kernel"));
    const ours = RECORD(REL("references", "DD-070", "the kernel") + REL("references", "DD-051", "ours"));
    const theirs = RECORD(
      REL("references", "DD-070", "the kernel") + REL("supersedes", "PROPOSAL-021", "theirs"),
    );

    const { result } = merge(base, ours, theirs);
    // Ours, verbatim — quoting style and all — plus theirs' entry in the
    // exact shape `appendRelationship` writes one.
    expect(result).toBe(
      RECORD(
        REL("references", "DD-070", "the kernel") +
          REL("references", "DD-051", "ours") +
          '  - supersedes: PROPOSAL-021\n    context: theirs\n',
      ),
    );
  });

  it("passes a clean merge straight through without touching the block", () => {
    const base = RECORD(REL("references", "DD-070", "the kernel"));
    const ours = RECORD(REL("references", "DD-070", "the kernel"), "Ours rewrote the body.");
    const theirs = RECORD(REL("references", "DD-070", "the kernel") + REL("references", "DD-051", "theirs"));

    const { outcome, result } = merge(base, ours, theirs);
    expect(outcome.status).toBe("clean"); // git managed it alone; docdog stayed out
    expect(result).toContain("Ours rewrote the body.");
    expect(edgesOf(result)).toHaveLength(2);
  });

  it("conflicts on divergent prose even when the edge lists also diverge", () => {
    const base = RECORD(REL("references", "DD-070", "the kernel"));
    const ours = RECORD(
      REL("references", "DD-070", "the kernel") + REL("references", "DD-051", "ours"),
      "Ours says one thing.",
    );
    const theirs = RECORD(
      REL("references", "DD-070", "the kernel") + REL("supersedes", "PROPOSAL-021", "theirs"),
      "Theirs says another.",
    );

    const { outcome, result } = merge(base, ours, theirs);
    expect(outcome.status).toBe("conflict");
    expect(result).toContain("<<<<<<<");
  });

  it("conflicts when both sides set a scalar differently", () => {
    const base = RECORD(REL("references", "DD-070", "k"));
    const ours = RECORD(REL("references", "DD-070", "k") + REL("references", "DD-051", "ours")).replace(
      "status: current",
      "status: shipped",
    );
    const theirs = RECORD(
      REL("references", "DD-070", "k") + REL("supersedes", "PROPOSAL-021", "theirs"),
    ).replace("status: current", "status: superseded");

    const { outcome, result } = merge(base, ours, theirs);
    expect(outcome.status).toBe("conflict");
    expect(result).toContain("<<<<<<<");
  });

  it("conflicts when both sides add the same edge with different contexts", () => {
    const base = RECORD(REL("references", "DD-070", "k"));
    const ours = RECORD(REL("references", "DD-070", "k") + REL("references", "DP-001", "ours' reading"));
    const theirs = RECORD(
      REL("references", "DD-070", "k") + REL("references", "DP-001", "theirs' reading"),
    );

    const { outcome, result } = merge(base, ours, theirs);
    expect(outcome.status).toBe("conflict");
    expect(result).toContain("<<<<<<<");
  });

  it("honours a deletion on one side while unioning an addition on the other", () => {
    const base = RECORD(REL("references", "DD-070", "k") + REL("references", "DD-051", "doomed"));
    const ours = RECORD(
      REL("references", "DD-070", "k") + REL("references", "DD-051", "doomed") + REL("references", "DP-001", "ours"),
    );
    const theirs = RECORD(REL("references", "DD-070", "k")); // theirs deleted DD-051

    const { outcome, result } = merge(base, ours, theirs);
    expect(outcome.status).toBe("merged");
    expect(edgesOf(result)).toEqual(["references:DD-070:k", "references:DP-001:ours"]);
  });

  it("falls back to a plain conflict when a side's frontmatter does not parse", () => {
    const base = RECORD(REL("references", "DD-070", "k"));
    const ours = RECORD(REL("references", "DD-070", "k") + REL("references", "DD-051", "ours"));
    const theirs = RECORD(
      REL("references", "DD-070", "k") + REL("supersedes", "PROPOSAL-021", "theirs"),
    ).replace("relationships:", "relationships: [unclosed");

    const { outcome, result } = merge(base, ours, theirs);
    expect(outcome.status).toBe("conflict");
    expect(result).toContain("<<<<<<<");
  });

  it("reindexes cleanly: the merged file's edges round-trip through the real extractor", () => {
    const base = RECORD(REL("references", "DD-070", "k"));
    const ours = RECORD(REL("references", "DD-070", "k") + REL("references", "DD-051", "a"));
    const theirs = RECORD(REL("references", "DD-070", "k") + REL("references", "DD-052", "b"));

    const { result } = merge(base, ours, theirs);
    const doc = parseMarkdown(result);
    expect(doc.frontmatter.id).toBe("DD-001");
    expect(doc.frontmatter.status).toBe("current");
    expect(extractRelationships(doc.frontmatter).warnings).toEqual([]);
    expect(edgesOf(result)).toEqual([
      "references:DD-070:k",
      "references:DD-051:a",
      "references:DD-052:b",
    ]);
  });
});
