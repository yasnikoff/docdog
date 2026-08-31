/**
 * `docdog merge-driver <base> <ours> <theirs> <marker-size> <path>` —
 * PROPOSAL-030. Plumbing: git invokes it, a user never does.
 *
 * The shape of the thing, in three sentences:
 *
 * 1. Run the ordinary three-way text merge **first**. Clean → write it and
 *    exit 0. The driver can therefore only ever act on a merge that
 *    already failed, so it cannot make a clean merge worse (§1).
 * 2. On a conflict, take the `relationships:` block out of the picture —
 *    swap it for one identical sentinel line on all three sides — and
 *    re-run the same text merge. If *that* still conflicts, the
 *    disagreement is somewhere else (prose, a scalar) and it is a real
 *    one: emit the original conflicted text and exit non-zero (§3).
 * 3. If it comes out clean, the whole fight was over the edge list. Merge
 *    the entries as the set they are (`storage/merge.ts`) and replay the
 *    result: ours' lines verbatim, theirs' additions through
 *    `appendRelationship` — the same surgery `docdog relate` writes edges
 *    with, so the merged block is formatted exactly like one docdog wrote
 *    itself, because it is one (§2).
 *
 * Every ambiguity resolves *toward* a conflict. The failure direction is
 * always "an agent or a human looks at it", never "docdog guessed".
 */
import { Command } from "commander";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRelationship,
  FrontmatterPatchError,
  readRelationshipsBlock,
  serializeRelationshipEntry,
  spliceRelationshipsBlock,
  type RelationshipsBlock,
} from "../../storage/frontmatter.js";
import { gitMergeFile } from "../../storage/git.js";
import { mergeRelationships } from "../../storage/merge.js";

/**
 * A line that cannot occur in a record and is byte-identical on all three
 * sides, so the text merge treats the region it stands in as unchanged.
 */
const SENTINEL = "relationships: __docdog_merge_sentinel__";

export interface MergeDriverArgs {
  basePath: string;
  oursPath: string;
  theirsPath: string;
  markerSize?: number;
  /** The record's path in the worktree — used only for conflict-marker labels. */
  path?: string;
}

export type MergeDriverOutcome =
  /** Git's own merge was clean; docdog did nothing. */
  | { status: "clean" }
  /** The conflict was confined to the edge list, and it was a union. */
  | { status: "merged"; appended: number; dropped: number; updated: number }
  /** A real conflict. Ours holds the conflict-marked text. */
  | { status: "conflict"; reason: string };

/**
 * Merge one record. Writes the result into `oursPath` — git's contract for
 * a merge driver — and reports what happened.
 */
