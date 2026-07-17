# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/tests/weekly/test_pre_mvp.py

"""PRE precision tests — product behavior, not implementation trivia."""

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
            "daily_used": sum(
                1
                for d in dailies
                if any(d.get(k) for k in ("reflection", "change", "experiment", "next_experiment"))
            ),
            "linked_used": 0,
            "missing": 0,
        },
        "warnings": [],
        "references": refs,
    }


def statements(review: dict) -> list[str]:
    return [str(p.get("statement") or p.get("title") or "") for p in review["suggested_principles"]]


def finding_titles(review: dict) -> list[str]:
    return [str(f.get("title") or "") for f in review["findings"]]


# ─── Evidence volume ───


def test_no_daily() -> None:
    review = generate_review(base_package([]))
    assert review["findings"] == []
    assert review["suggested_principles"] == []
    assert "Not enough evidence." in review["limitations"]


def test_one_daily() -> None:
    review = generate_review(
        base_package(
            [
                {
                    "date": "2026-07-20",
                    "reflection": "작은 일을 미뤘다.",
                    "change": "바로 처리하겠다.",
                    "experiment": "5분 룰",
                }
            ]
        )
    )
    assert review["findings"] == []
    assert review["suggested_principles"] == []
    assert review["pre_stats"]["enough_evidence"] is False


# ─── Precision: false positives ───


def test_temptation_alone_does_not_trigger_deferral() -> None:
    """유혹/집중 실패만 있고 미루기 증거가 없으면 Deferral 패턴 없음."""
    package = base_package(
        [
            {
                "date": "2026-07-13",
                "reflection": "중간에 유혹을 너무 많이 당한다. 유혹에 약하다.",
                "change": "유혹임을 인지하고 이겨내자. 집중과 휴식을 나누자.",
                "experiment": "자기전에 휴대폰 안보기",
            },
            {
                "date": "2026-07-14",
                "reflection": "또 집중한다 해놓고 유혹에 졌다.",
                "change": "집중 시간이 부족하다.",
                "experiment": "알림 끄기",
            },
            {
                "date": "2026-07-15",
                "reflection": "산만했다. 유혹이 많았다.",
                "change": "휴식을 분리하자.",
                "experiment": "타이머",
            },
        ]
    )
    review = generate_review(package)
    assert not any("미루" in t for t in finding_titles(review))
    assert not any("당일" in s or "바로 처리" in s for s in statements(review))


def test_unrelated_change_not_promoted_into_principle() -> None:
    """패턴은 맞지만 Change가 무관하면 규칙 statement를 쓰고, 무관 Change를 원칙으로 쓰지 않는다."""
    package = base_package(
        [
            {
                "date": "2026-07-13",
                "reflection": "작은 행정 업무를 한 달 넘게 미뤘다. 바로 해결할 수 있는 일인데 미뤘다.",
                "change": "채연이랑 대화할 때 틱틱거리지 않기",  # unrelated interpersonal
                "experiment": "즉시 처리",
            },
            {
                "date": "2026-07-14",
                "reflection": "또 미뤄 두었던 메일을 처리했다.",
                "change": "물을 더 마시자",  # unrelated
                "experiment": "인박스 제로",
            },
            {
                "date": "2026-07-15",
                "reflection": "미루지 말고 당일 처리하자고 다짐.",
                "change": "운동화를 사야 한다",  # unrelated
                "experiment": "5분 룰",
            },
        ]
    )
    review = generate_review(package)
    assert any("미루" in t for t in finding_titles(review))
    # Must not use unrelated Change as the principle statement
    for s in statements(review):
        assert "틱틱" not in s
        assert "물" not in s
        assert "운동화" not in s
    # Should fall back to predefined lesson statement (or repeated change — not these)
    if review["suggested_principles"]:
        assert any("당일" in s or "바로 처리" in s or "미루" in s for s in statements(review))


def test_topic_only_workout_findings_without_principle() -> None:
    """운동 주제만 반복되면 Finding은 가능, Principle(조언)은 없음."""
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "운동을 했다", "change": "컨디션", "experiment": "계속"},
            {"date": "2026-07-14", "reflection": "헬스 다녀옴", "change": "땀", "experiment": "유지"},
            {"date": "2026-07-15", "reflection": "workout done", "change": "피곤", "experiment": "휴식"},
        ]
    )
    review = generate_review(package)
    assert any("운동" in t for t in finding_titles(review))
    # No advice principle from topic-only workout
    assert not any("일정" in s or "먼저 잡" in s for s in statements(review))
    # short unrelated changes should not become principles either
    assert not any(s in ("컨디션", "땀", "피곤") for s in statements(review))


def test_topic_only_auction_findings_without_principle() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "경매 물건 봤다", "change": "메모", "experiment": "다음"},
            {"date": "2026-07-14", "reflection": "임장 갔다", "change": "사진", "experiment": "정리"},
            {"date": "2026-07-15", "reflection": "입찰 일정 확인", "change": "캘린더", "experiment": "알림"},
        ]
    )
    review = generate_review(package)
    assert any("경매" in t or "임장" in t for t in finding_titles(review))
    assert not any("시세" in s or "임장" in s and "전에" in s for s in statements(review))
    # safer: no principles from auction topic rule
    assert review["suggested_principles"] == [] or not any(
        "시세 판단" in s for s in statements(review)
    )


# ─── Correct positive cases ───


