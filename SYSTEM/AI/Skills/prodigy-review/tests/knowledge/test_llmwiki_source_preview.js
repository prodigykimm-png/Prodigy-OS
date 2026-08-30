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
