---
id: OQ-24
title: "What to salvage from docdog v1?"
collection: questions
status: analyzed
description: "Full review in 2026-04-11-first-attempt-review. v1 is a functionally complete MVP with different architecture. Direct reuse: 8 items. Patterns to reimplement: 5 items. Actionable: review v1's 41 decisions when starting the v2 build."
---

# OQ-24: What to salvage from docdog v1?

**Status:** ANALYZED

Full review in `notes/2026-04-11-first-attempt-review.md`. v1 is a functionally
complete MVP with different architecture (MongoDB + REST + pages).

**Direct reuse (8 items):** CLI structure (Commander), config loader (YAML +
overrides + env), template engine (`{{config:*}}`), CLAUDE.md injection (markers),
AppError hierarchy, export engine patterns (hash dedup, manifest), sanitization
engine, Docker Compose setup.

**Patterns to reimplement (5 items):** skill format (YAML frontmatter), project
context routing, atomic counters, self-bootstrap test, dogfooding protocol.

**Actionable:** Do a decision-by-decision review of v1's 41 decisions (D1–D41)
when starting the v2 build. Some still apply directly.
