# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/tests/weekly/test_formatter.py

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
SKILL_ROOT = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review"
SCRIPT = SKILL_ROOT / "scripts" / "format_weekly_review.py"
INPUT = SKILL_ROOT / "tests" / "weekly" / "formatter_input_review.json"
EXPECTED = SKILL_ROOT / "tests" / "weekly" / "expected_weekly_view_2026_W29.md"


def main() -> int:
    original = INPUT.read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory() as tmp:
        output = Path(tmp) / "weekly-view.md"
        subprocess.run([sys.executable, str(SCRIPT), "--input", str(INPUT), "--output", str(output)], check=True, capture_output=True, text=True, encoding="utf-8")
        actual = output.read_text(encoding="utf-8")
    expected = EXPECTED.read_text(encoding="utf-8")
    assert actual == expected
    assert INPUT.read_text(encoding="utf-8") == original
    assert "Pending Human Review" in actual
    assert "daily-2026-07-13" in actual
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
