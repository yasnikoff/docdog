---
id: PROPOSAL-018
title: "Workflow interpreter primitives — grammar, predicate set, run state collection"
collection: proposals
status: superseded
date: 2026-04-13
related:
  - DISC-013
  - WF-005
  - FRICTION-012
  - DD-034
  - DD-036
  - DP-001
  - PROPOSAL-016
relationships:
  - sourced_from: DISC-013
    context: "items 2-4 of DISC-013's what-needs-to-happen-next list"
  - references: WF-005
    context: "WF-005's informal [gate]/[delegate]/[pause] markers become the formal grammar defined here"
  - references: DD-036
    context: "extends the workflow artifact contract with a machine-readable layer"
  - references: DD-034
    context: "run state is deliberately kept out of task frontmatter to preserve artifact-as-spec"
  - references: DP-001
    context: "every primitive is tier-1 mechanics — literal dispatch, named predicates, no inference"
  - references: FRICTION-012
    context: "the AC-ticked-before-promote gate that would have prevented this friction is the driving example"
  - references: PROPOSAL-016
    context: "builds on workflow-template primitives (status_vocabulary, relation types, workflow template extensions)"
description: "Define a minimum-viable workflow interpreter for docdog. Three primitives in a parse-able prose grammar — [gate:<predicate>] / [delegate:<source>] / [pause:<question-id>] — evaluated linearly step-by-step. Six shipped predicates cover WF-005's usage sites; a custom-predicate extension mechanism is deliberately deferred until dogfood shows the shipped set is insufficient. Run state lives in a new dd_task_runs collection, not on task frontmatter, so task artifacts stay specs rather than execution logs. One new CLI subcommand tree (`docdog workflow step/status/check`) on top of one library entry point — no daemon, no runtime. Retrofits WF-005's informal markers to the new grammar as the first dogfood."
---

# PROPOSAL-018: Workflow interpreter primitives

**Superseded 2026-07-06 by DD-070** — the workflow interpreter is removed in v3 (DD-066 reaffirmed and enforced). Workflow documents stay; the executable machinery goes.

## Motivation

DISC-013 captured the reframe: docdog needs a small machine-readable
layer on top of its prose workflow artifacts. WF-005 (task lifecycle)
shipped as prose with three informal marker keywords inline — `[gate]`,
`[delegate]`, `[pause]` — specifically so the primitives this proposal
defines would have five concrete load-bearing usage sites to point at.

Without the primitives, WF-005's gates are agent discipline. That
is exactly how FRICTION-012 happened: TASK-001 and TASK-002 shipped
with `status: done` but unticked AC because "verify AC against the
actual corpus" lived only in the agent's head. A gate the interpreter
evaluates before letting status flip is the smallest thing that
removes that failure mode.

Three failure modes DISC-013 named, all fixed by this proposal:

1. **Task lifecycle steps get skipped because no step is programmatic.**
   → `[gate:<predicate>]` evaluates a named condition before the next
   step runs.
2. **Workflow composition gets inlined because there's no dispatch
   primitive.**
   → `[delegate:<source>]` runs another workflow and returns.
3. **HITL breakpoints get skipped or over-triggered because pauses
   aren't machine-readable.**
   → `[pause:<question-id>]` stops for user input; auto-accept uses
   an inline default declared in the workflow file — no fallback, no
   heuristic, no inference.

DP-001 is the constant. Every primitive dispatches by literal data:
predicate names from a shipped set or literally registered in the
workflow file, workflow ids from frontmatter or literal markers,
question defaults inlined next to the question. If the interpreter
cannot find a literal match, it errors. It never guesses.

## Specification

### 1. Grammar

Workflow bodies stay authoritative for humans. The interpreter parses
them as markdown with a small, deliberate grammar. No frontmatter
duplication — the prose is the single source of truth.

**Step block.** Under a `## Steps` header, each numbered list item
(line matching `^\d+\.\s`) is one step. The step's first line is its
title; markers attach to that line.

**Marker syntax.** Zero or more bracketed markers after the title,
each matching `\[(gate|delegate|pause):([^\]]+)\]`. Example:

