---
id: DD-055
title: "Docdog is a standalone project at github.com/yasnikoff/docdog, distributed on npm"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-019 under DD-034's artifact-resilience lens. Docdog lives in its own repository, ships as an npm package, and uses itself for context management (dogfooding)."
relationships:
  - supersedes: EJ-019
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-056
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — self-hosting makes the test executable
  - references: WF-002
    context: names dogfooding the primary quality loop for the shipped package
---

# DD-055: Repository and distribution

Docdog is a standalone project — not embedded in a host
application, not coupled to any specific consumer. The repository
is `github.com/yasnikoff/docdog`.

## Distribution

Published to npm as `@yasnikoff/docdog`. The CLI is the primary
surface for humans (`docdog init`, `docdog index`, `docdog serve`);
the MCP server (started by `docdog serve` and wired via `.mcp.json`)
is the primary surface for agents. Both are shipped from the same
package.

## Dogfooding

Docdog manages its own specs. The project's `.docdog/config.yaml`
points at the self-hosted database; every spec, principle, and
workflow in this repo is indexed by the same docdog binary the
package ships. Dogfooding is the primary quality loop — see
WF-002.

## DD-034 check

Orthogonal. Repository location and distribution channel don't
touch the artifact-resilience test. What they do guarantee is
that the code running against the corpus is the same code the
corpus describes, which is what makes DD-034 testable at all
(dogfooding catches drift between the artifact layer and the
code layer).
