# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/scripts/build_operation_reports.py --vault . --health-output object-health.md --inbox-output review-inbox.md

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, TypedDict

from evidence_core import extract_heading_sections, extract_links, is_reference_path, strip_frontmatter


IssueKind = Literal[
    "missing_required_property",
    "missing_required_content",
    "missing_review",
    "missing_reflection",
    "missing_learning",
    "missing_interaction",
    "broken_object_link",
    "invalid_progress",
    "unknown_status",
]


class Frontmatter(TypedDict, total=False):
    type: str
    status: str
    expected_bid: str
    expected_monthly_rent: str
    exit_price: str
    site_visit_date: str
    decision_reason: str
    market_price_basis: str
    key_takeaway: str
    last_contact: str
    progress: str


@dataclass(frozen=True, slots=True)
class HealthIssue:
    source_path: str
    object_type: str
    kind: IssueKind
    field: str
    message: str


@dataclass(frozen=True, slots=True)
class OperationReport:
    scanned_files: int
    health_issues: list[HealthIssue]
    inbox_items: list[HealthIssue]


KNOWN_STATUSES: Final = frozenset(
    {
        "active",
        "archived",
        "bidding",
        "completed",
        "doing",
        "done",
        "finished",
        "idea",
        "lost",
        "planned",
        "queue",
        "reading",
        "reviewing",
        "skipped",
        "watching",
        "won",
    }
)
READING_PROGRESS_VALUES: Final = frozenset({"", "0", "25", "50", "75", "100"})
AUCTION_REQUIRED: Final = ("expected_bid", "expected_monthly_rent", "exit_price", "site_visit_date", "decision_reason", "market_price_basis")
OPERATIONAL_ROOTS: Final = ("DAILY", "PARA", "STICKY", "ZETA")
PRIORITY: Final[dict[IssueKind, int]] = {
    "broken_object_link": 0,
    "unknown_status": 1,
    "missing_required_property": 2,
    "missing_review": 3,
    "missing_reflection": 3,
    "missing_learning": 3,
    "missing_interaction": 3,
    "missing_required_content": 4,
    "invalid_progress": 4,
}


def parse_frontmatter(text: str) -> Frontmatter:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    result: Frontmatter = {}
    for line in text[4:end].splitlines():
        key, sep, value = line.partition(":")
        clean_key = key.strip()
        if sep and clean_key:
            result[clean_key] = value.strip().strip("\"'")
    return result


def has_content(value: str | None) -> bool:
    if value is None:
        return False
    clean = value.strip()
    return clean not in {"", "-", "정보 없음", "n/a", "N/A", "none", "None", "null"}


def section_has_content(sections: dict[str, str], aliases: tuple[str, ...]) -> bool:
    for alias in aliases:
        section = sections.get(alias)
        if section is not None and meaningful_section_content(section):
            return True
    return False


def meaningful_section_content(section: str) -> bool:
    for line in section.splitlines():
        clean = line.strip()
        if not has_content(clean):
            continue
        if clean.startswith("*") and clean.endswith("*"):
            continue
        if "YYYY-MM-DD" in clean:
            continue
        return True
    return False


def operational_markdown_files(vault: Path) -> list[Path]:
    found: list[Path] = []
    for root in OPERATIONAL_ROOTS:
        base = vault / root
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.md")):
            if not is_reference_path(path, vault):
                found.append(path)
    return found


def markdown_index(vault: Path) -> set[str]:
    index: set[str] = set()
    for path in operational_markdown_files(vault):
        rel = path.relative_to(vault).with_suffix("").as_posix()
        index.add(path.stem)
        index.add(rel)
    return index


def issue(path: Path, vault: Path, object_type: str, kind: IssueKind, field: str, message: str) -> HealthIssue:
    return HealthIssue(path.relative_to(vault).as_posix(), object_type or "unknown", kind, field, message)


def frontmatter_issues(path: Path, vault: Path, fm: Frontmatter) -> list[HealthIssue]:
    result: list[HealthIssue] = []
    object_type = fm.get("type", "")
    status = fm.get("status", "")
    if not has_content(object_type):
        result.append(issue(path, vault, object_type, "missing_required_property", "type", "Missing required property: type"))
    if not has_content(status):
        result.append(issue(path, vault, object_type, "missing_required_property", "status", "Missing required property: status"))
    elif status not in KNOWN_STATUSES:
        result.append(issue(path, vault, object_type, "unknown_status", "status", f"Unknown status: {status}"))
    return result


