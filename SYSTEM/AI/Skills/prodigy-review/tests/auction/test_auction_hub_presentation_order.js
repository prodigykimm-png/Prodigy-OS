"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HUB = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
const STYLES = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-hub-styles.js"), "utf8");

// ---- static extraction helpers -------------------------------------------------

const HEADINGS = [...HUB.matchAll(/^(#+)\s+(.+)$/gm)].map((m) => ({ level: m[1].length, title: m[2].trim() }));

function headingIndex(title) {
  const index = HEADINGS.findIndex((h) => h.title.startsWith(title));
  assert.notEqual(index, -1, `heading "${title}" must exist`);
  return index;
}

function todayBlock() {
  const match = HUB.match(/^# 오늘\s*\n```dataviewjs\n([\s\S]*?)\n```/m);
  assert.ok(match, "Today summary dataviewjs block must exist");
  return match[1];
}

function pipelineBlock() {
  const match = HUB.match(/^# 경매 진행 현황\s*\n```js-engine\n([\s\S]*?)\n```/m);
  assert.ok(match, "Pipeline js-engine block must exist");
  return match[1];
}

// ---- VM harness for the Today dataviewjs block ---------------------------------

function element() {
  return {
    children: [],
    value: "",
    clientWidth: 1280,
    classList: { add() {}, contains: () => false },
    empty() { this.children = []; },
    createEl(tag, options = {}) {
      const child = element();
      child.tag = tag;
      child.options = options;
      if (options && options.text != null && typeof options.text !== "object") child.text = options.text;
      if (options && options.attr && options.attr.class) child.cls = options.attr.class;
      this.children.push(child);
      return child;
    }
  };
}

function containerFixture(cases, engineLabel, nowValue) {
  const rows = cases.map((c) => Object.assign({}, c, { array: undefined }));
  const dataview = {
    pages() {
      return {
        where(predicate) {
          return { array: () => rows.filter(predicate) };
        }
      };
    }
  };
  const container = element();
  const tokens = {
    RESPONSIVE_BREAKPOINTS: { compactMax: 419, phoneMax: 640, contentMax: 1440 }
  };
  const objectEngine = {
    evaluateObjects() { return []; },
    buildWorkspaceSummary() {
      return { continue_target: { label: engineLabel || "다음 행동 대상", action: "입찰가 확정", reason: "근거 요약" } };
    }
  };
  return { dataview, container, tokens, objectEngine, nowValue: nowValue || "2026-07-21T12:00:00" };
}

function runToday(cases, engineLabel, nowValue) {
  const fx = containerFixture(cases, engineLabel, nowValue);
  const RealDate = Date;
  const frozen = fx.nowValue;
  function FakeDate(...args) {
    if (args.length === 0) return new RealDate(frozen);
    return new RealDate(...args);
  }
  FakeDate.now = () => RealDate.parse(frozen);
  FakeDate.UTC = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  FakeDate.prototype = RealDate.prototype;
  const context = {
    dv: fx.dataview,
    Date: FakeDate,
    window: {
      ProdigyTokens: fx.tokens,
      ObjectEngine: fx.objectEngine,
      ProdigyAuctionNativeScenes: { register() {} },
      __prodigyMeasurementEntry: undefined
    },
    app: { workspace: { getActiveFile: () => ({ path: "HUB/10 Auction.md" }) } }
  };
  const script = new vm.Script(`(function () {\n${todayBlock()}\n});`, { filename: "HUB/10 Auction.md (오늘 block)" });
  const fn = script.runInNewContext(context);
  fn.call({ container: fx.container });
  return fx.container;
}

function textOf(node) {
  const out = [];
  if (node.text != null) out.push(String(node.text));
  (node.children || []).forEach((c) => out.push(textOf(c)));
  return out.join(" | ");
}

function rowValue(root, label) {
  // Find an auction-hub-stat-row whose first child label equals `label`.
  const rows = nodesWithClass(root, "auction-hub-stat-row");
  for (const row of rows) {
    const labelEl = (row.children || []).find((n) => n.cls && String(n.cls).split(/\s+/).includes("auction-hub-stat-label"));
    if (labelEl && String(labelEl.text) === label) {
      const valueEl = (row.children || []).find((n) => n.cls && String(n.cls).split(/\s+/).includes("auction-hub-stat-value"));
      return valueEl ? String(valueEl.text) : null;
    }
  }
  return null;
}

function findNodes(node, predicate, acc = []) {
  if (predicate(node)) acc.push(node);
  (node.children || []).forEach((c) => findNodes(c, predicate, acc));
  return acc;
}

function nodesWithClass(root, cls) {
  return findNodes(root, (n) => n.cls && String(n.cls).split(/\s+/).includes(cls));
}

function iso(today) {
  return today.toISOString().slice(0, 10);
}

function todayCase(number, status, date) {
  return { type: "auction_case", status, case_number: number, auction_datetime: date, site_visit_date: "", expected_bid: "" };
}

// ---- tests ----------------------------------------------------------------------

test("Auction Hub presentation is extracted to the shared styles module", () => {
  const inlinePipelineRule = /\.auction-hub-pipeline\s*\{/;
  const inlineStatGridRule = /\.auction-hub-stat-grid\s*\{/;
  // The note must not contain the moved presentation CSS rules…
  assert.doesNotMatch(HUB, inlinePipelineRule, "pipeline presentation must live in the shared module");
  assert.doesNotMatch(HUB, inlineStatGridRule, "stat-grid presentation must live in the shared module");
  // …and the shared module must own them plus install itself idempotently.
  assert.match(STYLES, /\.auction-hub-pipeline\s*\{/);
  assert.match(STYLES, /\.auction-hub-stat-grid\s*\{/);
  assert.match(STYLES, /style\.textContent\s*=\s*CSS/);
  assert.match(STYLES, /root\.AuctionHubStyles\s*=\s*api/);
});

test("Auction Hub loads the extracted shared styles module during bootstrap", () => {
  const bootstrap = HUB.match(/```js-engine\n([\s\S]*?)\n```/)[1];
  assert.match(bootstrap, /loadWorkspaceBootstrap\(["']SYSTEM\/Views\/auction-hub-styles\.js["']\)/);
  assert.match(bootstrap, /AuctionHubStyles/);
});

test("Auction Hub render order is Today → cards → calendar support → disclosures", () => {
  const today = headingIndex("오늘");
  const bidding = headingIndex("입찰 예정");
  const watching = headingIndex("관심");
  const calendar = headingIndex("입찰 일정");
  const pipeline = headingIndex("경매 진행 현황");
  const review = headingIndex("복기 대기");
  const history = headingIndex("보관");

  assert.ok(today < bidding, "Today summary must be first");
  assert.ok(bidding < watching, "canonical bidding cards must precede watching");
  assert.ok(watching < calendar, "canonical cards must precede calendar support");
  assert.ok(calendar < pipeline, "calendar support must precede the pipeline disclosure");
  assert.ok(pipeline < review, "pipeline disclosure must precede the review disclosure");
  assert.ok(review < history, "review disclosure must precede history disclosures");
});

test("Pipeline renders as a compact briefing status block", () => {
  const pipeline = pipelineBlock();
  assert.doesNotMatch(pipeline, /createEl\(["']details["']/);
  assert.match(pipeline, /auction-hub-pipeline-heading/);
  assert.match(pipeline, /auction-hub-pipeline-compact/);
});

test("Today summary counts two today bids and a nearest future event (VM)", () => {
  const today = new Date("2026-07-21T12:00:00");
  const todayStr = iso(today);
  const root = runToday([
    todayCase("두건-1", "bidding", `${todayStr} 10:00`),
    todayCase("두건-2", "bidding", `${todayStr} 14:00`),
    todayCase("미래건", "bidding", "2026-08-05 10:00")
  ], undefined, "2026-07-21T12:00:00");
  const text = textOf(root);
  assert.equal(rowValue(root, "오늘 입찰"), "2건", "오늘 입찰 must report the two today bids");
  assert.equal(rowValue(root, "다음 입찰"), "2026-08-05", "nearest future event must be named");
  assert.match(text, /다음 입찰/);
});

test("Today summary recovers today-empty state with the next event (VM)", () => {
  const today = new Date("2026-07-21T12:00:00");
  const root = runToday([
    todayCase("내일건", "bidding", "2026-07-22 10:00"),
    todayCase("여유건", "bidding", "2026-09-11 09:00")
  ], undefined, "2026-07-21T12:00:00");
  const text = textOf(root);
  assert.equal(rowValue(root, "오늘 입찰"), "0건", "today empty state must still count 오늘 입찰 0건");
  assert.equal(rowValue(root, "다음 입찰"), "2026-07-22", "empty today must name the nearest next event");
  assert.doesNotMatch(text, /계속/);
});

test("Today summary keeps Dataview collection normalization for mobile", () => {
  const block = todayBlock();
  assert.match(block, /toPlainArray\(cases\)\.forEach/);
  assert.match(HUB, /logicalWidth/);
});

test("Auction Hub keeps bounded loader error recovery", () => {
  for (const token of ["activeLoadPath", "err.message", "failedStage", "renderLoaderError"]) {
    assert.ok(HUB.includes(token), `loader recovery must keep ${token}`);
  }
});

test("Today summary keeps Korean stat labels intact", () => {
  const long = "부산광역시 해운대구 우동 1410 더현대 부산 옆 오피스텔 및 근린생활시설 일부 경매 물건（매우 긴 제목）";
  const root = runToday([todayCase("긴제목-1", "bidding", "2026-10-01 10:00")], long);
  const text = textOf(root);
  assert.match(text, /이번 달 진행 현황/);
  assert.match(STYLES, /\.auction-native-detail-pane \.auction-hub-stat-row,[\s\S]*?word-break:\s*keep-all/);
});
