"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const dataApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lossless-data-source.js"));

function fakeVault(artifact) {
  return { adapter: { async read(name) { assert.equal(name, dataApi.ARTIFACT_PATH); return JSON.stringify(artifact); } } };
}
const artifact = { results: [{ source_path: "INBOX/sample.md", claims: 2, topic_pages: 1, source_details: 1,
  corpus_index: { page_id: "index_1", title: "sample", body: "# sample" },
  topics: [{ page_id: "topic_1", title: "주제", claim_ids: ["claim_1"], source_detail_ids: ["detail_1"] }],
  details: [{ page_id: "detail_1", title: "원문", claim_ids: ["claim_1", "claim_2"] }],
  claim_rows: [{ claim_id: "claim_1", text: "첫 정보", global_span: { start: 10, end: 14 } }, { claim_id: "claim_2", text: "둘째 정보", global_span: { start: 20, end: 25 } }],
  receipt: { receipt_hash: "a".repeat(64) } }] };

test("lossless datasource loads lists and resolves a corpus without mutation", async () => {
  const source = dataApi.createDataSource({ vault: fakeVault(artifact) });
  const list = await source.list();
  assert.deepEqual(list, [{ source_path: "INBOX/sample.md", claims: 2, topics: 1, details: 1, receipt_hash: "a".repeat(64) }]);
  const result = await source.get("INBOX/sample.md");
  assert.equal(result.claim_rows[0].text, "첫 정보");
  assert.equal(Object.isFrozen(result), true);
});

test("lossless datasource rejects malformed artifacts", async () => {
  const source = dataApi.createDataSource({ vault: fakeVault({ results: [{ source_path: "bad" }] }) });
  await assert.rejects(() => source.load(), /invalid_lossless_artifact/u);
});
