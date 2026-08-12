# Prodigy Review Evidence Package

## When to Run

Run this skill when preparing a Weekly Review evidence package for:

> 이번 주의 경험에서 무엇이 반복되었고, 무엇을 배웠는가?

This MVP only supports `review_type: learning` and `workspace: journal`.

## Sources

The builder may read:

- Daily notes for the requested ISO week under the current Daily journal path.
- Objects explicitly linked from the Daily Reflection sections.
- Current Object files needed only for short projections.

It must not scan the vault for vaguely related content or perform semantic search.

## Write Target

The builder may write the requested generated JSON package path and a sibling Markdown preview.
It must never rewrite Daily notes, Object notes, templates, dashboards, or source Markdown.

## Projection Rules

Daily evidence includes only:

- 성찰 / Reflection
- 변화 / Change
- 다음 실험 / Next Experiment
- 연관 참조 / References

Linked Object evidence includes only a short projection from existing summary, objective, decision, review, or key learning sections. If a safe projection cannot be identified, include a bounded excerpt and the source path.

## Limits

- Maximum Daily files: 7
- Maximum linked Objects: 10
- Maximum extracted characters per Daily section: 3,000
- Maximum extracted characters per linked Object section: 2,000
- Maximum total estimated characters: 30,000

When a limit is reached, the package must record a warning and keep source references.

## Validation

Before reporting success:

1. Run the weekly fixture test.
2. Run the builder once against the real vault for the target week.
3. Confirm source files were not modified by the builder.
4. Report package path, preview path, counts, warnings, and known limitations.

## PRE v1 (MVP)

Run PRE only after an Evidence Package exists.

One-command weekly pipeline (from vault root):

```bash
python3 SYSTEM/AI/Skills/prodigy-review/scripts/prodigy.py weekly --week YYYY-Www
```

Pipeline:

```text
Daily (ISO week, max 7)
  → Evidence Package JSON
  → PRE Review Result (patterns + pending principles)
  → Formatter Weekly View
  → MVP Draft Markdown (Weekly Summary / Patterns / Principles / Evidence)
```

Outputs under `SYSTEM/AI/Skills/prodigy-review/runs/<week>/` (not a PRE Workspace/Object):

- `weekly-learning-*.json` — Evidence Package
- `weekly-review-*.json` — Review Result
- `weekly-review-*-draft.md` — human-facing draft
- `weekly-workspace-view-*.md` — formatted view
- `pipeline.log` — scan / extract / pattern / principle counts

PRE rules:

- Reads Evidence Package only (no vault scan in PRE step).
- Pattern generation requires **≥3 Daily notes with content**; otherwise: `Not enough evidence.`
- Every pattern/principle includes evidence refs (provenance).
- Principles are always `status: pending` — never auto-approved, never applied.
- Must not create Knowledge, approve Principles, modify Objects, or rewrite Weekly journal notes.

## Formatter v1

Run Formatter only after a Review Result exists.

Formatter reads one Review Result JSON and writes one Weekly Review Markdown view.

Formatter must not read the Vault, inspect Evidence Packages, rerun PRE, modify the Review Result, generate insights, approve Principles, or update Weekly Notes.

The Weekly Review Markdown view is presentation only. Review Result JSON remains canonical.
