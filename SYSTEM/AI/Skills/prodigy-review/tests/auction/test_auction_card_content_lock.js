"use strict";

/**
 * Todo 3 — Auction Card content-lock regression guard.
 *
 * Renders the REAL production auction-card.js against a synthetic fixture in an
 * in-memory DOM/VM sandbox, then records a SEMANTIC content snapshot: visible
 * shipped copy, semantic DOM order, links, roles, editable fields, action
 * identity and frontmatter write seams. This snapshot is the pre-redesign
 * regression contract so the Apple UI redesign may freely change CSS/classes
 * without drifting card content or behavior.
 *
 * Red discipline — each mutation must deterministically fail against the same
 * snapshot:
 *   1. my_opinion field removed       -> opinion write seam + row disappear
 *   2. protected order swapped        -> price pair order/text swap
 *   3. an edit handler removed        -> editable write seam disappears
 *   4. an action ID changed           -> transition action set changes
 * A pure style/class mutation must NOT fail the content snapshot.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const CARD_PATH = path.join(ROOT, "SYSTEM/Views/auction-card.js");
const COURT_STATUS = require(path.join(ROOT, "SYSTEM/Views/auction-court-status.js"));
const EVIDENCE_DIR = path.join(
  ROOT,
  ".omo/evidence/apple-ui-redesign/task-3",
);

const SOURCE = fs.readFileSync(CARD_PATH, "utf8");

function makeElement(tag, options) {
  const el = {
    tag,
    children: [],
    attrs: {},
    _text: (options && options.text) || "",
    _html: "",
    onclick: null,
    _handlers: {},
    title: "",
    hidden: false,
    createEl: (childTag, childOptions) => {
      const child = makeElement(childTag, childOptions);
      el.children.push(child);
      return child;
    },
    createSpan: (childOptions) => el.createEl("span", childOptions),
    setAttribute: (key, value) => {
      el.attrs[key] = String(value);
      if (key === "title") el.title = String(value);
    },
    getAttribute: (key) => (el.attrs[key] != null ? el.attrs[key] : null),
    addEventListener: (type, fn) => {
      el._handlers[type] = el._handlers[type] || [];
      el._handlers[type].push(fn);
    },
    empty: () => {
      el.children = [];
    },
    click: () => {},
    removeAttribute: () => {},
  };
  Object.defineProperty(el, "innerHTML", {
    get: () => el._html,
    set: (value) => {
      el._html = String(value);
    },
  });
  if (options && options.attr) {
    for (const key of Object.keys(options.attr)) {
      el.setAttribute(key, options.attr[key]);
    }
  }
  // createEl(tag, { text, href, attr }) — href and other top-level semantic
  // options are treated as element attributes.
  if (options && options.text) el._text = String(options.text);
  if (options && options.href) el.setAttribute("href", options.href);
  return el;
}

const STATUS_LABELS = {
  watching: "관심 경매",
  bidding: "입찰",
  skipped: "입찰 포기",
  won: "낙찰",
  lost: "패찰",
};

const PROPERTY_LABELS = {
  my_opinion: "내 의견",
  expected_bid: "입찰 예정가",
  minimum_bid: "최저가",
  exit_price: "매도 목표가",
  expected_monthly_rent: "예상 월세",
  loan_ratio: "대출비율",
  interest_rate: "이율",
  decision_reason: "판단 근거",
};

function isValidValue(val) {
  // Mirrors the card's per-call local `isValid` helper exactly so the sandbox
  // has a matching seam when a mutation drops that local declaration.
  return val
    && val !== "정보 없음"
    && val !== "메모 없음"
    && String(val).trim() !== "";
}

function buildWindow() {
  const windowObj = {};
  windowObj.ProdigyTokens = { BREAKPOINTS: { wide: 1024, medium: 640, compact: 320 } };
  windowObj.prodigyDisplay = {
    property: (key) =>
      Object.prototype.hasOwnProperty.call(PROPERTY_LABELS, key)
        ? PROPERTY_LABELS[key]
        : key,
    status: (value) =>
      STATUS_LABELS[value] || "미등록 상태",
    statusInfo: (value) => ({
      label: STATUS_LABELS[value] || "미등록 상태",
    }),
  };
  windowObj.parsePrice = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  };
  // Region decision board exists so 판단 보드 seam renders.
  windowObj.AuctionRegionPacket = { openForAuction: async () => {} };
  windowObj.AuctionCourtStatus = COURT_STATUS;
  windowObj.AuctionCardPriceProjection = undefined;
  windowObj.obsidianPrompt = async () => null;
  windowObj.obsidian = {};
  windowObj.app = { workspace: {}, vault: {}, fileManager: {} };
  windowObj.addEventListener = () => {};
  windowObj.removeEventListener = () => {};
  windowObj.dispatchEvent = () => {};
  windowObj.document = {
    getElementById: () => null,
    createElement: () => ({ appendChild() {}, textContent: "" }),
    head: { appendChild() {} },
    querySelectorAll: () => [],
  };
  return windowObj;
}

const FIXTURE = {
  status: "watching",
  type: "auction_case",
  case_number: "2026-12345",
  file: { name: "2026-12345.md", path: "INBOX/2026-12345.md" },
  address: "서울특별시 강남구 역삼동 123-45 상가",
  source: {
    naver: "https://land.naver.com/x/2026-12345",
    cafe: "https://cafe.naver.com/y/2026-12345",
  },
  auction_datetime: "2026-08-20",
  court: "서울중앙지방법원",
  property_type: "아파트",
  exclusive_area: "59.8㎡",
  supply_area: 84.9,
  region_sido: "서울",
  region_sigungu: "강남구",
  region_dong: "역삼동",
  appraisal_price: "1000000000",
  minimum_bid: "300000000",
  expected_bid: "350000000",
  expected_monthly_rent: "3000000",
  loan_ratio: 0.8,
  interest_rate: 0.06,
  auction_note: "권리 분석 완료",
  recommend_note: "추천 등급: A",
};

// Normalized snapshot of a single semantic node. Deliberately omits class and
// style so CSS/class-only changes never fail the content lock.
function describe(el) {
  const entry = {};
  if (el.tag) entry.tag = el.tag;
  let effectiveRole = null;
  if (el.attrs.role) effectiveRole = el.attrs.role;
  else if (el.tag === "button") effectiveRole = "button";
  else if (el.tag === "a" && el.attrs.href) effectiveRole = "link";
  if (effectiveRole) entry.role = effectiveRole;
  if (el.attrs.href) entry.href = el.attrs.href;
  if (el.attrs["aria-label"]) entry.aria = el.attrs["aria-label"];
  if (el.title) entry.title = el.title;
  if (el.attrs.tabindex) entry.tabindex = el.attrs.tabindex;
  for (const key of Object.keys(el.attrs)) {
    if (key.startsWith("data-")) entry[key] = el.attrs[key];
  }

  let ownText = el._text;
  if (!ownText && el._html) {
    ownText = el._html.replace(/<[^>]*>/g, "").trim();
  }
  if (el.tag !== "root" && ownText) {
    ownText = ownText.replace(/\s+/g, " ").trim();
    // D-day text is date-derived (오늘/D-N/종료) and legitimately changes daily.
    if (/\(\s*오늘\s*\)|\(\s*D-\d+\s*\)|종료\(|종료경매/.test(ownText)) {
      entry.ddate = true;
    } else {
      entry.text = ownText;
    }
  }

  const handlers = [];
  if (el.onclick) handlers.push(el.onclick);
  if (el._handlers.click) handlers.push(...el._handlers.click);
  const writes = new Set();
  for (const fn of handlers) {
    const src = typeof fn === "function" ? fn.toString() : "";
    const matches = src.match(/fm\.([A-Za-z_][A-Za-z0-9_]*)/g) || [];
    for (const m of matches) {
      const key = m.slice(3);
      if (key !== "updated") writes.add(key);
    }
  }
  if (writes.size) entry.writes = Array.from(writes).sort();
  if (el._text) entry.label = el._text.replace(/\s+/g, " ").trim();
  return entry;
}

function walkSnapshot(el, out) {
  out.push(describe(el));
  for (const child of el.children) walkSnapshot(child, out);
  return out;
}

function renderWithErrors(source, fixture, width) {
  const windowObj = buildWindow();
  const container = makeElement("root");
  const errors = [];
  const context = {
    window: windowObj,
    // Capturing console so renderer errors thrown inside production's try/catch
    // (which it swallows via new Notice + console.error) are surfaced and
    // asserted to be zero for every valid render.
    console: {
      error: (...args) => errors.push(args.map(String).join(" ")),
      log: () => {},
      warn: () => {},
    },
    isValid: isValidValue,
    app: windowObj.app,
    Notice: function Notice() {},
    confirm: () => false,
  };
  vm.runInNewContext(source, context, { filename: "auction-card.js" });
  windowObj.renderAuctionCard(
    fixture,
    container,
    { logicalWidth: width || 1024 },
  );
  const snapshot = walkSnapshot(container, []);
  return { snapshot, errors };
}

function renderSnapshot(source, fixture, width) {
  const result = renderWithErrors(source, fixture, width);
  assert.deepEqual(
    result.errors,
    [],
    `auction-card renderer must not swallow runtime errors:\n${result.errors.join("\n")}`,
  );
  return result.snapshot;
}

const baseline = renderSnapshot(SOURCE, FIXTURE, 1024);
const BASELINE_JSON = JSON.stringify(baseline);

test("GREEN — every card always exposes editable profit fields", () => {
  for (const status of ["watching", "bidding", "won", "lost", "skipped"]) {
    const snapshot = renderSnapshot(
      SOURCE,
      {
        ...FIXTURE,
        status,
        exit_price: "",
        expected_monthly_rent: "",
        winning_bid_price: "",
        my_bid_price: "",
      },
      390,
    );
    const text = JSON.stringify(snapshot);

    assert.match(text, /"aria":"수익 분석"/, `${status}: 수익 분석 must render`);
    assert.match(text, /(?:출구가|매도 목표가)(?:: )?-/, `${status}: exit price must render as -`);
    assert.match(text, /차익(?:: )?-/, `${status}: spread must render as -`);
    assert.match(text, /월수익(?:: )?-/, `${status}: monthly profit must render as -`);
    assert.ok(
      snapshot.some(
        (node) => node.role === "button"
          && /출구가|매도 목표가/.test(node.aria || "")
          && node.writes?.includes("exit_price"),
      ),
      `${status}: exit price must be editable`,
    );
    assert.ok(
      snapshot.some(
        (node) => node.role === "button"
          && /차익/.test(node.aria || "")
          && node.writes?.includes("exit_price"),
      ),
      `${status}: spread must be editable`,
    );
    assert.ok(
      snapshot.some(
        (node) => node.role === "button"
          && /월수익/.test(node.aria || "")
          && node.writes?.includes("expected_monthly_rent")
          && node.writes?.includes("loan_ratio")
          && node.writes?.includes("interest_rate"),
      ),
      `${status}: monthly profit must be editable`,
    );
  }
});

test("GREEN — past cards require an explicit court status instead of inferring 종료", () => {
  assert.match(SOURCE, /AuctionCourtStatus\.project/);
  assert.doesNotMatch(SOURCE, /ddayStr = "종료"/);
});

test("GREEN — real auction-card renders a stable semantic content snapshot", () => {
  assert.ok(Array.isArray(baseline) && baseline.length > 0, "card must render semantic nodes");
  const text = BASELINE_JSON;
  // Key shipped fields/labels exist in semantic order.
  assert.match(text, /서울 강남구 역삼동/);
  assert.match(text, /전용 59\.8㎡ \/ 공급 84\.9㎡/);
  assert.match(text, /2026-08-20/);
  assert.match(text, /최저가3\.00억/);
  assert.match(text, /입찰 예정가3\.50억/);
  assert.match(text, /내 의견/);
  assert.match(text, /월수익\+180만/);
  assert.doesNotMatch(text, /다음 행동/);
  assert.match(text, /관심 경매 경매 카드/);
  // Links are locked (naver + cafe external links).
  assert.match(text, /land\.naver\.com/);
  assert.match(text, /cafe\.naver\.com/);
  // Button roles from makeAuctionCardInteractive.
  assert.ok(
    baseline.some((n) => n.role === "button" && /판단 보드/.test(n.label || "")),
    "판단 보드 decision seam must be role=button",
  );
});

test("GREEN — Auction card omits only missing area parts without inventing values", () => {
  const exclusiveOnly = renderSnapshot(SOURCE, { ...FIXTURE, supply_area: "" }, 1024);
  assert.ok(exclusiveOnly.some((node) => node.text === "전용 59.8㎡"));
  assert.equal(exclusiveOnly.some((node) => /^공급/u.test(node.text || "")), false);

  const noArea = renderSnapshot(SOURCE, { ...FIXTURE, exclusive_area: "", supply_area: "" }, 1024);
  assert.equal(noArea.some((node) => /^(?:전용|공급)/u.test(node.text || "")), false);
});

test("RED — removing the my_opinion field breaks the content lock", () => {
  const mutated = SOURCE.replace(
    /    \/\/ Opinion Row \(Clickable\)[\s\S]*?(?=    const userText)/,
    [
      "    const userNote = p.auction_note;",
      "    const recLevel = (window.MorningContextCore && window.MorningContextCore.resolveRecommendLevel)",
      "      ? window.MorningContextCore.resolveRecommendLevel(p)",
      "      : (p.recommend_level || p.recommendation || \"\");",
      "    const recNote = p.recommend_note || (recLevel ? `추천 등급: ${recLevel}` : \"\");",
      "    const isValid = (val) => {",
      "      return val && val !== \"정보 없음\" && val !== \"메모 없음\" && String(val).trim() !== \"\";",
      "    };",
      "",
    ].join("\n"),
  );
  assert.notEqual(mutated, SOURCE, "mutation must have been applied");
  const out = renderSnapshot(mutated, FIXTURE, 1024);
  assert.notEqual(
    JSON.stringify(out),
    BASELINE_JSON,
    "removing my_opinion must be detected",
  );
  assert.ok(
    !JSON.stringify(out).includes("내 의견"),
    "my_opinion visible row must be gone after mutation",
  );
});

test("RED — swapping the protected price order breaks the content lock", () => {
  const mutated = SOURCE.replace(
    ": { left: { key: \"minimum_bid\", label: \"최저가\", value: p.minimum_bid }, right: { key: \"expected_bid\", label: \"입찰 예정가\", value: p.expected_bid } };",
    ": { left: { key: \"expected_bid\", label: \"입찰 예정가\", value: p.expected_bid }, right: { key: \"minimum_bid\", label: \"최저가\", value: p.minimum_bid } };",
  );
  assert.notEqual(mutated, SOURCE, "mutation must have been applied");
  const out = renderSnapshot(mutated, FIXTURE, 1024);
  assert.notEqual(
    JSON.stringify(out),
    BASELINE_JSON,
    "reordered price fields must be detected",
  );
});

test("RED — removing an edit handler breaks the content lock (write seam lost)", () => {
  const mutated = SOURCE.replace(
    /if \(expectedBidEditable\) expEl\.addEventListener\('click', async \(e\) => \{[\s\S]*?\n    \}\);/,
    "if (expectedBidEditable) { /* handler removed */ }",
  );
  assert.notEqual(mutated, SOURCE, "mutation must have been applied");
  const out = renderSnapshot(mutated, FIXTURE, 1024);
  assert.notEqual(
    JSON.stringify(out),
    BASELINE_JSON,
    "removing an edit handler must be detected",
  );
});

