from __future__ import annotations

import re
from pathlib import Path
from typing import Final


Json = str | int | float | bool | None | list["Json"] | dict[str, "Json"]
REQUIRED_KEYS: Final = (
    "schema_version",
    "package_id",
    "review_type",
    "question",
    "primary_evidence",
    "supporting_evidence",
    "coverage",
    "warnings",
    "references",
)

# Patterns need enough Daily entries with content.
MIN_DAILIES_FOR_PATTERNS: Final = 3
# A theme needs this many distinct daily sources to become a finding/principle.
MIN_SUPPORTING_SOURCES: Final = 2

# Deterministic theme detectors — keyword match only, no LLM.
# Keywords scan existing Daily projection fields only.
THEME_RULES: Final = (
    {
        "id": "deferral",
        "pattern": "Small tasks are deferred and handled late",
        "statement": "Handle immediately doable tasks on the same day.",
        "keys": (
            "미루",
            "지연",
            "미뤄",
            "미루다",
            "procrastin",
            "즉시 처리",
            "당일",
            "바로 처리",
            "5분",
        ),
    },
    {
        "id": "reading_interrupt",
        "pattern": "Reading is frequently interrupted or delayed",
        "statement": "Protect uninterrupted reading time.",
        "keys": ("독서", "읽기", "책 ", " reading", "중단", "방해", "interrupt", "집중 읽"),
    },
    {
        "id": "workout",
        "pattern": "Workout consistency appears repeatedly",
        "statement": "Schedule workouts before other flexible work.",
        "keys": ("운동", "workout", "헬스", "훈련", "스쿼트", "러닝", "run "),
    },
    {
        "id": "auction_review",
        "pattern": "Auction review or site-visit work recurs",
        "statement": "Perform site visits before valuation decisions.",
        "keys": ("경매", "임장", "입찰", "auction", "현장", "시세"),
    },
    {
        "id": "project_delay",
        "pattern": "Project work is delayed or blocked repeatedly",
        "statement": "Define one next action before leaving project work.",
        "keys": ("프로젝트", "스프린트", "마감", "지연된", "blocked", "project"),
    },
    {
        "id": "prep_helps",
        "pattern": "Preparation reduces friction before action",
        "statement": "Prepare materials before the work block starts.",
        "keys": ("준비", "미리", "마찰", "preparation", "prep"),
    },
)


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


def daily_blob(item: dict[str, Json]) -> str:
    """Combine canonical Daily projection fields only (no invented fields)."""
    parts = [
        text_value(item, "reflection"),
        text_value(item, "change"),
        text_value(item, "next_experiment"),
        text_value(item, "decision"),
        text_value(item, "experiment"),
    ]
    return "\n".join(p for p in parts if p).strip()


def has_daily_content(item: dict[str, Json]) -> bool:
    return bool(daily_blob(item))


def usable_dailies(primary: list[Json]) -> list[dict[str, Json]]:
    out: list[dict[str, Json]] = []
    for item in primary:
        if isinstance(item, dict) and has_daily_content(item):
            out.append(item)
    return out


def meaningful_changes(primary: list[Json]) -> list[Json]:
    changes: list[Json] = []
    for item in primary:
        if isinstance(item, dict):
            change = text_value(item, "change")
            evidence_id = item.get("evidence_id")
            if change and isinstance(evidence_id, str):
                # Skip empty markdown bullets
                cleaned = re.sub(r"^[\-\*\s]+", "", change, flags=re.M).strip()
                if cleaned and cleaned not in {"-", "—", "없음", "None"}:
                    changes.append(
                        {
                            "title": "기록된 변화",
                            "reason": change,
                            "evidence_refs": [evidence_id],
                        }
                    )
    return changes


def experiments(primary: list[Json]) -> list[Json]:
    result: list[Json] = []
    for item in primary:
        if isinstance(item, dict):
            experiment = text_value(item, "next_experiment")
            evidence_id = item.get("evidence_id")
            if experiment and isinstance(evidence_id, str):
                cleaned = re.sub(r"^[\-\*\s]+", "", experiment, flags=re.M).strip()
                if cleaned and cleaned not in {"-", "—", "없음", "None"}:
                    result.append(
                        {
                            "title": "다음 실험",
                            "description": experiment,
                            "evidence_refs": [evidence_id],
                        }
                    )
    return result


def match_theme(blob: str, keys: tuple[str, ...]) -> bool:
    lower = blob.lower()
    for key in keys:
        token = key.lower().strip()
        if not token:
            continue
        if token in lower:
            return True
    return False


