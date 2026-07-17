# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/tests/weekly/test_weekly_evidence.py

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
SKILL_ROOT = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review"
SCRIPT = SKILL_ROOT / "scripts" / "build_weekly_evidence.py"
FIXTURE_VAULT = SKILL_ROOT / "tests" / "weekly" / "fixture_vault"
EXPECTED = SKILL_ROOT / "tests" / "weekly" / "expected_weekly_learning_2026_W29.json"


def run_builder(output_path: Path) -> dict:
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--vault",
            str(FIXTURE_VAULT),
            "--week",
            "2026-W29",
            "--output",
            str(output_path),
        ],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if "weekly-learning-2026-W29" not in result.stdout:
        raise AssertionError(result.stdout)
    return json.loads(output_path.read_text(encoding="utf-8"))


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        output_path = Path(tmp) / "package.json"
        package = run_builder(output_path)

    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    assert package["schema_version"] == expected["schema_version"]
    assert package["package_id"] == expected["package_id"]
    assert package["period"] == expected["period"]
    assert len(package["primary_evidence"]) == expected["primary_evidence_count"]
    assert len(package["supporting_evidence"]) == expected["supporting_evidence_count"]
    assert len(package["missing"]) == expected["missing_count"]

    stats = package["statistics"]
    for key, value in expected["statistics"].items():
        assert stats[key] == value, key

    first = package["primary_evidence"][0]
    assert "태스크는 증거" not in json.dumps(first, ensure_ascii=False)
    assert first["projection"]["reflection"]
    assert first["linked_objects"] == ["[[Project Alpha]]", "[[Missing Object]]"]
    assert package["supporting_evidence"][0]["source_link"] == "[[Project Alpha]]"
    assert package["missing"][0]["source_link"] == "[[Missing Object]]"
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
