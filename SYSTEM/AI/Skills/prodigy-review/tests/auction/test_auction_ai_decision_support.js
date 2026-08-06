"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hub = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
const packetSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-region-packet.js"), "utf8");

class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.text = "";
    this.children = [];
    this.attr = {};
    this.isConnected = true;
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag);
    child.text = String(options.text ?? "");
    child.attr = { ...(options.attr || {}) };
    this.children.push(child);
    return child;
  }

  empty() { this.children = []; this.text = ""; }
  addClass() {}
  focus() {}
}

function walk(node, predicate, result = []) {
  if (node && predicate(node)) result.push(node);
  for (const child of node && node.children || []) walk(child, predicate, result);
  return result;
}

function textOf(node) {
  return [node && node.text, ...((node && node.children) || []).map(textOf)].filter(Boolean).join(" ");
}

function loadUiSandbox() {
  const sandbox = {
    console,
    Date,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of ["SYSTEM/Views/auction-decision-support-core.js", "SYSTEM/Views/auction-ai-decision-support.js"]) {
    new vm.Script(fs.readFileSync(path.join(ROOT, file), "utf8"), { filename: file }).runInContext(sandbox);
  }
  return sandbox;
}

function currentAuction(overrides = {}) {
  return {
    id: "current",
    type: "auction_case",
    path: "PARA/PROJECTS/Auction/current.md",
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    property_type: "아파트",
    appraisal_price: 1000000000,
    ...overrides
  };
}

function pastCase(id, percent) {
  return {
    id,
    type: "auction_case",
    path: `PARA/PROJECTS/Auction/${id}.md`,
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    region_dong: "구서동",
    property_type: "아파트",
    appraisal_price: 1000000000,
    auction_outcome: "lost",
    auction_result_date: "2026-07-01",
    winning_bid_price: percent * 10000000,
    my_bid_price: 800000000
  };
}

test("Given the Auction Hub loader, When the decision-support entry is wired, Then its pure core and UI load before the Region packet", () => {
  const corePath = 'loadProdigyScript("SYSTEM/Views/auction-decision-support-core.js")';
  const aiCorePath = 'loadProdigyScript("SYSTEM/Views/auction-ai-decision-support-core.js")';
  const uiPath = 'loadProdigyScript("SYSTEM/Views/auction-ai-decision-support.js")';
  const packetPath = 'loadProdigyScript("SYSTEM/Views/auction-region-packet.js")';
  assert.ok(hub.indexOf(corePath) >= 0);
  assert.ok(hub.indexOf(aiCorePath) >= 0);
  assert.ok(hub.indexOf(uiPath) >= 0);
  assert.ok(hub.indexOf(corePath) < hub.indexOf(packetPath));
  assert.ok(hub.indexOf(aiCorePath) < hub.indexOf(uiPath));
  assert.ok(hub.indexOf(uiPath) < hub.indexOf(packetPath));
  assert.match(packetSource, /AI 판단 보조/u);
  assert.match(packetSource, /AuctionAiDecisionSupport/u);
});

test("Given exact cohort history, When the deterministic preview is projected, Then it exposes Korean evidence sections without a recommendation", () => {
  const sandbox = loadUiSandbox();
  const api = sandbox.AuctionAiDecisionSupport;
  const projection = api.projectForAuction(currentAuction(), {
    cases: [80, 85, 90, 95, 100].map((percent, index) => pastCase(`past-${index}`, percent)),
    generationStartedAt: "2026-08-03T09:00:00.000Z"
  });

  assert.equal(projection.competition_references.status, "available");
  assert.equal(projection.analysis_as_of, "2026-08-03T09:00:00.000Z");
  assert.equal(projection.recommendation, undefined);
  assert.equal(projection.suggested_bid, undefined);

  const container = new FakeElement("section");
  api.renderProjection(container, projection);
  const rendered = textOf(container);
  assert.match(rendered, /판단 보조/u);
  assert.match(rendered, /시장 결과/u);
  assert.match(rendered, /내 기록/u);
  assert.match(rendered, /경쟁 가격 참고/u);
  assert.match(rendered, /감정가 환산/u);
  assert.match(rendered, /현재 시점의 누적 결과만 사용합니다/u);
  assert.doesNotMatch(rendered, /추천 입찰가/u);
});

test("Given no matching results, When the deterministic preview is rendered, Then it names the safe empty state instead of showing a blank panel", () => {
  const sandbox = loadUiSandbox();
  const projection = sandbox.AuctionAiDecisionSupport.projectForAuction(currentAuction(), {
    cases: [],
    generationStartedAt: "2026-08-03T09:00:00.000Z"
  });
  const container = new FakeElement("section");
  sandbox.AuctionAiDecisionSupport.renderProjection(container, projection);
  const rendered = textOf(container);
  assert.match(rendered, /정확히 일치하는 결과가 없습니다/u);
  assert.match(rendered, /경쟁 가격 참고/u);
});

console.log("Auction AI decision support UI tests loaded");
