"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const PACKET_PATH = path.join(ROOT, "SYSTEM/Views/auction-decision-packet.js");

function installDomStub() {
  const appended = [];
  globalThis.document = {
    body: {
      appendChild(node) { appended.push(node); }
    },
    createElement() {
      return {
        style: { cssText: "" },
        innerHTML: "",
        children: [],
        appendChild(child) { this.children.push(child); },
        addEventListener() {},
        querySelector() { return null; },
        remove() {}
      };
    }
  };
  return appended;
}

function loadPacket() {
  delete require.cache[require.resolve(PACKET_PATH)];
  return require(PACKET_PATH);
}

class Element {
  constructor(tag) {
    this.tag = tag || "div";
    this.children = [];
    this.attr = {};
    this.textContent = "";
    this.onclick = null;
  }
  get text() { return this.textContent; }
  set text(v) { this.textContent = String(v == null ? "" : v); }
  createEl(tag, options) {
    const item = new Element(tag);
    if (options && options.text) item.text = options.text;
    if (options && options.attr) Object.assign(item.attr, options.attr);
    this.children.push(item);
    return item;
  }
  createDiv(options) { return this.createEl("div", options); }
  empty() { this.children = []; }
  setAttribute(k, v) { this.attr[k] = v; }
  addEventListener() {}
}

function findButtonByPrefix(node, prefix) {
  if (node.tag === "button" && node.text.startsWith(prefix)) return node;
  for (const child of node.children) {
    const hit = findButtonByPrefix(child, prefix);
    if (hit) return hit;
  }
  return null;
}

function packetWithRegion() {
  return {
    region_resource: {
      path: "PARA/RESOURCES/REGION/부산-해운대구.md",
      title: "부산-해운대구 지역 분석",
      reason: "시군구 일치",
      region_key: "부산-해운대구"
    },
    knowledge: [],
    prior_decisions: [],
    empty_state: {}
  };
}

test("Given the decision packet lists a region analysis record, When the user clicks it, Then it opens the region intelligence popup instead of navigating to the note", () => {
  const packetApi = loadPacket();
  const parent = new Element("div");
  const appended = installDomStub();

  const opened = [];
  const navigated = [];
  globalThis.RegionIntelligencePopupCore = {
    isAvailable: true,
    openPopup(vaultRoot, regionKey) {
      opened.push(regionKey);
      return { ok: true, state: { regionKey } };
    }
  };
  globalThis.RegionIntelligencePopupView = {
    renderPopup() { return "<div>popup</div>"; }
  };

  const app = {
    vault: { adapter: { basePath: "/vault" } },
    workspace: {
      openLinkText(pathArg) { navigated.push(pathArg); }
    }
  };

  packetApi.renderInline(parent, { app, packet: packetWithRegion() });
  const regionRow = findButtonByPrefix(parent, "지역 분석:");
  assert.ok(regionRow, "지역 분석 행을 찾지 못했다");

  regionRow.onclick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(opened, ["부산-해운대구"], "지역 인텔리전스 팝업이 열려야 한다");
  assert.deepEqual(navigated, [], "노트로 이동하면 안 된다");
  assert.equal(appended.length, 1, "팝업 오버레이가 body에 붙어야 한다");

  delete globalThis.RegionIntelligencePopupCore;
  delete globalThis.RegionIntelligencePopupView;
  delete globalThis.document;
});

test("Given the popup modules are unavailable, When the region record is clicked, Then it falls back to opening the note rather than doing nothing", () => {
  const packetApi = loadPacket();
  const parent = new Element("div");
  const navigated = [];
  const app = {
    vault: { adapter: { basePath: "/vault" } },
    workspace: { openLinkText(pathArg) { navigated.push(pathArg); } }
  };

  packetApi.renderInline(parent, { app, packet: packetWithRegion() });
  const regionRow = findButtonByPrefix(parent, "지역 분석:");
  regionRow.onclick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(navigated, ["PARA/RESOURCES/REGION/부산-해운대구.md"]);
});

test("Given a non-region packet record, When it is clicked, Then it still opens the note", () => {
  const packetApi = loadPacket();
  const parent = new Element("div");
  const navigated = [];
  const app = {
    vault: { adapter: { basePath: "/vault" } },
    workspace: { openLinkText(pathArg) { navigated.push(pathArg); } }
  };

  packetApi.renderInline(parent, {
    app,
    packet: {
      region_resource: null,
      knowledge: [{ path: "ZETA/knowledge.md", title: "검증 지식 항목", reason: "" }],
      prior_decisions: [],
      empty_state: {}
    }
  });

  const row = findButtonByPrefix(parent, "검증 지식:");
  assert.ok(row, "검증 지식 행을 찾지 못했다");
  row.onclick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(navigated, ["ZETA/knowledge.md"]);
});
