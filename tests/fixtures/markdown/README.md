# Markdown fixture collection

Representative markdown samples used as ground truth for the
`src/markdown/` wrapper and downstream parsers. Grow this folder
whenever a new project's quirks force a new adapter — one fixture
per shape, kept small and self-explanatory.

Current shapes:

- `vanilla-dd-record.md` — canonical DD record: YAML frontmatter,
  single H1, prose body. Feeds `defaultParser`.
- `architecture-split.md` — multi-section decisions file split on
  `## DD-ARCH-NN: Title`, with inline `**Status:**` / `**Date:**`
  metadata. Feeds `splitParser`.
- `bracket-task-headings.md` — orchestrator-style
  `### [TASK-NNN] Title` headings.
- `backport-append-safe.md` — two sections; used to verify that
  appending a third section leaves the first two byte-identical
  (sectionKey stability).
- `no-frontmatter.md` — body-only file, heading acts as title.
- `malformed-frontmatter.md` — broken YAML; wrapper must return
  empty frontmatter and preserve body.
- `gfm-tables-and-tasks.md` — GFM table + task list items +
  inline links; exercises `findLinks` / `findTaskListItems`.
