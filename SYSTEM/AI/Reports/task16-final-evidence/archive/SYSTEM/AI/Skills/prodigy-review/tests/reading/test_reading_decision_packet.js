"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { FakeElement, collectText, findByText } = require("./reading_memory_view_fakes.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
require(path.join(ROOT, "SYSTEM/Views/auction-decision-packet.js"));
const adapter = require(path.join(ROOT, "SYSTEM/Views/reading-decision-packet.js"));

function knowledgeApp(records) {
  const files = new Map(Object.entries(records).map(([filePath, frontmatter]) => [filePath, { path: filePath, basename: filePath.split("/").pop().replace(/\.md$/, "") }]));
  const opened = [];
  return {
    opened,
    metadataCache: {
      getFirstLinkpathDest(link) {
        const target = String(link || "").replace(/\.md$/, "");
        return [...files.values()].find((file) => file.path.replace(/\.md$/, "") === target) || null;
      },
      getFileCache(file) { return { frontmatter: records[file.path] || {} }; }
    },
    workspace: { openLinkText: (...args) => opened.push(args) }
  };
}

function memoryCandidates() {
  return [
    {
      source_path: "PARA/PROJECTS/Reading/first.md",
      relation_labels: ["같은 주제", "같은 저자"],
      evidence_line: "내 기록: 관계를 먼저 살핀다.",
      knowledge_links: ["ZETA/Candidate", "ZETA/First", "ZETA/Legacy"]
    },
    {
      source_path: "PARA/PROJECTS/Reading/second.md",
      relation_labels: ["같은 개념"],
      evidence_line: "핵심 기록: 반복을 줄인다.",
      knowledge_links: ["ZETA/First", "ZETA/Second", "ZETA/Resource"]
    }
  ];
}

function testProjectsExistingMemoryWithoutRanking() {
  const app = knowledgeApp({
    "ZETA/Candidate.md": { type: "knowledge_candidate", title: "검증 대기" },
    "ZETA/First.md": { type: "knowledge", title: "첫 검증 지식" },
    "ZETA/Legacy.md": { type: "permanent_note", title: "기존 검증 지식" },
    "ZETA/Second.md": { type: "knowledge", title: "두 번째 검증 지식" },
    "ZETA/Resource.md": { type: "literature_note", title: "출처" }
  });
  const candidates = Object.freeze(memoryCandidates().map(Object.freeze));
  const before = JSON.stringify(candidates);

  const first = adapter.packetForMemory(candidates, app);
  const second = adapter.packetForMemory(candidates, app);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(candidates), before);
  assert.deepEqual(first.knowledge.map((record) => record.path), ["ZETA/First.md", "ZETA/Legacy.md", "ZETA/Second.md"]);
  assert.equal(first.knowledge.some((record) => record.title === "검증 대기"), false);
  assert.equal(first.knowledge.some((record) => record.title === "출처"), false);
  assert.equal(first.knowledge[0].reason, "같은 주제 · 같은 저자 · 내 기록: 관계를 먼저 살핀다.");
  assert.equal(first.empty_state.knowledge, null);
}

async function testCurrentReadingSurfaceAndSafeError() {
  const app = knowledgeApp({ "ZETA/First.md": { type: "knowledge", title: "첫 검증 지식" } });
  const originalMemory = global.ReadingMemoryView;
  let calls = 0;
  global.ReadingMemoryView = {
    loadForSource: async () => {
      calls += 1;
      return { candidates: [{ source_path: "PARA/PROJECTS/Reading/current.md", relation_labels: ["같은 주제"], evidence_line: "핵심 기록: 직접 적용한다.", knowledge_links: ["ZETA/First"] }] };
    }
  };

  const root = new FakeElement();
  const control = adapter.renderForReading(root, {
    app,
    reading: { status: "reading", file: { path: "PARA/PROJECTS/Reading/current.md" } }
  });
  assert.ok(control);
  assert.equal(findByText(root, "결정 패킷") !== null, true);
  await control.onclick({ preventDefault() {}, stopPropagation() {} });
  const rendered = collectText(root);
  assert.match(rendered, /첫 검증 지식/);
  assert.match(rendered, /같은 주제/);
  assert.equal(rendered.includes("지역 분석"), false);
  assert.equal(rendered.includes("이전 결정"), false);
  assert.equal(calls, 1);
  assert.equal(adapter.renderForReading(new FakeElement(), { app, reading: { status: "completed", path: "PARA/PROJECTS/Reading/done.md" } }), null);

  global.ReadingMemoryView = { loadForSource: async () => { throw new Error("private/source/path"); } };
  const failedRoot = new FakeElement();
  const failed = adapter.renderForReading(failedRoot, { app, reading: { status: "reading", path: "PARA/PROJECTS/Reading/current.md" } });
  await failed.onclick({ preventDefault() {}, stopPropagation() {} });
  const failedText = collectText(failedRoot);
  assert.match(failedText, /결정 패킷을 표시하지 못했습니다/);
  assert.equal(failedText.includes("private/source/path"), false);
  global.ReadingMemoryView = originalMemory;
}

function testCardUsesCurrentReadingSurfaceOnly() {
  const calls = [];
  const context = {
    window: {
      prodigyDisplay: { statusInfo: () => ({ color: "var(--text-accent)" }) },
      ReadingDecisionPacket: { renderForReading: (...args) => calls.push(args) }
    },
    app: {
      metadataCache: { getFirstLinkpathDest: () => null },
      vault: { getAbstractFileByPath: () => null, getResourcePath: () => "" },
      workspace: { openLinkText: () => {} }
    },
    Notice: function Notice() {},
    console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "SYSTEM/Views/reading-card.js"), "utf8"), context);

  context.window.renderReadingCard({ status: "reading", title: "현재 책", file: { path: "PARA/PROJECTS/Reading/current.md", name: "current" } }, new FakeElement(), "hero");
  context.window.renderReadingCard({ status: "completed", title: "완독", file: { path: "PARA/PROJECTS/Reading/done.md", name: "done" } }, new FakeElement(), "simple");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].reading.path, "PARA/PROJECTS/Reading/current.md");
}

function testNoScanOrWrites() {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/reading-decision-packet.js"), "utf8");
  ["dv.pages", "getMarkdownFiles", "vault.create", "vault.modify", "processFrontMatter", "fetch(", "telemetry"].forEach((forbidden) => {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not be introduced`);
  });
}

async function main() {
  testProjectsExistingMemoryWithoutRanking();
  await testCurrentReadingSurfaceAndSafeError();
  testCardUsesCurrentReadingSurfaceOnly();
  testNoScanOrWrites();
  console.log("Reading decision packet tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
