from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Final, NewType

from evidence_meta import relationships, warning


Json = str | int | float | bool | None | list["Json"] | dict[str, "Json"]
WeekId = NewType("WeekId", str)

QUESTION: Final = "이번 주의 경험에서 무엇이 반복되었고, 무엇을 배웠는가?"
SECTION_ALIASES: Final = {
    "reflection": ("성찰", "Reflection"),
    "change": ("변화", "Change"),
    "next_experiment": ("다음 실험", "Next Experiment"),
    "references": ("연관 참조", "References"),
}
OBJECT_SECTION_ALIASES: Final = ("Object Summary", "AI Summary", "Summary", "Objective", "Investment Decision", "Decision", "Review", "Key Learning")
SOURCE_LIMIT: Final = 3000
OBJECT_LIMIT: Final = 2000
TOTAL_LIMIT: Final = 30000
LINK_LIMIT: Final = 10
REFERENCE_PATH_SEGMENTS: Final = frozenset(
    {"_samples", "old", "archive", "archives", "experiments", "playground", "migration", "scratch", "temporary", "temp"}
)


class CliError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class Period:
    start: date
    end: date
    week: WeekId


@dataclass(frozen=True, slots=True)
class DailyEvidence:
    evidence_id: str
    source_path: str
    source_link: str
    day: str
    projection: dict[str, str]
    linked_objects: list[str]

    def to_json(self) -> dict[str, Json]:
        return {"evidence_id": self.evidence_id, "evidence_type": "daily_reflection", "source_path": self.source_path, "source_link": self.source_link, "date": self.day, "recency_days": 0, "projection": self.projection, "linked_objects": self.linked_objects}


@dataclass(frozen=True, slots=True)
class ObjectReference:
    source_link: str
    first_date: str
    referenced_by: list[str]
    count: int


def parse_period(raw_week: str) -> Period:
    match = re.fullmatch(r"(\d{4})-W(\d{2})", raw_week)
    if match is None:
        raise CliError(f"week must use ISO format YYYY-Www: {raw_week}")
    start = date.fromisocalendar(int(match.group(1)), int(match.group(2)), 1)
    return Period(start=start, end=start + timedelta(days=6), week=WeekId(raw_week))


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---", 4)
    if end == -1:
        return text
    return text[end + 4 :].lstrip()


def read_frontmatter_type(text: str) -> str:
    end = text.find("\n---", 4)
    if not text.startswith("---\n") or end == -1:
        return "unknown"
    for line in text[4:end].splitlines():
        key, sep, value = line.partition(":")
        if sep and key.strip() == "type":
            clean = value.strip().strip("\"'")
            return clean if clean else "unknown"
    return "unknown"


def truncate_text(text: str, limit: int) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    cut = text[:limit]
    sentence_end = max(cut.rfind("."), cut.rfind("。"), cut.rfind("!"), cut.rfind("?"), cut.rfind("\n"))
    if sentence_end > limit // 2:
        return cut[: sentence_end + 1].rstrip(), True
    return cut.rstrip(), True


def clean_section(raw: str, limit: int) -> tuple[str, bool]:
    lines: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if stripped in {"", "-", "- "}:
            continue
        if stripped.startswith("*") and stripped.endswith("*"):
            continue
        lines.append(line.rstrip())
    return truncate_text("\n".join(lines).strip(), limit)


