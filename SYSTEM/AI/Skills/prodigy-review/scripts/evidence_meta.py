from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from evidence_core import DailyEvidence, Json


def warning(severity: str, code: str, message: str) -> dict[str, "Json"]:
    return {"severity": severity, "code": code, "message": message}


def relationships(dailies: list["DailyEvidence"], supporting: list["Json"]) -> list["Json"]:
    result: list["Json"] = []
    supported = {str(item["source_link"]): str(item["evidence_id"]) for item in supporting if isinstance(item, dict)}
    for daily in dailies:
        for link in daily.linked_objects:
            target = supported.get(link)
            if target is not None:
                result.append({"source": daily.evidence_id, "target": target, "reason": "explicit_link"})
                result.append({"source": target, "target": daily.evidence_id, "reason": "referenced_by"})
    return result


def preview_markdown(result: dict[str, "Json"]) -> str:
    stats = result["statistics"]
    lines = ["# Weekly Evidence Preview", "", "## Reflection"]
    for item in result["primary_evidence"]:
        if isinstance(item, dict):
            projection = item["projection"] if isinstance(item.get("projection"), dict) else {}
            reflection = (
                str(projection.get("experience") or projection.get("reflection") or "")
            )
            title = str(projection.get("title") or "")
            label = f"{title} — {reflection}" if title and reflection else (reflection or title)
            eid = item.get("evidence_id") or item.get("source_link")
            lines.extend(["", f"- `{eid}` {item.get('source_link')}: {label}"])
    lines.extend(["", "## Missing"])
    missing = result["missing"]
    if isinstance(missing, list) and missing:
        for item in missing:
            if isinstance(item, dict):
                lines.append(f"- {item['source_link']}")
    else:
        lines.append("- None")
    lines.extend(["", "## Statistics", "", f"- Daily: {stats['daily_files_used']} used / {stats['daily_files_found']} found", f"- Linked Objects: {stats['linked_objects_used']} used / {stats['linked_objects_found']} found", f"- Missing: {stats['missing_links']}"])
    return "\n".join(lines) + "\n"
