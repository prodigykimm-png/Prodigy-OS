from __future__ import annotations

from pathlib import Path
from typing import Final


Json = str | int | float | bool | None | list["Json"] | dict[str, "Json"]
REQUIRED_KEYS: Final = ("schema_version", "package_id", "review_type", "question", "primary_evidence", "supporting_evidence", "coverage", "warnings", "references")


class ReviewInputError(Exception):
    pass


def validate_package(package: dict[str, Json]) -> None:
    missing = [key for key in REQUIRED_KEYS if key not in package]
    if missing:
        raise ReviewInputError("missing required keys: " + ", ".join(missing))
    if package["schema_version"] != "1.0":
        raise ReviewInputError("unsupported evidence schema_version")
    if not isinstance(package["primary_evidence"], list):
        raise ReviewInputError("primary_evidence must be a list")


def review_id(package_id: str) -> str:
    return package_id.replace("weekly-learning-", "weekly-review-", 1)


def evidence_refs(items: list[Json]) -> list[str]:
    refs: list[str] = []
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("evidence_id"), str):
            refs.append(str(item["evidence_id"]))
    return refs


def text_value(item: dict[str, Json], key: str) -> str:
    projection = item.get("projection")
    if isinstance(projection, dict) and isinstance(projection.get(key), str):
        return str(projection[key]).strip()
    return ""


def meaningful_changes(primary: list[Json]) -> list[Json]:
    changes: list[Json] = []
    for item in primary:
        if isinstance(item, dict):
            change = text_value(item, "change")
            evidence_id = item.get("evidence_id")
            if change and isinstance(evidence_id, str):
                changes.append({"title": "즉시 처리 기준의 변화", "reason": change, "evidence_refs": [evidence_id]})
    return changes


def experiments(primary: list[Json]) -> list[Json]:
    result: list[Json] = []
    for item in primary:
        if isinstance(item, dict):
            experiment = text_value(item, "next_experiment")
            evidence_id = item.get("evidence_id")
            if experiment and isinstance(evidence_id, str):
                result.append({"title": "다음 실험", "description": experiment, "evidence_refs": [evidence_id]})
    return result


def limitations(package: dict[str, Json], primary_used: int, linked_used: int, missing_count: int) -> list[str]:
    result = ["No repeated pattern identified."]
    if primary_used <= 1:
        result.append("Only one Daily available.")
    if linked_used == 0:
        result.append("No linked Objects.")
    if missing_count > 0:
        result.append(f"Missing references: {missing_count}.")
    warnings = package.get("warnings")
    if isinstance(warnings, list) and warnings:
        result.append("Evidence package contains warnings.")
    return result


def direction(experiments_list: list[Json]) -> list[str]:
    if experiments_list and isinstance(experiments_list[0], dict):
        description = experiments_list[0].get("description")
        if isinstance(description, str) and description:
            return [f"Try: {description}", "Observe: 같은 지연 패턴이 반복되는지 추가 증거를 모은다."]
    return ["Observe: 다음 주 성찰에서 반복되는 상황을 더 모은다."]


def generate_review(package: dict[str, Json]) -> dict[str, Json]:
    validate_package(package)
    primary = package["primary_evidence"]
    supporting = package["supporting_evidence"]
    coverage = package["coverage"]
    if not isinstance(primary, list) or not isinstance(supporting, list) or not isinstance(coverage, dict):
        raise ReviewInputError("invalid evidence package structure")
    primary_used = int(coverage.get("daily_used", 0))
    linked_used = int(coverage.get("linked_used", 0))
    missing_count = int(coverage.get("missing", 0))
    changes = meaningful_changes(primary)
    experiment_list = experiments(primary)
    summary = f"{primary_used}개의 일일 성찰과 {linked_used}개의 연결 Object를 검토했다. 반복 패턴은 충분한 복수 증거로 확인되지 않았다."
    return {
        "schema_version": "1.0",
        "review_id": review_id(str(package["package_id"])),
        "review_type": package["review_type"],
        "question": package["question"],
        "summary": summary,
        "findings": [],
        "meaningful_changes": changes,
        "experiments": experiment_list,
        "suggested_principles": [],
        "next_week_direction": direction(experiment_list),
        "limitations": limitations(package, primary_used, linked_used, missing_count),
        "references": package["references"],
    }


def preview_markdown(review: dict[str, Json]) -> str:
    lines = ["# Weekly Review Preview", "", "## Summary", "", str(review["summary"])]
    for title, key in (("Findings", "findings"), ("Meaningful Changes", "meaningful_changes"), ("Experiment Review", "experiments"), ("Suggested Principles", "suggested_principles"), ("Next Week Direction", "next_week_direction"), ("Limitations", "limitations"), ("References", "references")):
        lines.extend(["", f"## {title}"])
        values = review[key]
        if isinstance(values, list) and values:
            for value in values:
                lines.append("- " + preview_line(value))
        else:
            lines.append("- None")
    return "\n".join(lines) + "\n"


def preview_line(value: Json) -> str:
    if isinstance(value, dict):
        title = value.get("title") or value.get("proposal_id") or "Item"
        reason = value.get("reason") or value.get("description") or ""
        return f"{title}: {reason}".strip()
    return str(value)


def write_outputs(review: dict[str, Json], output: Path) -> None:
    import json

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    output.with_suffix(".md").write_text(preview_markdown(review), encoding="utf-8")