def detect_theme_patterns(usable: list[dict[str, Json]]) -> tuple[list[Json], list[Json]]:
    """Return (findings, principles) backed only by matched Daily sources."""
    findings: list[Json] = []
    principles: list[Json] = []
    for rule in THEME_RULES:
        supporting: list[dict[str, Json]] = []
        for item in usable:
            blob = daily_blob(item)
            if match_theme(blob, rule["keys"]):  # type: ignore[arg-type]
                supporting.append(item)
        if len(supporting) < MIN_SUPPORTING_SOURCES:
            continue
        refs = [str(item["evidence_id"]) for item in supporting if isinstance(item.get("evidence_id"), str)]
        sources = [
            str(item.get("source_path") or item.get("source_link") or item.get("evidence_id"))
            for item in supporting
        ]
        # Deduplicate while preserving order
        refs = list(dict.fromkeys(refs))
        sources = list(dict.fromkeys(sources))
        n = len(refs)
        pattern = str(rule["pattern"])
        reason = f"{n}개 일일 성찰에서 관련 표현이 반복되었다."
        findings.append(
            {
                "title": pattern,
                "reason": reason,
                "evidence_refs": refs,
                "supporting_sources": sources,
                "pattern": pattern,
            }
        )
        principles.append(
            {
                "title": str(rule["statement"]),
                "statement": str(rule["statement"]),
                "proposal_id": f"principle-{rule['id']}-{n:02d}",
                "reason": reason + f" 근거: {', '.join(refs)}.",
                "evidence_refs": refs,
                "support": refs,
                "evidence_strength": "repeated" if n >= 3 else "emerging",
                "decision": "pending",
                "status": "pending",
                "applied": False,
            }
        )
    return findings, principles


def detect_repeated_change_phrases(usable: list[dict[str, Json]]) -> list[Json]:
    """Exact repeated change lines across days (deterministic, provenance-preserving)."""
    buckets: dict[str, list[dict[str, Json]]] = {}
    for item in usable:
        change = text_value(item, "change")
        cleaned = re.sub(r"^[\-\*\s]+", "", change, flags=re.M).strip()
        cleaned = re.sub(r"\s+", " ", cleaned)
        if len(cleaned) < 8:
            continue
        key = cleaned.lower()
        buckets.setdefault(key, []).append(item)
    findings: list[Json] = []
    for key, items in buckets.items():
        if len(items) < MIN_SUPPORTING_SOURCES:
            continue
        refs = list(
            dict.fromkeys(
                str(i["evidence_id"]) for i in items if isinstance(i.get("evidence_id"), str)
            )
        )
        if len(refs) < MIN_SUPPORTING_SOURCES:
            continue
        sample = text_value(items[0], "change")
        findings.append(
            {
                "title": "Same change recorded on multiple days",
                "reason": f"동일한 변화 기록이 {len(refs)}개 일자에서 반복되었다: {sample[:160]}",
                "evidence_refs": refs,
                "supporting_sources": [
                    str(i.get("source_path") or i.get("evidence_id")) for i in items
                ],
                "pattern": "Repeated change statement",
            }
        )
    return findings


def detect_contradictions(usable: list[dict[str, Json]]) -> list[Json]:
    """
    If both success-like and failure-like language appears across days for the same week,
    surface both sides — never average.
    """
    success_keys = ("성공", "잘 됐", "완료", "개선", "success", "worked")
    failure_keys = ("실패", "안 됐", "막힘", "실패했", "failed", "blocked", "실패함")
    success_items = [i for i in usable if match_theme(daily_blob(i), success_keys)]
    failure_items = [i for i in usable if match_theme(daily_blob(i), failure_keys)]
    if not success_items or not failure_items:
        return []
    s_refs = list(
        dict.fromkeys(str(i["evidence_id"]) for i in success_items if isinstance(i.get("evidence_id"), str))
    )
    f_refs = list(
        dict.fromkeys(str(i["evidence_id"]) for i in failure_items if isinstance(i.get("evidence_id"), str))
    )
    return [
        {
            "title": "Contradictory outcomes in the same week",
            "reason": (
                f"성공·개선 신호가 {len(s_refs)}건, 실패·막힘 신호가 {len(f_refs)}건이다. "
                "상충 증거를 평균내지 않고 양측을 유지한다."
            ),
            "evidence_refs": list(dict.fromkeys([*s_refs, *f_refs])),
            "supporting_sources": {
                "success": s_refs,
                "failure": f_refs,
            },
            "pattern": "Contradictory evidence",
        }
    ]


