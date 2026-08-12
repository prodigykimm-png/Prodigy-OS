# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# python3 SYSTEM/AI/Skills/prodigy-review/tests/weekly/test_daily_evidence_blocks.py

"""Daily Evidence Blocks v1 — parse, identity, PRE multi-day, safety."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
SCRIPTS = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from daily_evidence_blocks import (  # noqa: E402
    block_to_evidence_item,
    next_evidence_id,
    parse_daily_evidence_blocks,
    propose_blocks_from_free_text,
    render_evidence_section,
    upsert_evidence_section,
)
from evidence_core import package, parse_period  # noqa: E402
from pre_core import generate_review  # noqa: E402


DAY = "2026-07-18"

MULTI_EVENT_MD = f"""---
type: journal
date: {DAY}
---
# {DAY}

## Evidence

### e01 · 운동 완료
<!-- evidence_id: daily-{DAY}-e01 -->

Context: workout

Experience:
오늘 운동을 성공적으로 완료했다.

Change:
운동 일정을 유동 업무보다 먼저 잡는다.

### e02 · 관리비 확인 후 경매 판단 변경
<!-- evidence_id: daily-{DAY}-e02 -->

Context: auction

Related Objects:
- [[3차 운송예산 편성]]

Experience:
관리비를 확인한 뒤 경매 분석 판단을 바꿨다.

### e03 · 말투 때문에 갈등이 생김
<!-- evidence_id: daily-{DAY}-e03 -->

Context: people

Related Objects:
- [[여자친구]]

Experience:
내 말투가 공격적으로 들려 다툼이 생겼다.

Interpretation:
문제를 해결하려는 마음이 앞서 상대의 감정을 먼저 듣지 않았다.

Change:
해결책보다 상대의 감정을 먼저 확인한다.

Next Experiment:
의견을 말하기 전에 상대가 원하는 것이 공감인지 해결인지 묻는다.

### e04 · 음주 사실을 숨기고 후회함
<!-- evidence_id: daily-{DAY}-e04 -->

Context: integrity

Experience:
술을 마신 사실을 숨겼고 후회했다.

Change:
가까운 관계에서 사실을 숨기지 않는다.

### e05 · 유튜브를 보며 독서를 피함
<!-- evidence_id: daily-{DAY}-e05 -->

Context: personal

Related Objects:
- [[Atomic Habits]]

Experience:
퇴근 후 책을 읽으려 했지만 유튜브를 두 시간 봤다.

Interpretation:
피곤함보다 어려운 일을 시작하기 싫어 회피했다.

Change:
유혹을 의지로 막기보다 시작 환경을 단순하게 만든다.

Next Experiment:
퇴근 후 휴대폰을 다른 방에 두고 책을 10분만 편다.
"""

LEGACY_MD = """---
type: journal
date: 2026-07-13
---
# 2026-07-13

## 성찰 (Reflection)
- 작은 일을 미뤘다.

## 변화 (Change)
- 바로 처리하겠다.

## 다음 실험 (Next Experiment)
- 5분 룰

## 연관 참조 (References)
- [[Project Alpha]]
"""

EMPTY_MD = f"""---
type: journal
date: {DAY}
---
# {DAY}

## Evidence

## 성찰 (Reflection)
-

## 변화 (Change)
-
"""


def test_parse_one_block() -> None:
    md = f"""
## Evidence

### 회사에서 실수함

Experience:
보고서 숫자를 잘못 입력했다.
"""
    blocks = parse_daily_evidence_blocks(md, DAY)
    assert len(blocks) == 1
    assert blocks[0]["title"] == "회사에서 실수함"
    assert "잘못 입력" in blocks[0]["experience"]
    assert blocks[0]["change"] == ""
    assert blocks[0]["evidence_id"] == f"daily-{DAY}-e01"


def test_parse_multiple_blocks() -> None:
    blocks = parse_daily_evidence_blocks(MULTI_EVENT_MD, DAY)
    assert len(blocks) == 5
    contexts = {b["context"] for b in blocks}
    assert "workout" in contexts
    assert "auction" in contexts
    assert "people" in contexts
    assert "integrity" in contexts
    assert "personal" in contexts
    rel = blocks[2]["related_objects"]
    assert "[[여자친구]]" in rel


def test_empty_optional_fields() -> None:
    md = f"""