```markdown
## Steps

1. **Seed the task record.**
   Write the task file per the task-frontmatter contract.
   ...

2. **Start the task.** [gate:status_equals:planned]
   Flip `status: planned` → `in_progress`, reindex.

3. **Discover context.**
   Read what the inside workflow tells you to read.

4. **Execute the inside workflow.** [delegate:frontmatter:follows_workflow]
   Return here when the inside workflow reaches its terminal state.

5. **Verify acceptance criteria.** [gate:ac_all_checked]
   Walk the checklist and tick boxes. ...

6. **HITL review.** [pause:promote_confirm]
   Stop and ask the user before promoting the task.

7. **Promote.** [gate:ac_all_checked]
   Flip `status: in_progress` → `done`, stamp commit_hash.
```

**Parsing rules.**

- A step with no markers runs straight through as agent work (the
  interpreter records that step N was reached and calls back for the
  step body).
- Multiple markers on one step evaluate **left to right**, and each
  must pass/complete before the next is considered.
- Steps with `[gate:...]` markers are evaluated before the step body
  runs. If a gate fails, the interpreter halts the run and records the
  failure in `dd_task_runs`.
- A step with `[delegate:...]` runs the resolved workflow recursively
  under the same task context, then continues with the next step here
  on terminal state.
- A step with `[pause:<id>]` halts until the pause is answered (or an
  inline default is applied under auto-accept).
- Any marker the parser cannot recognize is a hard error at parse
  time, not a silent skip. This is the single "mechanical failure
  mode" DP-001 requires.

**Lint.** A new `docdog workflow check` CLI command parses every
workflow file and reports:

- Unknown marker kinds.
- Predicate names not in the shipped six.
- `[pause:<id>]` whose id isn't declared in the workflow's `pauses:`
  frontmatter block.
- `[pause:<id>]` whose declared `answers:` enum is missing or
  inconsistent with the gates that read `pause_answered:<id>:<v>`.
- `[delegate:frontmatter:<field>]` whose field isn't in the task
  frontmatter contract (warns, doesn't error — the field may be
  optional).

`workflow check` is the mechanical analog of `collections check`.

### 2. Shipped predicates

A fixed, small set. Every predicate is literal dispatch over task or
corpus state. No fuzzy matching, no natural-language parsing.

| Predicate | Evaluates |
|---|---|
| `status_equals:<value>` | Task's `status` field equals literal `<value>`. |
| `status_in:<v1,v2,...>` | Task's `status` is in the comma-separated literal set. |
| `ac_all_checked` | Task body's acceptance-criteria checklist has zero `- [ ]` remaining (only `- [x]`). |
| `relation_exists:<type>:<target>` | Task has an outbound edge of `<type>` pointing at `<target>`. `<target>` may be literal (`DD-069`) or `frontmatter:<field>` (read from task frontmatter). |
| `consistency_check_clean` | `runConsistencyCheck(config)` returns zero warnings. |
| `commit_hash_set` | Task's `commit_hash` frontmatter field is non-null. |

Six predicates. Between them they cover every `[gate]` usage site in
WF-005 plus the obvious promotion gates WF-003 / WF-004 would want
when they're retrofitted. Adding a seventh is a one-line change to a
shipped registry (`SHIPPED_PREDICATES` in `src/workflow/predicates.ts`)
and must come with a test.

**Custom predicates are deferred.** An earlier draft of this
proposal defined a workflow-local `predicates:` block that let a
workflow register literal AQL / shell / regex predicates in its own
frontmatter. That mechanism is cut from this scope: the shipped six
cover WF-005 entirely and the obvious retrofit gates for WF-003 /
WF-004, so there's no dogfood evidence that a custom mechanism is
needed yet. Shipping it now would be designing for a hypothetical
future requirement, which is exactly the anti-pattern the project
CLAUDE.md warns against.

When dogfood *does* surface a gate the shipped set can't express,
that observation opens a new discussion which either (a) promotes
the predicate into the shipped set (one-line change) or (b) designs
the custom-predicate extension mechanism against a concrete failing
example. Either path is a better starting point than a speculative
extension surface shipped now.

Until then: **if a workflow gate names a predicate that isn't in
the shipped set of six, the interpreter errors at parse time.** No
fallback. No silent skip. No inference. The error message names
the predicate and points at the workflow file.

