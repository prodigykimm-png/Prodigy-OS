# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TypedDict


SNAKE_CASE: Final[re.Pattern[str]] = re.compile(r"^[a-z][a-z0-9_]*$")
VISIBLE_RAW_KEY: Final[re.Pattern[str]] = re.compile("".join((
    r"(?:text|label|title)\s*:\s*[\"']([a-z][a-z0-9_]+)[\"']",
    r"|(?:setText|setButtonText)\(\s*[\"']([a-z][a-z0-9_]+)[\"']",
    r"|(?:textContent|innerText)\s*=\s*[\"']([a-z][a-z0-9_]+)[\"']",
)))


class IssueJson(TypedDict):
    severity: str
    code: str
    path: str
    value: str
    message: str


class Counts(TypedDict):
    error: int
    warning: int


class PropertyReport(TypedDict):
    issues: list[IssueJson]
    counts: Counts


class CliNamespace(argparse.Namespace):
    def __init__(self) -> None:
        super().__init__()
        self.vault: Path = Path.cwd()
        self.format: str = "text"
        self.removed_property: list[str] = []


@dataclass(frozen=True, slots=True)
class Issue:
    severity: str
    code: str
    path: str
    value: str
    message: str

    def to_json(self) -> IssueJson:
        return {
            "severity": self.severity,
            "code": self.code,
            "path": self.path,
            "value": self.value,
            "message": self.message,
        }


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def frontmatter(path: Path) -> dict[str, str]:
    text = read(path)
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end < 0:
        return {}
    result: dict[str, str] = {}
    for line in text[4:end].splitlines():
        match = re.match(r"^([A-Za-z0-9_-]+):(?:\s*(.*))?$", line)
        if match:
            result[match.group(1)] = (match.group(2) or "").strip(" \"'")
    return result


def registry_block(text: str, name: str) -> str:
    expression = rf"(?:export\s+)?const\s+{re.escape(name)}\s*=\s*" + r"(?:Object\.freeze\()?\{(.*?)\}\)?;"
    pattern = re.compile(expression, re.DOTALL)
    match = pattern.search(text)
    return match.group(1) if match else ""


def registry_keys(text: str, name: str) -> set[str]:
    body = registry_block(text, name)
    keys: set[str] = set()
    depth = 0
    quote = ""
    escaped = False
    position = 0
    while position < len(body):
        char = body[position]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            position += 1
            continue
        if char in "\"'":
            quote = char
            position += 1
            continue
        if char in "({[":
            depth += 1
            position += 1
            continue
        if char in ")}]":
            depth -= 1
            position += 1
            continue
        if depth == 0 and (position == 0 or body[position - 1] in ",\n"):
            match = re.match(r"\s*(?:[\"']([^\"']+)[\"']|([A-Za-z_][A-Za-z0-9_]*))\s*:", body[position:])
            if match:
                keys.add(match.group(1) or match.group(2))
                position += match.end()
                continue
        position += 1
    return keys


def registry_labels(text: str, name: str) -> dict[str, str]:
    body = registry_block(text, name)
    if name == "PROPERTY_LABELS":
        pattern = re.compile(r'(?:^|,)\s*(?:["\']([^"\']+)["\']|([A-Za-z_][A-Za-z0-9_]*))\s*:\s*["\']([^"\']+)["\']')
    else:
        pattern = re.compile(r'(?:^|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:Object\.freeze\()?\{\s*label\s*:\s*["\']([^"\']+)["\']')
    labels: dict[str, str] = {}
    for match in pattern.finditer(body):
        if name == "PROPERTY_LABELS":
            labels[match.group(1) or match.group(2)] = match.group(3)
        else:
            labels[match.group(1)] = match.group(2)
    return labels


def display_label_issues(registry: str) -> list[Issue]:
    relative = "SYSTEM/Views/display-registry.js"
    issues: list[Issue] = []
    for registry_name, code in (
        ("PROPERTY_LABELS", "non_korean_property_label"),
        ("STATUS_INFO", "non_korean_status_label"),
        ("TYPE_INFO", "non_korean_type_label"),
    ):
        for key, label in registry_labels(registry, registry_name).items():
            if re.search(r"[가-힣]", label) is None:
                issues.append(Issue("ERROR", code, relative, key, f"Display label must contain Korean text: {label}"))
    return issues


def schema_properties(path: Path) -> set[str]:
    text = read(path)
    properties = set(re.findall(r"###\s+`([a-z][a-z0-9_]*)`", text))
    properties.update(re.findall(r"^\|\s*`([a-z][a-z0-9_]*)`\s*\|", text, re.MULTILINE))
    properties.update(re.findall(r"^([a-z][a-z0-9_]*):", text, re.MULTILINE))
    return properties


def schema_contracts(vault: Path) -> tuple[set[str], dict[str, set[str]]]:
    root = vault / "SYSTEM/Prodigy/Schema"
    core_path = root / "Core_Property_Schema.md"
    core = schema_properties(core_path) if core_path.exists() else set[str]()
    contracts: dict[str, set[str]] = {}
    if root.exists():
        for path in root.glob("*_Schema.md"):
            if path.name == "Core_Property_Schema.md":
                continue
            object_type = path.stem.removesuffix("_Schema").casefold()
            contracts[object_type] = schema_properties(path)
    return core, contracts


