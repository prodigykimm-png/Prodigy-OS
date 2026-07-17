"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

class Element {
  constructor(tag = "div") { this.tag = tag; this.text = ""; this.children = []; this.attr = {}; }
  createEl(tag, options = {}) { const item = new Element(tag); item.text = options.text || ""; item.attr = options.attr || {}; this.children.push(item); return item; }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; }
  addClass() {}
  setAttr(key, value) { this.attr[key] = value; }
}
function textOf(node) { return [node.text, ...node.children.flatMap(textOf)].filter(Boolean).join(" "); }

async function main() {
  const view = require(path.join(ROOT, "SYSTEM/Views/workspace-list-view.js"));
  const container = new Element();
  view.render({
    app: { workspace: { openLinkText: async () => {} } },
    container,
    title: "지식",
    subtitle: "검증된 이해를 찾고 연결합니다.",
    actions: [{ label: "오늘 기록 열기", path: "DAILY/DAILY/2026-07-17.md" }],
    sections: [{ title: "최근 지식", empty: "없음", items: [{ title: "판단 원칙", path: "ZETA/PERMANENT/판단 원칙.md", meta: ["영구 노트"], detail: "검증된 기록" }] }],
  });
  const text = textOf(container);
  for (const label of ["지식", "최근 지식", "판단 원칙", "영구 노트", "열기"]) assert.match(text, new RegExp(label));
  const css = container.children.find((item) => item.tag === "style").text;
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /min-height:44px/);

  // Knowledge + Personal use the shared list workspace. Journal uses JournalView dashboard.
  for (const hub of ["50 Knowledge.md", "60 Personal.md"]) {
    const source = fs.readFileSync(path.join(ROOT, "HUB", hub), "utf8");
    assert.match(source, /workspace-list-view\.js/);
    assert.equal(source.includes("dv.table"), false);
    assert.equal(source.includes("Recent Journals"), false);
  }
  const personal = fs.readFileSync(path.join(ROOT, "HUB/60 Personal.md"), "utf8");
  assert.match(personal, /people-core\.js|type === "people"/);
  assert.match(personal, /사람/);
  const journalHub = fs.readFileSync(path.join(ROOT, "HUB/70 Journal.md"), "utf8");
  assert.match(journalHub, /journal-view\.js/);
  assert.equal(journalHub.includes("dv.table"), false);
  assert.equal(journalHub.includes("Recent Journals"), false);
  const home = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
  assert.match(home, /HUB\/30 Workout\.md/);
  assert.match(home, /workout: "운동"/);
  console.log("Workspace consistency tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
