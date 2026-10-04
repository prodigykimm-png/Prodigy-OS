"use strict";

// Regression lock for the auction frontmatter guard.
//
// Each case below is a real defect class that made an auction card stop saving:
// Obsidian parses the existing frontmatter before it writes, and a parse throw
// means the write never happens. The guard must detect and repair each class,
// must leave valid frontmatter alone, and must never rewrite block-scalar text.

const assert = require("node:assert/strict");
const guard = require("./auction-frontmatter-guard.js");

const BODY = "# 요약\n\n- 중요한 이유:\n- 핵심 기회:\n- 핵심 위험:\n";

// 1. An unquoted value containing ": " is read by YAML as a nested mapping.
{
  const text = `---\nid: x\nmarket_price_basis: 정보 없음 (2026-09-27 Pass 1: t-auction 미수집)\n---\n\n${BODY}`;
  const report = guard.analyze(text);
  assert.equal(report.ok, false, "unquoted mapping value must be detected");
  assert.deepEqual(report.unquotedMappingValues.map((v) => v.key), ["market_price_basis"]);
  const fixed = guard.repair(text);
  assert.equal(fixed.ok, true);
  assert.match(fixed.text, /^market_price_basis: "정보 없음/m);
  assert.ok(fixed.text.endsWith(BODY), "body must be preserved");
}

// 2. A closing delimiter glued to the next line swallows the body as frontmatter.
{
  const text = `---\nid: x\nfield_report:\n---# 요약\n\n- 중요한 이유:\n`;
  const report = guard.analyze(text);
  assert.equal(report.ok, false);
  assert.equal(report.gluedDelimiter.line, 4);
  const fixed = guard.repair(text);
  assert.equal(fixed.ok, true);
  assert.ok(fixed.text.includes("---\n# 요약"), "delimiter must be split from the heading");
  assert.ok(fixed.text.includes("- 중요한 이유:"), "body must survive");
}

// 3. A duplicated key makes the frontmatter unparseable.
{
  const text = "---\nid: x\nwinning_bid_price:\nwinning_bid_price: 85200000\n---\n";
  const report = guard.analyze(text);
  assert.equal(report.ok, false);
  assert.deepEqual(report.duplicateKeys.map((v) => v.key), ["winning_bid_price"]);
  const fixed = guard.repair(text);
  assert.equal(fixed.ok, true);
  assert.equal((fixed.text.match(/winning_bid_price/g) || []).length, 1, "one key must remain");
  assert.match(fixed.text, /winning_bid_price: 85200000/, "the value must be kept, not dropped");
}

// 4. A multi-line double-quoted scalar whose continuation is not indented.
{
  const text = `---\nid: x\nauction_note: "적정시세를 모르겠다\n괜찮을거같긴한데"\n---\n`;
  const report = guard.analyze(text);
  assert.equal(report.ok, false);
  assert.deepEqual(report.unclosedQuotes.map((v) => v.key), ["auction_note"]);
  const fixed = guard.repair(text);
  assert.equal(fixed.ok, true);
  assert.match(fixed.text, /^auction_note: "적정시세를 모르겠다 괜찮을거같긴한데"$/m);
}

// 5. Block-scalar bodies are literal text and must never be rewritten.
{
  const text = `---\nid: x\nmarket_price_basis: >-\n  출처 URL: https://a.b/c. 확인시각: 2026-09-03 19:20 KST\nloan_ratio: 0.8\n---\n`;
  const report = guard.analyze(text);
  assert.equal(report.ok, true, "block-scalar content is not a defect");
  assert.equal(report.unquotedMappingValues.length, 0, "block-scalar body must not be read as a key");
  const fixed = guard.repair(text);
  assert.equal(fixed.changed, false, "a clean document must not be rewritten");
}

// 6. An explicitly empty quoted string is valid YAML, not an unclosed quote.
{
  const text = `---\nid: x\nmy_opinion: ""\n---\n`;
  assert.equal(guard.analyze(text).ok, true);
  assert.equal(guard.repair(text).changed, false);
}

// 7. Ordinary values (URLs, timestamps, areas, Korean text) need no quoting.
{
  const text = `---\nid: x\nurl: https://a.b/c?d=1\nts: 2026-10-30T10:00\narea: 22.23㎡\nnote: 짧은 메모\n---\n`;
  const report = guard.analyze(text);
  assert.equal(report.ok, true);
  assert.equal(report.unquotedMappingValues.length, 0, "safe scalars must not be quoted");
}

// 8. Repair is idempotent: a repaired document is reported clean.
{
  const text = `---\nid: x\nmarket_price_basis: 정보 없음: 미조사\nfield_report:\n---# 요약\n\n본문\n`;
  const once = guard.repair(text);
  assert.equal(once.ok, true);
  const twice = guard.repair(once.text);
  assert.equal(twice.changed, false, "second pass must be a no-op");
  assert.equal(twice.text, once.text);
}

console.log("auction-frontmatter-guard: all assertions passed");
