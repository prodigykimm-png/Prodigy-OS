# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
RUNNER = ROOT / "SYSTEM" / "AI" / "Skills" / "prodigy-review" / "tests" / "home" / "run_js_tests.js"

def main() -> int:
    print("Running Python Test: test_morning_result...")
    result = subprocess.run(["node", str(RUNNER)], capture_output=True, text=True)
    if result.returncode != 0:
        print("Test failed!", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        return 1
    assert "Home exposes no Morning Brief provider seam" in result.stdout
    assert "MorningContextCore.generateDeterministicFallback built correct rule-based JSON" in result.stdout
    print("test_morning_result passed.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