def limitations(
    package: dict[str, Json],
    primary_used: int,
    linked_used: int,
    missing_count: int,
    findings: list[Json],
    enough_evidence: bool,
) -> list[str]:
    result: list[str] = []
    if not enough_evidence:
        result.append("Not enough evidence.")
    if not findings:
        result.append("No repeated pattern identified.")
    if primary_used <= 1:
        result.append("Only one Daily available.")
    elif primary_used < MIN_DAILIES_FOR_PATTERNS:
        result.append(f"Fewer than {MIN_DAILIES_FOR_PATTERNS} Daily entries with content.")
    if linked_used == 0:
        result.append("No linked Objects.")
    if missing_count > 0:
        result.append(f"Missing references: {missing_count}.")
    warnings = package.get("warnings")
    if isinstance(warnings, list) and warnings:
        result.append("Evidence package contains warnings.")
    # Deduplicate while preserving order
    return list(dict.fromkeys(result))


def direction(experiments_list: list[Json], principles: list[Json]) -> list[str]:
    lines: list[str] = []
    if experiments_list and isinstance(experiments_list[0], dict):
        description = experiments_list[0].get("description")
        if isinstance(description, str) and description:
            lines.append(f"Try: {description}")
    if principles and isinstance(principles[0], dict):
        statement = principles[0].get("statement") or principles[0].get("title")
        if isinstance(statement, str) and statement:
            lines.append(f"Review pending principle: {statement}")
    if not lines:
        lines.append("Observe: 다음 주 성찰에서 반복되는 상황을 더 모은다.")
    else:
        lines.append("Observe: 같은 패턴이 반복되는지 추가 증거를 모은다.")
    return lines


def generate_review(package: dict[str, Json]) -> dict[str, Json]:
    validate_package(package)
    primary = package["primary_evidence"]
    supporting = package["supporting_evidence"]
    coverage = package["coverage"]
    if not isinstance(primary, list) or not isinstance(supporting, list) or not isinstance(coverage, dict):
        raise ReviewInputError("invalid evidence package structure")

    usable = usable_dailies(primary)
    primary_used = len(usable)
    # coverage may still report daily_used from package builder
    linked_used = int(coverage.get("linked_used", 0) or 0)
    missing_count = int(coverage.get("missing", 0) or 0)

    changes = meaningful_changes(primary)
    experiment_list = experiments(primary)

    enough_evidence = primary_used >= MIN_DAILIES_FOR_PATTERNS
    findings: list[Json] = []
    principle_list: list[Json] = []

    if enough_evidence:
        theme_findings, theme_principles = detect_theme_patterns(usable)
        findings.extend(theme_findings)
        findings.extend(detect_repeated_change_phrases(usable))
        findings.extend(detect_contradictions(usable))
        # Principles only from theme rules with support (never invent)
        principle_list.extend(theme_principles)
        # Stable order
        findings = _dedupe_findings(findings)
        principle_list = _dedupe_principles(principle_list)
        # Renumber proposal ids for week
        week_token = str(package.get("package_id", "week")).replace("weekly-learning-", "")
        for idx, item in enumerate(principle_list, start=1):
            if isinstance(item, dict):
                item["proposal_id"] = f"principle-{week_token}-{idx:03d}"

    if enough_evidence and findings:
        summary = (
            f"{primary_used}개의 일일 성찰과 {linked_used}개의 연결 Object를 검토했다. "
            f"반복 패턴 {len(findings)}건, 원칙 후보 {len(principle_list)}건을 제안한다. "
            "원칙은 모두 pending이며 사람 승인이 필요하다."
        )
    elif not enough_evidence:
        summary = (
            f"{primary_used}개의 일일 성찰과 {linked_used}개의 연결 Object를 검토했다. "
            "Not enough evidence."
        )
    else:
        summary = (
            f"{primary_used}개의 일일 성찰과 {linked_used}개의 연결 Object를 검토했다. "
            "반복 패턴은 충분한 복수 증거로 확인되지 않았다."
        )

    return {
        "schema_version": "1.0",
        "review_id": review_id(str(package["package_id"])),
        "review_type": package["review_type"],
        "question": package["question"],
        "summary": summary,
        "findings": findings,
        "meaningful_changes": changes,
        "experiments": experiment_list,
        "suggested_principles": principle_list,
        "next_week_direction": direction(experiment_list, principle_list),
        "limitations": limitations(
            package, primary_used, linked_used, missing_count, findings, enough_evidence
        ),
        "references": package["references"],
        # Debug / logging surface (non-canonical consumers may ignore)
        "pre_stats": {
            "dailies_scanned": len(primary),
            "evidence_extracted": primary_used,
            "patterns_found": len(findings),
            "principles_proposed": len(principle_list),
            "enough_evidence": enough_evidence,
        },
    }


