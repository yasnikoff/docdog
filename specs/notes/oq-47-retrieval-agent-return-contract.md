---
id: OQ-47
title: "What does a retrieval subagent hand back? Quoted spans under a checkable grammar — and the token bar was measured against the wrong baseline"
collection: questions
status: resolved
date: 2026-07-16
description: "RESOLVED — the contract is FOUND / SEARCHED / CONSIDERED / SYNTHESIS, where every load-bearing claim carries a quote rather than a bare id. The three requirements only fought each other because requirement 1 imported OBS-010's retrieval benchmark (143 tokens per search) into a subagent-value frame; measured against the investigation a sub actually replaces (~4,000 tokens), the budget has a ~20x margin and citations become affordable. A quote fuses citation and content, fails loudly, and needs no docdog change."
relationships:
  - references: PROPOSAL-036
    context: "the proposal that deferred this and the section that carries the answer — its navigate-specs suggestion currently ships only the floor (ids, one line each, name the misses), and this contract is what should replace it, reaching adopters via skill install --force"
  - discussed_in: DISC-031
    context: "the discussion that surfaced it — the host survey resolved portability and the OBS-014 rule resolved scope, leaving the contract as the only genuinely undesigned piece"
  - references: OBS-014
    context: "supplies both halves — its validator lesson (every accepted edge must be in the scanner's candidate set, else an agent invented one) is why citation is structural rather than advisory, and its central-reconciliation rule is the worked example this contract was measured against"
  - references: OBS-013
    context: "cited by the original framing as the contract's budget (248 tokens vs 123,551); the resolution finds that number measures retrieval, not subagent value, and the real baseline is the multi-call investigation a sub replaces"
  - references: OBS-010
    context: "the benchmark the original framing mis-transplanted — its ~143 tokens per hybrid answer scores retrieval quality (MRR/Hit@1 over a frozen query set), not the cost of answering a question, and importing it set the bar below the sub's own floor"
  - references: DP-001
    context: "the tier the question turned on, and the constraint that survived the budget correction — a contract that reports is tier 1 relayed, one that ranks or asserts sufficiency is judgment the caller receives as if it were a tool result"
  - references: OBS-011
    context: "the fan-out baseline that bounds any traversal the contract reports — edges are invisible to search and get by construction, and overfetch appears only at traverse depth >= 2 in a small-world graph"
  - references: PROPOSAL-023
    context: "§2 already designs the line-span citation this question considered — 'search can return a section and its file+line span instead of a whole record, saving consumer context' — and shipped the columns while deferring the population; declined here as the citation unit because it is a retrieval improvement to the sub's inputs, not a verification mechanism for its outputs"
  - references: FRICTION-028
    context: "the precedent that rules out line numbers as the anchor — a malformed edge that parsed as well-formed and silently dropped five real ones is the same shape as a coordinate citation, which lands wherever it lands and reads as authoritative rather than reporting that it missed"
  - references: PROPOSAL-035
    context: "the rail whose own logic applies here and cannot be reused — prose is enforced by the model's cooperation, so the write rail moved into the server; the return contract has no such seam, which is why its discipline is a checkable grammar rather than an epistemic label"
---

# OQ-47: The retrieval subagent's return contract

**Resolved 2026-07-16.** The contract is below. The question turned out
to rest on a measurement error, and correcting it dissolved two of the
three tensions it was built around.

## Why this was the question

PROPOSAL-036 settled the easy parts of a spawnable `docdog-retrieval`
agent. Portability was nearly free — MCP makes tool names universal and
four of five hosts take the same markdown file. Scope was settled by
OBS-014's never-write-the-corpus rule. Enforcement moved to the server
(PROPOSAL-035).

What was left is the piece no renderer can paper over: **what does the
sub hand back?** A subagent's entire value is context isolation. If the
return is an essay, the caller reads the essay, and the tokens isolation
was supposed to save get spent anyway — with a hop of latency added for
the privilege. The contract is not packaging around the product. It *is*
the product.

## The measurement error

The original framing said: OBS-010 puts a hybrid answer at ~143 tokens,
OBS-013 at 248 on a real adopted corpus, *that is the bar*, so the
contract's budget is "smaller than the search it wraps — a strange and
demanding place to start."

It is strange because it is wrong. **That number scores retrieval, not
subagent value.** OBS-010's 143 is the output of *one search*, measured
over a frozen query set to compute MRR and Hit@1 — it answers "does the
right record rank first," not "what did answering cost." The benchmark
is sound; importing it into this frame is not.

The transplanted version also proves too much. If a single search really
answered the question, **you should never spawn the sub** — you would pay
a spawn to save perhaps 50 tokens. The economics only work when retrieval
is an *investigation*: rephrase, discard, get, traverse, rephrase again.

## The worked example

The question this record asked for: *a question, the ideal return, and a
token count.* Run against this corpus, 2026-07-16.

**Question:** "May an agent write the corpus directly?"

