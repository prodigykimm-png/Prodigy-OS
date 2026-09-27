"use strict";
// 준비 단계 자동 해소: 바뀐 대상은 최신 기준으로 한 번 다시 준비하고,
// 어긋난 인용 행번호는 확인된 바이트 span으로 넘어간다. 합성 픽스처만 쓴다.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fx = require("./fixtures/llmwiki_review_fixtures.js");

async function readyModal(reviewId, item) {
  const harness = await fx.openReview({ item: item || fx.makeItem({ reviewId }) });
  const set = async (name, value) => {
    const input = fx.field(harness.modal.contentEl, name);
    assert.ok(input, `${name} 입력이 있어야 한다`);
    input.value = value;
    await input.onchange();
  };
  await set("knowledge_kind", "claim");
  await set("classification", "epistemic");
  await set("knowledge_domain", "wedding");
  await set("conditions", "합성 조건");
  await set("relation_status", "resolved");
  await set("evidence_strength", "sufficient");
  return harness;
}

function statusText(harness) {
  return fx.statusText(harness.modal.contentEl);
}

test("바뀐 대상은 최신 기준으로 한 번 다시 준비한다", async () => {
  const harness = await readyModal("plan_compiled_synthetic_stale_1");
  const changed = `${fx.LEGACY_BYTES}\n추가된 가이드 문장.\n`;
  await harness.app.vault.modify(fx.LEGACY_PATH, changed);
  const writesBefore = harness.writes.length;
  await fx.byAction(harness.modal.contentEl, "prepare-document-review").onclick();
  const text = statusText(harness);
  assert.ok(text.includes("변경 내용과 출처를 확인하고 체크하세요"), `다시 준비돼야 한다: ${text.slice(0, 200)}`);
  assert.ok(!text.includes("검토 이후 내용이 바뀌었습니다"), `stale에 머물면 안 된다: ${text.slice(0, 200)}`);
  assert.deepEqual(harness.writes.slice(writesBefore), [], "준비는 볼트에 쓰면 안 된다");
});

test("어긋난 인용 행번호는 확인되면 막지 않는다", async () => {
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_locator_1" });
  item.grounded_claims[0].citations[0].locator = `${fx.SOURCE_PATH}#L999`;
  const harness = await readyModal("plan_compiled_synthetic_locator_1", item);
  await fx.byAction(harness.modal.contentEl, "prepare-document-review").onclick();
  const text = statusText(harness);
  assert.ok(text.includes("변경 내용과 출처를 확인하고 체크하세요"), `행번호가 어긋나도 진행돼야 한다: ${text.slice(0, 200)}`);
});