def _dedupe_findings(items: list[Json]) -> list[Json]:
    seen: set[str] = set()
    out: list[Json] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = str(item.get("title") or item.get("pattern") or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _dedupe_principles(items: list[Json]) -> list[Json]:
    seen: set[str] = set()
    out: list[Json] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = str(item.get("statement") or item.get("title") or "")
        if key in seen:
            continue
        seen.add(key)
        # Enforce approval boundary
        item["status"] = "pending"
        item["decision"] = "pending"
        item["applied"] = False
        out.append(item)
    return out


def preview_markdown(review: dict[str, Json]) -> str:
    lines = ["# Weekly Review Preview", "", "## Summary", "", str(review["summary"])]
    for title, key in (
        ("Findings", "findings"),
        ("Meaningful Changes", "meaningful_changes"),
        ("Experiment Review", "experiments"),
        ("Suggested Principles", "suggested_principles"),
        ("Next Week Direction", "next_week_direction"),
        ("Limitations", "limitations"),
        ("References", "references"),
    ):
        lines.extend(["", f"## {title}"])
        values = review[key]
        if isinstance(values, list) and values:
            for value in values:
                lines.append("- " + preview_line(value))
        else:
            lines.append("- None")
    return "\n".join(lines) + "\n"


def render_mvp_draft(review: dict[str, Json]) -> str:
    """
    Human-facing Weekly Review draft sections (presentation only).
    Does not modify Weekly journal notes or templates.
    """
    lines = [
        "# Weekly Review Draft",
        "",
        "> PRE 초안 · 모든 원칙은 pending · 사람 승인 필요 · Knowledge 자동 생성 없음",
        "",
        "# Weekly Summary",
        "",
        str(review.get("summary") or ""),
        "",
        "# Observed Patterns",
        "",
    ]
    findings = review.get("findings")
    if isinstance(findings, list) and findings:
        for item in findings:
            if not isinstance(item, dict):
                continue
            title = item.get("title") or item.get("pattern") or "Pattern"
            reason = item.get("reason") or ""
            refs = item.get("evidence_refs") or []
            lines.append(f"## {title}")
            lines.append("")
            lines.append(f"- Why: {reason}")
            if isinstance(refs, list) and refs:
                lines.append(f"- Evidence: {', '.join(f'`{r}`' for r in refs)}")
            support = item.get("supporting_sources")
            if isinstance(support, list) and support:
                lines.append(f"- Sources: {', '.join(str(s) for s in support)}")
            lines.append("")
    else:
        lines.extend(["- Not enough evidence or no repeated pattern.", ""])

    lines.extend(["# Suggested Principles", ""])
    principles = review.get("suggested_principles")
    if isinstance(principles, list) and principles:
        for item in principles:
            if not isinstance(item, dict):
                continue
            statement = item.get("statement") or item.get("title") or "Principle"
            reason = item.get("reason") or ""
            refs = item.get("evidence_refs") or item.get("support") or []
            status = item.get("status") or item.get("decision") or "pending"
            lines.append(f"## {statement}")
            lines.append("")
            lines.append(f"- Reason: {reason}")
            if isinstance(refs, list) and refs:
                lines.append(f"- Supporting Evidence: {', '.join(f'`{r}`' for r in refs)}")
            lines.append(f"- Status: `{status}` (human approval required)")
            lines.append("")
    else:
        lines.extend(["- None (pending principles only when patterns have support).", ""])

    lines.extend(["# Evidence References", ""])
    refs = review.get("references")
    if isinstance(refs, list) and refs:
        for ref in refs:
            lines.append(f"- `{ref}`")
    else:
        lines.append("- None")
    lines.append("")
    return "\n".join(lines)


def preview_line(value: Json) -> str:
    if isinstance(value, dict):
        title = value.get("title") or value.get("proposal_id") or value.get("statement") or "Item"
        reason = value.get("reason") or value.get("description") or ""
        return f"{title}: {reason}".strip()
    return str(value)


def write_outputs(review: dict[str, Json], output: Path) -> None:
    import json

    output.parent.mkdir(parents=True, exist_ok=True)
    # pre_stats is helpful in logs but keep JSON stable for consumers
    serializable = {k: v for k, v in review.items()}
    output.write_text(json.dumps(serializable, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    output.with_suffix(".md").write_text(preview_markdown(review), encoding="utf-8")
    draft_path = output.with_name(output.stem + "-draft.md")
    draft_path.write_text(render_mvp_draft(review), encoding="utf-8")