## Evidence

### 가벼운 기록

Experience:
회의가 길었다.
"""
    b = parse_daily_evidence_blocks(md, DAY)[0]
    assert b["interpretation"] == ""
    assert b["change"] == ""
    assert b["next_experiment"] == ""
    assert b["related_objects"] == []


def test_legacy_compat() -> None:
    blocks = parse_daily_evidence_blocks(LEGACY_MD, "2026-07-13")
    assert len(blocks) == 1
    assert blocks[0]["legacy"] is True
    assert blocks[0]["evidence_id"] == "daily-2026-07-13"
    assert "미뤘" in blocks[0]["experience"]
    assert "[[Project Alpha]]" in blocks[0]["related_objects"]


def test_empty_daily() -> None:
    blocks = parse_daily_evidence_blocks(EMPTY_MD, DAY)
    assert blocks == []


def test_malformed_does_not_crash() -> None:
    bad = "## Evidence\n\n### \n\n### broken\nno labels at all just text\n\n## End of Day\n"
    blocks = parse_daily_evidence_blocks(bad, DAY)
    # title-only body becomes experience via leftover/title fallback
    assert isinstance(blocks, list)
    # pipeline must not raise
    for b in blocks:
        block_to_evidence_item(b, day=DAY, source_path=f"DAILY/DAILY/{DAY}.md")


def test_stable_ids_and_append() -> None:
    blocks = parse_daily_evidence_blocks(MULTI_EVENT_MD, DAY)
    ids = [b["evidence_id"] for b in blocks]
    assert ids == [
        f"daily-{DAY}-e01",
        f"daily-{DAY}-e02",
        f"daily-{DAY}-e03",
        f"daily-{DAY}-e04",
        f"daily-{DAY}-e05",
    ]
    # re-parse after re-render preserves ids
    rendered = upsert_evidence_section(MULTI_EVENT_MD, blocks)
    again = parse_daily_evidence_blocks(rendered, DAY)
    assert [b["evidence_id"] for b in again] == ids
    # adding a new block does not rename existing
    new_id = next_evidence_id(blocks, DAY)
    assert new_id == f"daily-{DAY}-e06"
    blocks2 = blocks + [
        {
            "evidence_id": new_id,
            "title": "새 경험",
            "context": "",
            "related_objects": [],
            "experience": "추가됨",
            "interpretation": "",
            "change": "",
            "next_experiment": "",
        }
    ]
    rendered2 = upsert_evidence_section(rendered, blocks2)
    final = parse_daily_evidence_blocks(rendered2, DAY)
    assert [b["evidence_id"] for b in final[:5]] == ids
    assert final[5]["evidence_id"] == new_id


def test_reorder_preserves_explicit_ids() -> None:
    blocks = parse_daily_evidence_blocks(MULTI_EVENT_MD, DAY)
    reordered = [blocks[2], blocks[0], blocks[1], blocks[4], blocks[3]]
    md = upsert_evidence_section(f"# {DAY}\n", reordered)
    parsed = parse_daily_evidence_blocks(md, DAY)
    by_title = {b["title"]: b["evidence_id"] for b in parsed}
    assert by_title["말투 때문에 갈등이 생김"] == f"daily-{DAY}-e03"
    assert by_title["운동 완료"] == f"daily-{DAY}-e01"


def test_projection_independent() -> None:
    blocks = parse_daily_evidence_blocks(MULTI_EVENT_MD, DAY)
    items = [block_to_evidence_item(b, day=DAY, source_path=f"DAILY/DAILY/{DAY}.md") for b in blocks]
    assert len(items) == 5
    assert all(it["evidence_type"] == "daily_evidence" for it in items)
    assert items[2]["evidence_id"] == f"daily-{DAY}-e03"
    assert items[2]["projection"]["experience"]
    assert items[2]["projection"]["reflection"] == items[2]["projection"]["experience"]
    assert "[[여자친구]]" in items[2]["related_objects"]


def _week_package_from_blocks(days: dict[str, str]) -> dict:
    """Build package primary_evidence from day→markdown map."""
    primary = []
    refs = []
    for day, md in sorted(days.items()):
        for b in parse_daily_evidence_blocks(md, day):
            primary.append(block_to_evidence_item(b, day=day, source_path=f"DAILY/DAILY/{day}.md"))
        refs.append(f"DAILY/DAILY/{day}.md")
    return {
        "schema_version": "1.0",
        "package_id": "weekly-learning-2026-W29",
        "review_type": "learning",
        "question": "이번 주의 경험에서 무엇이 반복되었고, 무엇을 배웠는가?",
        "primary_evidence": primary,
        "supporting_evidence": [],
        "coverage": {
            "daily_found": len(days),
            "daily_used": len(days),
            "linked_used": 0,
            "missing": 0,
            "evidence_blocks": len(primary),
        },
        "warnings": [],
        "references": refs,
    }


def test_same_day_blocks_not_repeated_days() -> None:
    """Five blocks on one day must not produce multi-day patterns alone."""
    pkg = _week_package_from_blocks({DAY: MULTI_EVENT_MD})
    assert len(pkg["primary_evidence"]) == 5
    review = generate_review(pkg)
    assert review["pre_stats"]["evidence_extracted"] == 5
    assert review["pre_stats"]["distinct_days"] == 1
    assert review["pre_stats"]["enough_evidence"] is False
    assert review["findings"] == []
    # Changes stay scoped to their block ids
    change_refs = [c["evidence_refs"] for c in review["meaningful_changes"]]
    for refs in change_refs:
        assert len(refs) == 1
        assert refs[0].startswith(f"daily-{DAY}-e")


def test_separate_themes_across_days() -> None:
    """Relationship vs reading evidence remain separate; temptation ≠ deferral."""
    day1 = "2026-07-14"
    day2 = "2026-07-15"
    day3 = "2026-07-16"
    md_rel = """
