# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/scripts/prodigy.py weekly --validate-only --week 2026-W29

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

from pathlib import Path

from evidence_core import Period, build_daily_evidence, daily_files
from operation_core import OperationReport


ValidationStage = Literal["operational", "structural", "review_readiness"]
ValidationSeverity = Literal["INFO", "WARNING", "ERROR"]


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    stage: ValidationStage
    severity: ValidationSeverity
    code: str
    message: str


@dataclass(frozen=True, slots=True)
class ValidationResult:
    issues: list[ValidationIssue]

    @property
    def has_fatal_errors(self) -> bool:
        return any(issue.severity == "ERROR" for issue in self.issues)


def validate_operation(report: OperationReport) -> list[ValidationIssue]:
    if not report.health_issues:
        return [ValidationIssue("operational", "INFO", "operation_health_clean", "No operational health issues found")]
    return [ValidationIssue("operational", "WARNING", "operation_health_items", f"{len(report.health_issues)} operational item(s) need review")]


def validate_structure(vault: Path, period: Period) -> list[ValidationIssue]:
    files = daily_files(vault, period)
    if not files:
        return [ValidationIssue("structural", "ERROR", "missing_daily_files", "No Daily files found for this week")]
    return [ValidationIssue("structural", "INFO", "structure_valid", "Evidence Package structure is valid")]


def validate_review_readiness(vault: Path, period: Period) -> list[ValidationIssue]:
    used = 0
    for path in daily_files(vault, period):
        evidence, _, _ = build_daily_evidence(vault, path)
        used += int(bool(evidence.projection["reflection"].strip()))
    if used < 1:
        return [ValidationIssue("review_readiness", "ERROR", "no_daily_reflection", "No meaningful Daily Reflection found for this week")]
    return [ValidationIssue("review_readiness", "INFO", "review_ready", "Weekly Review has usable primary evidence")]


def validate_pipeline_inputs(vault: Path, period: Period, operation_report: OperationReport) -> ValidationResult:
    issues = [*validate_operation(operation_report), *validate_structure(vault, period), *validate_review_readiness(vault, period)]
    return ValidationResult(issues)


def render_validation_report(result: ValidationResult) -> str:
    lines = ["# Pipeline Validation Report", "", f"- Fatal Errors: `{str(result.has_fatal_errors).lower()}`", ""]
    for stage in STAGES:
        lines.extend([f"## {stage.replace('_', ' ').title()}", ""])
        stage_issues = [issue for issue in result.issues if issue.stage == stage]
        if not stage_issues:
            lines.extend(["- None", ""])
            continue
        for item in stage_issues:
            lines.append(f"- `{item.severity}` `{item.code}`: {item.message}")
        lines.append("")
    return "\n".join(lines)


STAGES: Final[tuple[ValidationStage, ...]] = ("operational", "structural", "review_readiness")