### 3. Delegation resolution

`[delegate:<source>]` accepts two source forms:

| Source form | Meaning |
|---|---|
| `WF-NNN` | Run the literal workflow. Used when the outer workflow statically knows the inside workflow. |
| `frontmatter:<field>` | Read `<field>` from the task frontmatter. The field value must be a literal workflow id. |

That's it. No `select-best-match`, no default fallback chain, no
"if missing, run this other thing." Missing `frontmatter:<field>` is
a run-time error; the fix is always either to populate the field on
the task or to use the literal form.

**Recursion.** Delegation is recursive. The interpreter maintains a
delegation stack in `dd_task_runs`; when the inside workflow hits its
terminal state, the stack pops and execution resumes at the next step
in the outer workflow. A maximum stack depth (default 8) prevents
accidental infinite recursion; workflows that need deeper nesting
configure it in the outermost workflow's frontmatter.

### 4. Pause primitive and auto-accept

`[pause:<question-id>]` references a pause declared in the workflow's
frontmatter:

```yaml
pauses:
  - id: promote_confirm
    question: "All AC verified. Promote task to done?"
    default: accept             # optional — see below

  - id: apply_plan_revision
    question: "Batch 1 surfaced FRICTION-NNN. Apply the fix to remaining batches?"
    # no default — auto-accept mode errors here
```

**Auto-accept semantics.** The interpreter accepts a mode flag
(`--auto-accept` on the CLI, or a field on the run record). Under
auto-accept:

- If the pause declares an inline `default`, the interpreter records
  that default as the answer and continues.
- If the pause declares no default, the interpreter halts with
  `pause_no_default_under_auto_accept` and the run enters `blocked`
  state. The pause has to be answered interactively, by a human or by
  a caller that explicitly supplies an answer.

There is no other mode. No "pick the first valid option," no "use the
last answer from a prior run," no "infer from the question text." The
DP-001 constraint from DISC-013 is encoded in the interpreter: under
auto-accept, missing-default → halt.

**Answers are literal and enum-validated.** A pause answer is a
string. The `pauses:` declaration can name an `answers:` enum that
the interpreter validates against; any answer outside the enum is
rejected the same way an unregistered predicate is:

```yaml
pauses:
  - id: promote_confirm
    question: "All AC verified. Promote task to done?"
    answers: [accept, defer]
    default: accept
```

The validation is literal set-membership — no fuzzy matching, no
case folding beyond what the author declares. An enum is optional;
omitting it means "any string answer is recorded verbatim." When
present, the interpreter rejects non-enum answers with
`pause_answer_not_in_enum` and the run stays paused.

Answers are exposed to subsequent gates via a run-state predicate
family, `pause_answered:<id>:<literal-value>` (e.g.
`pause_answered:promote_confirm:accept`). It is not a seventh
"shipped predicate" in the sense of §2 — the six there check
corpus state (frontmatter fields, AC boxes, edges, the consistency
check). `pause_answered` checks *this run's* state and its domain
is fully determined by the declared pause ids, so it's part of
the interpreter's run-machinery rather than an extensible
predicate kind. Either way: literal dispatch, tier-1 mechanics.

### 5. Run state — `dd_task_runs` collection

**Schema** (document collection, not a vertex collection — runs are
machinery, not part of the spec graph):

```ts
interface TaskRun {
  _key: string;                    // `${task_id}:${attempt}` e.g. "TASK-005:1"
  task_id: string;                 // "TASK-005"
  workflow_id: string;             // "WF-005" (outermost)
  started_at: string;              // ISO
  terminal_at: string | null;
  terminal_state: "done" | "blocked" | "abandoned" | null;

  current_step: number | null;     // null when terminal
  delegation_stack: Array<{
    workflow_id: string;
    step: number;
  }>;

  pause_answers: Array<{
    step: number;
    workflow_id: string;
    question_id: string;
    answer: string;
    answered_at: string;
    auto_accepted: boolean;
  }>;

  gate_failures: Array<{
    step: number;
    workflow_id: string;
    predicate: string;
    reason: string;
    at: string;
  }>;
}
```

