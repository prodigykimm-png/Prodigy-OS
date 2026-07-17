"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/reading-core.js"));

function main() {
  const book = core.normalizeBook({
    title: "데일 카네기 인간관계론",
    purpose: "legacy purpose",
    path: "PARA/PROJECTS/Reading/book.md"
  });
  assert.equal(book.type, "reading");
  assert.equal(book.book_title, "데일 카네기 인간관계론");
  assert.equal(book.reading_purpose, "legacy purpose");
  assert.ok(book.book_id);

  const withPurpose = core.normalizeBook({
    book_title: "Test",
    purpose: "old",
    reading_purpose: "new purpose"
  });
  assert.equal(withPurpose.reading_purpose, "new purpose");

  assert.throws(() => core.createReadingSession(book, { date: "2026-07-17" }));

  const session = core.createReadingSession(book, {
    date: "2026-07-17",
    reading_range: "1장",
    duration: "32m",
    my_thought: "관계의 시작은 경청",
    thinking_delta: "설득보다 관심이 먼저다"
  });
  assert.equal(session.type, "reading_session");
  assert.equal(session.book_id, book.book_id);
  assert.equal(session.duration, "32m");
  assert.equal(session.thinking_delta, "설득보다 관심이 먼저다");
  assert.ok(session.session_id);

  const pageOnly = core.createReadingSession(book, {
    date: "2026-07-17",
    start_page: "10",
    end_page: "20",
    key_content: "핵심"
  });
  assert.equal(pageOnly.start_page, "10");

  const candidate = core.createKnowledgeCandidate(session, {});
  assert.equal(candidate.status, "proposed");
  assert.equal(candidate.source_type, "reading_session");
  assert.equal(candidate.statement, "관계의 시작은 경청");
  assert.match(candidate.title, /데일 카네기|후보/);

  const saved = core.saveKnowledgeCandidate(candidate);
  assert.equal(saved.status, "saved");
  assert.equal(candidate.status, "proposed");
  const rejected = core.rejectKnowledgeCandidate(candidate);
  assert.equal(rejected.status, "rejected");
  assert.equal(candidate.status, "proposed");
  assert.ok(rejected.updated);
  assert.throws(() => core.setKnowledgeCandidateStatus(candidate, "approved"));

  const original = { title: "immutable" };
  const bookCopy = core.normalizeBook(original);
  bookCopy.title = "changed";
  assert.equal(original.title, "immutable");

  assert.equal(core.sanitizeFilename('a/b:c*?"<>|d'), "a b c d");

  const md = core.buildSessionMarkdown(session);
  assert.match(md, /type: reading_session/);
  assert.match(md, /Thinking Delta/);

  console.log("Reading learning loop core tests passed");
}

main();
