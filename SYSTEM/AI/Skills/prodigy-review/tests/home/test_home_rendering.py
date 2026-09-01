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
    print("Running Python Test: test_home_rendering...")
    # Check syntax of all views
    views = [
        ROOT / "SYSTEM" / "Views" / "morning-context-core.js",
        ROOT / "SYSTEM" / "Views" / "morning-cache.js",
        ROOT / "SYSTEM" / "Views" / "home-view.js"
    ]
    for view in views:
        res = subprocess.run(["node", "-c", str(view)], capture_output=True, text=True)
        if res.returncode != 0:
            print(f"Syntax check failed for {view.name}: {res.stderr}", file=sys.stderr)
            return 1
    
    # Run the integration runner
    result = subprocess.run(["node", str(RUNNER)], capture_output=True, text=True)
    if result.returncode != 0:
        print("Test failed!", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        return 1
    assert "All JS Runtime Tests Passed" in result.stdout
    print("test_home_rendering passed.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
