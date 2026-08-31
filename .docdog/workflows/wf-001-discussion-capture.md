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
3. **Write the records** under
   `specs/notes/discussion-NNN-<slug>.md` with the discussion
   frontmatter shape (below). Body is a faithful summary of the
   substance — not a verbatim transcript. Capture positions,
   tradeoffs, conclusions, next actions. Quote the user directly
   when exact phrasing carries weight.
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
6. **Index** (`docdog index`) so everything is searchable.
7. **Commit** all records + artifacts in one commit, message
   mentioning the discussion id(s).
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
free one via `docdog search "DISC-" | head` or
`ls specs/notes/discussion-*.md`.

## Produces

- One or more `DISC-NNN` records under `specs/notes/`.
- Zero or more surfaced artifacts (issues, proposals, notes,
  questions, decisions) — only the ones the user explicitly
  approved.
- A single git commit containing all of the above.

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
  prose body does.
