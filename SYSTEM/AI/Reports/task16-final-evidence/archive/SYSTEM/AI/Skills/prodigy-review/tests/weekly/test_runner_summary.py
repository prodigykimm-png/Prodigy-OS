# /// script
# requires-python = ">=3.11"
# ///
# python3 SYSTEM/AI/Skills/prodigy-review/tests/weekly/test_runner_summary.py

"""CLI summary points to Weekly draft as primary output."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
SCRIPTS = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from runner_core import (  # noqa: E402
    PipelinePaths,
    PipelineResult,
    pipeline_paths,
    render_summary,
)
from validation_core import ValidationIssue, ValidationResult  # noqa: E402


def main() -> int:
    vault = ROOT
    paths = pipeline_paths(vault, "2026-W29")  # type: ignore[arg-type]
    assert paths.review_draft.name == "weekly-review-2026-W29-draft.md"
    assert "draft" in paths.review_draft.name
    result = PipelineResult(
        status="completed",
        paths=paths,
        log_lines=["Pipeline Finished"],
        validation=ValidationResult(issues=[]),
        operation_warning="",
    )
    text = render_summary(result)
    assert "Weekly Review generated successfully." in text
    assert "Open:" in text
    open_idx = text.index("Open:")
    internal_idx = text.index("Internal artifacts:")
    draft_idx = text.index(str(paths.review_draft))
    assert open_idx < draft_idx < internal_idx
    assert "workspace view" in text
    assert "operation report" in text
    # draft must appear before internal labels as the primary path block
    assert text.split("Open:")[1].split("Internal")[0].strip().endswith("draft.md")
    print("runner summary primary-draft tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
