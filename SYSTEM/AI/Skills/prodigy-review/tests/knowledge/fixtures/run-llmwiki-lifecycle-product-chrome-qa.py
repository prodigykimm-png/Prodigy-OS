#!/usr/bin/env python3
"""Capture the production lifecycle modules at the Task 15 viewport/state matrix."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import json, os, shutil, signal, subprocess, tempfile, time, urllib.parse

ROOT = Path(__file__).resolve().parents[7]
FIXTURE = Path(__file__).with_name("llmwiki-lifecycle-product-qa.html")
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
OUT = Path(os.environ.get("TASK15_CHROME_OUT", ROOT / ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-15/chrome"))
STATES = ["first-run", "queued", "processing", "approval", "conflict", "committed", "refresh-failure", "git-failure", "recovery", "error"]
VIEWPORTS = [(390, 900, 1), (820, 1000, 1), (1440, 1100, 1)] + [(834, 1000, 1), (1068, 1000, 1), (375, 812, 2)]


def capture(spec):
    state, width, height, scale = spec
    profile = Path(tempfile.mkdtemp(prefix="task15-chrome-"))
    name = f"{state}-{width}x{height}" + (f"-{scale}x" if scale != 1 else "") + ".png"
    target = OUT / name
    target.unlink(missing_ok=True)
    url = FIXTURE.as_uri() + "?state=" + urllib.parse.quote(state)
    command = [str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-component-update", "--disable-background-networking", "--disable-features=OptimizationHints", "--allow-file-access-from-files", f"--user-data-dir={profile}", f"--window-size={width},{height}", f"--force-device-scale-factor={scale}", "--virtual-time-budget=500", f"--screenshot={target}", url]
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline and not target.exists() and process.poll() is None:
        time.sleep(0.05)
    try: os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError: pass
    try: process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
    shutil.rmtree(profile, ignore_errors=True)
    if not target.exists() or target.stat().st_size == 0: raise RuntimeError(f"capture_failed:{name}")
    return {"state": state, "width": width, "height": height, "scale": scale, "path": str(target.relative_to(ROOT)), "bytes": target.stat().st_size}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    specs = [(state, width, height, scale) for width, height, scale in VIEWPORTS for state in STATES]
    rows = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(capture, spec) for spec in specs]
        for future in as_completed(futures): rows.append(future.result())
    rows.sort(key=lambda row: (row["width"], row["scale"], row["state"]))
    receipt = {"ok": len(rows) == len(specs), "screens": len(rows), "states": STATES, "viewports": [{"width": w, "height": h, "scale": s} for w, h, s in VIEWPORTS], "captures": rows}
    (OUT / "chrome-matrix.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": receipt["ok"], "screens": len(rows)}, ensure_ascii=False))

if __name__ == "__main__": main()
