---
name: prodigy-daily-reflection
description: >
  Convert free-form Daily reflection into retrieval-sized Evidence Blocks and proposal-only
  Knowledge, Resource, Object-linking, and PRE-routing candidates. Use when capturing, splitting,
  reviewing, or approving Prodigy OS Daily experiences. Never create permanent Knowledge or Objects automatically.
---

# Prodigy Daily Reflection

Use this skill as the canonical Prodigy OS Daily Reflection workflow.

## Required references

Before proposing a reflection, read completely:

1. [Runtime contract](references/runtime-contract.md)
2. [Response schema](references/response-schema.json) when producing structured JSON or integrating an API

The runtime contract is the single source for extraction, splitting, non-invention, and candidate rules. Do not duplicate or override it in a tool-specific adapter.

## Workflow

### Phase 1 — propose

- Use only the user's current reflection, active Daily note, and explicitly supplied context.
- Produce all five proposal classes required by the runtime contract.
- After the model response, resolve Object suggestions against scoped local Vault paths. The model never decides existence.
- Do not modify the Vault.
- Ask the user to approve, edit, remove, merge, or split.
- When the user requests a revision, send the raw reflection, current proposal without local paths, and the human-authored revision request; regenerate the complete proposal.

### Phase 2 — write

Write only after explicit approval such as `저장해`, `반영해`, or `승인`.

- Evidence approval itself appends only approved Evidence Blocks under the active Daily note's `## Evidence` section.
- Attach only the existing Object links that the user explicitly selected in the review UI.
- Preserve frontmatter, unrelated sections, and existing Evidence IDs.
- Never write Knowledge Candidates, Resource Candidates, Object Linking Suggestions, PRE Routing Suggestions, or low-confidence experiments into Daily.
- Evidence approval never creates or modifies Knowledge, Venue, generic Resource/Place, PRE, Weekly, Project, or any other file.
- If the active Daily path or date is unclear, stop and ask.

### Phase 3 — separately confirmed local handoff

Only after Evidence approval completes, the user may make a distinct second confirmation for one local handoff:

- `VenueCreator` may create one dedicated Wedding Venue from an eligible `suggested_type: "venue"` candidate.
- `PlaceCandidateStore` may capture one `suggested_type: "resource"` general-place candidate as a `fleeting_note`.

These handoffs are never automatic, are never provider-mediated, and do not run merely because Evidence was approved. They must not create a generic Resource or Place Object, and neither path may auto-promote a candidate.

## Human boundary

AI structures evidence and proposes connections; it never invokes a writer or creator. The user separately approves Evidence writes, each local handoff, and every promotion toward permanent Knowledge.
