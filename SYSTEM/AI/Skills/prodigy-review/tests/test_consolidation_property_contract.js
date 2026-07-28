const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../..");
const REGISTRY_PATH = path.join(ROOT, "SYSTEM/Views/display-registry.js");
const SCHEMA_PATH = path.join(ROOT, "SYSTEM/Prodigy/Schema/Core_Property_Schema.md");

/** Load display registry in a sandboxed VM and return window.prodigyDisplay. */
function loadDisplay() {
  const source = fs.readFileSync(REGISTRY_PATH, "utf8");
  const sandbox = { window: {}, globalThis: {} };
  sandbox.globalThis.ProdigyTokens = null;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.window.prodigyDisplay;
}

const CONSOLIDATION_PROPERTIES = [
  "auction_outcome",
  "auction_result_date",
  "winning_bid_price",
  "invalidation_conditions",
  "reading_format",
  "identifier",
  "publisher",
  "source_url",
];

const EXPECTED_LABELS = {
  auction_outcome: "경매 결과",
  auction_result_date: "결과 확정일",
  winning_bid_price: "낙찰가",
  invalidation_conditions: "무효화 조건",
  reading_format: "독서 형식",
  identifier: "식별 번호",
  publisher: "발행처",
  source_url: "자료 URL",
};

test("all consolidation properties are present in the display registry", () => {
  const display = loadDisplay();
  for (const key of CONSOLIDATION_PROPERTIES) {
    const label = display.property(key);
    assert.notEqual(label, "미등록 항목", `Property '${key}' is missing from registry`);
  }
});

test("all consolidation properties have correct Korean labels", () => {
  const display = loadDisplay();
  for (const [key, expected] of Object.entries(EXPECTED_LABELS)) {
    assert.equal(display.property(key), expected, `Label mismatch for '${key}'`);
  }
});

test("no unknown or duplicate keys in PROPERTY_LABELS", () => {
  const source = fs.readFileSync(REGISTRY_PATH, "utf8");
  const blockMatch = source.match(/const\s+PROPERTY_LABELS\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(blockMatch, "PROPERTY_LABELS block not found");
  const body = blockMatch[1];
  const keys = [];
  const keyPattern = /(?:^|,)\s*(?:["']([^"']+)["']|([A-Za-z_][A-Za-z0-9_]*))\s*:/g;
  let m;
  while ((m = keyPattern.exec(body)) !== null) {
    keys.push(m[1] || m[2]);
  }
  const seen = new Set();
  for (const key of keys) {
    assert.ok(!seen.has(key), `Duplicate key in PROPERTY_LABELS: '${key}'`);
    seen.add(key);
  }
  // All consolidation keys must be present
  for (const key of CONSOLIDATION_PROPERTIES) {
    assert.ok(seen.has(key), `Consolidation key '${key}' not found in PROPERTY_LABELS`);
  }
});

test("auction_outcome enum info renders Korean labels", () => {
  const display = loadDisplay();
  assert.equal(display.auctionOutcome("won"), "낙찰");
  assert.equal(display.auctionOutcome("lost"), "패찰");
  assert.equal(display.auctionOutcome("skipped"), "입찰 포기");
  assert.equal(display.auctionOutcome("nonexistent"), "미등록 경매 결과");
});

test("reading_format enum info renders Korean labels", () => {
  const display = loadDisplay();
  assert.equal(display.readingFormat("book"), "종이책");
  assert.equal(display.readingFormat("ebook"), "전자책");
  assert.equal(display.readingFormat("paper"), "논문");
  assert.equal(display.readingFormat("document"), "문서");
  assert.equal(display.readingFormat("audiobook"), "오디오북");
  assert.equal(display.readingFormat("미분류"), "미분류");
  assert.equal(display.readingFormat("scroll"), "미등록 독서 형식");
});

test("raw keys are never exposed as labels", () => {
  const display = loadDisplay();
  for (const key of CONSOLIDATION_PROPERTIES) {
    assert.notEqual(display.property(key), key, `Raw key '${key}' exposed as its own label`);
  }
});

test("schema has exactly one canonical definition per consolidation property", () => {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  for (const key of CONSOLIDATION_PROPERTIES) {
    const headingPattern = new RegExp(`^###\\s+\`${key}\``, "gm");
    const matches = schema.match(headingPattern) || [];
    assert.equal(matches.length, 1, `Property '${key}' has ${matches.length} ### definitions (expected 1)`);
  }
});

test("list properties are documented as YAML list in schema", () => {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  for (const key of ["invalidation_conditions", "connections"]) {
    const sectionStart = schema.indexOf(`### \`${key}\``);
    assert.ok(sectionStart >= 0, `Section for '${key}' not found`);
    const nextSection = schema.indexOf("### `", sectionStart + 10);
    const section = nextSection > 0 ? schema.slice(sectionStart, nextSection) : schema.slice(sectionStart);
    assert.ok(
      section.includes("YAML list") || section.toLowerCase().includes("list"),
      `Property '${key}' must document list format`
    );
  }
});

test("projections render Korean labels from fixture frontmatter", () => {
  const display = loadDisplay();
  // Simulate fixture frontmatter projection
  const fixtures = [
    { key: "auction_outcome", value: "won", expectLabel: "경매 결과", expectValue: "낙찰" },
    { key: "auction_outcome", value: "lost", expectLabel: "경매 결과", expectValue: "패찰" },
    { key: "auction_outcome", value: "skipped", expectLabel: "경매 결과", expectValue: "입찰 포기" },
    { key: "reading_format", value: "book", expectLabel: "독서 형식", expectValue: "종이책" },
    { key: "reading_format", value: "ebook", expectLabel: "독서 형식", expectValue: "전자책" },
    { key: "reading_format", value: "미분류", expectLabel: "독서 형식", expectValue: "미분류" },
    { key: "invalidation_conditions", value: ["금리 5% 초과", "인구 감소"], expectLabel: "무효화 조건", expectValue: null },
    { key: "auction_result_date", value: "2026-07-15", expectLabel: "결과 확정일", expectValue: null },
    { key: "winning_bid_price", value: 320000000, expectLabel: "낙찰가", expectValue: null },
    { key: "identifier", value: "978-89-01-23456-7", expectLabel: "식별 번호", expectValue: null },
    { key: "publisher", value: "한빛미디어", expectLabel: "발행처", expectValue: null },
    { key: "source_url", value: "https://example.com/book", expectLabel: "자료 URL", expectValue: null },
  ];
  for (const fixture of fixtures) {
    const label = display.property(fixture.key);
    assert.equal(label, fixture.expectLabel, `Label for '${fixture.key}' should be '${fixture.expectLabel}'`);
    // Labels must never be the raw key
    assert.notEqual(label, fixture.key, `Raw key '${fixture.key}' must not appear in UI`);
    // Enum values get Korean projection
    if (fixture.expectValue !== null) {
      if (fixture.key === "auction_outcome") {
        assert.equal(display.auctionOutcome(fixture.value), fixture.expectValue);
      } else if (fixture.key === "reading_format") {
        assert.equal(display.readingFormat(fixture.value), fixture.expectValue);
      }
    }
  }
});
