# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TypedDict


SECRET_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bAIza[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?i)authorization\s*[:=]\s*[\"']?bearer\s+[A-Za-z0-9._-]{16,}"),
)


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
    branch: str
    upstream: str
    categories: Categories
    deletions: list[str]
    secret_candidates: list[SecretCandidate]
    staged: list[str]
    unstaged: list[str]
    untracked: list[str]
    warnings: list[AuditItem]
    clean: bool


class CliNamespace(argparse.Namespace):
    def __init__(self) -> None:
        super().__init__()
        self.repo: Path = Path.cwd()
        self.format: str = "text"


@dataclass(frozen=True, slots=True)
class Change:
    path: str
    index: str
    worktree: str


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ("git", *args),
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def changes(repo: Path) -> list[Change]:
    result = subprocess.run(
        ("git", "status", "--porcelain=v1", "-z", "--untracked-files=all"),
        cwd=repo,
        check=True,
        capture_output=True,
    )
    records = result.stdout.decode("utf-8", errors="surrogateescape").split("\0")
    found: list[Change] = []
    index = 0
    while index < len(records):
        record = records[index]
        index += 1
        if len(record) < 4:
            continue
        status = record[:2]
        found.append(Change(path=record[3:], index=status[0], worktree=status[1]))
        if "R" in status or "C" in status:
            index += 1
    return sorted(found, key=lambda item: item.path.casefold())


def category(path: str) -> str:
    lowered = path.casefold()
    if lowered.startswith(("daily/", "para/")):
        return "operational_data"
    if lowered.startswith((".obsidian/", ".gjc/")):
        return "personal_config"
    if (
        lowered.startswith(("system/cache/", ".cache/", ".omo/"))
        or "/runtime/" in lowered
    ):
        return "cache_runtime"
    return "feature"


def secret_candidates(repo: Path, items: list[Change]) -> list[SecretCandidate]:
    candidates: list[SecretCandidate] = []
    for item in items:
        path = repo / item.path
        if not path.is_file() or path.stat().st_size > 1_000_000:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if any(pattern.search(content) for pattern in SECRET_PATTERNS):
            candidates.append({"kind": "api_key", "path": item.path})
    return candidates


def build_report(repo: Path) -> ReleaseReport:
    items = changes(repo)
    categories: Categories = {
        "feature": [],
        "operational_data": [],
        "personal_config": [],
        "cache_runtime": [],
    }
    for item in items:
        group = category(item.path)
        if group == "operational_data":
            categories["operational_data"].append(item.path)
        elif group == "personal_config":
            categories["personal_config"].append(item.path)
        elif group == "cache_runtime":
            categories["cache_runtime"].append(item.path)
        else:
            categories["feature"].append(item.path)
    deletions = [item.path for item in items if "D" in (item.index, item.worktree)]
    secrets = secret_candidates(repo, items)
    warnings: list[AuditItem] = []
    for path in deletions:
        warnings.append({"code": "deletion", "path": path})
    for candidate in secrets:
        warnings.append({"code": "secret_candidate", "path": candidate["path"]})
    for group in ("operational_data", "personal_config", "cache_runtime"):
        for path in categories[group]:
            warnings.append({"code": group, "path": path})
    upstream = git(repo, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}") if has_upstream(repo) else ""
    return {
        "branch": git(repo, "branch", "--show-current"),
        "upstream": upstream,
        "categories": categories,
        "deletions": deletions,
        "secret_candidates": secrets,
        "staged": [item.path for item in items if item.index not in (" ", "?")],
        "unstaged": [item.path for item in items if item.worktree not in (" ", "?")],
        "untracked": [item.path for item in items if item.index == "?"],
        "warnings": warnings,
        "clean": not items,
    }


def has_upstream(repo: Path) -> bool:
    result = subprocess.run(
        ("git", "rev-parse", "--verify", "@{u}"),
        cwd=repo,
        check=False,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def render_text(report: ReleaseReport) -> str:
    categories = report["categories"]
    lines = [f"Branch: {report['branch'] or '(detached)'}"]
    for name in ("feature", "operational_data", "personal_config", "cache_runtime"):
        paths = categories[name]
        lines.append(f"{name}: {len(paths)}")
        lines.extend(f"  - {path}" for path in paths)
    lines.append(f"deletions: {len(report['deletions'])}")
    lines.append(f"secret_candidates: {len(report['secret_candidates'])}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit a Prodigy OS release without changes.")
    _ = parser.add_argument("--repo", type=Path, default=Path.cwd())
    _ = parser.add_argument("--format", choices=("text", "json"), default="text")
    args = parser.parse_args(namespace=CliNamespace())
    report = build_report(args.repo.resolve())
    if args.format == "json":
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(render_text(report))


if __name__ == "__main__":
    main()
