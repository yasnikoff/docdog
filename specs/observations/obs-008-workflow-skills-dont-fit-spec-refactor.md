---
id: OBS-008
title: "Shipped code-loop skills are an uncaptured workflow — they don't fit WF-003 because they aren't WF-003's skills"
collection: observations
status: current
date: 2026-04-13
description: "Phase 3 of the workflow dogfood ran TASK-001 (EJ-001..008 → DD-037..044 mirror) through the shipped `.docdog/skills/*.md` loop. Initial diagnosis: 'code-loop skills don't fit WF-003.' Corrected after DISC-012: the code-loop skills aren't WF-003's skills at all — they implement an uncaptured code-change workflow that violates DD-036 by never being promoted to a WF-NNN artifact. The real fix is two workflow captures (one for the code-loop, one for WF-003's corpus batch rewrite) with matching skill clusters."
relationships:
  - references: WF-003
  - references: TASK-001
  - references: FEATURE-001
  - references: DD-036
  - references: FRICTION-012
  - references: DISC-012
    context: "DISC-012 reframed the diagnosis from 'skill mismatch' to 'uncaptured workflow' and resolved the batch-2 unblocker"
  - references: PROPOSAL-017
    context: executed its batch 1 — EJ-001..008 mirrored to DD-037..044
  - references: EJ-001
    context: start of the mirrored batch range
  - references: EJ-008
    context: end of the mirrored batch range; EJ-008→DD-044 doc-comment swap in code
  - references: DD-037
    context: first mirror of the batch; retrieval spot-check hit at vector 0.717
  - references: DD-044
    context: last mirror of the batch
  - references: DD-034
    context: the fidelity criterion for the mirror review — did each DD mirror respect DD-034
  - references: WF-001
    context: template-shipped workflow inventory (WF-001/002/003) contrasted with the unnamed skill cluster
  - references: WF-004
    context: recommends capturing the code-loop skill cluster as WF-004
  - references: DP-001
    context: frontmatter-driven skill selection judged DP-001-clean — no inference
  - references: WF-002
    context: dual-track dogfooding applied to the batch run
  - references: DD-043
    context: retrieval spot-check hit at vector 0.708
  - references: EJ-004
    context: EJ-004→DD-040 doc-comment reference swap in code
  - references: DD-040
    context: target of the doc-comment reference swap
  - references: OBS-007
    context: phase predecessor — OBS-007 covers Phases 0–2, this is the Phase 3 continuation
---

# OBS-008: Shipped code-loop skills are an uncaptured workflow

## Context

Phase 3 of the workflow-template dogfooding exercise on the
self-hosted repo executed batch 1 of PROPOSAL-017 — mirror
EJ-001..EJ-008 as DD-037..DD-044, flip sources to `superseded`,
migrate inbound references. TASK-001 was the driver; WF-003 was
the workflow; the shipped `.docdog/skills/` code-loop skills
(`start-task`, `architect`, `coder`, `reviewer`, `finalize-task`)
were the harness the user asked me to apply as written.

## The reframe (DISC-012)

My initial diagnosis was: *"the code-loop skills don't fit WF-003;
we need a WF-003-specific variant."* DISC-012 corrected this. The
shipped skills aren't "WF-003's skills with a bad fit" — they
**implement an uncaptured code-change workflow that was never
promoted to a WF-NNN artifact**. No skill in `.docdog/skills/`
carries a `follows_workflow:` edge back to any workflow record.
The code-loop is a real, repeatable process (survey → design →
implement → review → finalize) living only in skill prose, which
is exactly the pattern DD-036 says is wrong:

> DD-036: repeatable agent-facing processes live as first-class
> workflow artifacts, not as prose buried in skills or CLAUDE.md.

The code-loop hasn't escaped that pattern — it's just that the
escape was never enforced on the shipped template.

The body below preserves the per-skill friction catalog from the
original draft (it's useful data on *what specifically doesn't
translate*) but the recommendation section at the bottom has been
rewritten to match the DISC-012 reframe.

