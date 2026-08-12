"use strict";

const assert = require("node:assert/strict");
const { deferred, field, mount, prepareAndInterpret } = require("./knowledge_source_batch_view_fixture.js");

async function testUrlEditAfterPrepareInvalidatesPreparedSnapshotBeforeAnyRetrieval() {
  const cases = [Array.from({ length: 21 }, (_, index) => `https://news.example.test/${index}`).join("\n"), "<file-uri>/private/source.md"];
  for (const urlsText of cases) {
    const fixture = mount();
    assert.equal(fixture.controller.prepare(), true);
    field(fixture.root, "urls_text").oninput({ target: { value: urlsText } });
    assert.equal(fixture.controller.state().rows.length, 0, "editing URL input clears stale prepared rows");
    assert.equal(fixture.controller.state().can_summarize, false, "editing URL input disables AI until prepare reruns");
    assert.equal(await fixture.controller.retrieve(), false, "edited URLs need explicit successful prepare before retrieval");
    assert.equal(fixture.retrievalCalls.length, 0, "invalid edited input makes zero retrieval calls");
  }
}
async function testSavePendingBlocksAiProviderUntilAllRowsSettle() {
  const write = deferred();
  const fixture = mount({ sourceStore: { saveSource(_app, source) { fixture.sourceWrites.push(source); return write.promise; } } });
  prepareAndInterpret(fixture);
  await fixture.controller.retrieve();
  const save = fixture.controller.saveSelected();
  await Promise.resolve();
  assert.equal(fixture.controller.state().saving, true);
  assert.equal(fixture.controller.canSummarize(), false, "saving blocks AI before provider invocation");
  assert.equal(await fixture.controller.summarize(), false, "AI rejects while a source write is pending");
  assert.equal(fixture.providerCalls.length, 0, "saving makes zero provider calls");
  write.resolve({ link: "[[ZETA/LITERATURE/저장된 자료]]", source_id: "saved-source" });
  assert.equal(await save, true);
  assert.equal(fixture.controller.state().saving, false);
  assert.equal(fixture.controller.canSummarize(), true, "AI re-enables only after every source write settles");
}
async function main() {
  await testUrlEditAfterPrepareInvalidatesPreparedSnapshotBeforeAnyRetrieval();
  await testSavePendingBlocksAiProviderUntilAllRowsSettle();
  console.log("Knowledge source batch preflight/race tests passed");
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = Object.freeze({ testUrlEditAfterPrepareInvalidatesPreparedSnapshotBeforeAnyRetrieval, testSavePendingBlocksAiProviderUntilAllRowsSettle });
