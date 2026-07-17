# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/scripts/format_weekly_review.py --input SYSTEM/AI/Skills/prodigy-review/tests/weekly/weekly-review-2026-W29.json --output SYSTEM/AI/Skills/prodigy-review/tests/weekly/weekly-review-workspace-2026-W29.md

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from formatter_core import FormatterInputError, render_weekly_view


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    try:
        input_path = Path(args.input).expanduser().resolve()
        review = json.loads(input_path.read_text(encoding="utf-8"))
        if not isinstance(review, dict):
            raise FormatterInputError("input must be a JSON object")
        output = Path(args.output).expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render_weekly_view(review), encoding="utf-8")
    except (OSError, json.JSONDecodeError, FormatterInputError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(f"wrote weekly review view to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
