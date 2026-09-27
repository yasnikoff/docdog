---
id: CONCEPT-RELATION-AMENDS
title: "Relation: amends"
collection: concepts
status: current
concept_kind: relation
name: amends
scope: user
description: A amends B — A changes part of B, and the rest of B stays in force.
when_to_use: When a newer record changes, reverses or narrows one section or claim
  of an older record that otherwise remains current. Record it on the newer side,
  and put an amendment banner in the older record's body at the passage that
  changed. Use supersedes instead when the whole of B is replaced, and extends
  when A only adds to B without changing anything B says.
examples:
  - PROPOSAL-045
  - OBS-026
inverse_label: amended by
symmetric: false
---

# Relation: amends

A amends B — A changes part of B, and the rest of B stays in force.

**When to use:** When a newer record changes, reverses or narrows one section or
claim of an older record that otherwise remains current. Record it on the newer
side, and put an amendment banner in the older record's body at the passage that
changed. Use `supersedes` instead when the whole of B is replaced, and `extends`
when A only adds to B without changing anything B says.

**Why it exists:** OBS-029 found that the common defect between similar
records is neither a contradiction nor a duplicate, but a newer record that
changed part of an older one and declared nothing. Without this type the fix
could only be spelled as a `references` edge whose context said "amends", which
nothing mechanical can tell apart from any other reference — and DISC-043's
pair finder needs to know which edges settle a pair.

**Examples:** PROPOSAL-045 (amends DD-064 and PROPOSAL-039: pattern split stopped
executing), OBS-026 (amends PROPOSAL-029 §5: the shared-store gc refusal was
reversed)

**Inverse label:** amended by

**Symmetric:** no