## The mismatch, per skill

### `start-task`

Worked in principle — but TASK-001 was pre-seeded in Phase 2. The
skill's main value is *next-id generation + context discovery at
the start of a new task*. Neither was needed here: the id was
given, the context was the target-set list in the README. The
skill is a no-op for a pre-seeded task, which is fine, but it also
means the "run the skill first" instruction is cosmetic in
WF-003's batch shape.

### `architect`

**Does not apply.** The skill is explicitly "design-first — output
is rationale and decisions, not code." A batch rewrite has no
architectural choice to make — the transform was frozen in
PROPOSAL-017 and FEATURE-001. Asking the architect skill to do
anything produces either (a) an empty architecture.md or (b) a
restatement of the frozen plan, neither of which is useful.

The right answer is to **skip the architect skill entirely** for
WF-003-shaped tasks. That's fine in isolation, but "skip the
architect skill" isn't documented anywhere in the template — a
vanilla agent picking up TASK-001 cold would reasonably invoke
`architect` first and waste a pass.

### `coder`

**Mismatched vocabulary.** The skill's steps are:

1. Survey guidelines and patterns (for code).
2. Find existing code patterns.
3. Implement.
4. Document non-obvious choices in `implementation.md`.
5. Record working notes.

For a spec refactor, step 1 *is* useful if you substitute
"decisions" for "guidelines" — the skill's `docdog_search` call
would pull up the DD-034 framing and PROPOSAL-017 itself. Step 2
is a no-op (no code patterns). Step 3 is "edit N markdown files
to produce N mirror files," which has nothing in common with
"implement a feature." Step 4's `implementation.md` is a
code-review document, not appropriate for a batch-diff review.

