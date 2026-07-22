"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
require(path.join(ROOT, "SYSTEM/Views/decision-packet-core.js"));
const adapter = require(path.join(ROOT, "SYSTEM/Views/auction-decision-packet.js"));

function page(pathname, type, extra) {
  return Object.assign({ path: pathname, type, title: pathname.split("/").pop().replace(/\.md$/, "") }, extra || {});
}

function fakeElement(tag, options) {
  const opts = options || {};
  const element = {
    tag,
    attr: opts.attr || {},
    children: [],
    listeners: Object.create(null),
    parentNode: null,
    style: {},
    text: opts.text || "",
    textContent: opts.text || "",
    innerHTML: "",
    value: opts.attr && opts.attr.value ? String(opts.attr.value) : "",
    checked: false,
    disabled: false,
    createEl(childTag, childOptions) {
      const child = fakeElement(childTag, childOptions);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    createSpan(childOptions) {
      return this.createEl("span", childOptions);
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    setText(value) {
      this.text = String(value);
      this.textContent = String(value);
    },
    empty() {
      this.children = [];
      this.text = "";
      this.textContent = "";
      this.innerHTML = "";
    },
    removeChild(child) {
      this.children = this.children.filter((candidate) => candidate !== child);
      child.parentNode = null;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
  };
  return element;
}

function textContent(element) {
  return [element.text || "", element.textContent || "", element.innerHTML || "", ...element.children.flatMap(textContent)]
    .filter(Boolean)
    .join(" ");
}

function findAll(element, predicate, result) {
  const found = result || [];
  if (predicate(element)) found.push(element);
  element.children.forEach((child) => findAll(child, predicate, found));
  return found;
}

function button(element, label) {
  const match = findAll(element, (node) => node.tag === "button" && (node.text === label || node.textContent === label))[0];
  assert.ok(match, `button '${label}' exists`);
  return match;
}

function configureViewRuntime() {
  const documentHead = fakeElement("head");
  global.document = {
    body: { classList: { contains: () => false } },
    head: documentHead,
    getElementById: () => null,
    createElement: (tag) => fakeElement(tag),
    querySelector: () => null
  };
  global.Notice = function Notice() {};
  global.confirm = () => false;
  global.window = global;
  global.window.innerWidth = 1280;
  global.window.addEventListener = () => {};
  global.window.prodigyDisplay = {
    property: (key) => ({
      status: "상태", minimum_bid: "최저 입찰가", expected_bid: "예상 입찰가", bid_deposit: "입찰 보증금",
      my_bid_price: "실제 입찰가", winning_bid_price: "낙찰가", exit_price: "출구가"
    }[key] || key),
    status: (status) => ({ watching: "관심", bidding: "입찰 예정", won: "낙찰", lost: "패찰", skipped: "입찰 포기" }[status] || status),
    statusInfo: (status) => ({
      label: ({ watching: "관심", bidding: "입찰 예정", won: "낙찰", lost: "패찰", skipped: "입찰 포기", reviewing: "복기 중", archived: "보관" }[status] || status),
      icon: "",
      color: "var(--text-accent)"
    })
  };
  global.window.parsePrice = (value) => Number(String(value || "").replace(/,/g, ""));
  global.window.ProdigyUI = null;
}

function loadViewScripts() {
  ["auction-card-price-projection.js", "auction-card.js", "auction-day-core.js", "auction-day-view.js"].forEach((name) => {
    const file = path.join(ROOT, "SYSTEM/Views", name);
    delete require.cache[require.resolve(file)];
    require(file);
  });
}

function activeAuction(status) {
  return {
    type: "auction_case",
    status,
    case_number: "2026타경1001",
    file: { path: "PARA/PROJECTS/Auction/current.md", name: "current.md" },
    region_sido: "부산광역시",
    region_sigungu: "금정구",
    knowledge_topics: ["bidding"],
    property_type: "오피스텔",
    address: "부산광역시 금정구, 테스트 오피스텔",
    court: "부산지방법원",
    auction_datetime: "2026-07-21 10:00",
    minimum_bid: 100000000,
    expected_bid: 120000000,
    my_bid_price: 123000000,
    winning_bid_price: 127000000,
    exit_price: 150000000,
    bid_deposit: 10000000,
    expected_monthly_rent: 1000000,
    loan_ratio: 0.8,
    interest_rate: 0.06,
    my_opinion: "검토 중"
  };
}

async function main() {
  const auction = page("PARA/PROJECTS/Auction/current.md", "auction_case", {
    status: "bidding", region_sido: "부산광역시", region_sigungu: "금정구", knowledge_topics: ["bidding"]
  });
  const candidates = [
    auction,
    page("ZETA/knowledge-1.md", "knowledge", { knowledge_topics: ["bidding"] }),
    page("ZETA/knowledge-2.md", "permanent_note", { knowledge_topics: ["bidding"] }),
    page("ZETA/knowledge-3.md", "knowledge", { knowledge_topics: ["bidding"] }),
    page("ZETA/knowledge-4.md", "knowledge", { knowledge_topics: ["bidding"] }),
    page("ZETA/direct-link.md", "knowledge", { file: { outlinks: [{ path: "PARA/PROJECTS/Auction/current.md" }] } }),
    page("PARA/RESOURCES/Auction Regions/금정구.md", "auction_region", { region_sido: "부산광역시", region_sigungu: "금정구" }),
    page("PARA/Decisions/one.md", "decision", { knowledge_topics: ["bidding"] }),
    page("PARA/Decisions/two.md", "decision", { knowledge_topics: ["bidding"] }),
    page("PARA/Decisions/three.md", "decision", { knowledge_topics: ["bidding"] })
  ];
  const context = adapter.createDashboardContext(candidates);
  const packet = adapter.packetForAuction(context, auction);

  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.candidates), true);
  assert.equal(context.index[auction.path].path, auction.path);
  assert.equal(packet.knowledge.length, 3, "knowledge cap");
  assert.equal(packet.prior_decisions.length, 2, "prior decision cap");
  assert.equal(packet.region_resource.type, "auction_region");
  assert.equal(packet.knowledge.some((record) => record.path === auction.path), false, "current case excluded");
  assert.equal(packet.knowledge.some((record) => record.path === "ZETA/direct-link.md"), true, "structured file.outlinks are preserved");
  assert.equal(adapter.packetForAuction(null, auction).error, true, "safe missing-context error");

  configureViewRuntime();
  loadViewScripts();

  const fmWrites = [];
  const app = {
    isMobile: false,
    workspace: { getLeavesOfType: () => [], openLinkText: () => {}, getMostRecentLeaf: () => null },
    vault: { getAbstractFileByPath: (target) => target ? { path: target } : null },
    fileManager: {
      processFrontMatter: async (file, update) => {
        const frontmatter = { status: "bidding" };
        update(frontmatter);
        fmWrites.push({ path: file.path, frontmatter });
      }
    }
  };
  global.window.app = app;
  global.app = app;
  global.window.AuctionDecisionPacketDashboardContext = context;

  // Behavioral Card coverage: both active statuses render an action, toggle
  // real packet DOM, and retain existing finance/status controls.
  ["watching", "bidding"].forEach((status) => {
    const root = fakeElement("div");
    const casePage = activeAuction(status);
    global.window.renderAuctionCard(casePage, root, { decisionPacketContext: context });
    assert.match(textContent(root), /최저가/);
    assert.match(textContent(root), /입찰 예정가/);
    button(root, "결정 패킷").onclick({ preventDefault() {}, stopPropagation() {} });
    assert.match(textContent(root), /결정 패킷/);
    assert.match(textContent(root), /검증 지식/);
    assert.match(textContent(root), /지역 분석/);
    assert.match(textContent(root), /이전 결정/);
    assert.ok(findAll(root, (node) => node.tag === "button" && /낙찰|입찰 예정/.test(node.text || node.textContent)).length > 0, "existing lifecycle action remains");
  });

  const priceLabelsByStatus = {
    watching: ["최저가", "입찰 예정가"],
    bidding: ["최저가", "입찰 예정가"],
    won: ["내 입찰가", "낙찰가"],
    lost: ["내 입찰가", "낙찰가"],
    skipped: ["입찰 예정가", "낙찰가"],
    reviewing: ["내 입찰가", "낙찰가"],
    archived: ["입찰 예정가", "낙찰가"]
  };
  Object.entries(priceLabelsByStatus).forEach(([status, labels]) => {
    const priceRoot = fakeElement("div");
    global.window.renderAuctionCard(activeAuction(status), priceRoot, { decisionPacketContext: context });
    const priceText = textContent(priceRoot);
    labels.forEach((label) => assert.match(priceText, new RegExp(label), `${status} shows ${label}`));
    const pair = findAll(priceRoot, (node) => node.attr.class === "auction-card-price-pair")[0];
    assert.ok(pair, `${status} keeps its decision prices in one visual pair`);
    labels.forEach((label) => assert.match(textContent(pair), new RegExp(label), `${status} keeps ${label} beside its counterpart`));
    assert.doesNotMatch(textContent(pair), /출구가/, `${status} does not split the decision pair with the exit-price control`);
  });

  const wonPriceRoot = fakeElement("div");
  global.window.renderAuctionCard(activeAuction("won"), wonPriceRoot, { decisionPacketContext: context });
  assert.match(textContent(wonPriceRoot), /차익: <strong[^>]*>0\.27억/, "won card calculates spread from the recorded bid, not the prior estimate");

  const terminalRoot = fakeElement("div");
  global.window.renderAuctionCard(activeAuction("won"), terminalRoot, { decisionPacketContext: context });
  assert.equal(findAll(terminalRoot, (node) => node.tag === "button" && node.text === "결정 패킷").length, 0, "terminal card has no packet action");

  // Behavioral Auction Day coverage: the packet is before bid/result controls,
  // and the existing final-bid write remains functional after packet rendering.
  const dayRoot = fakeElement("div");
  const dayAuction = activeAuction("bidding");
  await global.AuctionDayView.render({
    container: dayRoot,
    app,
    pages: [dayAuction],
    date: "2026-07-21",
    now: new Date("2026-07-21T09:00:00") ,
    packetContext: context
  });
  const dayText = textContent(dayRoot);
  assert.ok(dayText.indexOf("결정 패킷") < dayText.indexOf("입찰가 확정"), "Auction Day packet precedes bid control");
  assert.ok(dayText.indexOf("결정 패킷") < dayText.indexOf("결과 기록"), "Auction Day packet precedes result controls");
  const bidInput = findAll(dayRoot, (node) => node.tag === "input" && node.attr.placeholder === "최종 입찰가 (원)")[0];
  assert.ok(bidInput, "Auction Day final-bid input exists");
  bidInput.value = "125000000";
  await button(dayRoot, "입찰가 확정").onclick();
  assert.equal(fmWrites.some((write) => write.frontmatter.my_bid_price === 125000000), true, "final-bid control still writes after packet rendering");
  button(dayRoot, "낙찰");
  button(dayRoot, "패찰");
  button(dayRoot, "입찰 포기");

  // The only static checks protect the no-per-card-query architecture seam.
  const cardSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");
  const hub = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
  assert.equal((hub.match(/createDashboardContext/g) || []).length, 1, "dashboard context is built once");
  assert.equal(cardSource.includes("dv.pages"), false, "cards do not scan Dataview per card");
  console.log("Auction decision packet integration tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
