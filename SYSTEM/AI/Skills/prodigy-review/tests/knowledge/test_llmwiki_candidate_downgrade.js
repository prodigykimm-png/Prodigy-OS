"use strict";
// 등급 저장: 균일성 경고만으로 막히면 후보 저장을 명시적으로 고를 수 있고,
// 안전·판단 게이트가 섞이면 버튼이 나가지 않는다. 합성 픽스처만 쓴다.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

async function principleReview(reviewId, evidence) {
  const harness = await fx.openReview({ item: fx.makeItem({ reviewId }) });
  const set = async (name, value) => {
    const input = fx.field(harness.modal.contentEl, name);
    assert.ok(input, `${name} 입력이 있어야 한다`);
    input.value = value;
    await input.onchange();
  };
  await set("knowledge_kind", "principle");
  await set("classification", "epistemic");
  await set("knowledge_domain", "wedding");
  await set("knowledge_topics", "editing");
  await set("conditions", "합성 조건");
  await set("exclusions", "합성 예외");
  await set("invalidation_conditions", "합성 재검토");
  await set("relation_status", "resolved");
  await set("evidence_strength", evidence);
  await fx.byAction(harness.modal.contentEl, "prepare-document-review").onclick();
  return harness;
}

function texts(harness) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node.textContent === "string" && node.textContent) out.push(node.textContent);
    for (const child of node.children || []) walk(child);
  };
  walk(harness.modal.contentEl);
  return out.join("\n");
}

test("균일성 경고만이면 후보 저장 버튼이 나간다", async () => {
  const harness = await principleReview("plan_compiled_synthetic_downgrade_1", "sufficient");
  const offer = fx.byAction(harness.modal.contentEl, "save-candidate-downgrade");
  assert.ok(offer, "후보 저장 제안이 있어야 한다");
  assert.ok((offer.textContent || "").includes("1건"), `경고 건수가 보여야 한다: ${offer.textContent}`);
  assert.ok(texts(harness).includes("후보로 저장"), "후보 저장 안내가 있어야 한다");
});

test("안전 게이트가 섞이면 버튼이 나가지 않는다", async () => {
  const harness = await principleReview("plan_compiled_synthetic_downgrade_2", "thin");
  assert.equal(fx.byAction(harness.modal.contentEl, "save-candidate-downgrade"), null, "얇은 근거에는 후보 저장도 안 된다");
});

test("확인하면 후보함에 경고와 함께 저장된다", async () => {
  const harness = await principleReview("plan_compiled_synthetic_downgrade_3", "sufficient");
  await fx.byAction(harness.modal.contentEl, "save-candidate-downgrade").onclick();
  const confirm = fx.byAction(harness.modal.contentEl, "save-candidate-downgrade-confirm");
  assert.ok(confirm, "확인 버튼이 있어야 한다");
  const writesBefore = harness.writes.length;
  await confirm.onclick();
  const joined = texts(harness);
  assert.ok(joined.includes("후보함에 저장했습니다"), `저장 안내가 있어야 한다: ${joined.slice(0, 300)}`);
  const candidatePaths = [...harness.vaultFiles.keys()].filter((filePath) => filePath.startsWith("ZETA/CANDIDATES/"));
  assert.equal(candidatePaths.length, 1, `후보 파일 하나: ${candidatePaths.join(",")}`);
  const body = harness.bytes(candidatePaths[0]);
  assert.ok(body.includes("principle_rationale_required") || body.includes("원칙의 근거"), "경고가 파일에 남아야 한다");
  assert.deepEqual(harness.writes.slice(writesBefore).filter(([, filePath]) => !filePath.startsWith("ZETA/CANDIDATES/")).length, 0, "후보 외 쓰기가 없어야 한다");
  assert.deepEqual(harness.writes.slice(writesBefore).filter(([, filePath]) => filePath.startsWith("ZETA/PERMANENT/")).length, 0, "정식 쓰기가 없어야 한다");
});
