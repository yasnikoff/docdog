---
id: WF-002
title: "Dual-track dogfooding — use docdog on every non-trivial task and capture what you notice"
collection: workflows
status: current
date: 2026-04-13
description: "The convention that every non-trivial task on the self-hosting repo is done twice — once the normal way (grep, Read, git log) and once via docdog's retrieval surface — with observations captured when something useful or painful happens."
relationships:
  - references: DD-036
    context: "DD-036 made this workflow canonical under .docdog/workflows/; it previously lived as prose in .claude/CLAUDE.md"
  - references: DD-034
    context: "DD-034's artifact-resilience test is the thing this workflow stress-tests in everyday practice"
  - references: OBS-001
    context: "the original failure case that motivated this convention — PROPOSAL-003 shipped without a single docdog search"
  - references: OBS-006
    context: "most recent exercise of this workflow — first-run status_vocabulary playbook"
  - references: PROPOSAL-003
    context: the original failure — shipped without a single docdog search; this workflow closes exactly that gap
  - references: DD-035
    context: observations' specs/ location grandfathered per its split rule
---

# WF-002: Dual-track dogfooding

## Trigger

Any non-trivial task on this repo that touches specs: design,
refactoring, finding prior art, understanding dependencies,
writing a new decision, discussing a tradeoff. Also: reaching a
stopping point on a big session and wanting to benchmark the
end-to-end retrieval experience.

**Not triggered by:** pure execution work (run tests, fix a typo,
rename a variable, apply a small mechanical edit). Reserve
dual-track for tasks where context retrieval actually matters.
The goal is to stress-test the retrieval layer, not to pad every
interaction with ceremony.

## Why

This is a self-hosting project whose value is the retrieval layer
it provides to agents. If the agents building it don't use it, we
won't catch the gaps that block real use. OBS-001 flagged the
original failure: the assistant never once used `docdog search`
during the session that shipped PROPOSAL-003. This workflow closes
that exact gap.

## Steps

1. **Do the task normally.** Read files, grep, whatever works
   fastest. Don't artificially delay.
2. **Also query docdog for the same information.** Use at least
   one of:
   - `docdog search <query>` (CLI)
   - `docdog_search` (MCP tool)
   - `docdog_traverse` (MCP tool — follow edges from a vertex)
   - `docdog_get <id>` (MCP tool — pull a specific record)
   - vocabulary lookups: `docdog_get CONCEPT-RELATION-<TYPE>` /
     `CONCEPT-COLLECTION-<NAME>`, or `docdog_search` scoped to the
     `concepts` collection
3. **Compare the results.** Ask:
   - Did docdog find the same context the normal path found?
   - Did it miss anything grep caught?
   - Did it surface something you wouldn't have found via grep?
   - Did a query that should have worked return nothing, or
     return something unrelated?
4. **Decide whether to capture an observation.** Triggers:
   - Docdog helped beyond what grep/Read would have done.
     Save the token count if you can estimate, or describe the
     specific gap it closed.
   - Friction: a query that should have returned something
     and didn't, or a result that surprised you.
   - A missing feature — log it for the next triage round.
   - Stopping point on a big session — benchmark the
     end-to-end feel.

   **Don't overdocument.** One observation per real learning is
   enough. If nothing notable happened, skip the write. Bulk
   capture dilutes the signal.

## Observation frontmatter

```yaml
---
id: OBS-NNN
title: "<one-line summary>"
collection: observations
status: current
date: YYYY-MM-DD
commit_hash: <full sha of git HEAD at the moment of capture>
description: "<one-sentence summary for search previews>"
relationships:
  - references: <related specs>
---
```

The `commit_hash` pins the observation to the exact tree state it
describes — later readers can `git show <hash>` to see what the
code/specs actually looked like when the note was written. Grab
it with `git rev-parse HEAD` immediately before writing the file.

## ID numbering

OBS-NNN is sequential across the whole project. Find the next
free one via `ls specs/observations/obs-*.md` or
`docdog search "OBS-" | head`.

## Produces

- Zero or one OBS-NNN records per triggering task. Zero is the
  common case and not a failure.
- Observations currently live under `specs/observations/`
  (grandfathered location per DD-035) and may eventually move to
  `.docdog/observations/` as the convention matures.

## Terminal states

- **Observation written:** commit it alongside whatever other
  artifacts the task produced.
- **No observation:** the dual-track exercise happened but
  nothing notable surfaced. That's a valid outcome — move on.

## Notes

- The failure case that birthed this workflow (OBS-001) is worth
  re-reading when you feel the pull to skip the dual-track pass.
  The whole point is that skipping *feels* rational in the
  moment.
- The dual-track habit is the single most load-bearing input
  into docdog's own feature roadmap. Skip it and the roadmap
  starts guessing.
- Per DD-034, a vanilla agent reading an OBS record must be able
  to reconstruct what happened from the frontmatter and body
  alone. Don't leave the substance in the git log.
