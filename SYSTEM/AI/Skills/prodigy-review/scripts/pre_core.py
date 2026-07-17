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
# require_all: every group must match (AND). Optional require_any_extra for precision.
# Product rule: prefer precision over volume (validation: weak reading false-positives).
THEME_RULES: Final = (
    {
        "id": "deferral",
        "pattern": "바로 할 수 있는 일을 미루는 패턴",
        "statement": "바로 처리할 수 있는 일은 당일에 끝낸다.",
        "keys": (
            "미루",
            "미뤄",
            "미루다",
            "procrastin",
            "즉시 처리",
            "즉각",
            "바로 처리",
            "바로 해결",
            "조금만 더",
            "하다가 말",
            "유혹에 약",
            "유혹",
        ),
        # Avoid matching only generic "5분" / "당일" alone
        "require_any_of": (
            "미루",
            "미뤄",
            "즉시",
            "즉각",
            "바로 처리",
            "바로 해결",
            "procrastin",
            "조금만 더",
            "하다가 말",
            "유혹에 약",
        ),
    },
    {
        "id": "reading_habit",
        "pattern": "독서 습관이 반복적으로 흔들림",
        "statement": "방해 없는 짧은 독서 시간을 먼저 지킨다.",
        # Topic + reading-specific failure (do NOT reuse generic 미루 — false positives)
        "require_all_groups": (
            ("독서", "읽기", "책", "reading"),
            ("안 읽", "안읽", "못 읽", "못읽", "책도 안", "중단", "방해", "interrupt", "집중 읽"),
        ),
        "keys": (),  # unused when require_all_groups present
    },
    {
        "id": "workout",
        "pattern": "운동이 반복적으로 기록됨",
        "statement": "유동 업무보다 운동 일정을 먼저 잡는다.",
        "keys": ("운동", "workout", "헬스", "훈련", "스쿼트", "러닝"),
        "require_any_of": ("운동", "workout", "헬스", "훈련", "스쿼트", "러닝"),
    },
    {
        "id": "auction_review",
        "pattern": "경매·임장 관련 일이 반복됨",
        "statement": "시세 판단 전에 임장·현장 확인을 한다.",
        "keys": ("경매", "임장", "입찰", "auction", "시세"),
        "require_any_of": ("경매", "임장", "입찰", "auction"),
    },
    {
        "id": "project_delay",
        "pattern": "프로젝트 지연·막힘이 반복됨",
        "statement": "프로젝트 작업을 끝내기 전에 next_action 하나를 남긴다.",
        "keys": ("프로젝트", "스프린트", "마감", "지연된", "blocked", "project"),
        "require_any_of": ("프로젝트", "스프린트", "지연", "blocked", "마감"),
    },
    {
        "id": "prep_helps",
        "pattern": "준비가 실행 마찰을 줄임",
        "statement": "작업 블록 시작 전에 재료·환경을 준비한다.",
        "keys": ("준비", "미리", "마찰", "preparation", "prep"),
        "require_any_of": ("준비", "미리", "마찰", "prep"),
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


def clean_bullet_text(raw: str) -> str:
    """Strip markdown bullets / empty placeholders for display."""
    text = re.sub(r"^[\-\*\s]+", "", raw or "", flags=re.M).strip()
    text = re.sub(r"\n[\-\*\s]+", "\n", text)
    text = re.sub(r"\s+", " ", text).strip()
    if text in {"", "-", "—", "없음", "None", "*"}:
        return ""
    return text


def short_title(raw: str, fallback: str, limit: int = 42) -> str:
    cleaned = clean_bullet_text(raw)
    if not cleaned:
        return fallback
    # Prefer first line / first sentence fragment
    first = re.split(r"[\n.。]", cleaned)[0].strip() or cleaned
    if len(first) > limit:
        return first[: limit - 1].rstrip() + "…"
    return first


def evidence_excerpt(item: dict[str, Json], limit: int = 100) -> str:
    """Prefer Change, then Reflection, then Experiment — user's own words."""
    for key in ("change", "reflection", "next_experiment"):
        cleaned = clean_bullet_text(text_value(item, key))
        if cleaned:
            return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"
    return ""


def meaningful_changes(primary: list[Json]) -> list[Json]:
    changes: list[Json] = []
    for item in primary:
        if isinstance(item, dict):
            change = text_value(item, "change")
            evidence_id = item.get("evidence_id")
            if change and isinstance(evidence_id, str):
                cleaned = clean_bullet_text(change)
                if cleaned:
                    changes.append(
                        {
                            "title": short_title(cleaned, "기록된 변화"),
                            "reason": cleaned,
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
                cleaned = clean_bullet_text(experiment)
                if cleaned:
                    # Prefer first bullet only for title clarity
                    first_bullet = clean_bullet_text(experiment.split("\n")[0])
                    result.append(
                        {
                            "title": short_title(first_bullet or cleaned, "다음 실험"),
                            "description": cleaned,
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


def match_rule(blob: str, rule: dict[str, object]) -> bool:
    """AND-groups if present; else keys + optional require_any_of precision filter."""
    groups = rule.get("require_all_groups")
    if isinstance(groups, tuple) and groups:
        for group in groups:
            if not isinstance(group, tuple) or not match_theme(blob, group):
                return False
        return True
    keys = rule.get("keys")
    if not isinstance(keys, tuple) or not keys:
        return False
    if not match_theme(blob, keys):
        return False
    require_any = rule.get("require_any_of")
    if isinstance(require_any, tuple) and require_any:
        return match_theme(blob, require_any)
    return True


def build_why_with_quotes(supporting: list[dict[str, Json]], n: int) -> str:
    quotes: list[str] = []
    for item in supporting[:3]:
        excerpt = evidence_excerpt(item, 80)
        eid = item.get("evidence_id")
        if excerpt and isinstance(eid, str):
            quotes.append(f"· {eid}: “{excerpt}”")
    head = f"{n}개 일일 성찰에서 같은 신호가 반복되었다."
    if not quotes:
        return head
    return head + "\n" + "\n".join(quotes)


def principle_from_changes(supporting: list[dict[str, Json]], fallback: str) -> str:
    """Prefer user's own Change language when available (product trust)."""
    for item in supporting:
        change = clean_bullet_text(text_value(item, "change"))
        if len(change) >= 12:
            # Keep as a short principle-like sentence
            return short_title(change, fallback, limit=60)
    return fallback


def detect_theme_patterns(usable: list[dict[str, Json]]) -> tuple[list[Json], list[Json]]:
    """Return (findings, principles) backed only by matched Daily sources."""
    findings: list[Json] = []
    principles: list[Json] = []
    for rule in THEME_RULES:
        supporting: list[dict[str, Json]] = []
        for item in usable:
            blob = daily_blob(item)
            if match_rule(blob, rule):  # type: ignore[arg-type]
                supporting.append(item)
        if len(supporting) < MIN_SUPPORTING_SOURCES:
            continue
        refs = [str(item["evidence_id"]) for item in supporting if isinstance(item.get("evidence_id"), str)]
        sources = [
            str(item.get("source_path") or item.get("source_link") or item.get("evidence_id"))
            for item in supporting
        ]
        refs = list(dict.fromkeys(refs))
        sources = list(dict.fromkeys(sources))
        n = len(refs)
        pattern = str(rule["pattern"])
        reason = build_why_with_quotes(supporting, n)
        findings.append(
            {
                "title": pattern,
                "reason": reason,
                "evidence_refs": refs,
                "supporting_sources": sources,
                "pattern": pattern,
            }
        )
        statement = principle_from_changes(supporting, str(rule["statement"]))
        principles.append(
            {
                "title": statement,
                "statement": statement,
                "proposal_id": f"principle-{rule['id']}-{n:02d}",
                "reason": reason,
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
        cleaned_sample = clean_bullet_text(sample)
        findings.append(
            {
                "title": "같은 변화가 여러 날에 반복됨",
                "reason": f"동일한 변화 기록이 {len(refs)}개 일자에서 반복되었다.\n· “{cleaned_sample[:160]}”",
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


def primary_experiment_line(experiments_list: list[Json]) -> str:
    """One next action for the week — first bullet of most recent non-empty experiment."""
    for item in reversed(experiments_list):
        if not isinstance(item, dict):
            continue
        description = item.get("description")
        if not isinstance(description, str) or not description.strip():
            continue
        first = clean_bullet_text(description.split("\n")[0])
        if first:
            return first
    return ""


def direction(experiments_list: list[Json], principles: list[Json]) -> list[str]:
    lines: list[str] = []
    primary = primary_experiment_line(experiments_list)
    if primary:
        lines.append(f"다음 한 가지: {primary}")
    if principles and isinstance(principles[0], dict):
        statement = principles[0].get("statement") or principles[0].get("title")
        if isinstance(statement, str) and statement:
            lines.append(f"검토할 원칙(pending): {statement}")
    if not lines:
        lines.append("관찰: 다음 주 성찰에서 반복되는 상황을 더 모은다.")
    else:
        lines.append("관찰: 같은 패턴이 반복되는지 기록한다.")
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