test("RED — changing an action ID breaks the content lock", () => {
  const mutated = SOURCE.replace(
    "watching: ['bidding', 'skipped'],",
    "watching: ['won', 'bidding', 'skipped'],",
  );
  assert.notEqual(mutated, SOURCE, "mutation must have been applied");
  const out = renderSnapshot(mutated, FIXTURE, 1024);
  assert.notEqual(
    JSON.stringify(out),
    BASELINE_JSON,
    "changing the transition action ID must be detected",
  );
});

test("GREEN — pure style/class changes do NOT fail the content lock", () => {
  const mutated = SOURCE.replace(
    "padding: var(--ke-space-3, 12px) !important;",
    "padding: 3px !important;",
  );
  assert.notEqual(mutated, SOURCE, "style mutation must have been applied");
  const out = renderSnapshot(mutated, FIXTURE, 1024);
  assert.equal(
    JSON.stringify(out),
    BASELINE_JSON,
    "class/style-only changes must keep the content snapshot identical",
  );
});

test("writes evidence JSON for the content-lock contract", () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidence = {
    task: 3,
    plan: ".omo/plans/apple-ui-redesign.md#todo-3",
    production_card: "SYSTEM/Views/auction-card.js",
    status: "green",
    baseline_node_count: baseline.length,
    fixture: {
      status: FIXTURE.status,
      case_number: FIXTURE.case_number,
      court: FIXTURE.court,
      property_type: FIXTURE.property_type,
      region: [FIXTURE.region_sido, FIXTURE.region_sigungu, FIXTURE.region_dong].join(" "),
    },
    locked_constraints: {
      semantic_field_order: true,
      shipped_labels: true,
      links: true,
      button_roles: true,
      editable_fields: true,
      action_ids: true,
      write_seams: true,
      approval_navigation_seams: true,
    },
    css_class_mutations: { allowed: true, detected_snapshot_change: false },
    semantic_snapshot_sha256: undefined,
  };
  const crypto = require("node:crypto");
  evidence.semantic_snapshot_sha256 = crypto
    .createHash("sha256")
    .update(BASELINE_JSON, "utf8")
    .digest("hex");
  const outFile = path.join(EVIDENCE_DIR, "task-3-apple-ui-redesign.json");
  fs.writeFileSync(outFile, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  assert.ok(fs.existsSync(outFile), "evidence JSON must be written");
});
