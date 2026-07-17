# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/tests/operation/test_operation_reports.py

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
SKILL_ROOT = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review"
OPERATION_SCRIPT = SKILL_ROOT / "scripts" / "build_operation_reports.py"
EVIDENCE_SCRIPT = SKILL_ROOT / "scripts" / "build_weekly_evidence.py"
FIXTURE_VAULT = SKILL_ROOT / "tests" / "operation" / "fixture_vault"


def fixture_snapshot() -> dict[str, str]:
    return {path.relative_to(FIXTURE_VAULT).as_posix(): path.read_text(encoding="utf-8") for path in sorted(FIXTURE_VAULT.rglob("*.md"))}


def main() -> int:
    before = fixture_snapshot()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        health_output = tmp_path / "object-health.md"
        inbox_output = tmp_path / "review-inbox.md"
        evidence_output = tmp_path / "weekly-learning.json"
        subprocess.run(
            [
                sys.executable,
                str(OPERATION_SCRIPT),
                "--vault",
                str(FIXTURE_VAULT),
                "--health-output",
                str(health_output),
                "--inbox-output",
                str(inbox_output),
            ],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        subprocess.run(
            [sys.executable, str(EVIDENCE_SCRIPT), "--vault", str(FIXTURE_VAULT), "--week", "2026-W29", "--output", str(evidence_output)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        health = health_output.read_text(encoding="utf-8")
        inbox = inbox_output.read_text(encoding="utf-8")
        package = json.loads(evidence_output.read_text(encoding="utf-8"))

    assert "# Object Health Report" in health
    assert "# Review Inbox" in inbox
    assert "Daily missing reflection" in health
    assert "Auction missing required field: exit_price" in health
    assert "Reading missing learning" in health
    assert "People missing interaction" in health
    assert "Broken Object link: [[Missing Object]]" in inbox
    assert "Unknown status: strange" in inbox
    assert "Sample Object.md" not in health
    assert all("_samples" not in str(item["source_path"]) for item in package["supporting_evidence"])
    assert all(item["source_link"] != "[[Sample Object]]" for item in package["supporting_evidence"])
    assert any(item["source_link"] == "[[Sample Object]]" for item in package["missing"])
    assert fixture_snapshot() == before
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
