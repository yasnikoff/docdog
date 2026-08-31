---
id: FRICTION-017
title: "github.com/yasnikoff/docdog is an empty stub — every remote adopter pays a detour"
collection: notes
status: resolved
resolution: fixed
resolved_date: 2026-07-20
description: "The orchestrator adoption run tried to source docdog from its advertised GitHub remote and found only LICENSE + a one-line README at the initial commit. The local tree has never been pushed (DD-071 holds v3/dev history back deliberately), so any adopter without filesystem access to E:\\projects\\docdog hits a dead reference and has to ask the machine owner for a direct copy."
severity: inconvenient
source: external-dogfood (host-project orchestrator, PLAN-DOCDOG-001)
harvested_from: specs/investigations/docdog-adoption/feedback-2026-07-12-github-repo-empty-stub.md
relationships:
  - references: DD-071
    context: "the publication boundary is *why* the remote is empty — v3/dev history can never be pushed, so the public tree only appears at publish time; this friction is the adopter-visible cost of that (correct) decision"
  - references: WF-002
    context: harvested from the external dogfood track — the first friction the orchestrator adoption produced, before docdog had even been installed
---

# FRICTION-017: The advertised GitHub remote is an empty stub

## What they were doing

Phase 1 of the orchestrator adoption (PLAN-DOCDOG-001), from a cloud
sandbox with no access to `E:\projects\docdog`. The plan names
`github.com/yasnikoff/docdog` as docdog's home, so the sandbox tried
to clone it.

## What went wrong

`git clone https://github.com/yasnikoff/docdog` succeeds and yields a
repository containing only `LICENSE` and a one-line `README.md`
("# docdog") at commit `626a9f3` ("Initial commit"). No source, no
tags, no branches. The local working copy has never been pushed.

## Workaround

Asked the machine owner to expose the local tree directly and built
docdog from it.

## What should change

This is the adopter-facing cost of DD-071, not a bug in it. DD-071 is
right that v3/dev history can never be pushed (`docs/discussion.md`
lives in it), so the remote stays empty until the publish cut. The
open question is only what the *reference* should say in the meantime:

- **Publish** (session 9, pending explicit go) — closes this outright.
- **Or** stop advertising the URL until it resolves to a real mirror.
  A reference that resolves to an empty stub costs every adopter a
  detour-and-retry, and it is the very first thing an adopter touches.

Resolving this needs no code — it is a publication-sequencing call,
and it resolves for free the moment the publish happens.

## Resolution (2026-07-20): published

The first option was taken. `main` is a fresh cut of the v3 tree per
DD-071 (`ca33c4e`, parented on the old empty `626a9f3`), tagged
`v0.2.0` with a release, and `@yasnikoff/docdog@0.2.0` is live on
npmjs — so the advertised URL now resolves to real source, and an
adopter installs with `npm i -g @yasnikoff/docdog` instead of asking
the machine owner for a copy. DD-071's registry question was closed to
npmjs in the same pass, specifically so that the `npx -y` wiring
`docdog init` writes into an adopter's `.mcp.json` works without auth.

The dev history stayed private, as designed — this friction's cost was
real and its cause (DD-071) was still right.
