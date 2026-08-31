---
name: docdog
description: Documentation management with docdog
---

# DocDog Documentation Management

This project uses docdog for documentation management. All documentation
operations go through the docdog API and skills.

## Skills

The following skills are available in `.docdog/skills/`:

- **create-page** — Create new documentation pages
- **update-page** — Update existing pages (full content replacement)
- **discuss** — Facilitate structured design discussions
- **export** — Export pages to disk for git
- **import-page** — Import existing project files as docdog pages
- **ingest** — Import external content as private reference
- **organize** — Organize pages with categories and labels
- **query** — Find and discover pages

Read the skill file for detailed instructions before performing the operation.

## Project Patches

Project-wide patches in `.docdog/patches/` with `target: "*"` provide
additional context for all documentation operations in this project.
Read them before starting work.

## Quick Reference

- API base URL: `http://localhost:6637/v1`
- Project header: `X-Docdog-Project: <project-name>`
- Always provide `changeReason` on mutations
- Always check `expectedVersion` before updates (optimistic concurrency)
- Use `--dry-run` to preview changes before committing
