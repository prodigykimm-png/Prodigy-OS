# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/scripts/build_weekly_evidence.py --vault . --week 2026-W29 --output SYSTEM/AI/Skills/prodigy-review/tests/weekly/out.json

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from evidence_core import CliError, package, parse_period
from evidence_meta import preview_markdown


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vault", required=True)
    parser.add_argument("--week", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    try:
        vault = Path(args.vault).expanduser().resolve()
        if not vault.exists():
            raise CliError(f"vault does not exist: {vault}")
        period = parse_period(args.week)
        result = package(vault, period)
        output = Path(args.output).expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        output.with_suffix(".md").write_text(preview_markdown(result), encoding="utf-8")
    except CliError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(f"wrote {result['package_id']} to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