**Why a collection, not task frontmatter.** The pushback that landed
in DISC-013 item 3: the task artifact is a *spec* — what the task
is, its acceptance criteria, its links. The run is *machinery* —
where an agent got to, which pauses it answered. Putting machinery
in the spec is the conflation the corpus-pollution concern surfaces.

Concretely: if `current_step` lived on task frontmatter, every step
transition would mutate the spec file, and `git log` on `specs/tasks/`
would become a log of workflow execution rather than a log of task
authorship. That's the wrong signal to have in version control. Run
state goes in the database; task frontmatter stays a spec.

**What DD-034 still sees.** A vanilla agent opening a task file sees
`status: in_progress`, the AC checklist (possibly partially ticked),
and the `follows_workflow:` edge. Those are enough to answer
"what is this task, and what does done mean?" The run position
("paused at step 5 of WF-005 waiting on `promote_confirm`") is
operational context, visible via `docdog workflow status TASK-NNN`
when docdog is available. It is deliberately not in the file.

**Registration.** `dd_task_runs` is added to
`INFRA_DOCUMENT_COLLECTIONS` in `src/arango/collections.ts`. It's
infrastructure, not a vertex collection — not scanned by the indexer,
not queried by content search, not subject to soft-delete / gc the
same way specs are.

**Gc.** Run records past terminal state older than
`gc.run_ttl_days` (default 90) are hard-deleted by `docdog gc`. The
flag is additive to the existing gc config schema.

### 6. Interpreter library + one CLI command

The interpreter is a library, not a daemon. Agents call into it
step-by-step; the library returns either "next action is X" or "run
terminated with state Y."

**Library entry points** (`src/workflow/interpreter.ts`):

```ts
export async function startRun(opts: {
  config: DocdogConfig;
  taskId: string;
  workflowId?: string;      // default: read from task frontmatter, else WF-005
  autoAccept?: boolean;
}): Promise<RunHandle>;

export async function stepRun(opts: {
  config: DocdogConfig;
  runKey: string;
  answer?: string;          // provided when the previous step returned a pause
}): Promise<StepResult>;
```

`StepResult` is a discriminated union:

```ts
type StepResult =
  | { kind: "run_step_body"; workflowId: string; step: number; title: string; body: string }
  | { kind: "paused"; pauseId: string; question: string; defaultAnswer: string | null }
  | { kind: "gate_failed"; step: number; predicate: string; reason: string }
  | { kind: "delegated"; innerWorkflowId: string; depth: number }
  | { kind: "terminal"; state: "done" | "blocked" | "abandoned" };
```

The agent loop calls `stepRun` in a loop. On `run_step_body` it
executes the prose, then calls `stepRun` again to advance. On
`paused`, it shows the question (or records the default under
auto-accept), then calls `stepRun` with the answer. On `gate_failed`
it surfaces the failure to the user and does not advance.

**CLI command** (`docdog workflow` subcommand tree):

```
docdog workflow step <task-id>   [--answer <text>] [--auto-accept]
docdog workflow status <task-id>
docdog workflow check            # lint all workflow files
```

`step` is the only command that advances a run. `status` is read-only
introspection (current step, delegation stack, answered pauses).
`check` is lint.

No `docdog workflow run` that executes a task end-to-end without an
agent in the loop — that would require the interpreter to *decide*
when a step body is complete, which is work only the agent can judge.
Execution stays agent-driven; the interpreter just gates and
delegates around it.

### 7. WF-005 retrofit

Step 1 of the landing pass: rewrite WF-005's informal markers to the
formal grammar defined in §1. Concrete before/after on WF-005's
current step 2 (`Start the task`):

**Before** (pre-engine prose):
```markdown
2. **Start the task.** Flip `status: planned` → `in_progress`, reindex.

   `[gate]` The previous status was `planned`. Starting a task in any
   other state is a mistake unless...
```

**After** (grammar-compliant):
```markdown
2. **Start the task.** [gate:status_equals:planned]
   Flip `status: planned` → `in_progress`, reindex.
```

All five marker sites in WF-005 get the same treatment. The
surrounding prose stays — it's still the authoritative explanation
for humans. The brackets just become the interpreter's entry points.

Retrofitting WF-005 is also the first run of `docdog workflow check`.
If lint doesn't come up green on WF-005, the parser spec is wrong —
that's the fastest feedback loop for the grammar.

