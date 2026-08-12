"""
Daily Evidence Blocks v1 — parse/render multi-event blocks inside Daily notes.

Not a new Object type. Blocks live under ## Evidence in the Daily Markdown.
Legacy Reflection/Change/Next Experiment remains one synthetic evidence item.
"""

from __future__ import annotations

import re
from typing import Any


Json = dict[str, Any]

FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "context": ("context", "컨텍스트", "상황"),
    "related_objects": ("related objects", "related_objects", "연관", "연결 object", "연결"),
    "experience": ("experience", "경험", "성찰", "reflection"),
    "interpretation": ("interpretation", "해석", "의미"),
    "change": ("change", "변화"),
    "next_experiment": ("next experiment", "next_experiment", "다음 실험", "실험"),
}

ID_COMMENT_RE = re.compile(
    r"<!--\s*evidence_id\s*:\s*(daily-\d{4}-\d{2}-\d{2}-e\d{2,})\s*-->",
    re.I,
)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
EVIDENCE_SECTION_RE = re.compile(
    r"(?ims)^##\s+Evidence\s*\n(.*?)(?=^##\s+(?!#)|\Z)"
)
LEGACY_ALIASES = {
    "reflection": ("성찰", "Reflection"),
    "change": ("변화", "Change"),
    "next_experiment": ("다음 실험", "Next Experiment"),
    "references": ("연관 참조", "References"),
}


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---", 4)
    if end == -1:
        return text
    return text[end + 4 :].lstrip()