def normalize_heading(raw: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", raw).strip()


def extract_heading_sections(markdown: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current = ""
    for line in markdown.splitlines():
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if match is not None:
            current = normalize_heading(match.group(2))
            sections.setdefault(current, [])
            continue
        if current:
            sections[current].append(line)
    return {heading: "\n".join(value).strip() for heading, value in sections.items()}


def find_section(sections: dict[str, str], aliases: tuple[str, ...]) -> str:
    for alias in aliases:
        if alias in sections:
            return sections[alias]
    return ""


def extract_links(text: str) -> list[str]:
    links: list[str] = []
    for raw in re.findall(r"\[\[([^\]]+)\]\]", text):
        target = raw.split("|", 1)[0].split("#", 1)[0].strip()
        if target:
            links.append(f"[[{target}]]")
    return links


def is_reference_path(path: Path, vault: Path) -> bool:
    parts = {part.lower() for part in path.relative_to(vault).parts}
    return bool(parts & REFERENCE_PATH_SEGMENTS)


def daily_files(vault: Path, period: Period) -> list[Path]:
    daily_root = vault / "DAILY" / "DAILY"
    search_root = daily_root if daily_root.exists() else vault / "DAILY"
    found: list[Path] = []
    for path in sorted(search_root.glob("*.md")):
        try:
            day = date.fromisoformat(path.stem)
        except ValueError:
            continue
        if period.start <= day <= period.end:
            found.append(path)
    return found[:7]


def build_daily_evidence(vault: Path, path: Path) -> tuple[DailyEvidence, bool, bool]:
    text = path.read_text(encoding="utf-8")
    sections = extract_heading_sections(strip_frontmatter(text))
    projection: dict[str, str] = {}
    truncated = False
    for key, aliases in SECTION_ALIASES.items():
        clean, was_truncated = clean_section(find_section(sections, aliases), SOURCE_LIMIT)
        projection[key] = clean
        truncated = truncated or was_truncated
    links = list(dict.fromkeys(extract_links("\n".join(projection.values()))))
    evidence = DailyEvidence(
        evidence_id=f"daily-{path.stem}",
        source_path=path.relative_to(vault).as_posix(),
        source_link=f"[[{path.stem}]]",
        day=path.stem,
        projection=projection,
        linked_objects=links,
    )
    return evidence, any(projection.values()), truncated


def markdown_index(vault: Path) -> dict[str, Path]:
    index: dict[str, Path] = {}
    for path in sorted(vault.rglob("*.md")):
        if is_reference_path(path, vault):
            continue
        rel = path.relative_to(vault).with_suffix("").as_posix()
        index.setdefault(path.stem, path)
        index.setdefault(rel, path)
    return index


def object_references(dailies: list[DailyEvidence]) -> list[ObjectReference]:
    refs: dict[str, ObjectReference] = {}
    for daily in dailies:
        for link in daily.linked_objects:
            current = refs.get(link)
            if current is None:
                refs[link] = ObjectReference(link, daily.day, [daily.evidence_id], 1)
            else:
                refs[link] = ObjectReference(
                    link,
                    current.first_date,
                    [*current.referenced_by, daily.evidence_id],
                    current.count + 1,
                )
    return sorted(refs.values(), key=lambda ref: (-ref.count, ref.first_date, ref.source_link))[:LINK_LIMIT]


def normalize_key(raw: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")


def object_date(path: Path, ref: ObjectReference) -> str:
    try:
        return date.fromisoformat(path.stem).isoformat()
    except ValueError:
        return ref.first_date


def project_object(vault: Path, path: Path, ref: ObjectReference, latest: date) -> tuple[dict[str, Json], bool]:
    text = path.read_text(encoding="utf-8")
    sections = extract_heading_sections(strip_frontmatter(text))
    projection: dict[str, str] = {}
    truncated = False
    for alias in OBJECT_SECTION_ALIASES:
        if alias in sections:
            clean, was_truncated = clean_section(sections[alias], OBJECT_LIMIT)
            if clean:
                projection[normalize_key(alias)] = clean
            truncated = truncated or was_truncated
    if not projection:
        projection["excerpt"], truncated = clean_section(strip_frontmatter(text), OBJECT_LIMIT)
    item_date = object_date(path, ref)
    return {"evidence_id": "object-" + re.sub(r"[^a-zA-Z0-9]+", "-", path.stem).strip("-").lower(), "evidence_type": read_frontmatter_type(text), "source_path": path.relative_to(vault).as_posix(), "source_link": ref.source_link, "date": item_date, "recency_days": (latest - date.fromisoformat(item_date)).days, "referenced_by": ref.referenced_by, "projection": projection}, truncated


def package(vault: Path, period: Period) -> dict[str, Json]:
    warnings: list[dict[str, Json]] = []
    missing: list[Json] = []
    dailies: list[DailyEvidence] = []
    daily_used = 0
    empty_reflections = 0
    for path in daily_files(vault, period):
        evidence, has_content, truncated = build_daily_evidence(vault, path)
        dailies.append(evidence)
        daily_used += int(has_content)
        empty_reflections += int(not has_content)
        if truncated:
            warnings.append(warning("WARNING", "daily_truncated", evidence.source_path))
    latest = max((date.fromisoformat(item.day) for item in dailies), default=period.end)
    dailies_json = []
    for item in dailies:
        value = item.to_json()
        value["recency_days"] = (latest - date.fromisoformat(item.day)).days
        dailies_json.append(value)
    index = markdown_index(vault)
    supporting: list[Json] = []
    used_links = 0
    for ref in object_references(dailies):
        target = index.get(ref.source_link.strip("[]"))
        if target is None:
            missing.append({"source_link": ref.source_link, "referenced_by": ref.referenced_by})
            warnings.append(warning("WARNING", "missing_link", ref.source_link))
            continue
        projected, truncated = project_object(vault, target, ref, latest)
        supporting.append(projected)
        used_links += 1
        if truncated:
            warnings.append(warning("WARNING", "object_truncated", str(projected["source_path"])))
    estimated = len(json.dumps(dailies_json, ensure_ascii=False))
    estimated += len(json.dumps(supporting, ensure_ascii=False))
    if daily_used == 0:
        warnings.append(warning("ERROR", "insufficient_primary_evidence", "No meaningful Daily Reflection found"))
    if estimated > TOTAL_LIMIT:
        warnings.append(warning("WARNING", "total_character_limit_exceeded", str(estimated)))
    found_links = sum(len(daily.linked_objects) for daily in dailies)
    stats: dict[str, Json] = {
        "daily_files_found": len(dailies),
        "daily_files_used": daily_used,
        "linked_objects_found": found_links,
        "linked_objects_used": used_links,
        "linked_objects_excluded": max(0, found_links - LINK_LIMIT),
        "empty_reflections": empty_reflections,
        "missing_links": len(missing),
        "estimated_characters": estimated,
    }
    period_json: dict[str, Json] = {"start": period.start.isoformat(), "end": period.end.isoformat(), "week": period.week}
    coverage: dict[str, Json] = {"daily_found": len(dailies), "daily_used": daily_used, "linked_found": found_links, "linked_used": used_links, "missing": len(missing)}
    recency: dict[str, Json] = {"latest": latest.isoformat(), "oldest": min((item.day for item in dailies), default=period.start.isoformat())}
    return {"schema_version": "1.0", "package_id": f"weekly-learning-{period.week}", "review_type": "learning", "workspace": "journal", "question": QUESTION, "period": period_json, "primary_evidence": dailies_json, "supporting_evidence": supporting, "relationships": relationships(dailies, supporting), "coverage": coverage, "recency": recency, "statistics": stats, "missing": missing, "warnings": warnings, "references": [item.source_path for item in dailies]}
