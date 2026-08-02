"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const view = require("../../../../../Views/region-explorer-view.js");

const ROOT = path.resolve(__dirname, "../../../../../../");
const READ_ONLY_SURFACES = Object.freeze([
  "HUB/15 Region.md",
  "SYSTEM/Views/region-explorer-view.js",
  "SYSTEM/Views/region-intelligence-popup-core.js",
  "SYSTEM/Views/region-intelligence-popup-view.js",
  "SYSTEM/Views/auction-region-packet.js"
]);

class FakeElement {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.text = ""; this.attr = {}; this.style = {}; this.classNames = []; this.clientWidth = 1280; }
  createEl(tag, options = {}) { const child = new FakeElement(tag); child.text = options.text || ""; child.attr = options.attr || {}; child.style = options.style || {}; child.disabled = Boolean(options.disabled); child.ownerDocument = this.ownerDocument; this.children.push(child); return child; }
  createDiv(options = {}) { return this.createEl("div", options); }
  createSpan(options = {}) { return this.createEl("span", options); }
  empty() { this.children = []; this.text = ""; }
  setText(value) { this.text = String(value ?? ""); }
  setAttr(name, value) { this.attr[name] = value; }
  addClass(name) { this.classNames.push(name); }
}

function walk(node, predicate, found = []) { if (node && predicate(node)) found.push(node); for (const child of node && node.children || []) walk(child, predicate, found); return found; }
function text(node) { return [node.text, ...(node.children || []).map(text)].filter(Boolean).join(" "); }
function find(node, predicate) { return walk(node, predicate)[0] || null; }
function click(node) { node.onclick({ preventDefault() {} }); }

function metric(value, availability = value === null ? "자료 없음" : "관측값") { return { value, availability }; }
function row({ sido, sigungu, volume, availability, diagnostics = [], long = false }) {
  return {
    identity: { region_key: `${sido}-${sigungu}`, sido, sigungu, title: long ? `${sido} ${sigungu} 아주길고긴한국어지역명과공백없는세부설명문자열` : `${sido} ${sigungu}` },
    metrics: {
      sale_volume_3m: metric(volume, availability), housing_stock: metric(1200), sale_turnover_rate: metric(0.03), sale_price_change_yoy: metric(-1.2), jeonse_ratio: metric(65), auction_bid_rate_6m: metric(null),
      households: metric(800), household_change_yoy: metric(0.5), move_in_12m: metric(100), move_in_24m: metric(200), move_in_36m: metric(null, "관측 범위 부족"), move_in_48m: metric(null), move_in_60m: metric(null)
    },
    history: { snapshots: [{ metrics: { sale_price_change_yoy: { value: -1.2 } } }, { metrics: { sale_price_change_yoy: { value: 0.2 } } }] },
    research: { summary: "공식 근거 요약", zones: "권역 근거", supply_pipeline: null, transport_life: "교통 근거", risks: "위험 근거", site_visit: null, sources: "출처 근거" },
    provenance: { metrics_as_of: "2026-05-01", verification_status: "unverified", freshness: { availability: "기준일 있음" } },
    land_price: { trend_yoy: null, as_of: "2026-01-01", scope: "시군구", source: "공식 지가 자료" },
    diagnostics
  };
}

const projection = { rows: [
  row({ sido: "부산광역시", sigungu: "중구", volume: 0, long: true }),
  row({ sido: "부산광역시", sigungu: "해운대구", volume: null, availability: "자료 없음" }),
  row({ sido: "부산광역시", sigungu: "금정구", volume: 20, diagnostics: [{ message: "히스토리 일부가 올바르지 않아 표시하지 않습니다." }] }),
  row({ sido: "인천광역시", sigungu: "부평구", volume: 30 })
] };

test("Given Region surfaces When their source is inspected Then no Vault write API is present", () => {
  for (const relativePath of READ_ONLY_SURFACES) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    assert.doesNotMatch(source, /processFrontMatter|vault\.(?:modify|create|delete)/u, relativePath);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}|rgba\(|hsla\(/u, relativePath);
    if (relativePath.endsWith("region-intelligence-popup-view.js")) assert.doesNotMatch(source, /add-site-visit/u, relativePath);
  }
});