def normalize_heading(raw: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", raw or "").strip()


def extract_heading_sections(markdown: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current = ""
    for line in markdown.splitlines():
        match = HEADING_RE.match(line)
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
    # case-insensitive partial for "성찰 (Reflection)" style already normalized
    for heading, body in sections.items():
        for alias in aliases:
            if alias.lower() in heading.lower():
                return body
    return ""


def extract_links(text: str) -> list[str]:
    links: list[str] = []
    for raw in re.findall(r"\[\[([^\]]+)\]\]", text or ""):
        target = raw.split("|", 1)[0].split("#", 1)[0].strip()
        if target:
            links.append(f"[[{target}]]")
    return list(dict.fromkeys(links))


def _slug_title(title: str) -> str:
    clean = re.sub(r"\s+", " ", (title or "").strip())
    return clean[:80]


def _parse_field_body(body: str) -> dict[str, str]:
    """Parse labeled fields from a block body (Experience:, Change:, …)."""
    lines = (body or "").splitlines()
    fields: dict[str, list[str]] = {k: [] for k in FIELD_ALIASES}
    current: str | None = None
    leftover: list[str] = []

    def resolve_label(label: str) -> str | None:
        key = re.sub(r"\s+", " ", label.strip().lower().rstrip(":"))
        for field, aliases in FIELD_ALIASES.items():
            if key in aliases or any(a in key for a in aliases):
                return field
        return None

    for line in lines:
        # Field label alone or "Label: value"
        m = re.match(r"^([A-Za-z가-힣 _]+)\s*:\s*(.*)$", line.strip())
        if m:
            field = resolve_label(m.group(1))
            if field:
                current = field
                rest = m.group(2).strip()
                if rest:
                    fields[field].append(rest)
                continue
        if current:
            fields[current].append(line.rstrip())
        else:
            leftover.append(line.rstrip())

    out = {k: "\n".join(v).strip() for k, v in fields.items()}
    # Untitled body without Experience label → treat as experience
    if not out.get("experience") and leftover:
        out["experience"] = "\n".join(leftover).strip()
    return out


def _title_and_id_from_heading(heading: str, day: str, index: int) -> tuple[str, str]:
    """
    Heading forms:
      e01 · title
      [e01] title
      title
    """
    h = heading.strip()
    explicit = re.match(r"^(?:e(\d{2,})|\[e(\d{2,})\])\s*[·\-\|:]\s*(.+)$", h, re.I)
    if explicit:
        num = explicit.group(1) or explicit.group(2)
        title = explicit.group(3).strip()
        return title, f"daily-{day}-e{int(num):02d}"
    bracket = re.match(r"^\[e(\d{2,})\]\s*(.+)$", h, re.I)
    if bracket:
        return bracket.group(2).strip(), f"daily-{day}-e{int(bracket.group(1)):02d}"
    # fallback stable by sequential index (assigned after scan of explicit ids)
    return h, f"daily-{day}-e{index:02d}"


def parse_evidence_section(section_body: str, day: str) -> list[Json]:
    """Parse ### blocks under ## Evidence."""
    if not (section_body or "").strip():
        return []

    blocks_raw: list[tuple[str, str]] = []
    current_title = ""
    buf: list[str] = []
    for line in section_body.splitlines():
        m = re.match(r"^###\s+(.+?)\s*$", line)
        if m:
            if current_title:
                blocks_raw.append((current_title, "\n".join(buf).strip()))
            current_title = m.group(1).strip()
            buf = []
        else:
            buf.append(line)
    if current_title:
        blocks_raw.append((current_title, "\n".join(buf).strip()))

    # Collect explicit IDs first to avoid renumbering
    used_ids: set[str] = set()
    prelim: list[dict[str, Any]] = []
    for i, (heading, body) in enumerate(blocks_raw, start=1):
        id_match = ID_COMMENT_RE.search(body)
        title, auto_id = _title_and_id_from_heading(heading, day, i)
        evidence_id = id_match.group(1) if id_match else auto_id
        # strip comment from body before field parse
        body_clean = ID_COMMENT_RE.sub("", body).strip()
        fields = _parse_field_body(body_clean)
        experience = (fields.get("experience") or "").strip()
        # experience required for a valid block — skip empty shells
        if not experience and not title:
            continue
        if not experience:
            # title-only with empty experience: still skip (invalid)
            # unless leftover title counts as experience fallback
            experience = title
        prelim.append(
            {
                "evidence_id": evidence_id,
                "title": _slug_title(title) or experience[:40],
                "context": (fields.get("context") or "").strip().lower(),
                "related_objects": extract_links(fields.get("related_objects") or "")
                or extract_links(body_clean),
                "experience": experience,
                "interpretation": (fields.get("interpretation") or "").strip(),
                "change": (fields.get("change") or "").strip(),
                "next_experiment": (fields.get("next_experiment") or "").strip(),
                "_order": i,
            }
        )
        used_ids.add(evidence_id)

    # Reassign colliding auto IDs while preserving explicit ones
    next_num = 1
    final: list[Json] = []
    seen: set[str] = set()
    for block in prelim:
        eid = str(block["evidence_id"])
        if eid in seen:
            while f"daily-{day}-e{next_num:02d}" in seen or f"daily-{day}-e{next_num:02d}" in used_ids:
                next_num += 1
            eid = f"daily-{day}-e{next_num:02d}"
            next_num += 1
        seen.add(eid)
        block["evidence_id"] = eid
        final.append(block)
    return final


def parse_legacy_as_block(body: str, day: str) -> list[Json]:
    """One synthetic evidence item from Reflection / Change / Next Experiment."""
    sections = extract_heading_sections(body)
    reflection = find_section(sections, LEGACY_ALIASES["reflection"])
    change = find_section(sections, LEGACY_ALIASES["change"])
    experiment = find_section(sections, LEGACY_ALIASES["next_experiment"])
    references = find_section(sections, LEGACY_ALIASES["references"])
    # Strip italic prompt lines
    def strip_prompts(text: str) -> str:
        lines = []
        for line in (text or "").splitlines():
            s = line.strip()
            if s.startswith("*") and s.endswith("*"):
                continue
            if s in {"", "-"}:
                continue
            lines.append(line.rstrip())
        return "\n".join(lines).strip()

    reflection = strip_prompts(reflection)
    change = strip_prompts(change)
    experiment = strip_prompts(experiment)
    if not (reflection or change or experiment):
        return []
    links = extract_links("\n".join([reflection, change, experiment, references]))
    return [
        {
            "evidence_id": f"daily-{day}",
            "title": "Daily Reflection",
            "context": "",
            "related_objects": links,
            "experience": reflection,
            "interpretation": "",
            "change": change,
            "next_experiment": experiment,
            "legacy": True,
        }
    ]


def parse_daily_evidence_blocks(markdown: str, day: str) -> list[Json]:
    """
    Parse Evidence Blocks from a Daily note body (with or without frontmatter).
    Prefer ## Evidence blocks; else legacy single item.
    """
    body = strip_frontmatter(markdown or "")
    m = EVIDENCE_SECTION_RE.search(body)
    if m:
        blocks = parse_evidence_section(m.group(1), day)
        if blocks:
            return blocks
    return parse_legacy_as_block(body, day)


def render_evidence_block(block: Json) -> str:
    """Render one ### block with stable ID comment."""
    eid = str(block.get("evidence_id") or "")
    # extract short eNN for heading
    num = "01"
    m = re.search(r"-e(\d+)$", eid)
    if m:
        num = m.group(1)
    title = str(block.get("title") or "경험").strip()
    lines = [f"### e{num} · {title}", f"<!-- evidence_id: {eid} -->", ""]
    context = str(block.get("context") or "").strip()
    if context:
        lines.append(f"Context: {context}")
        lines.append("")
    related = block.get("related_objects") or []
    if isinstance(related, list) and related:
        lines.append("Related Objects:")
        for link in related:
            lines.append(f"- {link}")
        lines.append("")
    experience = str(block.get("experience") or "").strip()
    lines.append("Experience:")
    lines.append(experience or "")
    lines.append("")
    interpretation = str(block.get("interpretation") or "").strip()
    if interpretation:
        lines.append("Interpretation:")
        lines.append(interpretation)
        lines.append("")
    change = str(block.get("change") or "").strip()
    if change:
        lines.append("Change:")
        lines.append(change)
        lines.append("")
    experiment = str(block.get("next_experiment") or "").strip()
    if experiment:
        lines.append("Next Experiment:")
        lines.append(experiment)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_evidence_section(blocks: list[Json]) -> str:
    parts = ["## Evidence", ""]
    for block in blocks:
        parts.append(render_evidence_block(block))
        parts.append("")
    return "\n".join(parts).rstrip() + "\n"


def upsert_evidence_section(markdown: str, blocks: list[Json]) -> str:
    """Replace or insert ## Evidence section; preserve frontmatter and other content."""
    text = markdown or ""
    fm = ""
    body = text
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            fm = text[: end + 4]
            body = text[end + 4 :].lstrip("\n")
    section = render_evidence_section(blocks)
    if EVIDENCE_SECTION_RE.search(body):
        body = EVIDENCE_SECTION_RE.sub(section.rstrip() + "\n\n", body, count=1)
    else:
        # Insert after first # title if present
        m = re.match(r"(#\s+[^\n]+\n+)", body)
        if m:
            body = body[: m.end()] + section + "\n" + body[m.end() :]
        else:
            body = section + "\n" + body
    if fm:
        return fm + "\n" + body.lstrip("\n")
    return body


def next_evidence_id(existing: list[Json], day: str) -> str:
    nums = []
    for b in existing:
        eid = str(b.get("evidence_id") or "")
        m = re.search(r"-e(\d+)$", eid)
        if m:
            nums.append(int(m.group(1)))
    n = max(nums) + 1 if nums else 1
    return f"daily-{day}-e{n:02d}"


def block_to_evidence_item(
    block: Json,
    *,
    day: str,
    source_path: str,
) -> Json:
    """Project one block into Evidence Package primary_evidence shape."""
    title = str(block.get("title") or "")
    eid = str(block.get("evidence_id") or f"daily-{day}-e01")
    experience = str(block.get("experience") or "")
    change = str(block.get("change") or "")
    experiment = str(block.get("next_experiment") or "")
    interpretation = str(block.get("interpretation") or "")
    # Map experience → reflection for PRE keyword compatibility
    projection = {
        "title": title,
        "experience": experience,
        "interpretation": interpretation,
        "reflection": experience,  # PRE reads reflection
        "change": change,
        "next_experiment": experiment,
    }
    anchor = title.replace("]", "")
    return {
        "evidence_id": eid,
        "evidence_type": "daily_evidence" if not block.get("legacy") else "daily_reflection",
        "source_path": source_path,
        "source_link": f"[[{day}#{anchor}]]" if title and not block.get("legacy") else f"[[{day}]]",
        "date": day,
        "context": str(block.get("context") or ""),
        "related_objects": list(block.get("related_objects") or []),
        "linked_objects": list(block.get("related_objects") or []),
        "projection": projection,
        "legacy": bool(block.get("legacy")),
    }


def propose_blocks_from_free_text(text: str, day: str) -> list[Json]:
    """
    Deterministic multi-event split (no LLM required).
    Splits on blank lines or numbered/bullet lines.
    User must confirm before save.
    """
    raw = (text or "").strip()
    if not raw:
        return []
    # Prefer blank-line paragraphs
    parts = [p.strip() for p in re.split(r"\n\s*\n+", raw) if p.strip()]
    if len(parts) == 1:
        # Try bullets / numbered
        bullets = re.split(r"(?m)^\s*(?:[-*]|\d+[.)])\s+", raw)
        bullets = [b.strip() for b in bullets if b.strip()]
        if len(bullets) > 1:
            parts = bullets
    blocks: list[Json] = []
    for i, part in enumerate(parts, start=1):
        first_line = part.split("\n", 1)[0].strip()
        title = first_line[:48] + ("…" if len(first_line) > 48 else "")
        blocks.append(
            {
                "evidence_id": f"daily-{day}-e{i:02d}",
                "title": title or f"경험 {i}",
                "context": "",
                "related_objects": extract_links(part),
                "experience": part,
                "interpretation": "",
                "change": "",
                "next_experiment": "",
            }
        )
    return blocks
