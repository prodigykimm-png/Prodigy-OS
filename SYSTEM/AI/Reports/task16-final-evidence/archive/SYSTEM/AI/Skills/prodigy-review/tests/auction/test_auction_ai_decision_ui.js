"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");

class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.text = "";
    this.children = [];
    this.attr = {};
    this.isConnected = true;
    this.disabled = false;
    this.checked = false;
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag);
    child.text = String(options.text ?? "");
    child.attr = { ...(options.attr || {}) };
    if (child.attr.type === "checkbox") child.checked = false;
    this.children.push(child);
    return child;
  }

  empty() { this.children = []; this.text = ""; }
  addClass() {}
  setAttribute(name, value) { this.attr[name] = String(value); }
  focus() {}
}

class FakeModal {
  constructor(app) {
    this.app = app;
    this.contentEl = new FakeElement("div");
    FakeModal.instances.push(this);
  }

  open() {
    if (typeof this.onOpen === "function") this.onOpen();
    return this;
  }

  close() {
    if (typeof this.onClose === "function") this.onClose();
  }
}
FakeModal.instances = [];

function walk(node, predicate, result = []) {
  if (node && predicate(node)) result.push(node);
  for (const child of node && node.children || []) walk(child, predicate, result);
  return result;
}

function textOf(node) {
  return [node && node.text, ...((node && node.children) || []).map(textOf)].filter(Boolean).join(" ");
}

function loadSandbox(providerService) {
  const sandbox = { console, Date, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.obsidian = { Modal: FakeModal };
  sandbox.ProdigyConfigService = {
    async load() {
      const codex = { adapter: "codex-exec", authMode: "codex-login", name: "Codex 구독" };
      return { defaultProvider: "codex", providers: { codex } };
    }
  };
  sandbox.AIProviderService = providerService;
  vm.createContext(sandbox);
  for (const file of [
    "SYSTEM/Views/auction-decision-support-core.js",
    "SYSTEM/Views/auction-ai-decision-support-core.js",
    "SYSTEM/Views/auction-ai-provider-resolver.js",
    "SYSTEM/Views/auction-ai-decision-support.js"
  ]) new vm.Script(fs.readFileSync(path.join(ROOT, file), "utf8"), { filename: file }).runInContext(sandbox);
  return sandbox;
}

function currentAuction() {
  return {
    id: "current",
    type: "auction_case",
    path: "PARA/PROJECTS/Auction/current.md",
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    property_type: "아파트",
    appraisal_price: 1000000000
  };
}

function cases() {
  return [80, 85, 90, 95, 100].map((percent, index) => ({
    id: `past-${index}`,
    type: "auction_case",
    path: `PARA/PROJECTS/Auction/past-${index}.md`,
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    property_type: "아파트",
    appraisal_price: 1000000000,
    auction_outcome: "lost",
    auction_result_date: "2026-07-01",
    winning_bid_price: percent * 10000000,
    my_bid_price: 800000000
  }));
}

test("Given the decision-support modal, When the user opts into personal context and requests a summary, Then the provider receives strict schema input and the validated draft stays in the session", async () => {
  const calls = [];
  const sandbox = loadSandbox({
    async isProviderConfigured() { return true; },
    async requestStructuredJson(options) {
      calls.push(options);
      return {
        headline: "동일 표본의 결과 분포를 확인할 수 있습니다.",
        summary: "정확히 일치한 결과 5건의 중앙 낙찰가율은 90%입니다.",
        personal_context: "내 입찰 기록은 별도 확인이 필요합니다.",
        evidence: [{ source_ref: "PARA/PROJECTS/Auction/past-0.md", statement: "낙찰가율 80%의 결과가 확인됩니다." }],
        cautions: ["표본은 5건이며 자동 판단은 하지 않습니다."]
      };
    }
  });

  sandbox.AuctionAiDecisionSupport.openForAuction({}, currentAuction(), {
    cases: cases(),
    generationStartedAt: "2026-08-03T09:00:00.000Z"
  });
  assert.equal(FakeModal.instances.length, 1);
  const modal = FakeModal.instances[0];
  const before = textOf(modal.contentEl);
  assert.match(before, /AI 요약 생성/u);
  assert.match(before, /내 입찰 기록은 체크할 때만 포함/u);
  const checkbox = walk(modal.contentEl, (node) => node.tag === "input" && node.attr.type === "checkbox")[0];
  assert.ok(checkbox);
  assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  checkbox.onchange();
  const button = walk(modal.contentEl, (node) => node.text === "AI 요약 생성")[0];
  assert.ok(button);
  await button.onclick();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].schema.additionalProperties, false);
  assert.match(calls[0].prompt, /개인 입찰 기록이 사용자의 명시적 선택으로 포함되었다/u);
  const after = textOf(modal.contentEl);
  assert.match(after, /AI 요약 결과/u);
  assert.match(after, /동일 표본의 결과 분포/u);
});

test("Given no connected provider, When the modal is rendered, Then it preserves deterministic evidence and gives a recoverable error", async () => {
  FakeModal.instances = [];
  const sandbox = loadSandbox({
    async isProviderConfigured() { return false; },
    async requestStructuredJson() { throw new Error("must not call provider"); }
  });
  sandbox.AuctionAiDecisionSupport.openForAuction({}, currentAuction(), {
    cases: cases(),
    generationStartedAt: "2026-08-03T09:00:00.000Z"
  });
  const modal = FakeModal.instances[0];
  const button = walk(modal.contentEl, (node) => node.text === "AI 요약 생성")[0];
  await button.onclick();
  const rendered = textOf(modal.contentEl);
  assert.match(rendered, /시장 결과/u);
  assert.match(rendered, /연결된 Codex 또는 Antigravity를 찾지 못했습니다/u);
});

console.log("Auction AI decision UI tests loaded");