## Evidence

### 말투 갈등
<!-- evidence_id: daily-2026-07-14-e01 -->
Experience:
말투 때문에 상대가 불편함을 느낌
Change:
해결책보다 감정을 먼저 확인한다.
"""
    md_rel2 = """
## Evidence

### 설명하려다 감정 놓침
<!-- evidence_id: daily-2026-07-15-e01 -->
Experience:
설명하려다 상대의 감정을 놓침
Change:
해결책보다 감정을 먼저 확인한다.
"""
    md_read = """
## Evidence

### 유튜브로 독서 방해
<!-- evidence_id: daily-2026-07-16-e01 -->
Experience:
책을 못 읽고 유튜브를 오래 봤다. 독서가 방해됐다.
"""
    # Need 3 days for enough_evidence; relationship Change repeats across 2 days
    pkg = _week_package_from_blocks({day1: md_rel, day2: md_rel2, day3: md_read})
    review = generate_review(pkg)
    assert review["pre_stats"]["distinct_days"] == 3
    assert review["pre_stats"]["evidence_extracted"] == 3

    # Temptation/reading interruption must NOT become deferral principle
    statements = " ".join(
        str(p.get("statement") or p.get("title") or "") for p in review["suggested_principles"]
    )
    findings = " ".join(str(f.get("title") or "") for f in review["findings"])
    assert "미루" not in statements
    assert "미루" not in findings or "바로 할 수 있는" not in findings

    # Reading habit may fire (day3 only once — need 2 days). Only one reading day → no reading pattern.
    assert "독서 습관" not in findings

    # Repeated change across 2 relationship days → principle from user wording
    assert any("감정" in str(p.get("statement") or "") for p in review["suggested_principles"])

    # evidence_refs for that principle point to block ids not whole days only
    for p in review["suggested_principles"]:
        refs = p.get("evidence_refs") or []
        for r in refs:
            assert "-e" in str(r) or str(r).startswith("daily-")


def test_reading_pattern_multi_day_not_temptation_as_deferral() -> None:
    days = {
        "2026-07-14": """