def template_issues(
    vault: Path,
    labels: set[str],
    statuses: set[str],
    types: set[str],
    core_schema: set[str],
    schemas: dict[str, set[str]],
) -> list[Issue]:
    issues: list[Issue] = []
    root = vault / "SYSTEM/TEMPLATE/FORMAT"
    for path in sorted(root.glob("template_*.md")) if root.exists() else []:
        relative = path.relative_to(vault).as_posix()
        properties = frontmatter(path)
        for key in properties:
            if not SNAKE_CASE.fullmatch(key):
                issues.append(Issue("ERROR", "invalid_property_key", relative, key, "Property key is not English snake_case."))
            elif key not in labels:
                issues.append(Issue("ERROR", "missing_property_label", relative, key, "Property has no Display Registry label."))
        status = properties.get("status", "")
        if status and "<%" not in status and status not in statuses:
            issues.append(Issue("ERROR", "unknown_status_label", relative, status, "Status has no Korean display label."))
        object_type = properties.get("type", "")
        if object_type and "<%" not in object_type and object_type not in types:
            issues.append(Issue("ERROR", "unknown_type_label", relative, object_type, "Type has no Korean display label."))
        if object_type in schemas:
            allowed = core_schema | schemas[object_type]
            for key in properties.keys() - allowed:
                issues.append(Issue("ERROR", "template_schema_conflict", relative, key, "Template Property is not declared in its official Schema."))
    return issues


def raw_label_issues(vault: Path, properties: set[str]) -> list[Issue]:
    issues: list[Issue] = []
    roots = (vault / "SYSTEM/Views", vault / "HUB")
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(candidate for candidate in root.rglob("*") if candidate.suffix in {".js", ".md"}):
            if path.name == "display-registry.js":
                continue
            relative = path.relative_to(vault).as_posix()
            for match in VISIBLE_RAW_KEY.finditer(read(path)):
                key = next(group for group in match.groups() if group is not None)
                if key in properties:
                    issues.append(Issue("WARNING", "raw_property_label", relative, key, "UI may expose a raw Property key."))
    return issues


def removed_reference_issues(vault: Path, removed: tuple[str, ...]) -> list[Issue]:
    issues: list[Issue] = []
    if not removed:
        return issues
    roots = (vault / "SYSTEM", vault / "HUB")
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(candidate for candidate in root.rglob("*") if candidate.suffix in {".py", ".js", ".md", ".json"}):
            relative = path.relative_to(vault).as_posix()
            content = read(path)
            for key in removed:
                if re.search(rf"\b{re.escape(key)}\b", content):
                    issues.append(Issue("ERROR", "removed_property_reference", relative, key, "Removed Property is still referenced."))
    return issues


def build_report(vault: Path, removed: tuple[str, ...]) -> PropertyReport:
    registry_path = vault / "SYSTEM/Views/display-registry.js"
    registry = read(registry_path) if registry_path.exists() else ""
    labels = registry_keys(registry, "PROPERTY_LABELS")
    statuses = registry_keys(registry, "STATUS_INFO")
    types = registry_keys(registry, "TYPE_INFO")
    core_schema, schemas = schema_contracts(vault)
    template_root = vault / "SYSTEM/TEMPLATE/FORMAT"
    template_properties = {
        key
        for path in template_root.glob("template_*.md") if template_root.exists()
        for key in frontmatter(path)
    }
    issues = template_issues(vault, labels, statuses, types, core_schema, schemas)
    issues.extend(display_label_issues(registry))
    issues.extend(raw_label_issues(vault, labels | template_properties))
    issues.extend(removed_reference_issues(vault, removed))
    issues.sort(key=lambda item: (item.severity, item.code, item.path, item.value))
    return {
        "issues": [issue.to_json() for issue in issues],
        "counts": {
            "error": sum(issue.severity == "ERROR" for issue in issues),
            "warning": sum(issue.severity == "WARNING" for issue in issues),
        },
    }


def render_text(report: PropertyReport) -> str:
    issues = report["issues"]
    if not issues:
        return "Property contract: PASS"
    lines = [f"Property contract: {len(issues)} issue(s)"]
    lines.extend(f"{item['severity']} {item['code']} {item['path']}: {item['value']}" for item in issues)
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Prodigy OS Property contracts without changes.")
    _ = parser.add_argument("--vault", type=Path, default=Path.cwd())
    _ = parser.add_argument("--format", choices=("text", "json"), default="text")
    _ = parser.add_argument("--removed-property", action="append", default=[])
    args = parser.parse_args(namespace=CliNamespace())
    report = build_report(args.vault.resolve(), tuple(args.removed_property))
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.format == "json" else render_text(report))
    raise SystemExit(1 if report["counts"]["error"] else 0)


if __name__ == "__main__":
    main()
