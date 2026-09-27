"use strict";
// 매뉴얼 등록부: 지정 목록의 정규화·저장·제안. 합성 픽스처만 쓴다.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const V = path.resolve(__dirname, "../../../../../Views");
const registry = require(path.join(V, "llmwiki-manual-registry.js"));

const GUIDE = "ZETA/PERMANENT/legacy album guide.md";
const OTHER = "ZETA/PERMANENT/second guide.md";

function fakeApp(seed = {}) {
  const files = new Map(Object.entries(seed));
  const touched = [];
  return {
    touched,
    vault: {
      getAbstractFileByPath: (filePath) => files.has(filePath) ? { path: filePath } : null,
      async read(file) {
        const filePath = typeof file === "string" ? file : file.path;
        if (!files.has(filePath)) throw new Error("missing_file");
        return files.get(filePath);
      },
      async create(filePath, bytes) {
        if (files.has(filePath)) throw new Error("file_exists");
        files.set(filePath, bytes); touched.push(["create", filePath]);
      },
      async modify(file, bytes) {
        const filePath = typeof file === "string" ? file : file.path;
        if (!files.has(filePath)) throw new Error("missing_file");
        files.set(filePath, bytes); touched.push(["modify", filePath]);
      },
    },
  };
}

test("목록을 정규화한다", () => {
  assert.deepEqual(registry.normalizeEntries([
    { path: GUIDE }, GUIDE, { path: "../escape.md" }, { path: "note.txt" }, "  ", null, 42,
  ]), [{ path: GUIDE }]);
  assert.equal(registry.normalizeEntries(new Array(100).fill(GUIDE)).length, 1);
  const many = Array.from({ length: 100 }, (_, index) => `ZETA/PERMANENT/note ${index}.md`);
  assert.equal(registry.normalizeEntries(many).length, 64);
});

test("겹침 상대가 매뉴얼이면 그 경로를 제안한다", () => {
  const manuals = [{ path: GUIDE }];
  const duplicate = [{ title: "가이드", path: GUIDE, relation: "duplicate" }];
  assert.equal(registry.suggestManualTarget(manuals, duplicate), GUIDE);
  assert.equal(registry.suggestManualTarget(manuals,
    [{ title: "가이드", path: GUIDE, relation: "conflict" }]), GUIDE);
  assert.equal(registry.suggestManualTarget(manuals,
    [{ title: "가이드", path: GUIDE, relation: "compatible_new" }]), "");
  assert.equal(registry.suggestManualTarget(manuals,
    [{ title: "다른", path: OTHER, relation: "duplicate" }]), "");
  assert.equal(registry.suggestManualTarget([], duplicate), "");
  assert.ok(registry.isManual(manuals, GUIDE));
  assert.ok(!registry.isManual(manuals, OTHER));
});

test("저장하고 다시 읽는다", async () => {
  const app = fakeApp();
  assert.deepEqual(await registry.loadRegistry(app), [], "없으면 빈 목록");
  await registry.saveRegistry(app, [{ path: GUIDE }, { path: OTHER }]);
  assert.deepEqual(await registry.loadRegistry(app), [{ path: GUIDE }, { path: OTHER }]);
  await registry.saveRegistry(app, [{ path: GUIDE }]);
  assert.deepEqual(await registry.loadRegistry(app), [{ path: GUIDE }]);
  assert.deepEqual(app.touched[0], ["create", registry.REGISTRY_PATH]);
});

test("망가진 등록부는 빈 목록으로 읽는다", async () => {
  const app = fakeApp({ [registry.REGISTRY_PATH]: "not json{" });
  assert.deepEqual(await registry.loadRegistry(app), []);
});

test("겹침 상대가 매뉴얼이면 대상으로 고른다", async () => {
  const fx = require("./fixtures/llmwiki_review_fixtures.js");
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_manual_1" });
  item.proposed_target = null;
  item.related_knowledge = [{ title: "legacy", path: fx.LEGACY_PATH, relation: "duplicate", covered_claim_count: 1 }];
  const harness = await fx.openReview({ item,
    files: { [registry.REGISTRY_PATH]: JSON.stringify([{ path: fx.LEGACY_PATH }]) } });
  const target = fx.field(harness.modal.contentEl, "target_path");
  assert.ok(target, "대상 선택기가 있어야 한다");
  assert.equal(target.value, fx.LEGACY_PATH, "매뉴얼을 대상으로 골라야 한다");
});

test("등록이 없으면 새로 만들기로 둔다", async () => {
  const fx = require("./fixtures/llmwiki_review_fixtures.js");
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_manual_2" });
  item.proposed_target = null;
  item.related_knowledge = [{ title: "legacy", path: fx.LEGACY_PATH, relation: "duplicate", covered_claim_count: 1 }];
  const harness = await fx.openReview({ item });
  assert.notEqual(fx.field(harness.modal.contentEl, "target_path").value, fx.LEGACY_PATH);
});

test("매뉴얼 목록을 보여주고 지정·해제를 한다", async () => {
  const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");
  const first = "ZETA/PERMANENT/first guide.md";
  const second = "ZETA/PERMANENT/second guide.md";
  const runtime = await runHub({ pages: buildPages(),
    extraFiles: { [first]: "# first\n", [second]: "# second\n",
      [registry.REGISTRY_PATH]: JSON.stringify([{ path: first }]) } });
  const walk = (node, predicate, hits = []) => {
    if (!node) return hits;
    if (predicate(node)) hits.push(node);
    for (const child of node.children || []) walk(child, predicate, hits);
    return hits;
  };
  const texts = () => walk(runtime.container, (node) => typeof node.textContent === "string" && node.textContent).map((node) => node.textContent).join("\n");
  assert.ok(texts().includes("매뉴얼"), "매뉴얼 구역이 있어야 한다");
  assert.ok(texts().includes(first), "지정된 매뉴얼이 보여야 한다");
  const picker = walk(runtime.container, (node) => node.tag === "select"
    && node.attr && node.attr["data-manual-picker"] !== undefined)[0];
  assert.ok(picker, "지정 선택기가 있어야 한다");
  picker.value = second;
  const add = walk(runtime.container, (node) => node.tag === "button" && (node.textContent || "").trim() === "매뉴얼로 지정")[0];
  assert.ok(add, "지정 버튼이 있어야 한다");
  await add.onclick();
  const stored = JSON.parse(await runtime.app.vault.read(runtime.app.vault.getAbstractFileByPath(registry.REGISTRY_PATH)));
  assert.deepEqual(stored.map((row) => row.path).sort(), [first, second].sort());
  const remove = walk(runtime.container, (node) => node.tag === "button" && (node.textContent || "").trim() === "지정 해제")[0];
  assert.ok(remove, "해제 버튼이 있어야 한다");
});
