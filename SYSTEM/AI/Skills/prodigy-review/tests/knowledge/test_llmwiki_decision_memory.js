"use strict";
// 소유자 결정 기억: 겹치는 주제로 예전 선택을 추천 기본값으로 꺼내고,
// 건드린 값은 덮지 않으며, 나쁜 파일에도 막히지 않는다. 합성 픽스처만 쓴다.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

const MEMO_PATH = "SYSTEM/CACHE/llmwiki/owner-decision-memory.json";
const TOPIC_LEGACY_BYTES = [
  "---",
  'type: knowledge',
  'title: "legacy album guide"',
  'knowledge_domain: "wedding"',
  'knowledge_topics:',
  '  - "웨딩"',
  "---",
  "",
  "# legacy album guide",
  "",
  "가족사진은 신랑측 우선으로 배치한다.",
  "",
].join("\n");

const memoryFile = (topics, extra = {}) => JSON.stringify([{
  topics, knowledge_kind: "claim", knowledge_domain: "wedding",
  evidence_strength: "strong", updated_at: "2026-09-20T00:00:00.000Z", ...extra,
}]);

function evidenceSelect(modal) {
  return fx.field(modal.contentEl, "evidence_strength");
}

test("겹치는 주제면 예전 근거 수준을 추천으로 꺼낸다", async () => {
  const harness = await fx.openReview({
    item: fx.makeItem({ reviewId: "plan_compiled_synthetic_memory_1" }),
    targetBytes: TOPIC_LEGACY_BYTES,
    files: { [MEMO_PATH]: memoryFile(["웨딩"]) },
  });
  const select = evidenceSelect(harness.modal);
  assert.ok(select, "근거 선택기가 있어야 한다");
  assert.equal(select.value, "strong", "기억된 값을 추천해야 한다");
});

test("건드린 값은 기억으로 덮지 않는다", async () => {
  const harness = await fx.openReview({
    item: fx.makeItem({ reviewId: "plan_compiled_synthetic_memory_2" }),
    targetBytes: TOPIC_LEGACY_BYTES,
    files: { [MEMO_PATH]: memoryFile(["웨딩"]) },
  });
  const select = evidenceSelect(harness.modal);
  select.value = "sufficient";
  await select.onchange();
  assert.equal(evidenceSelect(harness.modal).value, "sufficient", "소유자 선택이 우선해야 한다");
});

test("주제가 안 겹치면 일반 추천을 쓴다", async () => {
  const harness = await fx.openReview({
    item: fx.makeItem({ reviewId: "plan_compiled_synthetic_memory_3" }),
    targetBytes: TOPIC_LEGACY_BYTES,
    files: { [MEMO_PATH]: memoryFile(["낚시"]) },
  });
  assert.equal(evidenceSelect(harness.modal).value, "sufficient", "근거가 탄탄하면 충분함이 기본이다");
});

test("망가진 기억 파일에도 검토가 막히지 않는다", async () => {
  const harness = await fx.openReview({
    item: fx.makeItem({ reviewId: "plan_compiled_synthetic_memory_4" }),
    targetBytes: TOPIC_LEGACY_BYTES,
    files: { [MEMO_PATH]: "not json{" },
  });
  assert.equal(evidenceSelect(harness.modal).value, "sufficient", "기억 없이도 열려야 한다");
});

test("적용이 끝나면 결정을 기억한다", async () => {
  const harness = await fx.openReview({ item: fx.makeItem({ reviewId: "plan_compiled_synthetic_memory_5" }) });
  const set = async (name, value) => {
    const input = fx.field(harness.modal.contentEl, name);
    assert.ok(input, `${name} 입력이 있어야 한다`);
    input.value = value;
    await input.onchange();
  };
  await set("knowledge_kind", "claim");
  await set("classification", "epistemic");
  await set("knowledge_domain", "wedding");
  await set("knowledge_topics", "editing");
  await set("conditions", "합성 조건");
  await set("relation_status", "resolved");
  await set("evidence_strength", "sufficient");
  await fx.byAction(harness.modal.contentEl, "prepare-document-review").onclick();
  const accepted = fx.byAttr(harness.modal.contentEl, "data-review-acknowledgement")[0];
  assert.ok(accepted, "확인 체크가 있어야 한다");
  accepted.checked = true;
  await accepted.onchange();
  await fx.byAction(harness.modal.contentEl, "apply-document-review").onclick();
  const stored = harness.bytes(MEMO_PATH);
  assert.ok(stored, "기억 파일이 생겨야 한다");
  const entries = JSON.parse(stored);
  const hit = entries.find((row) => (row.topics || []).some((topic) => String(topic).toLowerCase() === "editing"));
  assert.ok(hit, `editing 항목이 있어야 한다: ${stored.slice(0, 200)}`);
  assert.equal(hit.knowledge_domain, "wedding");
});
