# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/tests/pipeline/test_pipeline_runner.py

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
SKILL_ROOT = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review"
SCRIPT = SKILL_ROOT / "scripts" / "prodigy.py"
FIXTURE_VAULT = SKILL_ROOT / "tests" / "operation" / "fixture_vault"
RUN_DIR = Path("SYSTEM/AI/Skills/prodigy-review/runs/2026-W29")


def copy_fixture(target: Path) -> Path:
    vault = target / "vault"
    shutil.copytree(FIXTURE_VAULT, vault)
    return vault


def run_weekly(vault: Path, *extra: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "weekly", "--week", "2026-W29", *extra],
        cwd=vault,
        check=check,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def assert_success_pipeline() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        vault = copy_fixture(Path(tmp))
        result = run_weekly(vault)
        run_dir = vault / RUN_DIR
        assert "Validation Passed" in result.stdout
        assert "Evidence Package Generated" in result.stdout
        assert "PRE Completed" in result.stdout
        assert "Formatter Completed" in result.stdout
        assert "Operation Reports Completed" in result.stdout
        assert (run_dir / "weekly-learning-2026-W29.json").exists()
        assert (run_dir / "weekly-review-2026-W29.json").exists()
        assert (run_dir / "weekly-workspace-view-2026-W29.md").exists()
        assert (run_dir / "review-inbox.md").exists()
        assert (run_dir / "operational-readiness-report.md").exists()
        assert (run_dir / "validation-report.md").exists()
        assert "Pipeline Finished" in (run_dir / "pipeline.log").read_text(encoding="utf-8")


def assert_dry_run_writes_nothing() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        vault = copy_fixture(Path(tmp))
        result = run_weekly(vault, "--dry-run")
        assert "✓ Validation" in result.stdout
        assert "Dry Run" in result.stdout
        assert not (vault / RUN_DIR).exists()


def assert_validate_only_writes_validation() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        vault = copy_fixture(Path(tmp))
        result = run_weekly(vault, "--validate-only")
        run_dir = vault / RUN_DIR
        assert "Validation Passed" in result.stdout
        assert "Validate Only" in result.stdout
        assert "Evidence Package" not in result.stdout
        assert (run_dir / "validation-report.md").exists()
        assert (run_dir / "pipeline.log").exists()
        assert not (run_dir / "weekly-learning-2026-W29.json").exists()


def assert_validation_stops_before_pre() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        vault = copy_fixture(Path(tmp))
        (vault / "DAILY" / "DAILY" / "2026-07-15.md").unlink()
        result = run_weekly(vault, check=False)
        run_dir = vault / RUN_DIR
        assert result.returncode == 1
        assert "Validation Failed" in result.stdout
        assert "Stopped before Evidence Package" in result.stdout
        assert (run_dir / "validation-report.md").exists()
        assert (run_dir / "pipeline.log").exists()
        assert not (run_dir / "weekly-learning-2026-W29.json").exists()
        assert not (run_dir / "weekly-review-2026-W29.json").exists()
        assert not (run_dir / "weekly-workspace-view-2026-W29.md").exists()


def main() -> int:
    assert_success_pipeline()
    assert_dry_run_writes_nothing()
    assert_validate_only_writes_validation()
    assert_validation_stops_before_pre()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
