# /// script
# requires-python = ">=3.12"
# dependencies = ["pytest>=8.0"]
# ///

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import TypedDict, cast


SCRIPT = Path(__file__).parents[1] / "scripts" / "audit_property_contract.py"


class IssueJson(TypedDict):
    code: str


class Counts(TypedDict):
    error: int
    warning: int


class PropertyReport(TypedDict):
    issues: list[IssueJson]
    counts: Counts


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _ = path.write_text(content, encoding="utf-8")


def make_vault(root: Path, *, broken: bool, english_labels: bool = False) -> None:
    invalid = "bad-Key: value\nrogue_property: value\n" if broken else ""
    write(
        root / "SYSTEM/Prodigy/Schema/Core_Property_Schema.md",
        "### `type`\n### `status`\n",
    )
    write(
        root / "SYSTEM/Prodigy/Schema/Auction_Case_Schema.md",
        "".join((
            "```yaml\ntype: auction_case\nstatus:\n```\n",
            "| Property | Purpose |\n|---|---|\n| `expected_bid` | bid |\n",
        )),
    )
    write(
        root / "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md",
        "".join((
            "---\ntype: auction_case\nstatus: bidding\nexpected_bid:\n",
            invalid,
            "---\n# Summary\n",
        )),
    )
    property_label = "Expected Bid" if english_labels else "예상 입찰가"
    status_label = "Bidding" if english_labels else "입찰 예정"
    type_label = "Auction" if english_labels else "경매"
    property_labels = "" if broken else f'  expected_bid: "{property_label}",\n'
    status_labels = "" if broken else f'  bidding: {{ label: "{status_label}" }},\n'
    write(
        root / "SYSTEM/Views/display-registry.js",
        "".join((
            "export const PROPERTY_LABELS = {\n",
            '  type: "유형",\n  status: "상태",\n',
            f"{property_labels}}};\n",
            "export const STATUS_INFO = {\n",
            f"{status_labels}}};\n",
            "export const TYPE_INFO = {\n",
            f'  auction_case: {{ label: "{type_label}" }},\n}};\n',
        )),
    )
    if broken:
        write(
            root / "SYSTEM/Views/auction-card.js",
            'card.createEl("span", { text: "expected_bid" });\n',
        )
        write(
            root / "SYSTEM/AI/Skills/example-validator.py",
            'required = ["purpose"]\n',
        )


def audit(root: Path, *extra: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--vault",
            str(root),
            "--format",
            "json",
            *extra,
        ],
        check=False,
        capture_output=True,
        text=True,
    )


def test_reports_contract_conflicts(tmp_path: Path) -> None:
    make_vault(tmp_path, broken=True)
    result = audit(tmp_path, "--removed-property", "purpose")
    report = cast(PropertyReport, json.loads(result.stdout))
    codes = {issue["code"] for issue in report["issues"]}

    assert result.returncode == 1
    assert {
        "invalid_property_key",
        "missing_property_label",
        "template_schema_conflict",
        "unknown_status_label",
        "raw_property_label",
        "removed_property_reference",
    } <= codes


def test_accepts_consistent_template_and_registry(tmp_path: Path) -> None:
    make_vault(tmp_path, broken=False)
    result = audit(tmp_path)
    report = cast(PropertyReport, json.loads(result.stdout))

    assert result.returncode == 0
    assert report["issues"] == []
    assert report["counts"] == {"error": 0, "warning": 0}


def test_rejects_english_display_label_values(tmp_path: Path) -> None:
    make_vault(tmp_path, broken=False, english_labels=True)
    result = audit(tmp_path)
    report = cast(PropertyReport, json.loads(result.stdout))
    codes = {issue["code"] for issue in report["issues"]}

    assert result.returncode == 1
    assert {
        "non_korean_property_label",
        "non_korean_status_label",
        "non_korean_type_label",
    } <= codes


def test_skips_obsidian_and_journals_reserved_keys(tmp_path: Path) -> None:
    make_vault(tmp_path, broken=False)
    write(
        tmp_path / "SYSTEM/TEMPLATE/FORMAT/template_daily_note.md",
        "".join((
            "---\n",
            "type: journal\n",
            "status: open\n",
            "tags:\n",
            "aliases:\n",
            "cssclasses:\n",
            "journal: true\n",
            "journal-date: 2026-07-18\n",
            "journal-start-date: 2026-07-18\n",
            "journal-end-date: 2026-07-18\n",
            "journal-section: daily\n",
            "---\n# Daily\n",
        )),
    )
    write(
        tmp_path / "SYSTEM/Prodigy/Schema/Journal_Schema.md",
        "".join((
            "```yaml\ntype: journal\nstatus:\n```\n",
            "| Property | Purpose |\n|---|---|\n| `status` | workflow |\n",
        )),
    )
    registry = (tmp_path / "SYSTEM/Views/display-registry.js").read_text(encoding="utf-8")
    registry = registry.replace(
        "export const STATUS_INFO = {\n",
        'export const STATUS_INFO = {\n  open: { label: "열림" },\n',
    )
    registry = registry.replace(
        "export const TYPE_INFO = {\n",
        'export const TYPE_INFO = {\n  journal: { label: "저널" },\n',
    )
    _ = (tmp_path / "SYSTEM/Views/display-registry.js").write_text(registry, encoding="utf-8")

    result = audit(tmp_path)
    report = cast(PropertyReport, json.loads(result.stdout))
    reserved_values = {issue.get("value") for issue in report["issues"]}
    assert result.returncode == 0
    assert report["issues"] == []
    assert not {
        "tags",
        "aliases",
        "cssclasses",
        "journal",
        "journal-date",
        "journal-start-date",
        "journal-end-date",
        "journal-section",
    } & reserved_values

