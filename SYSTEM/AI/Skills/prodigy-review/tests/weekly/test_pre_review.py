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

    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    assert actual == expected
    assert "# Weekly Review Preview" in preview
    assert "## Suggested Principles" in preview
    assert "No repeated pattern identified." in preview
    assert actual["suggested_principles"] == []
    assert actual["experiments"][0]["evidence_refs"] == ["daily-2026-07-13"]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
