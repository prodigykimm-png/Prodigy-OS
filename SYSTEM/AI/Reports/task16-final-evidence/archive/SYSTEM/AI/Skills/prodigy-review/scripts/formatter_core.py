from __future__ import annotations


Json = str | int | float | bool | None | list["Json"] | dict[str, "Json"]
REQUIRED_KEYS = ("summary", "findings", "meaningful_changes", "experiments", "suggested_principles", "next_week_direction", "limitations", "references")


class FormatterInputError(Exception):
    pass


def validate_review(review: dict[str, Json]) -> None:
    missing = [key for key in REQUIRED_KEYS if key not in review]
    if missing:
        raise FormatterInputError("missing required keys: " + ", ".join(missing))


def text(value: Json, fallback: str = "") -> str:
    return value if isinstance(value, str) else fallback


def refs(value: Json) -> str:
    if not isinstance(value, list) or not value:
        return "None"
    return ", ".join(f"`{item}`" for item in value)


def section_list(title: str, values: Json) -> list[str]:
    lines = ["---", "", f"## {title}", ""]
    if isinstance(values, list) and values:
        lines.extend(f"- {item}" for item in values)
    else:
        lines.append("- None")
    lines.append("")
    return lines


def titled_items(title: str, values: Json, body_key: str) -> list[str]:
    lines = ["---", "", f"## {title}", ""]
    if not isinstance(values, list) or not values:
        lines.extend(["- None", ""])
        return lines
    for item in values:
        if isinstance(item, dict):
            body = text(item.get(body_key))
            # Multiline Why (evidence quotes) — preserve line breaks in display
            if "\n" in body:
                lines.extend(
                    [
                        f"### {text(item.get('title'), 'Untitled')}",
                        "",
                        f"- {body_key.title()}:",
                        "",
                    ]
                )
                for line in body.split("\n"):
                    lines.append(f"  {line}" if line.strip() else "")
                lines.append(f"- Evidence: {refs(item.get('evidence_refs'))}")
                lines.append("")
            else:
                lines.extend(
                    [
                        f"### {text(item.get('title'), 'Untitled')}",
                        "",
                        f"- {body_key.title()}: {body}",
                        f"- Evidence: {refs(item.get('evidence_refs'))}",
                        "",
                    ]
                )
    return lines


def principles(values: Json) -> list[str]:
    lines = ["---", "", "## Suggested Principles", ""]
    if not isinstance(values, list) or not values:
        lines.extend(["- None", ""])
        return lines
    for item in values:
        if isinstance(item, dict):
            status = "Pending Human Review" if item.get("decision") == "pending" else text(item.get("decision"), "unknown")
            reason = text(item.get("reason"))
            lines.extend(
                [
                    f"### Suggested Principle: {text(item.get('title') or item.get('statement'), 'Untitled')}",
                    "",
                    f"- Proposal ID: `{text(item.get('proposal_id'))}`",
                ]
            )
            if "\n" in reason:
                lines.append("- Reason:")
                lines.append("")
                for line in reason.split("\n"):
                    lines.append(f"  {line}" if line.strip() else "")
            else:
                lines.append(f"- Reason: {reason}")
            lines.extend(
                [
                    f"- Evidence: {refs(item.get('evidence_refs'))}",
                    f"- Strength: `{text(item.get('evidence_strength'))}`",
                    f"- Status: {status}",
                    f"- Applied: `{str(item.get('applied')).lower()}`",
                    "",
                ]
            )
    return lines


def render_weekly_view(review: dict[str, Json]) -> str:
    """Single coherent Weekly Review surface — no duplicated Summary/Findings/References."""
    validate_review(review)
    lines = ["# Weekly Review", "", "## Summary", "", text(review["summary"]), ""]
    lines.extend(titled_items("Observed Patterns", review["findings"], "reason"))
    lines.extend(titled_items("Meaningful Changes", review["meaningful_changes"], "reason"))
    lines.extend(titled_items("Experiments", review["experiments"], "description"))
    lines.extend(principles(review["suggested_principles"]))
    lines.extend(section_list("Next Week Direction", review["next_week_direction"]))
    lines.extend(section_list("Limitations", review["limitations"]))
    lines.extend(section_list("Evidence References", review["references"]))
    return "\n".join(lines).rstrip() + "\n"
