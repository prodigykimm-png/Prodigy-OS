"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const ai = require(path.join(ROOT, "SYSTEM/Views/reading-question-ai.js"));

function testBuildPromptIncludesContext() {
  const prompt = ai.buildPrompt({
    title: "인간관계론",
    author: "데일 카네기",
    bookType: "practical",
    phase: "before",
    deterministicQuestions: [
      { id: "common_author_question", phase: "before", label: "저자가 던지는 핵심 질문은?" }
    ],
    memoryContext: [
      { title: "성공대화론", relation: "같은 저자", evidence: "대화 원칙" }
    ]
  });
  assert.match(prompt, /인간관계론/);
  assert.match(prompt, /데일 카네기/);
  assert.match(prompt, /practical/);
  assert.match(prompt, /성공대화론/);
  assert.match(prompt, /같은 저자/);
  assert.match(prompt, /최대 5개/);
}

function testNormalizePayloadValid() {
  const payload = {
    questions: [
      { phase: "before", label: "이 책이 해결하려는 관계의 문제는?", reason: "이전 독서와 연결", memory_refs: ["mem-1"] },
      { phase: "during", label: "핵심 용어는?", reason: "구조 파악" }
    ]
  };
  const result = ai.normalizePayload(payload, [{ id: "common_terms" }]);
  assert.equal(result.length, 2);
  assert.equal(result[0].source, "gemini");
  assert.equal(result[0].memory_refs.length, 1);
  assert.equal(result[1].id, "ai_q_1");
}

function testNormalizePayloadRejectsEmpty() {
  assert.equal(ai.normalizePayload(null), null);
  assert.equal(ai.normalizePayload({}), null);
  assert.equal(ai.normalizePayload({ questions: [] }), null);
  assert.equal(ai.normalizePayload({ questions: [{ phase: "before", label: "" }] }), null);
}

function testNormalizePayloadCapsAtFive() {
  const questions = Array.from({ length: 8 }, (_, i) => ({
    phase: "before", label: "질문 " + i, reason: "이유"
  }));
  const result = ai.normalizePayload({ questions }, []);
  assert.equal(result.length, 5);
}

async function testRefineQuestionsCallsProvider() {
  const calls = [];
  const fakeProviderService = {
    requestStructuredJson: async (options) => {
      calls.push(options);
      return {
        questions: [
          { phase: "before", label: "정교화된 질문", reason: "맥락 반영" }
        ]
      };
    }
  };
  const fakeConfig = {
    defaultProvider: "gemini",
    providers: { gemini: { adapter: "gemini", model: "gemini-3.5-flash", apiKeySecret: "test" } }
  };
  global.ProjectWorkflowDraftService = { loadProviderConfig: async () => fakeConfig };
  global.AIProviderService = fakeProviderService;
  try {
    const result = await ai.refineQuestions({
      app: {},
      title: "테스트",
      author: "저자",
      bookType: "universal",
      phase: "before",
      deterministicQuestions: [{ id: "q1", phase: "before", label: "기본 질문" }],
      memoryContext: []
    });
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0].label, "정교화된 질문");
    assert.equal(result.provider, "gemini");
    assert.equal(calls.length, 1);
  } finally {
    delete global.ProjectWorkflowDraftService;
    delete global.AIProviderService;
  }
}

async function main() {
  testBuildPromptIncludesContext();
  testNormalizePayloadValid();
  testNormalizePayloadRejectsEmpty();
  testNormalizePayloadCapsAtFive();
  await testRefineQuestionsCallsProvider();
  console.log("Reading Question AI tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