def auction_issues(path: Path, vault: Path, fm: Frontmatter) -> list[HealthIssue]:
    return [
        issue(path, vault, "auction_case", "missing_required_property", field, f"Auction missing required field: {field}")
        for field in AUCTION_REQUIRED
        if not has_content(fm.get(field))
    ]


def reading_issues(path: Path, vault: Path, fm: Frontmatter, sections: dict[str, str]) -> list[HealthIssue]:
    result: list[HealthIssue] = []
    progress = fm.get("progress", "")
    if progress not in READING_PROGRESS_VALUES:
        result.append(issue(path, vault, fm.get("type", "reading"), "invalid_progress", "progress", f"Invalid reading progress: {progress}"))
    if not has_content(fm.get("key_takeaway")) and not section_has_content(sections, ("What I Learned", "Key Takeaways")):
        result.append(issue(path, vault, fm.get("type", "reading"), "missing_learning", "learning", "Reading missing learning"))
    return result


def people_issues(path: Path, vault: Path, fm: Frontmatter, sections: dict[str, str]) -> list[HealthIssue]:
    if has_content(fm.get("last_contact")) or section_has_content(sections, ("Key Interactions",)):
        return []
    return [issue(path, vault, fm.get("type", "people"), "missing_interaction", "interaction", "People missing interaction")]


def daily_issues(path: Path, vault: Path, fm: Frontmatter, sections: dict[str, str]) -> list[HealthIssue]:
    if fm.get("type") != "journal":
        return []
    if section_has_content(sections, ("성찰", "Reflection")):
        return []
    return [issue(path, vault, "journal", "missing_reflection", "reflection", "Daily missing reflection")]


def broken_link_issues(path: Path, vault: Path, text: str, index: set[str], object_type: str) -> list[HealthIssue]:
    result: list[HealthIssue] = []
    for link in dict.fromkeys(extract_links(strip_frontmatter(text))):
        target = link.strip("[]")
        if target == "YYYY-MM-DD":
            continue
        if target not in index:
            result.append(issue(path, vault, object_type, "broken_object_link", target, f"Broken Object link: {link}"))
    return result


def file_issues(path: Path, vault: Path, index: set[str]) -> list[HealthIssue]:
    text = path.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    sections = extract_heading_sections(strip_frontmatter(text))
    object_type = fm.get("type", "")
    result = frontmatter_issues(path, vault, fm)
    match object_type:
        case "auction_case":
            result.extend(auction_issues(path, vault, fm))
        case "reading":
            result.extend(reading_issues(path, vault, fm, sections))
        case "people" | "contact":
            result.extend(people_issues(path, vault, fm, sections))
        case "journal":
            result.extend(daily_issues(path, vault, fm, sections))
        case _:
            pass
    result.extend(broken_link_issues(path, vault, text, index, object_type or "unknown"))
    return result


def build_operation_report(vault: Path) -> OperationReport:
    files = operational_markdown_files(vault)
    index = markdown_index(vault)
    issues: list[HealthIssue] = []
    for path in files:
        issues.extend(file_issues(path, vault, index))
    ordered = sorted(issues, key=lambda item: (item.source_path, item.kind, item.field))
    inbox = sorted(ordered, key=lambda item: (PRIORITY[item.kind], item.object_type, item.source_path, item.field))
    return OperationReport(len(files), ordered, inbox)


def render_object_health(report: OperationReport) -> str:
    lines = ["# Object Health Report", "", f"- Scanned Files: `{report.scanned_files}`", f"- Issues: `{len(report.health_issues)}`", ""]
    if not report.health_issues:
        lines.extend(["## Missing", "", "No missing operational data found.", ""])
        return "\n".join(lines)
    lines.extend(["## Missing", ""])
    current = ""
    for item in report.health_issues:
        if item.source_path != current:
            current = item.source_path
            lines.extend([f"### {current}", ""])
        lines.append(f"- `{item.object_type}` / `{item.field}`: {item.message}")
    lines.append("")
    return "\n".join(lines)


def render_review_inbox(report: OperationReport) -> str:
    lines = ["# Review Inbox", "", f"- Items: `{len(report.inbox_items)}`", ""]
    if not report.inbox_items:
        lines.extend(["## Needs Review", "", "No review items found.", ""])
        return "\n".join(lines)
    lines.extend(["## Needs Review", ""])
    for item in report.inbox_items:
        title = item.kind.replace("_", " ")
        lines.append(f"- **{title}**: `{item.source_path}` — {item.message}")
    lines.append("")
    return "\n".join(lines)