| Step | Cost | Outcome |
|---|---|---|
| `search "may an agent write the corpus directly"` | ~520 | five hits — **the governing record is not among them** |
| `search "agents judge and write review files never write the corpus"` | ~380 | OBS-014 at rank 2 |
| `get OBS-014` | ~1,250 | the rule |
| still owed: `get DP-001`, `get PROPOSAL-035` | ~1,800 | the principle, the rail |
| **investigation** | **~4,000** | |
| **the answer** | **~60** | |

The first query failing is not an aside — it is the mechanism. The sub's
value is that the discarded query never reaches the caller.

**The ideal return, ~190 tokens:**

```
FOUND
  OBS-014 § The finding — "per-batch agents cannot see corpus-wide
    shapes, so a central reconciliation pass is not optional"
  DP-001 — the principle under it: semantic judgment belongs to the
    agent+user loop, not to code
  PROPOSAL-035 § Proposal — the rail that mechanizes it:
    `docdog serve --read-only` refuses create/update/relate

SEARCHED
  "may an agent write the corpus directly" → DISC-006, DP-001,
    PROPOSAL-035, OQ-47, FRICTION-028 — none governing
  "agents judge and write review files never write the corpus"
    → OBS-014 @2

CONSIDERED, REJECTED
  DISC-006 — establishes DP-001, does not state the write rule
  FRICTION-028 — edge parsing, unrelated

SYNTHESIS — no record states this; each claim cites what does
  OBS-014 governs: it states the rule. DP-001 is the principle it
  instantiates, not the rule itself. PROPOSAL-035 enforces it for
  MCP writes only — it does not stop a file-tool hand-edit
  (PROPOSAL-035 § What it refuses, and what it does not).
```

**~190 against ~4,000 — a ~20x margin.** Requirement 1 stops fighting
requirements 2 and 3. Citations are affordable, and so is the miss field.

## What the tension actually was

The three requirements were stated as pulling against each other. With
the baseline corrected, two of the three pulls were artifacts:

- **(1) vs (2) — citations cost tokens.** Dissolved. A ~20x margin buys
  citations on every claim with room left over.
- **(1) vs (3) — negative results are verbose.** Dissolved by a
  compression, not by the margin. A search hit is ~100 tokens, of which
  ~90 is preview, description and relevance scores; the identity is ~5.
  **The sub forwards the ids it discarded, not the previews it
  discarded.** Reporting twelve rejected candidates costs ~60 tokens
  where re-exporting them costs ~1,200. This is a decent one-line
  definition of what a retrieval sub *is*: the thing that reads the 90%
  and forwards the 10% plus a verdict.
- **(2) vs (3) — a hits-only shape has nowhere to put "I found
  nothing."** Real, and answered structurally: `SEARCHED` is that place.
  It survived scrutiny because the worked example's *first query* is the
  case that needs it, which makes coverage-reporting a common path rather
  than insurance against a minority.

## Why a quote, not an id

An id is too coarse, and this holes the "verification costs one call"
defence. `get OBS-014` is ~1,250 tokens. The *call* is cheap; the *read*
is not. An id-only citation quietly charges the caller a whole record to
check one sentence.

A quote costs ~25 tokens and has four properties an id does not:

- **It fuses citation and content.** An id gives a claim plus a pointer
  the caller must cash for ~1,250 tokens. A quote *is* the payload — the
  caller reads the actual rule and never fetches. Same compression as
  forwarding ids instead of previews, one level down.
- **It fails loudly.** A quote either appears in the record or it does
  not. Fabrication — OBS-014's invention failure — is grep-checkable.
- **It needs no docdog change.** It is prose the sub produces by reading,
  which is what the sub is for. It ships in `navigate-specs` today.
- **It is chunking-independent.** Nothing here waits on a deferred
  feature, and nothing here breaks if that feature lands.

The heading (`§ The finding`) earns its ~5 tokens separately: it is
stable across edits above it, and unlike `:47-61` it tells the caller
something *before* they fetch.

## Why not the line span — and where that idea does belong

Line-span citation (`doc / start / end`) was considered seriously,
because **PROPOSAL-023 §2 already designs it**, in nearly these words:
"search can return a section and its file+line span instead of a whole
record, saving consumer context." The `chunks` table ships with
`heading_path`, `start_line`, `end_line` from day one.

They are `NULL`. `indexer.ts` writes one chunk per vertex — `ord` always
0, both line columns `NULL`, and `heading_path` stuffed with the record's
*title* rather than a heading path. The comment says so: "One chunk per
section for now — vertex-granularity retrieval… The schema supports finer
section chunking later." §8 put section-granularity tuning out of scope as
eval-driven follow-up, and it has stayed there.

Three reasons the contract does not wait for it, in ascending order of
force:

1. **It is deferred, and on a misdiagnosis.** The adopter evidence that
   motivated chunking turned out to be a corpus never in a scan path.
