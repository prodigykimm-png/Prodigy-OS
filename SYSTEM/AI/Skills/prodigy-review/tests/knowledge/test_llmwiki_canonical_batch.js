"use strict";
// 문서 묶음 승인: 적격 새 문서만 한 번의 확인으로, 실패는 이유와 함께 제외.
// 실제 Hub 마운트만 사용한다.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const V = path.resolve(__dirname, "../../../../../Views");
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const SOURCE_ID = "source_canonical_batch_fixture";
const SOURCE_PATH = "INBOX/batch fixture.md";
const CLAIM = "묶음 픽스처 주장이다.";
const SOURCE_BYTES = `묶음 픽스처 원문.\n${CLAIM}\n`;
const SOURCE_REVISION = hash.sha256(SOURCE_BYTES);
const PLAN_HASH = hash.sha256("canonical batch plan");
// 복원 검증을 통과하는 item_hash를 쓴다. 마운트 때 첫 항목이 자동 열리면서
// 틀린 해시는 보관 처리돼 초안이 사라진다. review 모듈의 itemHash와 동기화.
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}` : JSON.stringify(value);
const itemHash = (item) => hash.sha256(stable([item.review_id, item.document_body, item.grounded_claims, item.proposed_target || null]));

function seedItem(reviewId, title) {
  return { review_id: reviewId, title, plan_kind: "compiled_document", plan_page_id: `page_${reviewId}`,
    document_body: `## ${title}\n${CLAIM}\n`,
    grounded_claims: [{ text: CLAIM, citations: [{ source_id: SOURCE_ID, source_path: SOURCE_PATH,
      locator: `${SOURCE_PATH}#L2`, content_hash: SOURCE_REVISION, evidence_quote: CLAIM }] }],
    related_knowledge: [], proposed_target: null };
}

function seedDraft() {
  return { fields: { knowledge_kind: "claim", classification: "epistemic", knowledge_domain: "wedding",
      knowledge_topics: "editing", conditions: "합성 조건", relation_status: "resolved",
      evidence_strength: "sufficient", target_path: "new" },
    touched: { knowledge_kind: true, classification: true, knowledge_domain: true, knowledge_topics: true,
      conditions: true, relation_status: true, evidence_strength: true },
    cleared: {}, target_path: "new", target_revision: null, source_revision: SOURCE_REVISION,
    plan_hash: PLAN_HASH, item_hash: "", sources: [{ source_id: SOURCE_ID, source_path: SOURCE_PATH, content_hash: SOURCE_REVISION }], edit_revision: 1 };
}

async function hubWithBatch() {
  const disk = new Map();
  const storage = {
    async exists(key) { return disk.has(key); },
    async read(key) { return disk.get(key); },
    async writeAtomic(key, value) { disk.set(key, value); },
    async quarantine() { throw new Error("unexpected corrupt job"); },
  };
  const store = jobs.createBatchJobStore({ storage });
  await store.load();
  const seedReview = async (suffix, title, targetPath) => {
    const reviewId = `plan_compiled_batch_${suffix}`;
    const job = await store.createJob({ request_key: hash.sha256(`canonical-batch-${suffix}`),
      sources: [{ source_id: SOURCE_ID, revision_hash: SOURCE_REVISION }] });
    await store.savePlanSnapshot({ job_id: job.job_id, source_id: SOURCE_ID, source_revision: SOURCE_REVISION,
      inventory_hash: hash.sha256("canonical batch inventory"), plan_hash: PLAN_HASH, plan_revision: 1, status: "compiled",
      plan: { plan_version: "fixture_document_v1", pages: [] } });
    const item = seedItem(reviewId, title);
    const draft = seedDraft();
    if (targetPath !== "new") {
      draft.target_path = targetPath;
      draft.fields.target_path = targetPath;
    }
    draft.item_hash = itemHash(item);
    await store.saveCanonicalReviewDraft({ job_id: job.job_id, review_key: hash.sha256(reviewId), item, draft });
  };
  await seedReview("one", "묶음 하나", "new");
  await seedReview("two", "묶음 둘", "new");
  await seedReview("old", "묶음 제외", "ZETA/PERMANENT/legacy album guide.md");
  const runtime = await runHub({ pages: buildPages(),
    extraFiles: { [SOURCE_PATH]: SOURCE_BYTES, "ZETA/PERMANENT/legacy album guide.md": "# 기존\n" },
    llmWikiControllerOptions: { batchJobStore: store } });
  return runtime;
}

function walk(root, predicate, hits = []) {
  if (!root) return hits;
  if (predicate(root)) hits.push(root);
  for (const child of root.children || []) walk(child, predicate, hits);
  return hits;
}

function byAction(root, actionName) {
  return walk(root, (node) => node.attr && node.attr["data-action"] === actionName)[0] || null;
}

function byAttr(root, name, value) {
  return walk(root, (node) => node.attr && (value === undefined ? node.attr[name] !== undefined : node.attr[name] === value));
}

function allTexts(root) {
  const texts = [];
  walk(root, (node) => {
    if (typeof node.textContent === "string" && node.textContent) texts.push(node.textContent);
  });
  return texts.join("\n");
}

test("적격 새 문서만 묶음으로 고르고 한 번에 승인한다", async () => {
  const runtime = await hubWithBatch();
  const joined = allTexts(runtime.container);
  assert.ok(joined.includes("새 문서 2건"), `적격 수가 보여야 한다: ${joined.slice(0, 400)}`);
  const boxes = byAttr(runtime.container, "data-batch-canonical-review");
  assert.equal(boxes.length, 2, "새 문서 2건에만 체크가 있어야 한다");
  await byAction(runtime.container, "select-eligible-canonical").onclick();
  const ack = byAttr(runtime.container, "data-batch-canonical-acknowledgement")[0];
  assert.ok(ack, "확인 체크가 있어야 한다");
  ack.checked = true;
  await ack.onchange();
  const writesBefore = runtime.app.vault.touched.length;
  await byAction(runtime.container, "approve-canonical-batch").onclick();
  const after = allTexts(runtime.container);
  assert.ok(after.includes("2건 반영"), `반영 요약이 있어야 한다: ${after.slice(-400)}`);
  const touched = runtime.app.vault.touched.slice(writesBefore).map(([, filePath]) => filePath);
  assert.ok(touched.some((filePath) => filePath.includes("묶음 하나")), `첫 문서가 생겨야 한다: ${touched.join(",")}`);
  assert.ok(touched.some((filePath) => filePath.includes("묶음 둘")), `둘째 문서가 생겨야 한다: ${touched.join(",")}`);
  assert.ok(!touched.some((filePath) => filePath.startsWith("ZETA/PERMANENT/legacy")), "기존 문서는 안 건드린다");
});

test("체크를 풀면 묶음에서 빠진다", async () => {
  const runtime = await hubWithBatch();
  await byAction(runtime.container, "select-eligible-canonical").onclick();
  const boxes = byAttr(runtime.container, "data-batch-canonical-review");
  assert.equal(boxes.length, 2);
  boxes[0].checked = false;
  await boxes[0].onchange();
  const ack = byAttr(runtime.container, "data-batch-canonical-acknowledgement")[0];
  ack.checked = true;
  await ack.onchange();
  await byAction(runtime.container, "approve-canonical-batch").onclick();
  const after = allTexts(runtime.container);
  assert.ok(after.includes("1건 반영"), `한 건만 반영돼야 한다: ${after.slice(-400)}`);
});