### 8. DP-001 compliance walkthrough

Every primitive against the three DP-001 tiers:

| Primitive | Tier 1 (pure mechanics) | Tier 2 (defaults + override) | Tier 3 (inference — forbidden) |
|---|---|---|---|
| Step parsing | ✅ regex over markdown | — | — |
| `[gate]` shipped predicates | ✅ literal dispatch over closed set of 6 | — | — |
| `[delegate:WF-NNN]` | ✅ literal lookup | — | — |
| `[delegate:frontmatter:<field>]` | ✅ literal field read | — | — |
| `[pause]` interactive | ✅ display question, read answer | — | — |
| `[pause]` answer validation | ✅ literal enum match | — | — |
| `[pause]` auto-accept with default | ✅ record literal default | — | — |
| `[pause]` auto-accept without default | ✅ halt (literal error condition) | — | — |

There is no tier-2 column. The interpreter has no defaults. Either
the workflow file specifies the behavior literally or the interpreter
errors. This is deliberate — defaults are the surface where judgment
leaks in, and DISC-013's item-4 constraint is the hard line.

### 9. Estimated effort

**Core (`src/workflow/` — new subtree):**
- `parser.ts` — markdown → step list with markers (~120 LOC)
- `predicates.ts` — closed registry of the six shipped predicates +
  the `pause_answered` run-state predicate family + evaluator
  (~110 LOC — smaller than an earlier estimate that included a
  custom-predicate loader, which is deferred)
- `interpreter.ts` — `startRun` / `stepRun` state machine (~200 LOC)
- `runs.ts` — `dd_task_runs` CRUD + gc integration (~100 LOC)
- `types.ts` — shared types (~80 LOC)

**CLI:**
- `src/cli/commands/workflow.ts` — `step` / `status` / `check`
  subcommands (~150 LOC)
- Registration in `src/cli/index.ts` (~10 LOC)

**Arango integration:**
- `dd_task_runs` in `INFRA_DOCUMENT_COLLECTIONS` (~5 LOC)
- Setup step creating the collection (~20 LOC in `src/arango/setup.ts`)
- `run_ttl_days` field on `config.gc` schema (~15 LOC across
  `src/types/config.ts` and `src/config/defaults.ts`)
- Extended `runGc` sweep over `dd_task_runs` (~30 LOC in
  `src/arango/gc.ts`, reusing the edge-sweep refactor from
  FRICTION-013)

**WF-005 retrofit:**
- Rewrite five marker sites in `.docdog/workflows/wf-005-task-lifecycle.md`
  (~30 lines changed)

**Tests:**
- `tests/unit/workflow-parser.test.ts` — grammar + lint edge cases
  (~200 LOC)
- `tests/unit/workflow-predicates.test.ts` — each of the six
  shipped predicates + pause-answered run-state predicate +
  enum-rejection for pause answers (~120 LOC)
- `tests/integration/workflow-interpreter.test.ts` — full run of a
  synthetic 3-step workflow against real Arango, including delegation
  and paused/resumed states (~250 LOC)
- `tests/unit/workflow-cli.test.ts` — `check` / `status` output
  shapes (~80 LOC)

**Total:** ~1,050 LOC core + ~650 LOC tests. Medium-large. Larger
than PROPOSAL-016 because it's introducing a new subsystem, but
tightly scoped — no runtime, no daemon, no scheduler, no extension
mechanism beyond what's needed to run WF-005.

### 10. Not in scope

- **No loops, conditionals, parallel steps.** Execution is strictly
  linear. Workflows that want branching break the work into separate
  workflows and delegate.
- **No retries.** A failed gate halts the run; the fix is always to
  change state (tick the box, update status, land the commit) and
  re-run `docdog workflow step`.
- **No event-driven triggers.** The interpreter runs only when
  `docdog workflow step` is called.
- **No workflow versioning.** Workflows are edited in place. Runs
  in flight against a workflow that changes mid-run error on next
  step with `workflow_modified_since_run_started` — the fix is to
  restart the run.
- **No cross-task coordination.** A task's run is isolated. Gates
  cannot reference other tasks' state beyond the `relation_exists`
  predicate (which already does exactly that, literally).