test("Given explicit wide and compact logical widths When Region comparison renders Then compact keeps readable horizontal Region columns", () => {
  const state = { selected_region_keys: projection.rows.slice(0, 2).map((item) => item.identity.region_key) };
  const wide = new FakeElement("section");
  const compact = new FakeElement("section");

  view.renderRegionExplorer(wide, projection, { logicalWidth: 1024, state });
  view.renderRegionExplorer(compact, projection, { logicalWidth: 767, state });

  assert.equal(wide.attr["data-layout"], "wide");
  assert.equal(find(wide, (node) => node.attr && node.attr["data-comparison-layout"])?.attr["data-comparison-layout"], "side-by-side");
  assert.equal(compact.attr["data-layout"], "compact");
  assert.equal(find(compact, (node) => node.attr && node.attr["data-comparison-layout"])?.attr["data-comparison-layout"], "horizontal");
  assert.ok(walk(compact, (node) => node.attr && node.attr.class === "region-explorer-values" && node.attr["data-columns"] === "2").length > 0);
  const comparisonText = text(find(compact, (node) => node.attr && node.attr.class === "region-explorer-comparison"));
  assert.match(comparisonText, /지역 기준일 2026-05-01/);
  assert.match(comparisonText, /미검증/);
});

test("Given valid and incomplete Region rows When the wide Explorer renders Then Korean controls, provenance, SVG trends, diagnostics, and separate groups remain visible", () => {
  const root = new FakeElement("section");
  view.renderRegionExplorer(root, projection, { logicalWidth: 1280 });

  const rendered = text(root);
  assert.match(rendered, /지역 비교|시도|지역 검색|검증 상태|기준일|정렬|비교 선택/);
  assert.match(rendered, /관측값|자료 없음|관측 범위 부족|미검증|히스토리 일부/);
  assert.match(rendered, /거래·가격|임대·수요 근거|공급·생활환경|경매 사례·미시 입지|근거 상태/);
  assert.doesNotMatch(rendered, /sale_volume_3m|move_in_12m|score|rank|추천|지도/i);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-scroll-owner"] === "region-explorer-content").length, 0, "the shared AppShell body remains the only scroll owner");
  assert.ok(walk(root, (node) => node.tag === "svg").length >= 1, "valid history must render a native SVG sparkline");
  assert.ok(walk(root, (node) => node.tag === "style")[0].text.includes("@container region-explorer"));
});

test("Given a mounted Explorer When three rows are selected and a fourth is requested Then the Korean limit notice appears without a stale selection leak", () => {
  const root = new FakeElement("section");
  const shell = view.mountRegionExplorer({ container: root, projection, logicalWidth: 1280 });
  for (const item of projection.rows.slice(0, 3)) click(find(root, (node) => node.attr && node.attr["data-action"] === "select-region" && node.attr["data-region-key"] === item.identity.region_key));
  click(find(root, (node) => node.attr && node.attr["data-action"] === "select-region" && node.attr["data-region-key"] === projection.rows[3].identity.region_key));

  assert.equal(shell.state().selected_region_keys.length, 3);
  assert.match(text(root), /최대 3개/);
  const freshRoot = new FakeElement("section");
  const independent = view.mountRegionExplorer({ container: freshRoot, projection, logicalWidth: 1280 });
  assert.deepEqual(independent.state().selected_region_keys, []);
});

test("Given compact, long-label, null, and malformed fixtures When the Explorer renders Then comparison keeps horizontal columns without throwing", () => {
  const compact = new FakeElement("section");
  assert.doesNotThrow(() => view.renderRegionExplorer(compact, projection, { logicalWidth: 375, state: { selected_region_keys: projection.rows.slice(0, 3).map((item) => item.identity.region_key) } }));
  assert.equal(compact.attr["data-layout"], "compact");
  assert.equal(walk(compact, (node) => node.attr && node.attr["data-comparison-layout"] === "horizontal").length, 1);
  assert.match(walk(compact, (node) => node.tag === "style")[0].text, /overflow-x:auto/);
  assert.match(text(compact), /아주길고긴한국어지역명과공백없는세부설명문자열/);
  assert.doesNotThrow(() => view.renderRegionExplorer(new FakeElement("section"), { rows: [null, { identity: null, metrics: null }] }, { logicalWidth: 375 }));
});

