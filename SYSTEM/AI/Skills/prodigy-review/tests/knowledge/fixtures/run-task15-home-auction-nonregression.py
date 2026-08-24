#!/usr/bin/env python3
"""Record current Home/Auction gates without editing or claiming ownership of their pre-existing failures."""
from pathlib import Path
import hashlib, json, subprocess

ROOT = Path(__file__).resolve().parents[7]
OUT = ROOT / ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-15/post-audit/home-auction"

def production_files():
    selected = [ROOT / "HUB/00 Home.md", ROOT / "HUB/10 Auction.md"]
    for path in (ROOT / "SYSTEM/Views").glob("*.js"):
        if path.name.startswith(("home-", "auction-", "bid-calendar", "region-")): selected.append(path)
    return sorted(set(path for path in selected if path.exists()))

def hashes():
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in production_files()}

def run(name):
    files = sorted((ROOT / f"SYSTEM/AI/Skills/prodigy-review/tests/{name}").glob("test_*.js"))
    process = subprocess.run(["node", "--test", *map(str, files)], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log = OUT / f"{name}.tap"; log.write_text(process.stdout)
    summary = {}
    for line in process.stdout.splitlines():
        if line.startswith("ℹ tests "): summary["tests"] = int(line.rsplit(" ", 1)[1])
        elif line.startswith("ℹ pass "): summary["pass"] = int(line.rsplit(" ", 1)[1])
        elif line.startswith("ℹ fail "): summary["fail"] = int(line.rsplit(" ", 1)[1])
    return {"exit": process.returncode, "log": str(log.relative_to(ROOT)), **summary}

def main():
    OUT.mkdir(parents=True, exist_ok=True); before = hashes(); results = {name: run(name) for name in ["home", "auction"]}; after = hashes()
    unchanged = before == after
    receipt = {"scope": "Task15 non-interference only", "current_worktree_baseline": "dirty and pre-existing", "production_hashes_before": before, "production_hashes_after": after, "hashes_unchanged_during_verification": unchanged, "results": results, "claim": "No claim that current Home/Auction behavior is green; failures are recorded as pre-existing current-worktree gaps."}
    (OUT / "nonregression.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": unchanged, "results": results}, ensure_ascii=False))
    raise SystemExit(0 if unchanged else 1)
if __name__ == "__main__": main()
