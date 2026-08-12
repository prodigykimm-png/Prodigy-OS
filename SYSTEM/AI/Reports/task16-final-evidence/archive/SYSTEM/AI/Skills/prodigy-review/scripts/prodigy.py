# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/scripts/prodigy.py weekly --week 2026-W29

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from evidence_core import CliError
from formatter_core import FormatterInputError
from pre_core import ReviewInputError
from runner_core import PipelineMode, render_summary, run_weekly


def pipeline_mode(dry_run: bool, validate_only: bool) -> PipelineMode:
    if dry_run:
        return "dry_run"
    if validate_only:
        return "validate_only"
    return "run"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="prodigy")
    subparsers = parser.add_subparsers(dest="command", required=True)
    weekly = subparsers.add_parser("weekly")
    weekly.add_argument("--week")
    weekly.add_argument("--dry-run", action="store_true")
    weekly.add_argument("--validate-only", action="store_true")
    args = parser.parse_args(argv)
    if args.command != "weekly":
        parser.error("unsupported command")
    if args.dry_run and args.validate_only:
        parser.error("--dry-run and --validate-only cannot be used together")
    try:
        result = run_weekly(Path.cwd(), args.week, pipeline_mode(args.dry_run, args.validate_only))
    except (CliError, OSError, ReviewInputError, FormatterInputError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(render_summary(result))
    if result.status == "validation_failed":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
