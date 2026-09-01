"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const aiPath = path.join(ROOT, "SYSTEM/Views/monthly-validation-ai.js");
const context = {
  schema_version: "1.0",
  month: "2026-07",
  readiness: { weekly_count: 3, eligible_principles: 2 },
  principles: [
    { principle_ref: "monthly-2026-07-p001", title: "먼저 확인하기", weeks: ["2026-W27", "2026-W28"], supporting_evidence_refs: ["daily-2026-07-01-e01"] },
    { principle_ref: "monthly-2026-07-p002", title: "짧게 기록하기", weeks: ["2026-W27", "2026-W29"], supporting_evidence_refs: ["daily-2026-07-02-e01"] }
  ],
  evidence: [
    { evidence_id: "daily-2026-07-01-e01", date: "2026-07-01", context: "업무", experience: "경험 1", interpretation: "해석 1", change: "변화 1", next_experiment: "실험 1" },
    { evidence_id: "daily-2026-07-02-e01", date: "2026-07-02", context: "업무", experience: "경험 2", interpretation: "해석 2", change: "변화 2", next_experiment: "실험 2" }
  ],
  coverage_warnings: []
};

function review(ref, supporting, counter) {
  return {
    principle_ref: ref,
    supporting_evidence_refs: supporting,
    counter_evidence_refs: counter,
    missing_evidence: ["추가 관찰"],
    contradictions_or_exceptions: ["예외 가능성"],
    validation_questions: ["다음에도 반복되는가?"],
    validation_rationale_draft: "저장이라는 단어가 들어간 자유 문장도 허용한다."
  };
}

const goodPayload = {
  schema_version: "1.0",
  principle_reviews: [
    review("monthly-2026-07-p002", ["daily-2026-07-02-e01"], []),
    review("monthly-2026-07-p001", ["daily-2026-07-01-e01"], [])
  ],
  next_month_direction_draft: "다음 달에는 같은 실험을 한 번 더 관찰한다."
};

delete require.cache[require.resolve(aiPath)];
const ai = require(aiPath);

assert.equal(ai.MONTHLY_AI_SCHEMA.additionalProperties, false);
assert.equal(ai.MONTHLY_AI_SCHEMA.properties.principle_reviews.items.additionalProperties, false);
const normalized = ai.normalizeMonthlyAIResponse(goodPayload, context);
assert.deepEqual(normalized.principle_reviews.map((item) => item.principle_ref), [
  "monthly-2026-07-p001",
  "monthly-2026-07-p002"
]);
assert.equal(normalized.principle_reviews[0].validation_rationale_draft.includes("저장"), true);
assert.equal(normalized.next_month_direction_draft, goodPayload.next_month_direction_draft);

const questionPayload = {
  schema_version: "1.0",
  coverage_summary: "7월 Evidence 2개를 관찰했습니다.",
  observed_evidence_groups: [{ evidence_refs: ["daily-2026-07-01-e01"], observation: "확인 전 멈추는 장면을 더 관찰합니다." }],
  missing_evidence: ["서로 다른 주차의 반복 근거"],
  uncertainties: ["단일 주차 관찰인지 알 수 없음"],
  review_questions: ["다음 주에도 같은 변화가 나타나는가?"] ,
  next_month_direction_draft: "확인 전 멈추는 장면을 한 달 더 관찰한다."
};
const questionNormalized = ai.normalizeMonthlyQuestionResponse(questionPayload, context);
assert.equal(questionNormalized.mode, "question_only");
assert.equal(questionNormalized.observed_evidence_groups[0].evidence_refs[0], "daily-2026-07-01-e01");
assert.throws(
  () => ai.normalizeMonthlyQuestionResponse({ ...questionPayload, observed_evidence_groups: [{ evidence_refs: ["foreign-evidence"], observation: "금지" }] }, context),
  /evidence|근거/i
);
assert.throws(
  () => ai.normalizeMonthlyQuestionResponse({ ...questionPayload, decision: "validated" }, context),
  /forbidden|금지|decision|key/i
);

assert.throws(
  () => ai.normalizeMonthlyAIResponse({ ...goodPayload, principle_reviews: goodPayload.principle_reviews.slice(0, 1) }, context),
  /review/i
);
assert.throws(
  () => ai.normalizeMonthlyAIResponse({ ...goodPayload, principle_reviews: [goodPayload.principle_reviews[0], goodPayload.principle_reviews[0]] }, context),
  /review/i
);
assert.throws(
  () => ai.normalizeMonthlyAIResponse({ ...goodPayload, principle_reviews: goodPayload.principle_reviews.map((item) => ({ ...item, extra: "금지" })) }, context),
  /key|field|허용/i
);
assert.throws(
  () => ai.normalizeMonthlyAIResponse({ ...goodPayload, principle_reviews: goodPayload.principle_reviews.map((item) => ({ ...item, decision: "validated" })) }, context),
  /forbidden|금지|decision|key/i
);
assert.throws(
  () => ai.normalizeMonthlyAIResponse({ ...goodPayload, principle_reviews: goodPayload.principle_reviews.map((item) => ({ ...item, supporting_evidence_refs: ["foreign-evidence"] })) }, context),
  /evidence|근거/i
);

let requestOptions = null;
let nextPayload = goodPayload;
const client = {
  requestStructured: async (options) => {
    requestOptions = options;
    return { ok: true, payload: nextPayload, receipt: { provider_key: "test", model: "test-model" } };
  }
};

(async () => {
  const controller = new AbortController();
  const result = await ai.generateMonthlyAI({ app: {}, client, context, signal: controller.signal });
  assert.equal(result.provider, "test");
  assert.equal(result.model, "test-model");
  assert.equal(requestOptions.schema, ai.MONTHLY_AI_SCHEMA);
  assert.equal(requestOptions.signal, controller.signal);
  assert.equal(requestOptions.prompt.includes("source_mtime"), false);
  requestOptions = null;
  nextPayload = questionPayload;
  const questionResult = await ai.generateMonthlyAI({ app: {}, client, context, mode: "question_only", signal: controller.signal });
  assert.equal(questionResult.mode, "question_only");
  assert.equal(requestOptions.schema, ai.MONTHLY_QUESTION_SCHEMA);
  assert.match(requestOptions.prompt, /관찰 질문 보조/);
  console.log("Monthly validation AI tests passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
