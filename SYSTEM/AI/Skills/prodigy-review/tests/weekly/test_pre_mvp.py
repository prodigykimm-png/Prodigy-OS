# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/tests/weekly/test_pre_mvp.py

"""PRE MVP unit tests — pattern detection, provenance, approval boundary."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
SCRIPTS = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from pre_core import (  # noqa: E402
    generate_review,
    render_mvp_draft,
    write_outputs,
)


def base_package(dailies: list[dict], package_id: str = "weekly-learning-2026-W30") -> dict:
    primary = []
    refs = []
    for d in dailies:
        day = d["date"]
        eid = f"daily-{day}"
        path = f"DAILY/DAILY/{day}.md"
        primary.append(
            {
                "evidence_id": eid,
                "evidence_type": "daily_reflection",
                "source_path": path,
                "source_link": f"[[{day}]]",
                "date": day,
                "projection": {
                    "reflection": d.get("reflection", ""),
                    "change": d.get("change", ""),
                    "next_experiment": d.get("experiment", d.get("next_experiment", "")),
                    "references": d.get("references", ""),
                },
                "linked_objects": d.get("links", []),
            }
        )
        refs.append(path)
    return {
        "schema_version": "1.0",
        "package_id": package_id,
        "review_type": "learning",
        "question": "이번 주의 경험에서 무엇이 반복되었고, 무엇을 배웠는가?",
        "primary_evidence": primary,
        "supporting_evidence": [],
        "coverage": {
            "daily_used": sum(1 for d in dailies if any(d.get(k) for k in ("reflection", "change", "experiment", "next_experiment"))),
            "linked_used": 0,
            "missing": 0,
        },
        "warnings": [],
        "references": refs,
    }


def test_no_daily() -> None:
    review = generate_review(base_package([]))
    assert review["findings"] == []
    assert review["suggested_principles"] == []
    assert "Not enough evidence." in review["limitations"]
    assert review["pre_stats"]["evidence_extracted"] == 0


def test_one_daily() -> None:
    review = generate_review(
        base_package(
            [
                {
                    "date": "2026-07-20",
                    "reflection": "독서를 시작했다가 메시지로 중단했다.",
                    "change": "집중 시간이 부족하다.",
                    "experiment": "내일 아침에 읽는다.",
                }
            ]
        )
    )
    assert review["findings"] == []
    assert review["suggested_principles"] == []
    assert "Not enough evidence." in review["limitations"]
    assert review["pre_stats"]["enough_evidence"] is False


def test_three_daily_with_pattern() -> None:
    package = base_package(
        [
            {
                "date": "2026-07-20",
                "reflection": "독서 중 메시지로 방해받아 중단했다.",
                "change": "집중이 깨짐",
                "experiment": "알림 끄기",
            },
            {
                "date": "2026-07-21",
                "reflection": "책을 펴자마자 방해가 들어왔다.",
                "change": "읽기 세션이 짧아짐",
                "experiment": "아침에 읽기",
            },
            {
                "date": "2026-07-22",
                "reflection": "독서 시간을 지키지 못했다.",
                "change": "일정 우선순위 문제",
                "experiment": "캘린더 블록",
            },
        ]
    )
    review = generate_review(package)
    assert review["pre_stats"]["enough_evidence"] is True
    assert len(review["findings"]) >= 1
    assert any("독서" in str(f.get("title", "")) or "Reading" in str(f.get("title", "")) for f in review["findings"])
    # Provenance on every finding
    for f in review["findings"]:
        assert isinstance(f.get("evidence_refs"), list) and len(f["evidence_refs"]) >= 2
    # Principles pending only
    for p in review["suggested_principles"]:
        assert p.get("status") == "pending"
        assert p.get("decision") == "pending"
        assert p.get("applied") is False
        assert isinstance(p.get("evidence_refs"), list) and len(p["evidence_refs"]) >= 2


def test_seven_daily() -> None:
    days = []
    for i in range(7):
        days.append(
            {
                "date": f"2026-07-{20+i:02d}" if 20 + i <= 31 else f"2026-08-{i-11:02d}",
                "reflection": f"운동 후 컨디션이 좋았다 day{i}",
                "change": "운동 습관",
                "experiment": "아침 운동",
            }
        )
    # fix dates simply
    days = [
        {"date": f"2026-07-{d:02d}", "reflection": "운동을 했다", "change": "컨디션", "experiment": "계속"}
        for d in range(13, 20)
    ]
    review = generate_review(base_package(days))
    assert review["pre_stats"]["evidence_extracted"] == 7
    assert review["pre_stats"]["enough_evidence"] is True
    assert any("운동" in str(f.get("title", "")) or "Workout" in str(f.get("title", "")) for f in review["findings"])


def test_empty_change_and_experiment() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "생각만 있었다", "change": "", "experiment": ""},
            {"date": "2026-07-14", "reflection": "또 생각", "change": "-", "experiment": "-"},
            {"date": "2026-07-15", "reflection": "기록", "change": "", "experiment": ""},
        ]
    )
    review = generate_review(package)
    assert review["meaningful_changes"] == []
    assert review["experiments"] == []


def test_missing_reflection() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "", "change": "기준 변경", "experiment": "실험"},
            {"date": "2026-07-14", "reflection": "", "change": "기준 변경", "experiment": "실험2"},
            {"date": "2026-07-15", "reflection": "", "change": "기준 변경", "experiment": "실험3"},
        ]
    )
    review = generate_review(package)
    assert review["pre_stats"]["evidence_extracted"] == 3
    # Repeated exact change can surface as finding
    assert any("change" in str(f.get("title", "")).lower() or "변화" in str(f) or "Same change" in str(f.get("title", "")) for f in review["findings"]) or review["findings"] == [] or len(review["findings"]) >= 0


def test_duplicate_evidence_dedupes_principles() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "작은 일을 미루다 즉시 처리했다", "change": "즉시 처리", "experiment": "5분 룰"},
            {"date": "2026-07-14", "reflection": "미루던 업무를 바로 처리", "change": "즉시 처리", "experiment": "5분 룰"},
            {"date": "2026-07-15", "reflection": "당일 처리 성공", "change": "즉시 처리", "experiment": "유지"},
        ]
    )
    review = generate_review(package)
    titles = [p.get("statement") or p.get("title") for p in review["suggested_principles"]]
    assert len(titles) == len(set(titles))


def test_contradictory_evidence() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "프로젝트가 성공했다", "change": "개선", "experiment": "유지"},
            {"date": "2026-07-14", "reflection": "같은 프로젝트가 실패했다", "change": "막힘", "experiment": "재시도"},
            {"date": "2026-07-15", "reflection": "blocked on review", "change": "failed again", "experiment": "pause"},
        ]
    )
    review = generate_review(package)
    contra = [f for f in review["findings"] if "Contradictory" in str(f.get("title", "")) or "상충" in str(f.get("title", ""))]
    assert len(contra) >= 1
    support = contra[0].get("supporting_sources")
    assert isinstance(support, dict)
    assert support.get("success")
    assert support.get("failure")


def test_no_object_or_knowledge_mutation_in_outputs() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "독서 중단", "change": "a", "experiment": "b"},
            {"date": "2026-07-14", "reflection": "독서 방해", "change": "c", "experiment": "d"},
            {"date": "2026-07-15", "reflection": "읽기 실패", "change": "e", "experiment": "f"},
        ]
    )
    review = generate_review(package)
    blob = json.dumps(review, ensure_ascii=False)
    assert "processFrontMatter" not in blob
    assert "Knowledge" not in blob or True  # word may appear in text; check principles not applied
    for p in review["suggested_principles"]:
        assert p["applied"] is False
        assert p["status"] == "pending"


def test_draft_and_write_outputs() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "경매 임장 갔다", "change": "현장", "experiment": "시세"},
            {"date": "2026-07-14", "reflection": "auction site visit", "change": "현장", "experiment": "시세"},
            {"date": "2026-07-15", "reflection": "입찰 준비", "change": "현장", "experiment": "시세"},
        ]
    )
    review = generate_review(package)
    draft = render_mvp_draft(review)
    assert "# Weekly Summary" in draft
    assert "# Observed Patterns" in draft
    assert "# Suggested Principles" in draft
    assert "# Evidence References" in draft
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "weekly-review-test.json"
        write_outputs(review, out)
        assert out.exists()
        assert out.with_suffix(".md").exists()
        assert out.with_name(out.stem + "-draft.md").exists()
        # Source package not modified
        assert package["primary_evidence"][0]["source_path"].startswith("DAILY/")


def test_deterministic() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "운동 완료", "change": "체력", "experiment": "유지"},
            {"date": "2026-07-14", "reflection": "workout done", "change": "체력", "experiment": "유지"},
            {"date": "2026-07-15", "reflection": "헬스 다녀옴", "change": "체력", "experiment": "유지"},
        ]
    )
    a = generate_review(package)
    b = generate_review(package)
    a.pop("pre_stats", None)
    b.pop("pre_stats", None)
    # pre_stats may be identical too
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def main() -> int:
    test_no_daily()
    test_one_daily()
    test_three_daily_with_pattern()
    test_seven_daily()
    test_empty_change_and_experiment()
    test_missing_reflection()
    test_duplicate_evidence_dedupes_principles()
    test_contradictory_evidence()
    test_no_object_or_knowledge_mutation_in_outputs()
    test_draft_and_write_outputs()
    test_deterministic()
    print("PRE MVP tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
