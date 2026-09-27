---
id: WF-001
title: "Discussion capture — persist exploratory threads as durable records"
collection: workflows
status: current
date: 2026-04-13
description: "How to turn 'let's discuss...' threads into DISC-NNN records plus any artifacts the conversation surfaced (issues, proposals, questions, decisions), committed in one change."
relationships:
  - references: DD-036
    context: "DD-036 made this workflow canonical under .docdog/workflows/; it previously lived as prose in .claude/CLAUDE.md"
  - references: DISC-011
    context: "most recent discussion captured under this workflow — the PROPOSAL-016 workflow primitives reframe"
  - references: OBS-001
    context: "origin of the retrieval-first habit this workflow supports"
  - references: DD-034
    context: DISC relationships blocks are load-bearing under its artifact-resilience test
  - references: DD-073
    context: discussions are written as a private full record plus a public stub; steps 3, 6 and 7 follow that split
---

# WF-001: Discussion capture

## Trigger

The user opens an exploratory thread. Signals include: *"let's
discuss…"*, *"what do you think about…"*, *"I'm torn between…"*,
*"how should we approach…"*. Treat any such opener as a discussion
to be persisted, not an ephemeral chat.

Pure execution threads (*"run this"*, *"fix that typo"*) are **not**
discussions — skip this workflow.

## During the discussion

Talk normally. Don't write files yet. Keep one topic at a time
where possible. If the user drifts onto a second topic, note it
mentally so the split can happen cleanly later.

Do real thinking — weigh tradeoffs, surface counterarguments,
recommend a position. The user is looking for judgment, not
transcription.

## Steps — at discussion end

A discussion ends when the user moves on, a conclusion is reached,
or the user explicitly says "done" / "next topic".

1. **Review the substance in your head.** Identify positions
   considered, tradeoffs, tentative conclusions, and open
   questions.
2. **Split by topic.** If the conversation covered distinct
   subjects, each topic gets its own `discussion-NNN-<slug>.md`
   record. Err on the side of splitting — one focused record per
   topic is easier to retrieve later than a sprawling transcript.
3. **Write each record twice** (DD-073), with the same file name
   `discussion-NNN-<slug>.md` in both places:
   - the **full record** in the private repo, at
     `../docdog-discussions/discussions/`, with the discussion
     frontmatter shape (below). Body is a faithful summary of the
     substance — not a verbatim transcript. Capture positions,
     tradeoffs, conclusions, next actions. Quote the user directly
     when exact phrasing carries weight.
   - the **stub** in this repo, at `specs/discussions/`: `id`,
     `title`, `collection`, `status`, `date`,
     `retained_privately: docdog-discussions`, the **full**
     `relationships:` block, and the standard "Retained privately"
     body. No `description` and no `participants` — the stub drops
     them on purpose (DD-073, OBS-028).
   The two `relationships:` blocks must stay identical, and so must
   every other field the stub keeps. Any later edit to one half
   reaches the other by hand.
4. **Detect artifacts** the discussion surfaced. Common types:
   - **issue** (`issues`) — bug, limitation, friction worth
     fixing.
   - **proposal** (`proposals`) — RFC / enhancement / design
     change.
   - **note** (`notes`) — miscellaneous context.
   - **question** (`questions`) — open design question, OQ-NN
     style.
   - **decision** (`decisions`) — if the user commits to a
     direction, draft a DD-NNN record.
5. **Propose each artifact to the user** with a one-line summary:
   *"This surfaced a potential issue (X), a proposal (Y), and an
   open question (Z). Create any of them?"* Wait for explicit
   go-ahead before writing — don't bulk-create.
6. **Index both projects** (`docdog index` here and in
   `../docdog-discussions`) so everything is searchable.
7. **Commit in both repos**: in this repo, the stub(s) plus
   artifacts in one commit; in the private repo, the full
   record(s). Both messages mention the discussion id(s). This
   repo's `v3` goes to the `private` remote (`docdog-dev`), never
   to `origin` — the public repo only receives release cuts
   (DD-071).
8. **Ask** for the next discussion topic.

## Discussion frontmatter

```yaml
---
id: DISC-NNN
title: "<one-line topic>"
collection: discussions
status: open | resolved | archived
date: YYYY-MM-DD
participants: [user, assistant]
description: "<one-sentence summary — shows up in search previews>"
---
```

## ID numbering

DISC-NNN is sequential across the whole project. Find the next
free one with `docdog list --collection discussions` or
`ls specs/discussions/`. The stubs and the full records carry the
same ids, so either half gives the answer.

## Produces

- One or more `DISC-NNN` records, each as a full record in
  `../docdog-discussions/discussions/` plus a stub in
  `specs/discussions/`.
- Zero or more surfaced artifacts (issues, proposals, notes,
  questions, decisions) — only the ones the user explicitly
  approved.
- One commit in each repo (see step 7).

## Terminal states

- **Resolved:** the discussion reached a commitment; a decision
  was drafted and the DISC record references it.
- **Open:** captured as a record but the question remains live;
  status stays `open` and will resolve in a later session.
- **Archived:** superseded or no longer relevant; the record
  stays for provenance but contributes nothing to current
  planning.

## Notes

- Don't bulk-create artifacts without asking. One explicit
  go-ahead per artifact keeps signal-to-noise honest.
- If a discussion generates zero records (pure execution), that
  itself is a signal you were in the wrong workflow — no commit
  needed.
- The `relationships:` block on a DISC record is load-bearing
  under DD-034: future retrieval depends on it more than the
  prose body does. That is why the stub keeps all of it — edges
  reach neither retrieval leg, so keeping them costs nothing
  (OBS-028).
- **Never index the two halves as one corpus.** A stub and its
  full record share an id, so the loser of the contest would be
  invisible to search, get and traverse (PROPOSAL-031). The
  private project's `scan_paths` omit `specs/discussions/` for
  this reason.