test("Given an Obsidian-style element helper When a valid history renders Then trend elements use the SVG namespace instead of the generic helper", () => {
  const calls = [];
  const documentLike = {
    createElement(tag) { return new FakeElement(tag); },
    createElementNS(namespace, tag) { calls.push({ namespace, tag }); const element = new FakeElement(tag); element.ownerDocument = documentLike; return element; }
  };
  const root = new FakeElement("section");
  root.ownerDocument = documentLike;
  root.createEl = (tag, options) => {
    assert.notEqual(tag, "svg", "SVG must bypass Obsidian's generic createEl helper");
    assert.notEqual(tag, "polyline", "SVG children must bypass Obsidian's generic createEl helper");
    const child = FakeElement.prototype.createEl.call(root, tag, options);
    child.ownerDocument = documentLike;
    return child;
  };

  view.renderRegionExplorer(root, { rows: [projection.rows[0]] }, { logicalWidth: 1280 });

  assert.deepEqual(calls.map((call) => call.tag), ["svg", "polyline"]);
  assert.ok(calls.every((call) => call.namespace === "http://www.w3.org/2000/svg"));
});

test("Given a projection row with populated transit When rendered Then Korean transit summary appears", () => {
  const root = new FakeElement("section");
  const transitRow = { ...row({ sido: "인천광역시", sigungu: "검단구", volume: 10 }), transit: { available: true, malformed: false, lines: [{ line: "인천1호선", stations: ["검단호수공원역", "신검단중앙역"] }, { line: "인천2호선", stations: ["검단오류역", "왕길역"] }], totalStations: 4 } };
  view.renderRegionExplorer(root, { rows: [transitRow] }, { logicalWidth: 1280, state: { selected_region_keys: ["인천광역시-검단구"] } });
  const rendered = text(root);
  assert.match(rendered, /인천1호선/);
  assert.match(rendered, /인천1호선 2개역/);
  assert.match(rendered, /인천2호선 2개역/);
});

test("Given a valid Region row and an Auction navigation handler When the Explorer renders Then the row exposes a district-scoped Auction action", () => {
  const root = new FakeElement("section");
  const calls = [];
  view.renderRegionExplorer(root, { rows: [projection.rows[0]] }, {
    logicalWidth: 1280,
    onViewRegionAuctions: (payload) => calls.push(payload)
  });

  const action = find(root, (node) => node.attr && node.attr["data-action"] === "view-region-auctions");
  assert.ok(action);
  assert.equal(action.text, "이 지역 경매 보기");
  click(action);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].regionKey, "부산광역시-중구");
  assert.equal(calls[0].row.identity.sigungu, "중구");
});

test("Given a valid Region row and a detail handler When the Explorer renders Then the row exposes a note-free Region detail action", () => {
  const root = new FakeElement("section");
  const calls = [];
  view.renderRegionExplorer(root, { rows: [projection.rows[0]] }, {
    logicalWidth: 1280,
    onViewRegionDetail: (payload) => calls.push(payload)
  });

  const action = find(root, (node) => node.attr && node.attr["data-action"] === "view-region-detail");
  assert.ok(action);
  assert.equal(action.text, "지역 상세 보기");
  click(action);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].regionKey, "부산광역시-중구");
});

test("Given a projection row with empty transit When rendered Then Korean empty message appears", () => {
  const root = new FakeElement("section");
  const emptyRow = { ...row({ sido: "서울특별시", sigungu: "종로구", volume: 10 }), transit: { available: false, malformed: false, lines: null } };
  view.renderRegionExplorer(root, { rows: [emptyRow] }, { logicalWidth: 1280, state: { selected_region_keys: ["서울특별시-종로구"] } });
  const rendered = text(root);
  assert.match(rendered, /확인된 도시철도 정보 없음/);
});

test("Given a projection row with malformed transit When rendered Then Korean error message appears", () => {
  const root = new FakeElement("section");
  const badRow = { ...row({ sido: "서울특별시", sigungu: "종로구", volume: 10 }), transit: { available: false, malformed: true, lines: null } };
  view.renderRegionExplorer(root, { rows: [badRow] }, { logicalWidth: 1280, state: { selected_region_keys: ["서울특별시-종로구"] } });
  const rendered = text(root);
  assert.match(rendered, /정보 확인 불가/);
});
