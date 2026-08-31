"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const segmenter = require(path.join(ROOT, "SYSTEM/Views/llmwiki-corpus-segmenter.js"));

const SOURCE_PATH = "INBOX/투놀카페/투놀카페 - 투자일기.md";
const FIXTURE = `---\ntitle: 투자일기\n---\n\n# 투자일기\n\n> 총 2개 글\n\n## 첫 번째 집짓기\n\n글번호: 85 | 작성자: 모멘트 | 날짜: 2015.05.02.\n\n첫 글의 핵심 내용이다.\n\n## 두 번째 경매기\n\n글번호: 91 | 작성자: 장생 | 날짜: 2015.05.09.\n\n둘째 글의 핵심 내용이다.\n`;

test("corpus segmentation preserves every source byte with stable article boundaries", () => {
  const result = segmenter.segmentCorpus({ source_path: SOURCE_PATH, source_text: FIXTURE });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.subdocuments.length, 2);
  assert.equal(result.ledger.length, 3, "preamble plus two articles");
  assert.equal(result.coverage.total_chars, FIXTURE.length);
  assert.equal(result.coverage.covered_chars, FIXTURE.length);
  assert.equal(result.coverage.uncovered_chars, 0);
  assert.equal(result.coverage.overlap_chars, 0);
  assert.equal(result.ledger.map((row) => FIXTURE.slice(row.global_span.start, row.global_span.end)).join(""), FIXTURE);
  for (const document of result.subdocuments) {
    assert.equal(FIXTURE.slice(document.global_span.start, document.global_span.end), document.source_text);
    assert.deepEqual(document.local_span, { start: 0, end: document.source_text.length });
    assert.match(document.subdocument_id, /^subdoc_[0-9a-f]{24}$/u);
  }
});

test("inserting one article preserves unaffected content-derived subdocument ids", () => {
  const first = segmenter.segmentCorpus({ source_path: SOURCE_PATH, source_text: FIXTURE });
  const inserted = FIXTURE.replace("## 두 번째 경매기", "## 새 글\n\n글번호: 88 | 작성자: 새작성자 | 날짜: 2015.05.05.\n\n새 내용이다.\n\n## 두 번째 경매기");
  const second = segmenter.segmentCorpus({ source_path: SOURCE_PATH, source_text: inserted });
  assert.equal(second.ok, true, second.reason);
  assert.equal(second.subdocuments.length, 3);
  assert.equal(second.subdocuments[0].subdocument_id, first.subdocuments[0].subdocument_id);
  assert.equal(second.subdocuments[2].subdocument_id, first.subdocuments[1].subdocument_id);
});

test("ordinary headed notes fall back to section boundaries without crossing spans", () => {
  const source = "# 학습 노트\n\n서문\n\n## 준비\n\n준비 내용\n\n## 실행\n\n실행 내용\n";
  const result = segmenter.segmentCorpus({ source_path: "INBOX/학습.md", source_text: source });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.subdocuments.map((row) => row.title), ["준비", "실행"]);
  assert.equal(result.coverage.uncovered_chars, 0);
  assert.equal(result.coverage.overlap_chars, 0);
});