## Evidence
### 독서 실패
Experience:
책을 못 읽었다. 독서가 방해됐다.
""",
        "2026-07-15": """
## Evidence
### 또 못 읽음
Experience:
읽기를 안 했다. 책도 안 폈다.
""",
        "2026-07-16": """
## Evidence
### 운동만
Experience:
오늘은 운동만 했다.
""",
    }
    review = generate_review(_week_package_from_blocks(days))
    findings = [str(f.get("title") or "") for f in review["findings"]]
    assert any("독서" in t for t in findings)
    # No deferral from temptation-like language absent
    assert not any("미루" in t for t in findings)


def test_propose_requires_no_ai() -> None:
    free = """오늘 운동했고 경매도 분석했다.

여자친구랑 말투 때문에 다퉜고,

유튜브를 오래 봐서 책은 못 읽었다."""
    proposed = propose_blocks_from_free_text(free, DAY)
    assert len(proposed) >= 3
    # propose never mutates disk — pure function
    assert all(p["experience"] for p in proposed)


def test_package_live_multi_event_vault() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        daily = vault / "DAILY" / "DAILY"
        daily.mkdir(parents=True)
        (daily / f"{DAY}.md").write_text(MULTI_EVENT_MD, encoding="utf-8")
        # second day for package period spanning ISO week of 2026-07-18 = W29
        (daily / "2026-07-14.md").write_text(LEGACY_MD.replace("2026-07-13", "2026-07-14"), encoding="utf-8")
        (daily / "2026-07-15.md").write_text(
            """---
type: journal
date: 2026-07-15
---
# 2026-07-15

## Evidence

### 말투 다시
<!-- evidence_id: daily-2026-07-15-e01 -->
Experience:
말투 문제로 또 불편함을 줬다.
Change:
해결책보다 감정을 먼저 확인한다.
""",
            encoding="utf-8",
        )
        period = parse_period("2026-W29")
        pkg = package(vault, period)
        assert pkg["statistics"]["evidence_blocks"] == 7  # 5 + 1 legacy + 1
        assert pkg["statistics"]["daily_files_found"] == 3
        eids = [str(i["evidence_id"]) for i in pkg["primary_evidence"]]
        assert f"daily-{DAY}-e03" in eids
        assert "daily-2026-07-14" in eids  # legacy single
        review = generate_review(pkg)
        assert review["pre_stats"]["evidence_extracted"] >= 5
        # Integrity / relationship blocks survive as separate units
        assert any("integrity" == str(i.get("context")) for i in pkg["primary_evidence"])
        assert any("people" == str(i.get("context")) for i in pkg["primary_evidence"])
        assert any("workout" == str(i.get("context")) for i in pkg["primary_evidence"])


def main() -> int:
    tests = [
        test_parse_one_block,
        test_parse_multiple_blocks,
        test_empty_optional_fields,
        test_legacy_compat,
        test_empty_daily,
        test_malformed_does_not_crash,
        test_stable_ids_and_append,
        test_reorder_preserves_explicit_ids,
        test_projection_independent,
        test_same_day_blocks_not_repeated_days,
        test_separate_themes_across_days,
        test_reading_pattern_multi_day_not_temptation_as_deferral,
        test_propose_requires_no_ai,
        test_package_live_multi_event_vault,
    ]
    for fn in tests:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"Daily Evidence Blocks tests passed ({len(tests)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
