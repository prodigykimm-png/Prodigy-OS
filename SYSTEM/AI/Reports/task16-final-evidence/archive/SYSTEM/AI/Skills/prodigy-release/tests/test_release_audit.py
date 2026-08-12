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


SCRIPT = Path(__file__).parents[1] / "scripts" / "release_audit.py"


class Categories(TypedDict):
    feature: list[str]
    operational_data: list[str]
    personal_config: list[str]
    cache_runtime: list[str]


class AuditItem(TypedDict):
    code: str
    path: str


class SecretCandidate(TypedDict):
    kind: str
    path: str


class ReleaseReport(TypedDict):
    categories: Categories
    deletions: list[str]
    secret_candidates: list[SecretCandidate]
    warnings: list[AuditItem]
    clean: bool


def run(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _ = path.write_text(content, encoding="utf-8")


def init_repo(repo: Path) -> None:
    _ = run("git", "init", "-q", cwd=repo)
    _ = run("git", "config", "user.email", "fixture@example.com", cwd=repo)
    _ = run("git", "config", "user.name", "Fixture", cwd=repo)
    write(repo / "SYSTEM/Views/card.js", "export const card = true;\n")
    write(repo / "SYSTEM/old.js", "export const old = true;\n")
    _ = run("git", "add", ".", cwd=repo)
    _ = run("git", "commit", "-qm", "fixture", cwd=repo)


def audit(repo: Path) -> ReleaseReport:
    result = run(
        sys.executable,
        str(SCRIPT),
        "--repo",
        str(repo),
        "--format",
        "json",
        cwd=repo,
    )
    return cast(ReleaseReport, json.loads(result.stdout))


def test_classifies_risky_changes_and_secret_candidates(tmp_path: Path) -> None:
    init_repo(tmp_path)
    fake_secret = "sk-" + "prodigy-12345678901234567890"
    write(tmp_path / "SYSTEM/Views/card.js", "export const card = false;\n")
    write(tmp_path / "DAILY/DAILY/2026-07-15.md", "# Reflection\n")
    write(tmp_path / ".obsidian/workspace.json", "{}\n")
    write(tmp_path / "SYSTEM/CACHE/runtime/a.json", "{}\n")
    write(tmp_path / ".omo/evidence/review.md", "generated review\n")
    write(
        tmp_path / "SYSTEM/Views/provider.js",
        f'const token = "{fake_secret}";\n',
    )
    (tmp_path / "SYSTEM/old.js").unlink()

    report = audit(tmp_path)
    categories = report["categories"]
    assert "SYSTEM/Views/card.js" in categories["feature"]
    assert "SYSTEM/Views/provider.js" in categories["feature"]
    assert "DAILY/DAILY/2026-07-15.md" in categories["operational_data"]
    assert ".obsidian/workspace.json" in categories["personal_config"]
    assert "SYSTEM/CACHE/runtime/a.json" in categories["cache_runtime"]
    assert ".omo/evidence/review.md" in categories["cache_runtime"]
    assert "SYSTEM/old.js" in report["deletions"]
    assert report["secret_candidates"] == [
        {"kind": "api_key", "path": "SYSTEM/Views/provider.js"}
    ]
    assert report["clean"] is False


def test_feature_only_change_has_no_risk_warning(tmp_path: Path) -> None:
    init_repo(tmp_path)
    write(tmp_path / "SYSTEM/Views/card.js", "export const card = false;\n")

    report = audit(tmp_path)
    assert report["categories"]["feature"] == ["SYSTEM/Views/card.js"]
    assert report["deletions"] == []
    assert report["secret_candidates"] == []
    assert report["warnings"] == []


def test_korean_and_spaced_operational_paths_are_not_features(tmp_path: Path) -> None:
    init_repo(tmp_path)
    korean = "PARA/PROJECTS/Reading/책 이름.md"
    spaced = "PARA/PROJECTS/Auction/Space Name.md"
    write(tmp_path / korean, "# 책\n")
    write(tmp_path / spaced, "# Auction\n")

    report = audit(tmp_path)

    assert report["categories"]["operational_data"] == [spaced, korean]
    assert spaced not in report["categories"]["feature"]
    assert korean not in report["categories"]["feature"]


def test_renamed_korean_operational_path_uses_destination_path(tmp_path: Path) -> None:
    init_repo(tmp_path)
    original = "PARA/PROJECTS/Reading/기존 책.md"
    renamed = "PARA/PROJECTS/Reading/새 책 이름.md"
    write(tmp_path / original, "# 기존 책\n")
    _ = run("git", "add", original, cwd=tmp_path)
    _ = run("git", "commit", "-qm", "add operational fixture", cwd=tmp_path)
    _ = run("git", "mv", original, renamed, cwd=tmp_path)

    report = audit(tmp_path)

    assert report["categories"]["operational_data"] == [renamed]
    assert original not in report["categories"]["feature"]
    assert renamed not in report["categories"]["feature"]
