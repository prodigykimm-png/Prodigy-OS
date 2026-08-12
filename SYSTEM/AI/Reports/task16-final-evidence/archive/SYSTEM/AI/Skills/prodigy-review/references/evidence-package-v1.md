# Evidence Package v1.1

The Evidence Package is a deterministic JSON artifact that gathers the minimum source evidence for one Weekly Review question.

It is not a reasoning output, summary, second wiki, vector index, or replacement for source Objects.

## Schema

Required top-level fields:

- `schema_version`
- `package_id`
- `review_type`
- `workspace`
- `question`
- `period`
- `primary_evidence`
- `supporting_evidence`
- `relationships`
- `coverage`
- `recency`
- `statistics`
- `missing`
- `warnings`
- `references`

## Evidence Contract

Every item must include:

- `evidence_id`
- `evidence_type`
- `source_path`
- `source_link`
- `projection`

Daily evidence is ordered by date ascending.
Supporting evidence is ordered by reference frequency, first reference date, then link name.

Warnings are structured as `{severity, code, message}` with `INFO`, `WARNING`, or `ERROR`.
Relationships are deterministic only and may use `explicit_link`, `referenced_by`, or `same_daily`.
Coverage and recency are factual metadata, not confidence or relevance scoring.

The sibling Markdown preview is for human inspection only. JSON remains canonical.

## Human Content Protection

The package stores excerpts and references only.
All interpretation, principle generation, and user approval belong to later stages.

# PRE v1 Review Result

PRE consumes only the Evidence Package JSON.
It never scans the Vault.

Required Review Result fields:

- `schema_version`
- `review_id`
- `review_type`
- `question`
- `summary`
- `findings`
- `meaningful_changes`
- `experiments`
- `suggested_principles`
- `next_week_direction`
- `limitations`
- `references`

Suggested Principles are temporary proposals only.
Every proposal must remain `pending` and `applied: false`.
If repeated evidence is unavailable, PRE must not invent a pattern.

# Formatter v1 Weekly View

Formatter consumes only the Review Result JSON.
It never reads the Vault or Evidence Package.

Weekly View sections:

- Summary
- Key Findings
- Meaningful Changes
- Experiment Review
- Suggested Principles
- Next Week Direction
- Limitations
- References

The Markdown view is a human workspace view only.
It must preserve proposal status, evidence references, evidence strength, and `applied` state exactly.