def test_repeated_change_wording_becomes_principle() -> None:
    """같은 Change가 여러 날에 반복되면 그 문장이 Principle이 된다."""
    package = base_package(
        [
            {
                "date": "2026-07-13",
                "reflection": "작은 일을 미뤘다.",
                "change": "바로 처리할 수 있는 일은 당일에 끝낸다.",
                "experiment": "5분",
            },
            {
                "date": "2026-07-14",
                "reflection": "또 미뤘다가 처리했다.",
                "change": "바로 처리할 수 있는 일은 당일에 끝낸다.",
                "experiment": "인박스",
            },
            {
                "date": "2026-07-15",
                "reflection": "미루지 않았다.",
                "change": "바로 처리할 수 있는 일은 당일에 끝낸다.",
                "experiment": "유지",
            },
        ]
    )
    review = generate_review(package)
    assert any("변화" in t or "미루" in t for t in finding_titles(review))
    assert any("당일" in s or "바로 처리" in s for s in statements(review))
    for p in review["suggested_principles"]:
        assert p["status"] == "pending"
        assert p["applied"] is False
        assert len(p["evidence_refs"]) >= 2


def test_reading_failure_pattern_with_evidence() -> None:
    """독서 + 실패 신호가 함께 반복되면 Finding 가능 (provenance 유지)."""
    package = base_package(
        [
            {
                "date": "2026-07-20",
                "reflection": "독서 중 메시지로 방해받아 중단했다.",
                "change": "알림을 끈다.",
                "experiment": "알림 끄기",
            },
            {
                "date": "2026-07-21",
                "reflection": "책을 펴자마자 방해가 들어왔다.",
                "change": "읽기 전에 방해 제거",
                "experiment": "아침에 읽기",
            },
            {
                "date": "2026-07-22",
                "reflection": "책도 안읽었다. 독서 실패.",
                "change": "짧은 독서 블록",
                "experiment": "캘린더",
            },
        ]
    )
    review = generate_review(package)
    assert any("독서" in t for t in finding_titles(review))
    for f in review["findings"]:
        assert len(f["evidence_refs"]) >= 2
        assert "daily-" in f["reason"] or "“" in f["reason"] or "같은 신호" in f["reason"]


def test_true_deferral_pattern() -> None:
    package = base_package(
        [
            {
                "date": "2026-07-13",
                "reflection": "한 달 넘게 미뤘던 협의를 오늘 시작했다.",
                "change": "미루는 경향을 고친다. 즉각 처리한다.",
                "experiment": "바로 시행",
            },
            {
                "date": "2026-07-14",
                "reflection": "미뤄 둔 메일을 처리했다.",
                "change": "인박스를 당일 비운다.",
                "experiment": "인박스",
            },
            {
                "date": "2026-07-15",
                "reflection": "작은 일도 미루지 않았다.",
                "change": "바로 처리 습관",
                "experiment": "유지",
            },
        ]
    )
    review = generate_review(package)
    assert any("미루" in t for t in finding_titles(review))
    assert review["suggested_principles"]  # lesson pattern may emit principle
    for p in review["suggested_principles"]:
        assert p["status"] == "pending"
        assert len(p["evidence_refs"]) >= 2


# ─── Stability ───


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


def test_no_object_mutation_and_pending_only() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "일을 미뤘다", "change": "바로 처리", "experiment": "a"},
            {"date": "2026-07-14", "reflection": "또 미뤘다", "change": "바로 처리", "experiment": "b"},
            {"date": "2026-07-15", "reflection": "미루지 말자", "change": "바로 처리", "experiment": "c"},
        ]
    )
    review = generate_review(package)
    assert "processFrontMatter" not in json.dumps(review)
    for p in review["suggested_principles"]:
        assert p["applied"] is False
        assert p["status"] == "pending"
        assert p["decision"] == "pending"


def test_draft_outputs_stable() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "미뤘다", "change": "바로 처리한다", "experiment": "x"},
            {"date": "2026-07-14", "reflection": "미뤘다", "change": "바로 처리한다", "experiment": "y"},
            {"date": "2026-07-15", "reflection": "미뤘다", "change": "바로 처리한다", "experiment": "z"},
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
        assert out.with_name(out.stem + "-draft.md").exists()


def test_deterministic() -> None:
    package = base_package(
        [
            {"date": "2026-07-13", "reflection": "운동 완료", "change": "체력 관리", "experiment": "유지"},
            {"date": "2026-07-14", "reflection": "workout done", "change": "체력 관리", "experiment": "유지"},
            {"date": "2026-07-15", "reflection": "헬스 다녀옴", "change": "체력 관리", "experiment": "유지"},
        ]
    )
    a = generate_review(package)
    b = generate_review(package)
    a.pop("pre_stats", None)
    b.pop("pre_stats", None)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def main() -> int:
    test_no_daily()
    test_one_daily()
    test_temptation_alone_does_not_trigger_deferral()
    test_unrelated_change_not_promoted_into_principle()
    test_topic_only_workout_findings_without_principle()
    test_topic_only_auction_findings_without_principle()
    test_repeated_change_wording_becomes_principle()
    test_reading_failure_pattern_with_evidence()
    test_true_deferral_pattern()
    test_empty_change_and_experiment()
    test_no_object_mutation_and_pending_only()
    test_draft_outputs_stable()
    test_deterministic()
    print("PRE precision tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
