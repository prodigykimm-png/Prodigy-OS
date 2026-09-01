"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const ai = require(path.join(ROOT, "SYSTEM/Views/reading-thinking-delta-ai.js"));

function testValidateReadinessBlocksMissingBefore() {
  const result = ai.validateReadiness({ before: "", after: "읽고 나서 생각이 바뀌었다." });
  assert.equal(result.ready, false);
  assert.match(result.reason, /Before/);
}

function testValidateReadinessBlocksMissingAfter() {
  const result = ai.validateReadiness({ before: "읽기 전에는 이렇게 생각했다.", after: "" });
  assert.equal(result.ready, false);
  assert.match(result.reason, /After/);
}

function testValidateReadinessPassesWhenBothPresent() {
  const result = ai.validateReadiness({ before: "설득이 먼저라고 생각했다.", after: "경청이 먼저라고 생각하게 되었다." });
  assert.equal(result.ready, true);
}

function testBuildPromptIncludesBeforeAndAfter() {
  const prompt = ai.buildPrompt({
    title: "인간관계론",
    before: "설득이 먼저라고 생각했다.",
    after: "경청이 먼저라고 생각하게 되었다.",
    sessionNotes: "대화에서 먼저 질문했다."
  });
  assert.match(prompt, /인간관계론/);
  assert.match(prompt, /설득이 먼저/);
  assert.match(prompt, /경청이 먼저/);
  assert.match(prompt, /대화에서 먼저 질문/);
  assert.match(prompt, /존재하지 않는 과거 믿음을 생성하지 않는다/);
}

function testNormalizePayloadValid() {
  const payload = {
    before: "설득이 먼저라고 생각했다.",
    after: "경청이 먼저라고 생각하게 되었다.",
    reason: "책에서 경청의 중요성을 반복 강조했다.",
    evidence_refs: ["ch3", "ch5"]
  };
  const result = ai.normalizePayload(payload);
  assert.equal(result.before, "설득이 먼저라고 생각했다.");
  assert.equal(result.after, "경청이 먼저라고 생각하게 되었다.");
  assert.equal(result.reason, "책에서 경청의 중요성을 반복 강조했다.");
  assert.deepEqual(result.evidence_refs, ["ch3", "ch5"]);
}

function testNormalizePayloadRejectsMissingFields() {
  assert.equal(ai.normalizePayload(null), null);
  assert.equal(ai.normalizePayload({}), null);
  assert.equal(ai.normalizePayload({ before: "", after: "test" }), null);
  assert.equal(ai.normalizePayload({ before: "test", after: "" }), null);
}

function testNormalizePayloadDefaultsReason() {
  const result = ai.normalizePayload({ before: "A", after: "B", reason: "" });
  assert.equal(result.reason, "변화가 확인되지 않음");
}

async function testGenerateThinkingDeltaCallsProvider() {
  const calls = [];
  const fakeClient = {
    requestStructured: async (options) => {
      calls.push(options);
      return { ok: true, payload: {
        before: "설득이 먼저라고 생각했다.",
        after: "경청이 먼저라고 생각하게 되었다.",
        reason: "책에서 경청의 중요성을 반복 강조했다.",
        evidence_refs: []
      }, receipt: { provider_key: "fake", model: "fake-model" } };
    }
  };
  const result = await ai.generateThinkingDelta({
      app: {},
      client: fakeClient,
      title: "인간관계론",
      before: "설득이 먼저라고 생각했다.",
      after: "경청이 먼저라고 생각하게 되었다.",
      sessionNotes: ""
    });
    assert.equal(result.before, "설득이 먼저라고 생각했다.");
    assert.equal(result.after, "경청이 먼저라고 생각하게 되었다.");
    assert.equal(result.provider, "fake");
    assert.equal(calls.length, 1);
}

async function testGenerateThinkingDeltaRejectsInsufficientRecords() {
  await assert.rejects(
    ai.generateThinkingDelta({ app: {}, title: "test", before: "", after: "something" }),
    /기록이 부족/
  );
}

async function main() {
  testValidateReadinessBlocksMissingBefore();
  testValidateReadinessBlocksMissingAfter();
  testValidateReadinessPassesWhenBothPresent();
  testBuildPromptIncludesBeforeAndAfter();
  testNormalizePayloadValid();
  testNormalizePayloadRejectsMissingFields();
  testNormalizePayloadDefaultsReason();
  await testGenerateThinkingDeltaCallsProvider();
  await testGenerateThinkingDeltaRejectsInsufficientRecords();
  console.log("Reading Thinking Delta AI tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
