---
id: OQ-30
title: "Project name sanitization for ArangoDB database names"
collection: questions
status: resolved
description: "docdog init --name with special chars (@, /) would create invalid Arango database names. Resolved: sanitize to database name = docdog_ + slugified project name. Must be documented and predictable."
---

# OQ-30: Project name sanitization for ArangoDB database names

`docdog init --name "@example/my-project"` would create database
`docdog_@example/my-project` — invalid ArangoDB name (@ and / not allowed).
Need sanitization: strip `@`, replace `/` and other special chars with `_` or `-`.
Rule: database name = `docdog_` + slugified project name. Must be documented and
predictable (user should know what database name to expect).
