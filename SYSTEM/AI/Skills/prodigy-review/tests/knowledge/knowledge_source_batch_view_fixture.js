"use strict";

const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/knowledge-authoring-core.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/knowledge-source-batch-view.js"));

class FakeElement {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.text = ""; this.attr = {}; this.value = ""; this.disabled = false; this.focused = false; }
  createEl(tag, options = {}) { const child = new FakeElement(tag); child.text = options.text || ""; child.attr = options.attr || {}; child.disabled = Boolean(options.disabled); this.children.push(child); return child; }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; this.text = ""; }
  focus() { this.focused = true; }
}

function walk(node, predicate, found = []) { if (!node) return found; if (predicate(node)) found.push(node); for (const child of node.children || []) walk(child, predicate, found); return found; }
function allText(node) { return walk(node, () => true).map((item) => item.text).filter(Boolean).join(" "); }
function field(node, name) { return walk(node, (item) => item.attr && item.attr.name === name)[0] || null; }
function button(node, label) { return walk(node, (item) => item.tag === "button" && item.text === label)[0] || null; }
function deferred() { let resolve; let reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
function titleFor(item) { return `${item.item_id} 긴 한글 기사 제목도 좁은 화면에서 안전하게 줄바꿈됩니다`; }
function validInput(overrides = {}) {
  return { urls_text: "https://news.example.test/a\nhttps://news.example.test/b", source_kind: "article", knowledge_domain: "coding", knowledge_topics: ["ai"], application_contexts: ["coding", "coding/ai"], ...overrides };
}
function mount(overrides = {}) {
  const retrievalCalls = [];
  const providerCalls = [];
  const sourceWrites = [];
  const candidateWrites = [];
  const root = new FakeElement("section");
  const retrievalService = overrides.retrievalService || {
    async retrieveArticle(item, options) {
      retrievalCalls.push(item);
      const body = `${item.item_id} 공개 기사 본문은 사용자 확인이 필요한 근거입니다.`;
      options.onRetrieved(body, { title: titleFor(item), publisher: "테스트 신문", date: "2026-07-21" });
      return { item_id: item.item_id, status: "retrieved", title: titleFor(item), publisher: "테스트 신문", date: "2026-07-21" };
    }
  };
  const batchService = overrides.batchService || {
    async summarizeSuppliedText(items) { providerCalls.push(items); return { status: "ai", items: items.map((item) => ({ item_id: item.item_id, summary: `${item.item_id} AI 요약`, uncertainties: ["원문 맥락 확인 필요"] })) }; },
    cancelCurrent() { providerCalls.push("cancelled"); }
  };
  const sourceStore = overrides.sourceStore || { async saveSource(_app, source) { sourceWrites.push(source); return { link: `[[ZETA/LITERATURE/${source.source_title}]]`, source_id: source.source_id }; } };
  const createCandidate = overrides.createCandidate || (async (candidate) => { candidateWrites.push(candidate); return { candidate_id: `candidate-${candidate.title}` }; });
  const controller = view.createSourceBatchController({ app: {}, authoringCore: core, retrievalService, batchService, sourceStore, createCandidate, initialValues: validInput(overrides.initialValues) });
  const mounted = view.mountSourceBatchView(root, controller);
  return { root, controller, mounted, retrievalCalls, providerCalls, sourceWrites, candidateWrites };
}
function prepareAndInterpret(fixture) {
  fixture.controller.prepare();
  fixture.controller.rows().forEach((row, index) => fixture.controller.updateRow(row.item_id, { my_interpretation: `사람의 한 줄 해석 ${index + 1}` }));
}

module.exports = Object.freeze({ ROOT, allText, field, button, deferred, titleFor, validInput, mount, prepareAndInterpret });
