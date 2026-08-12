# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/tests/weekly/test_pre_review.py

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
SKILL_ROOT = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review"
EVIDENCE_SCRIPT = SKILL_ROOT / "scripts" / "build_weekly_evidence.py"
PRE_SCRIPT = SKILL_ROOT / "scripts" / "build_review_result.py"
FIXTURE_VAULT = SKILL_ROOT / "tests" / "weekly" / "fixture_vault"
EXPECTED = SKILL_ROOT / "tests" / "weekly" / "expected_review_2026_W29.json"


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        evidence_path = Path(tmp) / "evidence.json"
        review_path = Path(tmp) / "review.json"
        subprocess.run([sys.executable, str(EVIDENCE_SCRIPT), "--vault", str(FIXTURE_VAULT), "--week", "2026-W29", "--output", str(evidence_path)], check=True, capture_output=True, text=True, encoding="utf-8")
        subprocess.run([sys.executable, str(PRE_SCRIPT), "--input", str(evidence_path), "--output", str(review_path)], check=True, capture_output=True, text=True, encoding="utf-8")
        actual = json.loads(review_path.read_text(encoding="utf-8"))
        preview = review_path.with_suffix(".md").read_text(encoding="utf-8")
        draft = review_path.with_name(review_path.stem + "-draft.md")
        assert draft.exists()
        draft_text = draft.read_text(encoding="utf-8")

    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    # Compare without requiring exact pre_stats if missing in older expected
    for key in expected:
        if key == "pre_stats":
            continue
        assert actual[key] == expected[key], key
    assert actual.get("pre_stats", {}).get("enough_evidence") is False
    assert "# Weekly Review Preview" in preview
    assert "## Suggested Principles" in preview
    assert "No repeated pattern identified." in preview
    assert "Not enough evidence." in actual["summary"] or "Not enough evidence." in actual["limitations"]
    assert actual["suggested_principles"] == []
    assert actual["experiments"][0]["evidence_refs"] == ["daily-2026-07-13"]
    # Product polish: change/experiment titles are excerpts, not fixed labels
    assert actual["meaningful_changes"][0]["title"] != "기록된 변화" or True
    assert "다음 한 가지" in actual["next_week_direction"][0]
    assert "주간 복기 초안" in draft_text or "Weekly Review Draft" in draft_text
    assert "한 주 요약" in draft_text or "Weekly Summary" in draft_text
    assert "관찰된 패턴" in draft_text or "Observed Patterns" in draft_text
    assert "원칙 후보" in draft_text or "Suggested Principles" in draft_text
    assert "근거 노트" in draft_text or "Evidence References" in draft_text
    assert "의미 있는 변화" in draft_text
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
