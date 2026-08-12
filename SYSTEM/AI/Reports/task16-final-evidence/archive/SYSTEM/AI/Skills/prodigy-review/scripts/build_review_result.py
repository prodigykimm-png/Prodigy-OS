# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/scripts/build_review_result.py --input SYSTEM/AI/Skills/prodigy-review/tests/weekly/weekly-learning-2026-W29.json --output SYSTEM/AI/Skills/prodigy-review/tests/weekly/weekly-review-2026-W29.json

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pre_core import ReviewInputError, generate_review, write_outputs


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    try:
        input_path = Path(args.input).expanduser().resolve()
        package = json.loads(input_path.read_text(encoding="utf-8"))
        if not isinstance(package, dict):
            raise ReviewInputError("input must be a JSON object")
        review = generate_review(package)
        output = Path(args.output).expanduser().resolve()
        write_outputs(review, output)
    except (OSError, json.JSONDecodeError, ReviewInputError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(f"wrote {review['review_id']} to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
