# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/scripts/prodigy.py weekly --week 2026-W29

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal

from evidence_core import CliError, WeekId, package, parse_period
from evidence_meta import preview_markdown
from formatter_core import FormatterInputError, render_weekly_view
from operation_core import build_operation_report, render_object_health, render_review_inbox
from pre_core import ReviewInputError, generate_review, write_outputs
from validation_core import ValidationResult, render_validation_report, validate_pipeline_inputs


PipelineMode = Literal["run", "dry_run", "validate_only"]


@dataclass(frozen=True, slots=True)
class PipelinePaths:
    run_dir: Path
    evidence_json: Path
    review_json: Path
    review_draft: Path
    weekly_view: Path
    review_inbox: Path
    readiness_report: Path
    validation_report: Path
    log: Path


@dataclass(frozen=True, slots=True)
class PipelineResult:
    status: str
    paths: PipelinePaths
    log_lines: list[str]
    validation: ValidationResult
    operation_warning: str


def default_week(today: date) -> WeekId:
    year, week, _ = today.isocalendar()
    return WeekId(f"{year}-W{week:02d}")


def pipeline_paths(vault: Path, week: WeekId) -> PipelinePaths:
    run_dir = vault / "SYSTEM" / "AI" / "Skills" / "prodigy-review" / "runs" / str(week)
    review_json = run_dir / f"weekly-review-{week}.json"
    return PipelinePaths(
        run_dir=run_dir,
        evidence_json=run_dir / f"weekly-learning-{week}.json",
        review_json=review_json,
        # Primary human-facing PRE output
        review_draft=run_dir / f"weekly-review-{week}-draft.md",
        weekly_view=run_dir / f"weekly-workspace-view-{week}.md",
        review_inbox=run_dir / "review-inbox.md",
        readiness_report=run_dir / "operational-readiness-report.md",
        validation_report=run_dir / "validation-report.md",
        log=run_dir / "pipeline.log",
    )


def write_log(paths: PipelinePaths, lines: list[str]) -> None:
    paths.log.parent.mkdir(parents=True, exist_ok=True)
    paths.log.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_validation(paths: PipelinePaths, validation: ValidationResult) -> None:
    paths.validation_report.parent.mkdir(parents=True, exist_ok=True)
    paths.validation_report.write_text(render_validation_report(validation), encoding="utf-8")


def write_evidence(paths: PipelinePaths, result: dict[str, object]) -> None:
    paths.evidence_json.parent.mkdir(parents=True, exist_ok=True)
    paths.evidence_json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    paths.evidence_json.with_suffix(".md").write_text(preview_markdown(result), encoding="utf-8")


def render_summary(result: PipelineResult) -> str:
    lines = [*result.log_lines, ""]
    marker = "!" if result.validation.has_fatal_errors else "✓"
    lines.append(f"{marker} Validation")
    if result.status == "validation_failed":
        lines.append("! Stopped before Evidence Package")
    elif result.status == "dry_run":
        lines.append("✓ Dry Run")
    elif result.status == "validate_only":
        lines.append("✓ Validate Only")
    else:
        lines.extend(["✓ Evidence Package", "✓ PRE", "✓ Formatter"])
        lines.append("! Operation Reports Warning" if result.operation_warning else "✓ Review Inbox")
    lines.append("Done." if result.status in {"completed", "dry_run", "validate_only"} else "Stopped.")
    # Product hierarchy: one primary human path, internals secondary
    if result.status == "completed":
        draft = result.paths.review_draft
        lines.extend(
            [
                "",
                "Weekly Review generated successfully.",
                "",
                "Open:",
                str(draft),
                "",
                "Internal artifacts:",
                f"  workspace view: {result.paths.weekly_view}",
                f"  operation report: {result.paths.readiness_report}",
                f"  review inbox: {result.paths.review_inbox}",
                f"  evidence package: {result.paths.evidence_json}",
            ]
        )
    return "\n".join(lines)


def run_weekly(vault: Path, raw_week: str | None, mode: PipelineMode) -> PipelineResult:
    if not vault.exists():
        raise CliError(f"vault does not exist: {vault}")
    week = WeekId(raw_week) if raw_week is not None else default_week(date.today())
    period = parse_period(str(week))
    paths = pipeline_paths(vault, week)
    log_lines = ["Pipeline Started"]
    operation_report = build_operation_report(vault)
    validation = validate_pipeline_inputs(vault, period, operation_report)
    if mode == "dry_run":
        log_lines.extend(["Validation Passed" if not validation.has_fatal_errors else "Validation Failed", "Pipeline Finished"])
        return PipelineResult("dry_run", paths, log_lines, validation, "")
    write_validation(paths, validation)
    if validation.has_fatal_errors:
        log_lines.extend(["Validation Failed", "Pipeline Finished"])
        write_log(paths, log_lines)
        return PipelineResult("validation_failed", paths, log_lines, validation, "")
    log_lines.append("Validation Passed")
    if mode == "validate_only":
        log_lines.append("Pipeline Finished")
        write_log(paths, log_lines)
        return PipelineResult("validate_only", paths, log_lines, validation, "")
    evidence = package(vault, period)
    write_evidence(paths, evidence)
    coverage = evidence.get("coverage") if isinstance(evidence, dict) else {}
    daily_scanned = int(coverage.get("daily_scanned", coverage.get("daily_total", 0)) or 0) if isinstance(coverage, dict) else 0
    daily_used = int(coverage.get("daily_used", 0) or 0) if isinstance(coverage, dict) else 0
    log_lines.append("Evidence Package Generated")
    log_lines.append(f"Daily scanned: {daily_scanned or len(evidence.get('primary_evidence') or [])}")
    log_lines.append(f"Evidence extracted: {daily_used}")
    if isinstance(evidence.get("warnings"), list) and evidence["warnings"]:
        log_lines.append(f"Warnings: {len(evidence['warnings'])}")
    review = generate_review(evidence)
    write_outputs(review, paths.review_json)
    stats = review.get("pre_stats") if isinstance(review, dict) else {}
    if isinstance(stats, dict):
        log_lines.append(f"Patterns found: {stats.get('patterns_found', 0)}")
        log_lines.append(f"Principles proposed: {stats.get('principles_proposed', 0)}")
        if not stats.get("enough_evidence", True):
            log_lines.append("Not enough evidence for pattern generation")
    log_lines.append("PRE Completed")
    weekly_view_body = render_weekly_view(review)
    # Demote workspace view: not the primary human Weekly Review
    paths.weekly_view.write_text(
        "\n".join(
            [
                "# Weekly Workspace View (internal)",
                "",
                "> 내부/고급 뷰입니다. 사람이 읽을 주간 복기는 같은 폴더의 `*-draft.md` 입니다.",
                f"> Primary: `{paths.review_draft.name}`",
                "",
                weekly_view_body.lstrip(),
            ]
        ),
        encoding="utf-8",
    )
    log_lines.append("Formatter Completed")
    log_lines.append(f"Primary Weekly Review draft: {paths.review_draft}")
    operation_warning = ""
    try:
        final_operation_report = build_operation_report(vault)
        paths.review_inbox.write_text(render_review_inbox(final_operation_report), encoding="utf-8")
        paths.readiness_report.write_text(render_object_health(final_operation_report), encoding="utf-8")
        log_lines.append("Operation Reports Completed")
    except OSError as error:
        operation_warning = str(error)
        log_lines.append("Operation Reports Warning")
    log_lines.append("Pipeline Finished")
    write_log(paths, log_lines)
    return PipelineResult("completed", paths, log_lines, validation, operation_warning)
