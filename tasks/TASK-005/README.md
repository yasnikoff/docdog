---
id: TASK-005
title: "FEATURE-002 batch 1/3 — guidance surfaces + repo hygiene"
collection: tasks
status: done
date: 2026-07-11
commit_hash: b19a96b
description: "Delete the v1-era docs/ folder (21 tracked files) and the two v1 slash commands from tracking, rewrite .claude/CLAUDE.md's historical-docs block, untrack and gitignore .idea/, and fix the dead CLI commands still instructed by WF-002 (relations list / collections describe / docdog_concepts_search) and WF-003 (collections check). docs/discussion.md stays on disk untracked per DD-071."
artifacts_path: tasks/TASK-005/
relationships:
  - part_of: FEATURE-002
  - follows_workflow: WF-003
  - references: DD-071
    context: the publication boundary this batch enforces — tracked v1 docs and IDE config must not reach the fresh public cut
  - references: WF-002
    context: target — its step-2 tool list offers three surfaces that died at v3 step 6
  - references: WF-003
    context: target — its step-5 verification gate names a deleted command
  - references: DD-070
    context: the conformance target of the guidance rewrite — WF-002/WF-003 must name only §4 CLI commands and kernel-8 MCP tools, the dead commands being the drift this batch corrects
---

# TASK-005: Batch 1/3 — guidance surfaces + repo hygiene

## Goal

Every surface an agent reads for *current* guidance stops
referencing v1/v2 artifacts, and the tracked tree stops carrying v1
material that DD-071's fresh cut would publish.

## Acceptance criteria

- [x] `git ls-files docs/` empty; `docs/discussion.md` present on
      disk and still ignored (`git check-ignore` positive).
- [x] `.claude/commands/` contains no design.md / discuss.md.
- [x] `.claude/CLAUDE.md` documentation-layout section states the
      v1 docs were removed from tracking with git history as the
      archive.
- [x] `git ls-files .idea/` empty; `.gitignore` covers `.idea/`.
      (`.tmp-ddmeta/` session scratch gitignored in the same pass
      after `git add -A` nearly committed it.)
- [x] WF-002/WF-003 name only DD-070 §4 CLI commands and kernel-8
      MCP tools.
- [x] `docdog index` zero net-new warnings (2 vertices reindexed,
      12 edges).