The skill can be *mentally translated* to spec work
("implementation = transform execution, non-obvious choices =
reframe judgments"), but the mental translation is doing all the
load-bearing work. The skill itself adds nothing beyond "search
for context first" — which WF-003 already prescribes in step 5.

### `reviewer`

**Partially applies.** The review rubric (against guidelines /
constraints / decisions / principles) is code-oriented, but the
notion of a systematic pass against *decisions* maps cleanly onto
a batch-rewrite review: did each DD mirror respect DD-034? Does
the reframe preserve the source's semantics? Are inbound
references migrated only where "doing so preserves historical
meaning"?

The skill would need a variant that reads "diff of N spec files"
instead of "code diff from branch", and its output would be a
per-record pass/fail against the transform spec. That's a real
skill waiting to be written — call it `batch-reviewer` or
`transform-reviewer`.

### `finalize-task`

**Partially applies.** Steps 1-3 (identify task, walk `implements`
edges, judge each feature's state) map cleanly. Steps 5-7 (promote
task artifacts, refresh feature matrix, prompt commit) also
survive the translation.

Step 4 (completeness check on touched specs) needs inversion: for
a refactor that *creates* spec records, the question isn't "which
neighbors of the touched spec need updating" — it's "which
inbound references to the superseded record still need migration."
That's a different traversal direction and a different UX.

## What this says about the workflow template

The template ships **three workflow artifacts** (WF-001/002/003)
and **one unnamed skill cluster** (`start-task`, `architect`,
`coder`, `reviewer`, `finalize-task`). The skill cluster has no
workflow id. It does not link to any WF-NNN via
`follows_workflow:`. A task's `follows_workflow` edge currently
has no effect on which skills apply — there is only one cluster,
and a vanilla agent reading `start-task` is told to invoke
`architect` next regardless of what workflow the task follows.

That is a DD-036 violation in the shipped template. DD-036 says
processes are workflow artifacts; the code-loop is a process; the
code-loop is not a workflow artifact. Phase 3 surfaced it by
accident, because WF-003 was the first shipped workflow that
*isn't* the code-loop, and the mismatch made the hidden coupling
visible.

## Recommendation (per DISC-012)

**Two workflow captures, matched to skill clusters:**

1. **Capture the code-loop as WF-004** (or similar — the id is
   mechanical; the point is that the cluster gets a workflow
   record to link to). Retroactively document what
   `architect`/`coder`/`reviewer`/`finalize-task` already
   implement. Add `follows_workflow: WF-004` to each skill's
   frontmatter. No behavior change, just making the implicit
   explicit.
2. **Write a WF-003 skill cluster.** Either a peer set
   (`batch-architect`/`batch-executor`/`batch-reviewer`/
   `batch-finalize`) or a single `batch-rewrite` skill that
   walks the WF-003 step list directly. Each skill carries
   `follows_workflow: WF-003`.

Once both workflows have named skill sets, `start-task` becomes a
lookup rather than a hardcode: read the task's `follows_workflow`
edge, pick the matching skill cluster. No inference, no
workflow-parametric fat skills, DP-001-clean.

## Short-term unblocker for batch 2

Capturing WF-004 + writing a proper WF-003 skill cluster is
bigger than batch 2's critical path. The minimum unblocker is a
small edit to `.docdog/workflows/wf-003-docs-batch-rewrite.md`
(post-DISC-012 rename — the rename landed together with this
observation revision, so the new path is already in effect):

> **Skills note.** This workflow does not use the shipped
> code-loop skills in `.docdog/skills/`
> (`architect`/`coder`/`reviewer`). Those skills implement a
> separate code-change workflow that is currently uncaptured
> (see OBS-008, DISC-012). Follow the numbered steps in this
> document directly. A WF-003-specific skill cluster is a
> follow-up.

That unblocks batch 2 without pretending the underlying gap is
fixed. The proper fix — both workflow captures plus skill-
cluster linkage — remains as follow-up work once batch 2 ships.

## Retrieval during batch 1

Dual-track dogfooding (WF-002) was applied:

- `docdog_get TASK-001` + `wf-003-docs-batch-rewrite.md` gave
  the full brief without manual file-hunting.
- `docdog search "orchestrator specs folder in-place authoring"`
  returned DD-037 at vector=0.717 after indexing — retrieval
  works cleanly on the new records. Same pattern for DD-043 at
  0.708. No tuning needed.
- `docdog collections describe decisions` surfaced the
  status_vocabulary immediately, which is how I caught the
  `retired` / `superseded` collision with TASK-001's AC wording
  (captured as FRICTION-012).
- `docdog collections check` was load-bearing as a stop sign:
  ran once after the mirror+retire step, caught a warning I'd
  introduced (`superseded_by` relation type), fixed, re-ran,
  verified net-new warnings = 0.

The tooling surfaces did their job. The friction was entirely in
the skill layer, not the retrieval layer.

## What I did not do

- Did not write `architecture.md`, `implementation.md`, or
  `review.md` in `tasks/TASK-001/`. The skill-prescribed
  artifacts don't fit the task shape; producing them would have
  been ceremonial.
- Did not run `npm test`. The batch touched `src/engine/indexer.ts`
  and `src/mcp/server.ts` at the doc-comment level only
  (EJ-008→DD-044 and EJ-004→DD-040 reference swaps). No behavior
  change, no test exercised. Rebuilt successfully via `npm run
  build` to confirm the edits compile.
- Did not start batch 2. Hard constraint from the session brief.

## Related

- WF-003 — the workflow this task instantiates.
- DISC-012 — reframed the diagnosis from "skill mismatch" to
  "uncaptured workflow" and picked the rename
  refactor → rewrite.
- FRICTION-012 — concrete mechanical gap (TASK-001 AC wording
  collided with vocabulary) surfaced by the same exercise.
- DD-036 — the decision that made workflows canonical. OBS-008
  extends DD-036's reasoning in one direction: *DD-036 said
  processes are workflow artifacts, but the shipped skill cluster
  was the one process that never got the treatment.* Capturing
  WF-004 closes that gap.
- OBS-007 — Phases 0-2 findings. OBS-008 is the Phase 3
  continuation.
