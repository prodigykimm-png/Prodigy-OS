"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
require(path.join(ROOT, "SYSTEM/Views/knowledge-use-body-core.js"));
const store = require(path.join(ROOT, "SYSTEM/Views/knowledge-use-body-store.js"));

const DATE = "2026-07-23";

function makeApp(files, types) {
  const file = (p) => ({ path: p, name: p.split("/").pop() });
  const writes = [];
  return {
    writes,
    vault: {
      getAbstractFileByPath(p) { return Object.prototype.hasOwnProperty.call(files, p) ? file(p) : null; },
      async read(f) { return files[f.path]; },
      async modify(f, content) { files[f.path] = content; writes.push({ path: f.path, content }); }
    },
    metadataCache: {
      getFileCache(f) { return { frontmatter: { type: types[f.path] } }; },
      getFirstLinkpathDest(target) { return Object.prototype.hasOwnProperty.call(types, target + ".md") ? file(target + ".md") : null; }
    }
  };
}

function auctionNote() {
  return "---\ntype: auction_case\nstatus: bidding\n---\n# 요약\n- 기존\n# 판단 기록\n### 판단 변경 기록\n- 날짜: 2026-07-22\n# 복기\n- 기존\n";
}

async function testRecordsVerifiedKnowledgeAndWritesOnce() {
  // Given: an auction object and two verified Knowledge notes.
  const files = { "p.md": auctionNote(), "ZETA/PERMANENT/a.md": "", "ZETA/PERMANENT/b.md": "" };
  const types = { "p.md": "auction_case", "ZETA/PERMANENT/a.md": "knowledge", "ZETA/PERMANENT/b.md": "permanent_note" };
  const app = makeApp(files, types);

  // When: the user records both links with a one-line basis.
  const result = await store.recordKnowledgeUse(app, "p.md", "auction_case", { date: DATE, context: "출구가 우선", links: ["[[ZETA/PERMANENT/a]]", "[[ZETA/PERMANENT/b]]"] });

  // Then: exactly one modify happens and the body carries the block.
  assert.equal(result.status, "recorded");
  assert.equal(app.writes.length, 1);
  assert.match(files["p.md"], /PRODIGY:KNOWLEDGE_USE/);
  assert.match(files["p.md"], /- 판단: 출구가 우선/);
}

async function testRepeatDoesNotWriteAgain() {
  // Given: a recorded object.
  const files = { "p.md": auctionNote(), "ZETA/PERMANENT/a.md": "" };
  const types = { "p.md": "auction_case", "ZETA/PERMANENT/a.md": "knowledge" };
  const app = makeApp(files, types);
  const input = { date: DATE, context: "출구가 우선", links: ["[[ZETA/PERMANENT/a]]"] };
  await store.recordKnowledgeUse(app, "p.md", "auction_case", input);
  app.writes.length = 0;

  // When: the identical submission repeats.
  const repeat = await store.recordKnowledgeUse(app, "p.md", "auction_case", input);

  // Then: no write occurs and content is unchanged.
  assert.equal(repeat.status, "already_recorded");
  assert.equal(app.writes.length, 0);
}

async function testUnverifiedLinkRejectsBeforeWrite() {
  // Given: a link that resolves to a candidate, not verified Knowledge.
  const files = { "p.md": auctionNote(), "ZETA/PERMANENT/a.md": "", "PARA/RESOURCES/Knowledge/Candidates/c.md": "" };
  const types = { "p.md": "auction_case", "ZETA/PERMANENT/a.md": "knowledge", "PARA/RESOURCES/Knowledge/Candidates/c.md": "knowledge_candidate" };
  const app = makeApp(files, types);

  // When/Then: recording rejects and writes nothing.
  await assert.rejects(() => store.recordKnowledgeUse(app, "p.md", "auction_case", { date: DATE, context: "맥락", links: ["[[ZETA/PERMANENT/a]]", "[[PARA/RESOURCES/Knowledge/Candidates/c]]"] }), /검증된 지식/);
  assert.equal(app.writes.length, 0);
}

async function testTypeMismatchAndMissingObjectReject() {
  const files = { "p.md": auctionNote(), "ZETA/PERMANENT/a.md": "" };
  const types = { "p.md": "auction_case", "ZETA/PERMANENT/a.md": "knowledge" };
  const app = makeApp(files, types);
  const good = { date: DATE, context: "맥락", links: ["[[ZETA/PERMANENT/a]]"] };
  await assert.rejects(() => store.recordKnowledgeUse(app, "p.md", "reading", good), /유형이 일치/);
  await assert.rejects(() => store.recordKnowledgeUse(app, "missing.md", "auction_case", good), /찾을 수/);
  assert.equal(app.writes.length, 0);
}

async function main() {
  await testRecordsVerifiedKnowledgeAndWritesOnce();
  await testRepeatDoesNotWriteAgain();
  await testUnverifiedLinkRejectsBeforeWrite();
  await testTypeMismatchAndMissingObjectReject();
  console.log("Knowledge use body store tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