export function runMergeDriver(args: MergeDriverArgs): MergeDriverOutcome {
  const label = args.path ?? "record";

  const plain = gitMergeFile({
    basePath: args.basePath,
    oursPath: args.oursPath,
    theirsPath: args.theirsPath,
    markerSize: args.markerSize,
    label,
  });

  // Git could not merge at all (no binary, unreadable temp file). Leave
  // ours untouched and let git treat it as a conflict — the one case where
  // we must not write, because we have nothing to write.
  if (!plain.ok) {
    return { status: "conflict", reason: "git merge-file could not run" };
  }

  if (plain.conflicts === 0) {
    writeFileSync(args.oursPath, plain.text, "utf-8");
    return { status: "clean" };
  }

  // Conflicted. From here, every bail-out writes git's conflicted text and
  // reports why docdog stayed out of it.
  const conflict = (reason: string): MergeDriverOutcome => {
    writeFileSync(args.oursPath, plain.text, "utf-8");
    return { status: "conflict", reason };
  };

  const base = readFileSync(args.basePath, "utf-8");
  const ours = readFileSync(args.oursPath, "utf-8");
  const theirs = readFileSync(args.theirsPath, "utf-8");

  let blocks: { base: RelationshipsBlock; ours: RelationshipsBlock; theirs: RelationshipsBlock };
  try {
    const parsed = {
      base: readRelationshipsBlock(base),
      ours: readRelationshipsBlock(ours),
      theirs: readRelationshipsBlock(theirs),
    };
    if (!parsed.base || !parsed.ours || !parsed.theirs) {
      return conflict("a side has no frontmatter block");
    }
    blocks = parsed as typeof blocks;
  } catch (err) {
    // Malformed frontmatter on any side: conflict, falling back to the
    // plain text-merge output (§3).
    const detail = err instanceof FrontmatterPatchError ? err.message : String(err);
    return conflict(`frontmatter does not parse on one side — ${detail}`);
  }

  // Is the conflict confined to the edge list? Ask git, by asking it to
  // merge the same three files with the block replaced by one identical
  // line on each side.
  const rest = mergeWithoutRelationships(args, base, ours, theirs, label);
  if (!rest) {
    return conflict("the conflict is outside the relationships: block");
  }

  const merged = mergeRelationships(
    blocks.base.entries.map((e) => e.entry),
    blocks.ours.entries.map((e) => e.entry),
    blocks.theirs.entries.map((e) => e.entry),
  );
  if (!merged.ok) {
    return conflict(merged.reason);
  }

  // Replay: ours' surviving entries as the exact lines they already are,
  // theirs' edits re-serialized, theirs' additions appended.
  const { actions, append } = merged.plan;
  const kept: string[] = [];
  let dropped = 0;
  let updated = 0;
  blocks.ours.entries.forEach((source, i) => {
    const action = actions[i];
    if (action.kind === "drop") {
      dropped++;
      return;
    }
    if (action.kind === "replace") {
      updated++;
      kept.push(...serializeRelationshipEntry(action.entry));
      return;
    }
    kept.push(...source.lines);
  });

  const blockLines =
    kept.length > 0 ? ["relationships:", ...blocks.ours.preamble, ...kept] : [];

  let text: string;
  try {
    text = replaceSentinel(rest, blockLines);
    for (const entry of append) {
      text = appendRelationship(text, entry);
    }
  } catch (err) {
    return conflict(
      `could not rebuild the relationships block — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  writeFileSync(args.oursPath, text, "utf-8");
  return { status: "merged", appended: append.length, dropped, updated };
}

/**
 * The three-way text merge of everything *but* the edge list: each side's
 * `relationships:` block is swapped for the same sentinel line, so the
 * region is identical on all three and git merges it as untouched. A
 * conflict here is a conflict git would have had regardless of edges.
 *
 * Returns the merged text (containing exactly one sentinel line), or null
 * when it conflicts — or when the sentinel does not survive intact, which
 * would mean the merge moved lines in a way this reconstruction cannot
 * account for.
 */
function mergeWithoutRelationships(
  args: MergeDriverArgs,
  base: string,
  ours: string,
  theirs: string,
  label: string,
): string | null {
  const dir = mkdtempSync(join(tmpdir(), "docdog-merge-"));
  try {
    const write = (name: string, raw: string): string => {
      const path = join(dir, name);
      writeFileSync(path, spliceRelationshipsBlock(raw, [SENTINEL]), "utf-8");
      return path;
    };
    const result = gitMergeFile({
      basePath: write("base", base),
      oursPath: write("ours", ours),
      theirsPath: write("theirs", theirs),
      markerSize: args.markerSize,
      label,
    });
    if (!result.ok || result.conflicts !== 0) return null;
    const sentinels = result.text.split(/\r\n|\n/).filter((l) => l === SENTINEL).length;
    return sentinels === 1 ? result.text : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Put the merged block back where the sentinel stands, preserving the text's line endings. */
function replaceSentinel(text: string, blockLines: string[]): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r\n|\n/);
  const at = lines.indexOf(SENTINEL);
  if (at === -1) throw new Error("merge sentinel vanished");
  lines.splice(at, 1, ...blockLines);
  return lines.join(eol);
}

export function registerMergeDriverCommand(program: Command): void {
  program
    .command("merge-driver <base> <ours> <theirs> [marker-size] [path]")
    .description("Git merge driver for the relationships: block (plumbing — git invokes this, not you)")
    .action((base: string, ours: string, theirs: string, markerSize?: string, path?: string) => {
      const size = markerSize ? Number.parseInt(markerSize, 10) : undefined;
      const outcome = runMergeDriver({
        basePath: base,
        oursPath: ours,
        theirsPath: theirs,
        markerSize: Number.isFinite(size) ? size : undefined,
        path,
      });

      // stderr, always: git owns stdout during a merge.
      if (outcome.status === "merged") {
        const parts = [`${outcome.appended} edge(s) unioned in`];
        if (outcome.updated) parts.push(`${outcome.updated} updated`);
        if (outcome.dropped) parts.push(`${outcome.dropped} dropped`);
        console.error(`docdog: ${path ?? "record"} — ${parts.join(", ")}`);
      } else if (outcome.status === "conflict") {
        console.error(`docdog: ${path ?? "record"} — conflict left for you: ${outcome.reason}`);
        process.exitCode = 1;
        return;
      }
    });
}
