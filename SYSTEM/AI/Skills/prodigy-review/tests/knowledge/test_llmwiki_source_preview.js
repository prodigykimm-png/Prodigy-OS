"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const resolver = require(path.join(ROOT, "SYSTEM/Views/llmwiki-source-preview.js"));

const korean = [
  "첫 번째 문단입니다.",
  "근거 앞 문장입니다.",
  "한글 근거 문장입니다.",
  "근거 뒤 문장입니다.",
  "마지막 문단입니다.",
].join("\n");

test("source preview resolves a unique Korean evidence quote with surrounding context", () => {
  const result = resolver.resolvePreview({
    citation: {
      source_id: "source_korean",
      content_hash: resolver.sha256(korean),
      source_path: "INBOX/한글 원문.md",
      locators: ["INBOX/한글 원문.md#10-40"],
      evidence_quote: "한글 근거 문장입니다.",
    },
    source_text: korean,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "current");
  assert.equal(result.match_status, "unique");
  assert.equal(result.source_path, "INBOX/한글 원문.md");
  assert.equal(result.evidence_quote, "한글 근거 문장입니다.");
  assert.equal(result.position.line, 2);
  assert.equal(result.position.ch, 0);
  assert.match(result.context, /근거 앞 문장입니다/);
  assert.match(result.context, /근거 뒤 문장입니다/);
});

test("source preview reports duplicate quotes without guessing a location", () => {
  const source = "앞\n반복 근거\n중간\n반복 근거\n뒤";
  const result = resolver.resolvePreview({
    citation: {
      source_id: "source_duplicate",
      content_hash: resolver.sha256(source),
      source_path: "INBOX/중복.md",
      locators: ["INBOX/중복.md#1-4"],
      evidence_quote: "반복 근거",
    },
    source_text: source,
  });
  assert.equal(result.ok, true);
  assert.equal(result.match_status, "ambiguous");
  assert.equal(result.match_count, 2);
  assert.equal(result.position, null);
  assert.equal(result.context, "");
});

test("source preview uses a verified global locator to disambiguate repeated evidence", () => {
  const source = "앞\n반복 근거\n중간\n반복 근거\n뒤";
  const second = source.lastIndexOf("반복 근거");
  const result = resolver.resolvePreview({
    citation: {
      source_id: "source_global_span",
      content_hash: resolver.sha256(source),
      source_path: "INBOX/전역 위치.md",
      locators: [`INBOX/전역 위치.md#${second}-${second + "반복 근거".length}`],
      evidence_quote: "반복 근거",
    },
    source_text: source,
  });

  assert.equal(result.match_status, "unique");
  assert.equal(result.match_mode, "global_span");
  assert.equal(result.position.line, 3);
  assert.equal(result.position.ch, 0);
  assert.match(result.context, /중간/u);
});

test("source preview ignores an invalid global locator and stays ambiguous", () => {
  const source = "앞\n반복 근거\n중간\n반복 근거\n뒤";
  const wrong = source.indexOf("중간");
  const result = resolver.resolvePreview({
    citation: {
      source_id: "source_invalid_span",
      content_hash: resolver.sha256(source),
      source_path: "INBOX/잘못된 위치.md",
      locators: [`INBOX/잘못된 위치.md#${wrong}-${wrong + 2}`],
      evidence_quote: "반복 근거",
    },
    source_text: source,
  });

  assert.equal(result.match_status, "ambiguous");
  assert.equal(result.match_mode, "exact");
  assert.equal(result.position, null);
});

test("source preview anchors normalized table whitespace to the exact source row", () => {
  const source = [
    "| 구분 | 기준                              |",
    "| --- | --- |",
    "| 무주택자 | 공시가격 5억 이하                 |",
  ].join("\n");
  const result = resolver.resolvePreview({
    citation: {
      source_id: "source_table",
      content_hash: resolver.sha256(source),
      source_path: "INBOX/표.md",
      locators: ["INBOX/표.md"],
      evidence_quote: "| 무주택자 | 공시가격 5억 이하 |",
    },
    source_text: source,
  });

  assert.equal(result.ok, true);
  assert.equal(result.match_status, "unique");
  assert.equal(result.match_mode, "normalized_whitespace");
  assert.equal(result.evidence_quote, "| 무주택자 | 공시가격 5억 이하                 |");
  assert.equal(result.position.line, 2);
  assert.equal(result.position.ch, 0);
});

test("source preview reports stale content while preserving read-only evidence", () => {
  const result = resolver.resolvePreview({
    citation: {
      source_id: "source_stale",
      content_hash: "a".repeat(64),
      source_path: "INBOX/수정됨.md",
      locators: ["INBOX/수정됨.md#1-2"],
      evidence_quote: "이전 근거",
    },
    source_text: "새로운 원문",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "stale");
  assert.equal(result.match_status, "missing");
  assert.equal(result.position, null);
  assert.equal(result.evidence_quote, "이전 근거");
});

test("source preview never issues an edit position for stale matching evidence", () => {
  const source = "앞\n동일 근거\n변경된 뒤 문장";
  const start = source.indexOf("동일 근거");
  const result = resolver.resolvePreview({
    citation: {
      source_id: "source_stale_match",
      content_hash: resolver.sha256("앞\n동일 근거\n이전 뒤 문장"),
      source_path: "INBOX/부분 수정됨.md",
      locators: [`INBOX/부분 수정됨.md#${start}-${start + "동일 근거".length}`],
      evidence_quote: "동일 근거",
    },
    source_text: source,
  });

  assert.equal(result.status, "stale");
  assert.equal(result.match_status, "unique");
  assert.equal(result.match_mode, "exact");
  assert.equal(result.position, null);
  assert.match(result.context, /변경된 뒤 문장/u);
});

test("source preview rejects citations without a vault Markdown path", () => {
  const result = resolver.resolvePreview({
    citation: {
      source_id: "source_external",
      content_hash: "b".repeat(64),
      source_url: "https://example.com/source",
      locators: ["https://example.com/source#section"],
      evidence_quote: "근거",
    },
    source_text: "근거",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "SOURCE_PREVIEW_PATH_REQUIRED");
});
