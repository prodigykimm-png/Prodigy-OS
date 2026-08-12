# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/scripts/build_operation_reports.py --vault . --health-output object-health.md --inbox-output review-inbox.md

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from evidence_core import CliError
from operation_core import build_operation_report, render_object_health, render_review_inbox


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vault", required=True)
    parser.add_argument("--health-output", required=True)
    parser.add_argument("--inbox-output", required=True)
    args = parser.parse_args(argv)
    try:
        vault = Path(args.vault).expanduser().resolve()
        if not vault.exists():
            raise CliError(f"vault does not exist: {vault}")
        report = build_operation_report(vault)
        health_output = Path(args.health_output).expanduser().resolve()
        inbox_output = Path(args.inbox_output).expanduser().resolve()
        health_output.parent.mkdir(parents=True, exist_ok=True)
        inbox_output.parent.mkdir(parents=True, exist_ok=True)
        health_output.write_text(render_object_health(report), encoding="utf-8")
        inbox_output.write_text(render_review_inbox(report), encoding="utf-8")
    except (CliError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(f"wrote operation reports to {health_output} and {inbox_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
