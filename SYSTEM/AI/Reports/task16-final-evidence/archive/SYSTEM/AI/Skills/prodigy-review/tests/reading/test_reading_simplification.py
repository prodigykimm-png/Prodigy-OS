# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# python3 SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_simplification.py

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
TEMPLATE = ROOT / "SYSTEM" / "TEMPLATE" / "FORMAT" / "template_reading.md"
READING_CARD = ROOT / "SYSTEM" / "Views" / "reading-card.js"
DISPLAY_REGISTRY = ROOT / "SYSTEM" / "Views" / "display-registry.js"
# Discarded tracking fields (page-level). progress 0–100 is allowed again.
REMOVED_TERMS = (
    "purpose",
    "reading_purpose",
    "current_page",
    "total_page",
    "total_pages",
)


def assert_template_and_dashboard_removed_fields() -> None:
    template = TEMPLATE.read_text(encoding="utf-8")
    card = READING_CARD.read_text(encoding="utf-8")
    for term in REMOVED_TERMS:
        assert term not in template, f"template still has {term}"
    # current_page may appear only as cleanup when saving progress, not as product UI
    assert "current_page" not in template
    assert "progress" in template
    assert "| 다음 행동 |" in template
    assert "`= this.next_action`" in template
    assert "| next_action |" not in template
    assert "# Status Control" not in template
    assert "meta-bind-button" not in template
    assert "BUTTON[r_" not in template
    assert "PROGRESS_STEPS" in card
    assert "fm.progress" in card
    assert "window.prodigyDisplay" in card
    assert "display.statusInfo(p.status)" in card
    assert "statusInfo.label" in card
    assert "statusInfo(p.status).color" not in card


def assert_legacy_card_renders_without_page_tracking() -> None:
    node = shutil.which("node")
    if node is None:
        raise AssertionError("node is required for Reading card runtime test")
    script = f"""
const fs = require("node:fs");
const vm = require("node:vm");
class El {{
  constructor(tag) {{ this.tag = tag; this.children = []; this.style = {{}}; this.text = ""; }}
  createEl(tag, options = {{}}) {{
    const child = new El(tag);
    child.text = options.text || "";
    child.attr = options.attr || {{}};
    this.children.push(child);
    return child;
  }}
  querySelectorAll() {{ return []; }}
}}
const context = {{
  console,
  window: {{}},
  Notice: function() {{}},
  app: {{
    metadataCache: {{ getFirstLinkpathDest: () => null }},
    vault: {{ getAbstractFileByPath: () => null }},
    fileManager: {{ processFrontMatter: async () => {{}} }},
    workspace: {{ openLinkText: () => {{}} }}
  }}
}};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync({json.dumps(str(DISPLAY_REGISTRY))}, "utf8"), context);
vm.runInContext(fs.readFileSync({json.dumps(str(READING_CARD))}, "utf8"), context);
const root = new El("root");
context.window.renderReadingCard({{
  status: "reading",
  book_title: "Legacy Book",
  author: "Legacy Author",
  purpose: "Legacy purpose",
  current_page: 87,
  total_page: 520,
  progress: 50,
  file: {{ path: "PARA/PROJECTS/Reading/Legacy Book.md", name: "Legacy Book" }}
}}, root, "hero");
const text = [];
const walk = (item) => {{ text.push(item.text); item.children.forEach(walk); }};
walk(root);
const rendered = text.join(" ");
if (!rendered.includes("Legacy Book")) throw new Error("legacy title did not render");
if (!rendered.includes("복기 시작")) throw new Error("Reading action did not render");
if (!rendered.includes("진행")) throw new Error("progress label missing");
if (!rendered.includes("50%")) throw new Error("progress chip missing");
for (const removed of ["Legacy purpose", "87", "520", "진행률"]) {{
  if (rendered.includes(removed)) throw new Error(`removed tracking UI rendered: ${{removed}}`);
}}
"""
    subprocess.run([node, "-e", script], check=True, capture_output=True, text=True, encoding="utf-8")


def main() -> int:
    assert_template_and_dashboard_removed_fields()
    assert_legacy_card_renders_without_page_tracking()
    subprocess.run(["node", "--check", str(READING_CARD)], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