- **No daemon / background mode.** Interpreter is a library. Agents
  call it step by step.
- **No retroactive retrofit of WF-003 / WF-004.** Out of scope here;
  WF-005 alone is the dogfood surface. Retrofit of the other two
  becomes a follow-up FEATURE once the grammar is proven.
- **No auto-execution of step bodies.** Step bodies are agent work.
  The interpreter signals *which* step body runs next; it doesn't
  execute the body itself.
- **No custom predicates per workflow.** Deferred. An earlier draft
  of this proposal defined a `predicates:` frontmatter block for
  literal AQL / shell / regex predicates scoped to a single workflow.
  That mechanism is cut from the scope of this proposal because (a)
  the six shipped predicates cover WF-005 and the obvious retrofit
  gates for WF-003 / WF-004, (b) there is no dogfood example of a
  gate the shipped set can't express, and (c) shipping a speculative
  extension surface is the anti-pattern the project CLAUDE.md warns
  against. When dogfood does surface such a gate, the observation
  opens a new discussion that either promotes the predicate into
  the shipped set (one-line change) or designs the extension against
  a concrete failing example. Until then, an unregistered predicate
  name in a workflow file is a hard parse-time error.

### 11. Dependencies

- **Soft dep on PROPOSAL-016** (shipped) — `follows_workflow`
  relation type already exists; `status_vocabulary` already defines
  the literal values that `status_equals` / `status_in` predicates
  check against.
- **Soft dep on FRICTION-013 fix** (landed this session) — `runGc`
  now sweeps edge collections, so extending it to sweep
  `dd_task_runs` is a one-line addition to the sweep list.
- **Soft dep on DD-049** (shipped) — soft-delete + gc model applies
  to runs the same way it applies to vertices.
- **Blocks:** WF-003 / WF-004 retrofit, any future HITL workflow,
  the auto-accept mode discussed in DISC-013, PROPOSAL-017-shaped
  rewrites that want gate-on-AC-ticked.

### 12. Implementation order

Three commits, each independently reviewable:

1. **Parser + predicates + unit tests.** Lands the grammar, the
   shipped predicate registry, and `docdog workflow check`. No
   runtime state yet. Passes lint against WF-005 with the markers
   retrofitted in this same commit.
2. **`dd_task_runs` collection + interpreter library + integration
   tests.** Lands `startRun` / `stepRun`, the run state collection,
   the setup step that creates it, gc extension, and the integration
   test that runs a synthetic workflow end-to-end with a pause and a
   delegation.
3. **CLI subcommands + status / step commands.** Lands the user-
   facing surface. Last because it depends on the interpreter
   library.

Splitting into three keeps each commit under ~500 LOC and each pass
reviewable. Can be collapsed to two if diffs stay tight.

## Resolved design decisions

These were the four open questions in an earlier draft. All
resolved during the proposal-review pass:

1. **Compound `relation_exists` targets — no.**
   `relation_exists:implements:[FEATURE-001,FEATURE-002]` is not
   supported. A gate that needs to check multiple targets writes
   multiple `[gate:relation_exists:...]` markers on the same step,
   which is literal and unambiguous. When a gate needs the *OR* of
   several targets, that's a case for a future custom predicate —
   see the deferred extension under §10.
2. **Pause answer enum validation — yes.** `pauses:` accepts an
   optional `answers:` enum that the interpreter validates against
   via literal set-membership. Specified in §4 above; small, literal,
   DP-001 clean. Omitting the enum means any string answer is
   recorded verbatim.
3. **`workflow status` output format — text + JSON.** Default is
   human-readable text; `--json` flag emits a machine-readable
   object for agent loops. Both land in the same commit.
4. **`in_progress → blocked` transition — dogfood decides.** This
   proposal does not pin down which halted gates flip the run state
   to `blocked` versus leaving it `in_progress` with a recorded
   halt. The first WF-005 run under the interpreter will produce a
   concrete example; that example becomes the rule. Until then, all
   halted gates leave the run `in_progress` with a recorded failure,
   and the agent decides whether to also flip task status to
   `blocked` by hand.

## Status

Proposed. No remaining open design questions — ready for
implementation once the user signs off on scope.