2. **The units answer different questions.** An *indexing* unit optimizes
   retrieval quality — what window makes the embedding find the right
   record. A *citation* unit optimizes verification cost — what span makes
   a claim cheap to check. Nothing makes them coincide, and they should
   not be assumed to. Conceded, because an earlier draft of this record
   got it wrong: §2's granularity is **section**, i.e. heading-driven, so
   it *would* split a record like OBS-014, and it would make `§ The
   finding` mechanically retrievable instead of sub-produced. That is a
   real gain — to the sub's **inputs**. It does not reach the return,
   for the reason in §Why a quote: a span must still be cashed for a
   fetch, and a quote is already the payload.
3. **A coordinate cannot check itself.** The tempting argument — "a stale
   id fails loudly, a stale span silently returns the wrong text" — is
   **false on the id half**, and the falsity is worth recording because it
   is invisible from the outside: `docdog_get` reads `vertices.body_text`
   (`mcp/tools/get.ts:40`), i.e. it serves from the **cache, not from
   disk**. Under a stale index an id returns stale content with no
   signal. Reindexing repairs the cache, but neither the cache nor a
   reindex can reach a citation that has already left in a return message.

   So the distinction is not fresh-vs-stale, which bites both. It is
   **content-addressed vs coordinate-addressed**. A quote validates itself
   against whatever it lands in — it matches or it doesn't, and "doesn't"
   *is* the answer. A coordinate lands wherever it lands and reads as
   authoritative either way; it has no way to report that it missed. That
   is FRICTION-028's shape, and FRICTION-019's: this project keeps paying
   for silent-and-wrong over loudly-broken.

   Docdog already runs on this principle everywhere else — `content_hash`
   is LF-normalized, the embed key is computed on the full body, cache
   invalidation is content-addressed throughout. A quote is that same idea
   at the citation layer, which is the strongest reason to prefer it.

**These are complementary, not competing.** If PROPOSAL-023 §2's section
granularity ever lands, it makes the sub's *inputs* cheaper — search
returns sections instead of records. It does not change what the sub
*returns*, because a span still requires a fetch and a quote does not.

## The DP-001 resolution: the label is not the lever

A contract that *reports* is tier-1 mechanics relayed. One that *ranks*,
*filters to the best few*, or *asserts sufficiency* is the agent doing
judgment — legitimate in an agent, but the caller receives the return as
if it were a tool result, and does not discount a subagent's conclusion
the way it would a colleague's.

The instinct to fix this with an epistemic label fails from both ends.
`VERDICT` is a **closure word** — what suppresses the caller's instinct
to check is not confident tone but the signal that the work is finished.
Hedging fails worse: if everything is "possibly," the sub can no longer
distinguish *confident* from *guessing*, and uniform hedging destroys the
signal it exists to send. The label is the wrong instrument.

And a label is prose, enforced by the model's cooperation — which is
precisely what PROPOSAL-035 rejected on the write side, moving the rail
into the server where cooperation is not required. **Here there is no
seam to move it to.** Docdog is not in the loop when the sub returns to
its caller. So the honest move is to stop pretending the label is a rail.
It is a request, and requests are acceptable when the failure they permit
is cheap.

Two structural moves, neither needing the caller to buy an epistemic
frame:

1. **Every line in `SYNTHESIS` names at least one id. No id, no line.**
   A grammar, not a suggestion — a violation is visible at a glance.
   It converts "trust me" into "here is the chain, check any link."
2. **Label by provenance, not confidence.** A caller cannot act on *how
   sure is it*. It can act on *did this come from a record or from the
   sub's head* — factual and checkable. Hence
   `SYNTHESIS — no record states this; each claim cites what does`.

## Bounds, stated rather than glossed

- **Citation catches invention, not misjudgment.** A nonexistent id dies
  in one call — that is OBS-014's failure and it is mechanically
  checkable. A sub that cites real records and reads them wrong, or misses
  the governing one entirely, is untouched by any citation discipline. The
  contract does not make the return trustworthy; it makes one class of
  wrongness cheap.
- **The sections leak.** "OBS-014 — the rule: agents never write the
  corpus" is relay; "OBS-014 — this is what governs your question" is
  judgment wearing FOUND's clothes. Not fully preventable. It is a further
  reason to lean on *the citation is the contract, the prose is
  commentary* — the anchor holds when the sections blur.
- **Quote the load-bearing claim; id + heading for orientation.** When a
  claim rests on the record's overall shape ("OBS-014 is a drain report,
  not a rule"), a quote is misleading precision. This means the sub
  chooses what to quote, which is judgment again — but choosing *what to
  quote* is far more visible to the caller than choosing what to conclude.
- **A subagent does not reduce total tokens.** It increases them — its own
  system prompt, the skill, its reasoning. It reduces *caller context*,
  which is the scarce thing: what fills up, and what degrades reasoning as
  it does. The contract optimizes caller context, not spend.

## What ships next

`navigate-specs` currently carries PROPOSAL-036's floor — "return the ids
it found, one line on why each, and what it searched for but didn't find."
That floor is this contract minus the quote and minus `SEARCHED`'s
structure. Replacing it is the delivery step; adopters get it via
`docdog skill install navigate-specs --force`.
